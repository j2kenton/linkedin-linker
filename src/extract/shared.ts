export interface ExtractWarning { field: string; message: string; }

export const cleanText = (value: unknown): string => String(value || "").replace(/\s+/g, " ").trim();

export function capText(text: string, max: number, field: string, warnings: ExtractWarning[]): string {
  if (text.length <= max) return text;
  warnings.push({ field, message: `Truncated to ${max} characters.` });
  return `${text.slice(0, max)}…`;
}

export function findText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const value = cleanText(root.querySelector(selector)?.textContent || "");
    if (value) return value;
  }
  return "";
}

/** Reads the first non-empty of several og: or name meta tags. */
export function metaContent(document: Document, names: string[]): string {
  for (const name of names) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    const value = cleanText(el?.getAttribute("content") || "");
    if (value) return value;
  }
  return "";
}

/** Parses every JSON-LD script block on the page, flattening @graph arrays, and returns parsed objects whose @type matches one of `types`. */
export function readJsonLd(document: Document, types: string[]): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const matchesType = (type: unknown): boolean => {
    if (typeof type === "string") return types.includes(type);
    if (Array.isArray(type)) return type.some(item => types.includes(String(item)));
    return false;
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try { parsed = JSON.parse(script.textContent || ""); } catch { continue; }
    const graph = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["@graph"])
      ? (parsed as Record<string, unknown>)["@graph"] as unknown[]
      : null;
    const items = Array.isArray(parsed) ? parsed : graph || [parsed];
    for (const item of items) {
      if (item && typeof item === "object" && matchesType((item as Record<string, unknown>)["@type"])) {
        results.push(item as Record<string, unknown>);
      }
    }
  }
  return results;
}

/** Capped, whitespace-collapsed visible text — the last-resort fallback shared by every extractor. */
export function visibleText(root: Document | Element, max: number): string {
  const element = root instanceof Document ? root.body : root;
  if (!element) return "";
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Normalizes any LinkedIn company href down to a canonical https://www.linkedin.com/company/<slug>/ form, or "" if it isn't one. */
export function canonicalCompanyUrl(href: string): string {
  if (!href) return "";
  try {
    const url = new URL(href, "https://www.linkedin.com");
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return "";
    const match = /^\/company\/([^/?#]+)/i.exec(url.pathname);
    return match ? `https://www.linkedin.com/company/${match[1]}/` : "";
  } catch { return ""; }
}

/** Discovers every distinct canonical LinkedIn company URL linked from the document. */
export function discoverCompanyUrls(document: Document): string[] {
  const found = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/company/"]').forEach(anchor => {
    const canonical = canonicalCompanyUrl(anchor.getAttribute("href") || "");
    if (canonical) found.add(canonical);
  });
  return [...found];
}
