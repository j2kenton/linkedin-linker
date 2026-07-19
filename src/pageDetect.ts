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
