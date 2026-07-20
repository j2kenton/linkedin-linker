export type LinkedInPageKind = "profile" | "job" | "other";

/** Classifies only usable, authenticated LinkedIn destinations. */
export function classifyUrl(rawUrl: string): LinkedInPageKind {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "other"; }
  if (url.protocol !== "https:" || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return "other";
  const path = url.pathname.replace(/\/+$/, "");
  if (/\/(login|authwall|checkpoint)(\/|$)/i.test(path)) return "other";
  if (/^\/in\/[^/]+/i.test(path)) return "profile";
  if (/^\/jobs\/view\/\d+$/i.test(path)) return "job";
  if (/^\/jobs\/(search|collections)\/?$/i.test(path) && /^\d+$/.test(url.searchParams.get("currentJobId") || "")) return "job";
  return "other";
}

/**
 * The store build's content script only injects into
 * https://www.linkedin.com/* (see manifest.store.json's
 * content_scripts.matches), so a page classifyUrl recognizes as a
 * profile/job page — bare linkedin.com, a locale subdomain — can never
 * actually respond to an extraction request there.
 */
export const STORE_CONTENT_SCRIPT_HOST = /^https:\/\/www\.linkedin\.com\//i;

/**
 * classifyUrl narrowed to hosts the calling build's content script can
 * actually reach. Pass `hostPattern: null` for a build whose content script
 * matches every host (e.g. the dev build's <all_urls>).
 */
export function extractableKind(rawUrl: string, hostPattern: RegExp | null): LinkedInPageKind {
  if (hostPattern && !hostPattern.test(rawUrl)) return "other";
  return classifyUrl(rawUrl);
}
