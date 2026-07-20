import type { ExtractWarning } from "./profile";
export interface JobExtraction { ready: boolean; title: string; companyName: string; companyUrl: string; location: string; workplaceType: string; seniority: string; description: string; salary: string; benefits: string; warnings: ExtractWarning[]; }
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const findText = (root: ParentNode, selectors: string[]) => { for (const s of selectors) { const value = clean(root.querySelector(s)?.textContent || ""); if (value) return value; } return ""; };
const emptyJob = (message: string): JobExtraction => ({ ready:false, title:"", companyName:"", companyUrl:"", location:"", workplaceType:"", seniority:"", description:"", salary:"", benefits:"", warnings:[{field:"page",message}] });
const REQUIRED_FIELDS: (keyof Pick<JobExtraction, "title" | "companyName" | "companyUrl" | "description">)[] = ["title", "companyName", "companyUrl", "description"];
export function extractJob(document: Document): JobExtraction {
  const warnings: ExtractWarning[] = [];
  // A bare <main> renders on nearly every LinkedIn route, including profile
  // pages, so readiness must key off a job-page-specific container. Falling
  // back to any <main> let EXTRACT_JOB report ready:true with empty fields
  // on a non-job page. ".jobs-details"/".jobs-unified-top-card" are legacy
  // class tokens that no longer appear in current markup — the live tokens
  // are "jobs-details__main-content" and
  // "job-details-jobs-unified-top-card__container".
  const jobRoot = document.querySelector(".jobs-details__main-content, .job-details-jobs-unified-top-card__container, .jobs-details, .jobs-unified-top-card, .job-view-layout");
  if (!jobRoot) return emptyJob("This does not look like a rendered LinkedIn job page yet.");
  // Scope every lookup to the job detail pane rather than document.body — on
  // /jobs/search, document.body also contains sidebar recommendation cards
  // with their own a[href*="/company/"] links, which a body-wide query would
  // match ahead of (or instead of) the real job's company link.
  const root = document.querySelector(".jobs-details__main-content") || jobRoot;
  const companyLink = root.querySelector<HTMLAnchorElement>('a[href*="/company/"]');
  const description = findText(root, [".jobs-description__content .jobs-box__html-content", "#job-details", ".jobs-description", ".jobs-box__html-content"]);
  const cap = (s: string, field: string) => s.length > 14000 ? (warnings.push({field,message:"Truncated to 14,000 characters."}), `${s.slice(0, 14000)}…`) : s;
  const result: JobExtraction = { ready:true, title:findText(root,["h1", ".job-details-jobs-unified-top-card__job-title"]), companyName:clean(companyLink?.textContent || ""), companyUrl:companyLink?.href || "", location:findText(root,[".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__bullet-text"]), workplaceType:findText(root,[".job-details-jobs-unified-top-card__workplace-type", ".jobs-unified-top-card__workplace-type"]), seniority:findText(root,[".job-details-jobs-unified-top-card__job-insight", ".description__job-criteria-text--criteria", ".jobs-details__job-criteria"]), description:cap(description,"description"), salary:findText(root,[".jobs-details__salary-main-rail", ".compensation__salary", ".jobs-details__salary"]), benefits:findText(root,[".jobs-details__benefits", ".benefits"]), warnings };
  for (const field of REQUIRED_FIELDS) {
    if (!result[field]) warnings.push({ field, message: `${field} was not found on the page.` });
  }
  const fields: (keyof Pick<JobExtraction, "title" | "companyName" | "companyUrl" | "location" | "workplaceType" | "seniority" | "description" | "salary" | "benefits">)[] = ["title", "companyName", "companyUrl", "location", "workplaceType", "seniority", "description", "salary", "benefits"];
  let excess = fields.reduce((sum, field) => sum + result[field].length, 0) - 30_000;
  for (const field of ["benefits", "salary", "description"] as const) {
    if (excess <= 0) break;
    const remove = Math.min(excess, result[field].length);
    result[field] = result[field].slice(0, result[field].length - remove);
    excess -= remove;
    warnings.push({ field, message: "Trimmed to keep the combined job payload within 30,000 characters." });
  }
  return result;
}
