import type { ExtractWarning } from "./shared";
import { cleanText, metaContent, readJsonLd, visibleText, discoverCompanyUrls } from "./shared";

export interface GenericExtraction { ready: boolean; title: string; text: string; companyUrls: string[]; warnings: ExtractWarning[]; }

/**
 * The catch-all extractor used for any current page — LinkedIn or not —
 * that isn't a recognised profile/job/company URL (posts, search-result
 * pages, feed items, and every non-LinkedIn page). It never requires a
 * specific container to exist: title/description metadata, relevant JSON-LD,
 * and a capped dump of visible text are all fair game, since the whole point
 * is a best-effort attempt rather than a precise structured extraction.
 * Reports not-ready only when literally nothing readable was found.
 */
export function extractGenericPage(document: Document): GenericExtraction {
  const title = metaContent(document, ["og:title"]) || cleanText(document.title) || cleanText(document.querySelector("h1")?.textContent || "");
  const description = metaContent(document, ["og:description", "description"]);
  const jsonLd = readJsonLd(document, ["Article", "NewsArticle", "SocialMediaPosting", "Person", "Organization", "JobPosting", "DiscussionForumPosting"]);
  const jsonLdText = jsonLd
    .map(item => cleanText(String(item.description || item.articleBody || item.text || "")))
    .filter(Boolean)
    .join("\n\n");
  const bodyText = visibleText(document, 8000);
  const companyUrls = discoverCompanyUrls(document);
  const text = [description, jsonLdText, bodyText].filter(Boolean).join("\n\n").slice(0, 12000);

  if (!title && !text) {
    return { ready:false, title:"", text:"", companyUrls:[], warnings:[{ field:"page", message:"No readable content was found on this page." }] };
  }
  return { ready:true, title, text, companyUrls, warnings:[] };
}
