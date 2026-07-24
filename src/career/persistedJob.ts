// Ingress validation for every persisted (or session-pending) career job —
// the one boundary untrusted storage records must pass through before a
// worker trusts them. A stored schemaVersion/shape is a migration hint, not
// proof of validity: this module inspects the complete record and repairs or
// refuses it accordingly (plan §8.5).
//
// Deliberately independent of aiClient.ts's CareerJob type/values: aiClient.ts
// is the caller that imports *from* here, so a value-level import back from
// here would create a runtime import cycle. The literal unions below mirror
// aiClient.ts's CareerKind/JobStatus exactly.

import type { Provider } from "../aiClient/provider";
import { DEFAULT_MODEL, resolveKnownModel } from "../models";
import { MAX_INPUT_BYTES, normalizeCareerInput } from "./fields";
import { boundJobForPersistence, byteSize, MAX_ID_BYTES, MAX_PERSISTED_JOB_BYTES, type BoundableJob, type BoundableJobSource } from "./bytes";

export type PersistedCareerKind = "interview" | "company" | "combined";
export type PersistedJobStatus = "queued" | "running" | "complete" | "error" | "cancelled" | "interrupted";
export type PersistedJobStage = "research" | "synthesis" | "complete";

export interface PersistedJob extends BoundableJob {
  kind: PersistedCareerKind;
  status: PersistedJobStatus;
  stage: PersistedJobStage;
  provider: Provider;
}

const KNOWN_KINDS = new Set<string>(["interview", "company", "combined"]);
const KNOWN_STATUSES = new Set<string>(["queued", "running", "complete", "error", "cancelled", "interrupted"]);
const KNOWN_STAGES = new Set<string>(["research", "synthesis", "complete"]);
/** Legacy interview/company jobs predate the closed Career field contract in fields.ts (which only governs combined reports); their ad hoc keys are preserved as-is, only length-capped, so regenerate/report rendering for older jobs keeps working unchanged. */
const LEGACY_INPUT_VALUE_CAP = 100_000;
export const MIGRATION_WARNING = "migration: this saved report's data was repaired to fit the current storage format.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeInput(kind: PersistedCareerKind, rawInput: unknown): Record<string, string> {
  if (kind === "combined") return normalizeCareerInput(isPlainObject(rawInput) ? rawInput : null);
  if (!isPlainObject(rawInput)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawInput)) {
    if (typeof value === "string") result[key] = value.slice(0, LEGACY_INPUT_VALUE_CAP);
  }
  return result;
}

