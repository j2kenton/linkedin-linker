import { CAREER_VALUE_KEYS, capForKey, normalizeCareerValuePatch, type CareerSources, type CareerValueKey, type CareerValuePatch, type CareerValues } from "./fields";

export interface MergeSourceMeta { url?: string; label?: string; }
export interface MergeOutcome { values: CareerValues; sources: CareerSources; added: CareerValueKey[]; skipped: CareerValueKey[]; }

const LONG_FIELDS = new Set<CareerValueKey>(["cv", "profile", "companyInfo", "jobDescription"]);

/**
 * Additively merges a freshly extracted patch into the current form values.
 * Never overwrites existing data: a scalar field only fills when currently
 * empty (otherwise it's left alone — the user's existing value wins); a
 * long-text field that already has content gets the new content appended as
 * a labelled block, or skipped outright if that exact text is already
 * present so re-running an extraction never duplicates it.
 */
export function mergeExtraction(
  current: CareerValues,
  currentSources: CareerSources,
  patch: CareerValuePatch,
  meta: MergeSourceMeta = {},
): MergeOutcome {
  const normalized = normalizeCareerValuePatch(patch);
  const values: CareerValues = { ...current };
  const sources: CareerSources = { ...currentSources };
  const added: CareerValueKey[] = [];
  const skipped: CareerValueKey[] = [];

  for (const key of CAREER_VALUE_KEYS) {
    const incoming = normalized[key];
    if (!incoming) continue;
    const existing = (current[key] || "").trim();

    if (!existing) {
      values[key] = incoming.slice(0, capForKey(key));
      sources[key] = "extracted";
      added.push(key);
      continue;
    }

    if (!LONG_FIELDS.has(key)) { skipped.push(key); continue; }
    if (existing.includes(incoming.trim())) { skipped.push(key); continue; }

    const label = meta.label || meta.url;
    const block = label ? `[Extracted from ${label}]\n${incoming}` : incoming;
    values[key] = `${existing}\n\n${block}`.slice(0, capForKey(key));
    sources[key] = "mixed";
    added.push(key);
  }

  return { values, sources, added, skipped };
}
