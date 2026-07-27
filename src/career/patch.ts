import { CAREER_VALUE_KEYS, type CareerValuePatch } from "./fields";
import type { JobExtraction } from "../extract/job";
import { formatProfileProse, type ProfileExtraction } from "../extract/profile";
import type { CompanyExtraction } from "../extract/company";
import type { GenericExtraction } from "../extract/generic";

/** Which Career section requested the extraction — determines how a patch is mapped onto canonical fields. */
export type ExtractTarget = "job" | "profile" | "cv" | "company";

const clean = (value: string | undefined): string | undefined => (value && value.trim() ? value : undefined);

function jobPatch(data: JobExtraction): CareerValuePatch {
  const extras = [
    data.workplaceType ? `Workplace type: ${data.workplaceType}` : "",
    data.salary ? `Salary: ${data.salary}` : "",
    data.benefits ? `Benefits: ${data.benefits}` : "",
  ].filter(Boolean).join("\n");
  return {
    companyName: clean(data.companyName),
    companyUrl: clean(data.companyUrl),
    jobTitle: clean(data.title),
    seniority: clean(data.seniority),
    location: clean(data.location),
    jobDescription: clean([data.description, extras].filter(Boolean).join("\n\n")),
  };
}

function profilePatch(data: ProfileExtraction, target: "profile" | "cv"): CareerValuePatch {
  const prose = clean(formatProfileProse(data));
  return target === "cv" ? { cv: prose } : { profile: prose };
}

function companyPatch(data: CompanyExtraction): CareerValuePatch {
  const info = clean([data.industry ? `Industry: ${data.industry}` : "", data.about].filter(Boolean).join("\n\n"));
  return { companyName: clean(data.companyName), companyUrl: clean(data.companyUrl), companyInfo: info };
}

/**
 * LinkedIn's public job-page <title>/og:title shape:
 * "<Company> hiring <Role> in <Location> | LinkedIn", optionally with a
 * "(n) " notification-count prefix. English-UI only. The role segment is
 * greedy so a role containing " in " still splits at the final " in ".
 * Unverified against a live capture — defensive fallback, pending a
 * sanitized DOM capture (LinkedIn A/B-tests these shapes).
 */
const LINKEDIN_JOB_TITLE_PATTERN = /^(?:\(\d+\)\s+)?(.+?)\s+hiring\s+(.+)\s+in\s+(.+?)(?:\s*[|–—-]\s*LinkedIn)?$/i;

/**
 * The labeled seniority value inside collapsed visible text ("… Seniority
 * level Mid-Senior level Employment type …") — matched by its label against
 * LinkedIn's fixed vocabulary, never positionally. Unverified against a live
 * capture — defensive fallback, pending a sanitized DOM capture.
 */
const LABELED_SENIORITY_PATTERN = /\bseniority level[:\s]+(internship|entry level|associate|mid-senior level|director|executive)\b/i;

/**
 * Maps a generic-page extraction onto the field(s) relevant to the section
 * that requested it. companyUrl inference is restricted to the Company
 * target, only offered when exactly one distinct company link was found —
 * never guessed from a page with several candidate company links.
 */
function genericPatch(data: GenericExtraction, forTarget: ExtractTarget): CareerValuePatch {
  const block = clean(data.title ? `${data.title}\n\n${data.text}` : data.text);
  if (forTarget === "company") return { companyUrl: data.companyUrls.length === 1 ? data.companyUrls[0] : undefined, companyInfo: block };
  if (forTarget === "cv") return { cv: block };
  if (forTarget === "profile") return { profile: block };
  // Job target: beyond the raw JD block, try to recover the role details a
  // stale targeted selector set missed — the company/role/location triple
  // from LinkedIn's standard job-page title and the labeled seniority term
  // from the collapsed visible text. Every recovered value is best-effort:
  // the caller merges this patch UNDER the targeted one, so these only ever
  // fill gaps, and off-pattern pages simply yield no extra fields.
  const titleMatch = LINKEDIN_JOB_TITLE_PATTERN.exec(data.title);
  const seniorityMatch = LABELED_SENIORITY_PATTERN.exec(data.text);
  return {
    jobTitle: clean(titleMatch?.[2]?.trim()),
    companyName: clean(titleMatch?.[1]?.trim()),
    location: clean(titleMatch?.[3]?.trim()),
    seniority: clean(seniorityMatch?.[1]),
    jobDescription: block,
  };
}

/**
 * Combines two patches for the same target, preferring `preferred` wherever
 * it carries a non-empty value; `base` only fills fields `preferred` left
 * empty. Lets a best-effort generic-page pass backfill the fields a partial
 * targeted extraction missed without ever clobbering its precise values.
 */
export function mergeCareerPatches(base: CareerValuePatch, preferred: CareerValuePatch): CareerValuePatch {
  const merged: CareerValuePatch = { ...base };
  for (const key of CAREER_VALUE_KEYS) {
    const value = preferred[key];
    if (value && value.trim()) merged[key] = value;
  }
  return merged;
}

export function toPatch(
  target: ExtractTarget,
  data: JobExtraction | ProfileExtraction | CompanyExtraction | GenericExtraction,
  isGeneric = false,
): CareerValuePatch {
  if (isGeneric) return genericPatch(data as GenericExtraction, target);
  if (target === "job") return jobPatch(data as JobExtraction);
  if (target === "company") return companyPatch(data as CompanyExtraction);
  return profilePatch(data as ProfileExtraction, target === "cv" ? "cv" : "profile");
}

/** True if the patch carries at least one non-empty canonical field. */
export function hasUsefulCareerPatch(patch: CareerValuePatch): boolean {
  return Object.values(patch).some(value => Boolean(value && value.trim()));
}