function sanitizeSources(raw: unknown): BoundableJobSource[] {
  if (!Array.isArray(raw)) return [];
  const sources: BoundableJobSource[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const url = typeof item.url === "string" ? item.url : "";
    if (!id || !url) continue;
    sources.push({
      id, url,
      ...(typeof item.title === "string" ? { title: item.title } : {}),
      ...(typeof item.citedText === "string" ? { citedText: item.citedText } : {}),
    });
  }
  return sources;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Strict shape check for an already-rebuilt candidate. This is the gate
 * normalizePersistedJob's rebuilt output must pass before being trusted —
 * exported so a hostile or malformed record can never claim conformance from
 * a stored schemaVersion alone.
 */
export function isConformantPersistedJob(value: unknown): value is PersistedJob {
  if (!isPlainObject(value)) return false;
  const id = value.id;
  if (typeof id !== "string" || !id.trim() || byteSize(id) > MAX_ID_BYTES) return false;
  if (!KNOWN_KINDS.has(String(value.kind))) return false;
  if (!KNOWN_STATUSES.has(String(value.status))) return false;
  if (!KNOWN_STAGES.has(String(value.stage))) return false;
  if (value.provider !== "anthropic" && value.provider !== "openai") return false;
  if (typeof value.model !== "string" || !value.model) return false;
  if (!isPlainObject(value.input) || byteSize(JSON.stringify(value.input)) > MAX_INPUT_BYTES) return false;
  if (typeof value.reportText !== "string") return false;
  if (typeof value.findings !== "string") return false;
  if (!Array.isArray(value.sources)) return false;
  if (!Array.isArray(value.researchMessages)) return false;
  if (typeof value.researchAvailable !== "boolean") return false;
  if (!Array.isArray(value.warnings)) return false;
  if (!isFiniteNumber(value.generation)) return false;
  if (!isFiniteNumber(value.createdAt)) return false;
  if (byteSize(JSON.stringify(value)) > MAX_PERSISTED_JOB_BYTES) return false;
  return true;
}

/**
 * Repairs (or refuses) one arbitrary stored/session record into a
 * conformant PersistedJob. Reads stay pure — a repaired shape is only ever
 * persisted on the next legitimate write, never written back here — so a
 * caller that only reads (e.g. History) never has a storage side effect.
 */
export function normalizePersistedJob(raw: unknown): PersistedJob | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  // Refused outright, never shortened — an empty/oversized/non-string id
  // would corrupt identity rather than merely lose content.
  if (!id || byteSize(id) > MAX_ID_BYTES) return null;

  const kind: PersistedCareerKind = KNOWN_KINDS.has(String(raw.kind)) ? (raw.kind as PersistedCareerKind) : "interview";
  const provider: Provider = raw.provider === "openai" ? "openai" : "anthropic";
  const model = typeof raw.model === "string" && raw.model ? resolveKnownModel(provider, raw.model) : DEFAULT_MODEL[provider];
  const rawStatus = String(raw.status);
  // An unrecognized status string is converted to a non-running error state;
  // a *recognized* running/queued status with no live controller is instead
  // resolved to a recoverable error by the worker-restart handling in
  // aiClient.ts, which has the runtime context this pure ingress step lacks.
  const status: PersistedJobStatus = KNOWN_STATUSES.has(rawStatus) ? (rawStatus as PersistedJobStatus) : "error";
  const stage: PersistedJobStage = KNOWN_STAGES.has(String(raw.stage)) ? (raw.stage as PersistedJobStage) : "complete";
  const input = sanitizeInput(kind, raw.input);
  const reportText = typeof raw.reportText === "string" ? raw.reportText : "";
  const findings = typeof raw.findings === "string" ? raw.findings : "";
  const sources = sanitizeSources(raw.sources);
  const researchMessages = Array.isArray(raw.researchMessages) ? raw.researchMessages.filter(isPlainObject) : [];
  const researchAvailable = raw.researchAvailable === true;
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === "string") : [];
  const generation = isFiniteNumber(raw.generation) ? raw.generation : 0;
  const createdAt = isFiniteNumber(raw.createdAt) ? raw.createdAt : Date.now();

  // Optional fields are included only when meaningful (never as an explicit
  // `undefined`-valued key), matching how the live job objects that produced
  // them are shaped, so a normalize round trip never introduces a
  // structural difference an equality check elsewhere would see.
  const candidate: PersistedJob = {
    id, kind, status, stage, provider, model, input, reportText, findings, sources,
    researchMessages, researchAvailable, warnings, generation, createdAt,
    ...(raw.researchComplete === true ? { researchComplete: true as const } : {}),
    ...(isFiniteNumber(raw.heartbeat) ? { heartbeat: raw.heartbeat } : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    ...(isPlainObject(raw.usage) ? { usage: raw.usage } : {}),
    ...(isPlainObject(raw.validation) ? { validation: raw.validation } : {}),
  };

  const bounded = boundJobForPersistence(candidate);

  const wasRepaired = [
    raw.kind !== kind,
    raw.status !== status,
    raw.stage !== stage,
    raw.provider !== provider,
    raw.model !== model,
    typeof raw.researchAvailable !== "boolean",
    !isFiniteNumber(raw.generation),
    !isFiniteNumber(raw.createdAt),
    !Array.isArray(raw.sources),
    !Array.isArray(raw.researchMessages),
    !Array.isArray(raw.warnings),
    typeof raw.reportText !== "string",
    typeof raw.findings !== "string",
    !isPlainObject(raw.input),
    bounded.truncatedFields.length > 0,
  ].some(Boolean);

  const final = wasRepaired && !bounded.job.warnings.includes(MIGRATION_WARNING)
    ? { ...bounded.job, warnings: [...bounded.job.warnings, MIGRATION_WARNING] }
    : bounded.job;

  return isConformantPersistedJob(final) ? final : null;
}
