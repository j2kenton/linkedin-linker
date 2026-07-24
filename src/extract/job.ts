import type { ExtractWarning } from "./shared";
import { cleanText, findText, metaContent, readJsonLd, canonicalCompanyUrl } from "./shared";

export interface JobExtraction { ready: boolean; title: string; companyName: string; companyUrl: string; location: string; workplaceType: string; seniority: string; description: string; salary: string; benefits: string; warnings: ExtractWarning[]; }

const emptyJob = (message: string): JobExtraction => ({ ready:false, title:"", companyName:"", companyUrl:"", location:"", workplaceType:"", seniority:"", description:"", salary:"", benefits:"", warnings:[{field:"page",message}] });
const REQUIRED_FIELDS: (keyof Pick<JobExtraction, "title" | "companyName" | "companyUrl" | "description">)[] = ["title", "companyName", "companyUrl", "description"];
type FillableField = "title" | "companyName" | "companyUrl" | "location" | "workplaceType" | "seniority" | "description" | "salary" | "benefits";
const FILLABLE_FIELDS: readonly FillableField[] = ["title", "companyName", "companyUrl", "location", "workplaceType", "seniority", "description", "salary", "benefits"];

/**
 * Best-effort ladder: current job-page selectors first (most precise, and
 * the only rung that can report readiness on an all-empty page — see the
 * sparse-fields test), then JSON-LD JobPosting data, then Open Graph
 * metadata. Each rung only fills fields the previous rung left empty. Unlike
 * the generic-page extractor, this never falls back to raw visible text: a
 * bare skeleton page (no matching container, no JobPosting data, no OG tags)
 * must keep reporting not-ready so the popup's retry loop keeps waiting for
 * LinkedIn's SPA to finish mounting instead of returning an empty "success".
 */
export function extractJob(document: Document): JobExtraction {
  const warnings: ExtractWarning[] = [];
  const result: JobExtraction = { ready:false, title:"", companyName:"", companyUrl:"", location:"", workplaceType:"", seniority:"", description:"", salary:"", benefits:"", warnings };
  const fill = (source: Partial<Record<FillableField, string>>) => {
    for (const key of FILLABLE_FIELDS) {
      const value = source[key];
      if (!result[key] && value) result[key] = value;
    }
  };

  // ".jobs-details"/".jobs-unified-top-card" are legacy class tokens kept as
  // a fallback; the live tokens are "jobs-details__main-content" and
  // "job-details-jobs-unified-top-card__container".
  const jobRoot = document.querySelector(".jobs-details__main-content, .job-details-jobs-unified-top-card__container, .jobs-details, .jobs-unified-top-card, .job-view-layout");
  let structureFound = Boolean(jobRoot);
  let bestEffort = !jobRoot;
  if (jobRoot) {
    // Scope every lookup to the job detail pane rather than document.body —
    // on /jobs/search, document.body also contains sidebar recommendation
    // cards with their own a[href*="/company/"] links.
    const root = document.querySelector(".jobs-details__main-content") || jobRoot;
    const companyLink = root.querySelector<HTMLAnchorElement>('a[href*="/company/"]');
    fill({
      title: findText(root, ["h1", ".job-details-jobs-unified-top-card__job-title"]),
      companyName: cleanText(companyLink?.textContent || ""),
      companyUrl: companyLink ? canonicalCompanyUrl(companyLink.href) : "",
      location: findText(root, [".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__bullet-text"]),
      workplaceType: findText(root, [".job-details-jobs-unified-top-card__workplace-type", ".jobs-unified-top-card__workplace-type"]),
      seniority: findText(root, [".job-details-jobs-unified-top-card__job-insight", ".description__job-criteria-text--criteria", ".jobs-details__job-criteria"]),
      description: findText(root, [".jobs-description__content .jobs-box__html-content", "#job-details", ".jobs-description", ".jobs-box__html-content"]),
      salary: findText(root, [".jobs-details__salary-main-rail", ".compensation__salary", ".jobs-details__salary"]),
      benefits: findText(root, [".jobs-details__benefits", ".benefits"]),
    });
  }

  if (!result.title || !result.companyName || !result.description) {
    const posting = readJsonLd(document, ["JobPosting"])[0];
    if (posting) {
      structureFound = true;
      if (!jobRoot) bestEffort = true;
      const org = posting.hiringOrganization as Record<string, unknown> | undefined;
      const rawLocation = posting.jobLocation as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const firstLocation = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
      const address = (firstLocation?.address ?? {}) as Record<string, unknown>;
      fill({
        title: cleanText(posting.title),
        companyName: cleanText(org?.name),
        companyUrl: canonicalCompanyUrl(String(org?.sameAs || org?.url || "")),
        location: cleanText([address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", ")),
        workplaceType: cleanText(posting.jobLocationType),
        description: cleanText(String(posting.description || "").replace(/<[^>]+>/g, " ")),
      });
    }
  }

  if (!result.title && !result.description) {
    const metaTitle = metaContent(document, ["og:title"]);
    const metaDescription = metaContent(document, ["og:description", "description"]);
    if (metaTitle || metaDescription) {
      structureFound = true;
      bestEffort = true;
      fill({ title: metaTitle, description: metaDescription });
    }
  }

  if (!structureFound) return emptyJob("This does not look like a rendered LinkedIn job page yet.");

  result.ready = true;
  if (bestEffort) warnings.push({ field:"page", message:"Best-effort extraction: this doesn't look like a fully rendered LinkedIn job page, so only limited details were found." });
  for (const field of REQUIRED_FIELDS) {
    if (!result[field]) warnings.push({ field, message: `${field} was not found on the page.` });
  }

  let excess = FILLABLE_FIELDS.reduce((sum, field) => sum + result[field].length, 0) - 30_000;
  for (const field of ["benefits", "salary", "description"] as const) {
    if (excess <= 0) break;
    const remove = Math.min(excess, result[field].length);
    result[field] = result[field].slice(0, result[field].length - remove);
    excess -= remove;
    warnings.push({ field, message: "Trimmed to keep the combined job payload within 30,000 characters." });
  }
  return result;
}
