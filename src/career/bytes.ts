// Shared UTF-8 byte-measurement and truncation helpers. Every persisted or
// diagnostic string that must respect a serialized-byte ceiling goes through
// this module so measurement stays exact and consistent everywhere.

const encoder = new TextEncoder();

/** Exact UTF-8 serialized byte size of a string. */
export function byteSize(value: string): number {
  return encoder.encode(value).length;
}

/**
 * Truncates text to at most maxBytes UTF-8 bytes, never splitting a
 * multi-byte character mid-sequence, and appends a single ellipsis marker
 * when truncation occurred (the marker itself counts against maxBytes).
 */
export function sliceToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (byteSize(text) <= maxBytes) return text;
  const marker = "…";
  const markerBytes = byteSize(marker);
  const budget = Math.max(0, maxBytes - markerBytes);
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteSize(text.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return budget > 0 ? `${text.slice(0, lo)}${marker}` : marker.length && byteSize(marker) <= maxBytes ? marker : "";
}

/** Fits an already-serialized string within maxSerializedBytes, reporting whether truncation was needed. */
export function fitSerialized(text: string, maxSerializedBytes: number): { text: string; truncated: boolean } {
  const size = byteSize(text);
  if (size <= maxSerializedBytes) return { text, truncated: false };
  return { text: sliceToBytes(text, maxSerializedBytes), truncated: true };
}

// --- Persisted-job byte partitioning (plan §8.4) --------------------------
//
// Every persisted job is split into an immutable "fixed" part (identity and
// the input context it was generated from — refused rather than shortened,
// since silently truncating an id or dropping user-supplied context would
// corrupt the record) and a bounded "growth" part (streamed/appended
// content, which is safe to clamp because doing so only shortens output the
// user can already see and regenerate). Only the growth part is ever
// clamped here.

export const MAX_ID_BYTES = 2 * 1024;
export const MAX_SCALAR_BYTES = 1024;
export const MAX_FIXED_BYTES = 1024 * 1024;

export const MAX_REPORT_TEXT_BYTES = 256 * 1024;
export const MAX_FINDINGS_BYTES = 512 * 1024;
export const MAX_SOURCES_BYTES = 128 * 1024;
export const MAX_RESEARCH_MESSAGES_BYTES = 1024 * 1024;
export const MAX_WARNINGS_BYTES = 32 * 1024;
export const MAX_MUTABLE_TAIL_BYTES = 64 * 1024;
export const MAX_GROWTH_TOTAL_BYTES = 2 * 1024 * 1024;
export const MAX_PERSISTED_JOB_BYTES = 3 * 1024 * 1024;
export const MAX_SOURCE_ENTRIES = 40;
export const MAX_WARNING_ENTRIES = 200;

export const STORAGE_TRUNCATION_MARKER = "\n\n[Truncated to fit storage limits]";

export interface BoundableJobSource { id: string; url: string; title?: string; citedText?: string; }

/**
 * The structural subset of CareerJob that byte-bounding and ingress
 * validation operate on. Deliberately independent of aiClient.ts's CareerJob
 * type (a value import from there would create a runtime import cycle,
 * since aiClient.ts imports these helpers) — every field name matches
 * CareerJob exactly, so callers can pass a CareerJob directly.
 */
export interface BoundableJob {
  id: string;
  kind: string;
  status: string;
  stage: string;
  provider: string;
  model: string;
  input: Record<string, string>;
  reportText: string;
  findings: string;
  sources: BoundableJobSource[];
  researchMessages: Record<string, unknown>[];
  researchAvailable: boolean;
  warnings: string[];
  generation: number;
  researchComplete?: boolean;
  heartbeat?: number;
  error?: string;
  usage?: Record<string, unknown>;
  validation?: unknown;
  createdAt: number;
}

/** The immutable identity/context keys — never clamped, only refused. */
const FIXED_KEYS = ["id", "kind", "provider", "model", "createdAt", "researchAvailable", "input"] as const;
const MUTABLE_TAIL_KEYS = ["status", "stage", "heartbeat", "error", "usage", "validation", "researchComplete", "generation"] as const;

function pick<T extends object, K extends readonly (keyof T)[]>(value: T, keys: K): Pick<T, K[number]> {
  return Object.fromEntries(keys.map(key => [key, value[key]])) as Pick<T, K[number]>;
}

/** Serialized-byte size of only the immutable identity/context part of a job. */
export function baseBytes(job: BoundableJob): number {
  return byteSize(JSON.stringify(pick(job, FIXED_KEYS)));
}

/** A stable fingerprint of the fixed part, used to detect whether a re-anchored or retried record still describes the same job identity/context. */
export function fixedFingerprint(job: BoundableJob): string {
  return JSON.stringify(pick(job, FIXED_KEYS));
}

function mutableTailBytes(job: BoundableJob): number {
  return byteSize(JSON.stringify(pick(job, MUTABLE_TAIL_KEYS)));
}

