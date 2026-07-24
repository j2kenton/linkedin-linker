import type { CareerValuePatch } from "./fields";
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
  return { jobDescription: block };
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
