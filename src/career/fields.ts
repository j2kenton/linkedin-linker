// Canonical Career input contract — the single source of truth for which
// fields a combined report can use, how they map onto popup form elements and
// the job.input wire payload, and how big each one is allowed to get.

export type CareerValueKey =
  | "cv"
  | "profile"
  | "companyName"
  | "companyUrl"
  | "companyInfo"
  | "jobTitle"
  | "seniority"
  | "location"
  | "jobDescription"
  | "stage";

export const CAREER_VALUE_KEYS: readonly CareerValueKey[] = [
  "cv", "profile", "companyName", "companyUrl", "companyInfo",
  "jobTitle", "seniority", "location", "jobDescription", "stage",
];

export type Provenance = "manual" | "extracted" | "mixed";

export type CareerValues = Partial<Record<CareerValueKey, string>>;
export type CareerSources = Partial<Record<CareerValueKey, Provenance>>;
export type CareerValuePatch = Partial<Record<CareerValueKey, string>>;

/** The job.input (wire) key each canonical form field is persisted/sent under. Kept stable for backward compatibility with existing job records. */
export const WIRE_KEY: Record<CareerValueKey, string> = {
  cv: "cv",
  profile: "profile",
  companyName: "companyName",
  companyUrl: "companyUrl",
  companyInfo: "companyInfo",
  jobTitle: "title",
  seniority: "seniority",
  location: "location",
  jobDescription: "jd",
  stage: "stage",
};

/** The popup form element id backing each canonical field. */
export const FORM_ID: Record<CareerValueKey, string> = {
  cv: "careerCv",
  profile: "careerProfile",
  companyName: "careerCompanyName",
  companyUrl: "careerCompanyUrl",
  companyInfo: "careerCompanyInfo",
  jobTitle: "careerJobTitle",
  seniority: "careerSeniority",
  location: "careerLocation",
  jobDescription: "careerJobDescription",
  stage: "careerStage",
};

export const STAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "recruiter", label: "Recruiter screen" },
  { value: "hiring-manager", label: "Hiring manager" },
  { value: "technical", label: "Technical" },
  { value: "panel", label: "Panel" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other" },
];

/** Long free-text fields get a large cap; short scalar fields get a small one. */
const LONG_FIELDS = new Set<CareerValueKey>(["cv", "profile", "companyInfo", "jobDescription"]);
export const CAP_LONG = 100_000;
export const CAP_SHORT = 2_000;
/** Mirrors the worker's persisted-input storage boundary (see aiClient.ts). */
export const MAX_INPUT_BYTES = 448 * 1024;

export function capForKey(key: CareerValueKey): number {
  return LONG_FIELDS.has(key) ? CAP_LONG : CAP_SHORT;
}

const trimValue = (value: unknown, max: number): string => String(value ?? "").slice(0, max);

export function normalizeCareerValue(key: CareerValueKey, value: unknown): string {
  return trimValue(value, capForKey(key));
}

const sourceWireKey = (key: CareerValueKey): string => `${WIRE_KEY[key]}Source`;

/** Projects an arbitrary object down to only the canonical value keys, normalizing/capping each present value and dropping everything else. */
export function normalizeCareerValuePatch(raw: Record<string, unknown> | null | undefined): CareerValuePatch {
  const patch: CareerValuePatch = {};
  if (!raw) return patch;
  for (const key of CAREER_VALUE_KEYS) {
    if (!(key in raw)) continue;
    const value = normalizeCareerValue(key, raw[key]);
    if (value) patch[key] = value;
  }
  return patch;
}

function normalizeProvenance(value: unknown): Provenance {
  return value === "extracted" || value === "mixed" ? value : "manual";
}

/** Builds the job.input wire payload for a fresh combined-report submission from canonical form values + provenance. */
export function formToCareerInput(values: CareerValues, sources: CareerSources): Record<string, string> {
  const patch = normalizeCareerValuePatch(values);
  const input: Record<string, string> = { kind: "combined" };
  for (const key of CAREER_VALUE_KEYS) {
    const value = patch[key];
    if (value) input[WIRE_KEY[key]] = value;
    if (key !== "stage") input[sourceWireKey(key)] = normalizeProvenance(sources[key]);
  }
  return input;
}

/** The inverse of formToCareerInput: reads a persisted job.input wire payload back into canonical form keys (used to prefill regenerate/history views). */
export function careerInputToForm(input: Record<string, unknown> | null | undefined): CareerValuePatch {
  const values: CareerValuePatch = {};
  if (!input) return values;
  for (const key of CAREER_VALUE_KEYS) {
    const raw = input[WIRE_KEY[key]];
    if (typeof raw === "string" && raw) values[key] = normalizeCareerValue(key, raw);
  }
  return values;
}

export function careerInputToSources(input: Record<string, unknown> | null | undefined): CareerSources {
  const sources: CareerSources = {};
  if (!input) return sources;
  for (const key of CAREER_VALUE_KEYS) {
    if (key === "stage") continue;
    const raw = input[sourceWireKey(key)];
    if (typeof raw === "string") sources[key] = normalizeProvenance(raw);
  }
  return sources;
}

/** Normalizes an arbitrary worker-side job.input record for persistence: unknown keys dropped, every known field capped, kind preserved. */
export function normalizeCareerInput(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const values = careerInputToForm(raw);
  const sources = careerInputToSources(raw);
  const input = formToCareerInput(values, sources);
  const kind = String(raw?.kind || "combined");
  input.kind = kind;
  return input;
}

/** True if the normalized patch carries at least one non-empty canonical field (readiness/warnings do not count). */
export function isConformantCareerInput(patch: CareerValuePatch): boolean {
  return CAREER_VALUE_KEYS.some(key => Boolean(patch[key]));
}
