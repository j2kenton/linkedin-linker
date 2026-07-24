import type { ExtractWarning } from "./shared";
import { cleanText, capText, findText, metaContent, readJsonLd, canonicalCompanyUrl } from "./shared";

export interface CompanyExtraction { ready: boolean; companyName: string; companyUrl: string; industry: string; about: string; warnings: ExtractWarning[]; }

/**
 * Best-effort ladder for LinkedIn company pages, and useful non-canonical
 * contexts (company posts/insights) that still carry Organization JSON-LD or
 * Open Graph metadata: current company-page selectors, then JSON-LD
 * Organization data, then Open Graph metadata. The page's own URL is used as
 * the company URL whenever it's already a canonical /company/<slug> page.
 */
export function extractCompany(document: Document): CompanyExtraction {
  const warnings: ExtractWarning[] = [];
  const result: CompanyExtraction = { ready:false, companyName:"", companyUrl:"", industry:"", about:"", warnings };
  let structureFound = false;
  let bestEffort = true;

  const orgRoot = document.querySelector(".org-top-card, [data-view-name='company-overview'], [data-view-name='company-about-us']");
  if (orgRoot) {
    structureFound = true;
    bestEffort = false;
    result.companyName = findText(orgRoot, ["h1", ".org-top-card-summary__title"]);
    result.industry = findText(document, [".org-top-card-summary-info-list__info-item", ".org-page-details__definition-text"]);
    result.about = findText(document, ["[data-view-name='company-about-us-description'] p", "section.org-about-us-organization-description p", "p.break-words"]);
  }

  if (!result.companyName) {
    const org = readJsonLd(document, ["Organization", "Corporation"])[0];
    if (org) {
      structureFound = true;
      result.companyName = cleanText(org.name);
      result.about = result.about || cleanText(org.description);
      result.companyUrl = canonicalCompanyUrl(String(org.sameAs || org.url || ""));
    }
  }

  if (!result.companyName) {
    const metaTitle = metaContent(document, ["og:title"]);
    const metaDescription = metaContent(document, ["og:description", "description"]);
    if (metaTitle || metaDescription) {
      structureFound = true;
      result.companyName = metaTitle;
      result.about = result.about || metaDescription;
    }
  }

  // The page's own URL is the most reliable company URL when it's already a
  // canonical /company/<slug> page, regardless of which rung above matched.
  if (!result.companyUrl) {
    try { result.companyUrl = canonicalCompanyUrl(document.location?.href || ""); } catch { /* no document.location in some test harnesses */ }
  }

  if (!structureFound) return { ready:false, companyName:"", companyUrl:"", industry:"", about:"", warnings:[{ field:"page", message:"This does not look like a rendered LinkedIn company page yet." }] };

  result.ready = true;
  if (bestEffort) warnings.push({ field:"page", message:"Best-effort extraction: this doesn't look like a fully rendered LinkedIn company page, so only limited details were found." });
  if (!result.companyName) warnings.push({ field:"companyName", message:"companyName was not found on the page." });
  result.about = capText(result.about, 6000, "about", warnings);
  return result;
}