/**
 * Truncates text to fit within maxBytes *including* the appended marker —
 * budgeting the marker's own bytes into the target rather than appending it
 * after an already-exact fit, which would silently push the result over
 * maxBytes. Naturally idempotent: a text already within maxBytes (marker
 * included) is returned unchanged, so re-bounding an already-bounded job
 * never re-truncates or re-appends the marker.
 */
function truncateWithMarker(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (byteSize(text) <= maxBytes) return { text, truncated: false };
  const budget = Math.max(0, maxBytes - byteSize(STORAGE_TRUNCATION_MARKER));
  return { text: `${sliceToBytes(text, budget)}${STORAGE_TRUNCATION_MARKER}`, truncated: true };
}

function boundSources(sources: readonly BoundableJobSource[]): { sources: BoundableJobSource[]; changed: boolean } {
  const capped = sources.slice(0, MAX_SOURCE_ENTRIES).map(source => ({
    id: sliceToBytes(String(source.id ?? ""), 64),
    url: sliceToBytes(String(source.url ?? ""), 2048),
    ...(source.title ? { title: sliceToBytes(source.title, 512) } : {}),
    ...(source.citedText ? { citedText: sliceToBytes(source.citedText, 4096) } : {}),
  }));
  let list = capped;
  while (list.length > 0 && byteSize(JSON.stringify(list)) > MAX_SOURCES_BYTES) list = list.slice(0, -1);
  const changed = list.length !== sources.length || byteSize(JSON.stringify(list)) !== byteSize(JSON.stringify(sources));
  return { sources: list, changed };
}

const WARNING_PRIORITY_PREFIXES = ["storage:", "migration:", "context:"];

function boundWarnings(warnings: readonly string[]): { warnings: string[]; changed: boolean } {
  let list = warnings.map(w => sliceToBytes(w, 2000)).slice(0, MAX_WARNING_ENTRIES);
  while (list.length > 0 && byteSize(JSON.stringify(list)) > MAX_WARNINGS_BYTES) {
    const dropIndex = list.findIndex(w => !WARNING_PRIORITY_PREFIXES.some(prefix => w.startsWith(prefix)));
    list = dropIndex >= 0 ? [...list.slice(0, dropIndex), ...list.slice(dropIndex + 1)] : list.slice(1);
  }
  const changed = list.length !== warnings.length || list.some((w, i) => w !== warnings[i]);
  return { warnings: list, changed };
}

export interface BoundJobResult<T> {
  job: T;
  /** New human-readable warnings this bounding pass added (already folded into job.warnings). */
  addedWarnings: string[];
  /** Which growth fields were clamped this pass. */
  truncatedFields: string[];
}

/**
 * Clamps only the bounded growth fields of a job to their serialized-byte
 * ceilings — reportText, findings, sources, researchMessages, warnings, and
 * the small mutable tail. The fixed identity/context part (id, kind,
 * provider, model, createdAt, researchAvailable, input) is never touched
 * here; by construction the sum of every growth cap stays under
 * MAX_GROWTH_TOTAL_BYTES, so a fixed part within MAX_FIXED_BYTES keeps the
 * whole record under MAX_PERSISTED_JOB_BYTES.
 */
export function boundJobForPersistence<T extends BoundableJob>(job: T): BoundJobResult<T> {
  const addedWarnings: string[] = [];
  const truncatedFields: string[] = [];
  const patch: Partial<BoundableJob> = {};

  const reportFit = truncateWithMarker(job.reportText, MAX_REPORT_TEXT_BYTES);
  if (reportFit.truncated) { patch.reportText = reportFit.text; truncatedFields.push("reportText"); }

  const findingsFit = truncateWithMarker(job.findings, MAX_FINDINGS_BYTES);
  if (findingsFit.truncated) { patch.findings = findingsFit.text; truncatedFields.push("findings"); }

  const sourcesFit = boundSources(job.sources);
  if (sourcesFit.changed) { patch.sources = sourcesFit.sources; truncatedFields.push("sources"); }

  if (byteSize(JSON.stringify(job.researchMessages)) > MAX_RESEARCH_MESSAGES_BYTES) {
    patch.researchMessages = [];
    patch.researchComplete = true;
    addedWarnings.push("storage: the research transcript exceeded its storage limit and was dropped; the report itself is unaffected.");
    truncatedFields.push("researchMessages");
  }

  // Cast rather than rely on structural inference here: TypeScript cannot
  // prove `{...job, ...patch}` satisfies the open generic T (it could be
  // instantiated with a stricter subtype), even though every patched key is
  // a plain BoundableJob field every T is required to carry unchanged.
  let next: T = (Object.keys(patch).length ? { ...job, ...patch } : job) as T;

  if (mutableTailBytes(next) > MAX_MUTABLE_TAIL_BYTES && next.usage) {
    next = { ...next, usage: undefined } as T;
    addedWarnings.push("storage: usage metadata was dropped to fit storage limits.");
  }

  const warningsFit = boundWarnings([...next.warnings, ...addedWarnings]);
  if (warningsFit.changed || addedWarnings.length) next = { ...next, warnings: warningsFit.warnings } as T;

  return { job: next, addedWarnings, truncatedFields };
}
