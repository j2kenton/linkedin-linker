export type LinkedInPageKind = "profile" | "job" | "company" | "generic" | "unsupported";

const UNSUPPORTED_PROTOCOL = /^(chrome|chrome-extension|edge|about|moz-extension|devtools|view-source|file):/i;
const UNSUPPORTED_HOST = /(^|\.)(chromewebstore\.google\.com|chrome\.google\.com|microsoftedge\.microsoft\.com)$/i;

/**
 * Classifies any readable page for extraction purposes. Recognised LinkedIn
 * profile/job/company URLs get their own kind; every other readable page
 * (LinkedIn or not) is "generic" and still gets a best-effort extraction
 * attempt. Only genuinely inaccessible browser-internal pages are
 * "unsupported".
 */
export function classifyUrl(rawUrl: string): LinkedInPageKind {
  if (UNSUPPORTED_PROTOCOL.test(rawUrl)) return "unsupported";
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "unsupported"; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "unsupported";
  if (UNSUPPORTED_HOST.test(url.hostname)) return "unsupported";
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return "generic";
  const path = url.pathname.replace(/\/+$/, "");
  if (/\/(login|authwall|checkpoint)(\/|$)/i.test(path)) return "generic";
  if (/^\/in\/[^/]+/i.test(path)) return "profile";
  if (/^\/jobs\/view\/\d+$/i.test(path)) return "job";
  if (/^\/jobs\/(search|collections)\/?$/i.test(path) && /^\d+$/.test(url.searchParams.get("currentJobId") || "")) return "job";
  if (/^\/company\/[^/]+/i.test(path)) return "company";
  return "generic";
}

/**
 * The store build's declared content script only injects into
 * https://www.linkedin.com/* (see manifest.store.json's
 * content_scripts.matches). Pass `hostPattern: null` for a build whose
 * content script matches every host (e.g. the dev build's <all_urls>).
 */
export const STORE_CONTENT_SCRIPT_HOST = /^https:\/\/www\.linkedin\.com\//i;

/** What kind of page this is, for extraction purposes — independent of whether the current build's declared content script can reach it. */
export function extractableKind(rawUrl: string, _hostPattern: RegExp | null): LinkedInPageKind {
  return classifyUrl(rawUrl);
}

/** Whether the calling build's *declared* (manifest-matched) content script can reach this URL without on-demand injection. */
export function hasDeclaredContentScript(rawUrl: string, hostPattern: RegExp | null): boolean {
  if (!hostPattern) return true;
  return hostPattern.test(rawUrl);
}
