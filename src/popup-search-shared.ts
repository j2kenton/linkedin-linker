import { classifyUrl } from "./pageDetect";
import { requestExtraction } from "./popup-career-shared";

export interface SearchFormElements {
  companyNameInput: HTMLInputElement;
  companiesIdsInput: HTMLInputElement;
  titleOfProspectInput: HTMLInputElement;
  locationIdsInput: HTMLInputElement;
  connectionDegreeInput: HTMLSelectElement;
  startPageInput: HTMLInputElement;
}

export interface UrlExtractionElements {
  statusDiv: HTMLDivElement;
  getFromUrlButton: HTMLButtonElement;
  getLocationFromUrlButton: HTMLButtonElement;
  getCompanyNameFromUrlButton: HTMLButtonElement;
  getTitleFromUrlButton: HTMLButtonElement;
  getConnectionDegreeFromUrlButton: HTMLButtonElement;
  getStartPageFromUrlButton: HTMLButtonElement;
}

export interface SearchStrings {
  noTabUrl: string;
  notSearchPage: string;
  noCompany: string;
  invalidCompany: string;
  companyExtracted: (ids: string) => string;
  parseCompanyFailed: string;
  noLocation: string;
  invalidLocation: string;
  locationExtracted: (ids: string) => string;
  parseLocationFailed: string;
  noCompanyName: string;
  companyNameExtracted: (name: string) => string;
  parseCompanyNameFailed: string;
  companyPagePending: string;
  companyPageFailed: string;
  companyIdOnly: (ids: string) => string;
  companyNameWrongPage: string;
  noTitle: string;
  titleExtracted: (title: string) => string;
  parseTitleFailed: string;
  noConnectionDegree: string;
  invalidConnectionDegree: string;
  connectionDegreeExtracted: (degrees: string) => string;
  parseConnectionDegreeFailed: string;
  noPage: string;
  invalidPage: string;
  pageExtracted: (page: number) => string;
  parsePageFailed: string;
}

const SUCCESS_COLOR = "#057642";
const DANGER_COLOR = "#B3261E";
const PENDING_COLOR = "#56687A";

type Report = (text: string, color: string) => void;

/** True only for an http(s) URL on linkedin.com (or a subdomain) whose path is the people search results page. */
const isPeopleSearchUrl = (url: string): boolean => {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return false;
  return /^\/search\/results\/people(\/|$)/i.test(parsed.pathname);
};

function parseIdArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Free text for the "Search keywords" field from a LinkedIn people-search URL.
 * `titleFreeText` wins (the generated URL carries it); otherwise `keywords`. When the
 * URL also carries a `company` parameter, a trailing copy of that company name is
 * removed because generateLinkedInURL appends the company name to `keywords`.
 */
export function extractFreeText(url: string): string | null {
  let params: URLSearchParams;
  try { params = new URL(url).searchParams; } catch { return null; }
  const titleFreeText = params.get("titleFreeText")?.trim();
  if (titleFreeText) return titleFreeText;
  let keywords = params.get("keywords")?.trim() ?? "";
  const company = params.get("company")?.trim();
  if (keywords && company && keywords.toLowerCase().endsWith(company.toLowerCase())) {
    keywords = keywords.slice(0, keywords.length - company.length).trim();
  }
  return keywords || null;
}

export type CompanyNameSource =
  | { kind: "companyPage" }
  | { kind: "name"; name: string }
  | { kind: "idOnly"; ids: string[] }
  | { kind: "none" }
  | { kind: "wrongPage" };

/** Where the Target company name can come from for the given tab URL. */
export function resolveCompanyNameSource(url: string): CompanyNameSource {
  if (classifyUrl(url) === "company") return { kind: "companyPage" };
  if (!isPeopleSearchUrl(url)) return { kind: "wrongPage" };
  let params: URLSearchParams;
  try { params = new URL(url).searchParams; } catch { return { kind: "wrongPage" }; }
  const name = params.get("company")?.trim();
  if (name) return { kind: "name", name };
  const ids = parseIdArray(params.get("currentCompany"));
  if (ids.length > 0) return { kind: "idOnly", ids };
  return { kind: "none" };
}

function requireLinkedInSearchTab(
  tab: chrome.tabs.Tab | undefined,
  report: Report,
  strings: SearchStrings
): chrome.tabs.Tab | null {
  if (!tab || !tab.url) {
    report(strings.noTabUrl, DANGER_COLOR);
    return null;
  }
  if (!isPeopleSearchUrl(tab.url)) {
    report(strings.notSearchPage, DANGER_COLOR);
    return null;
  }
  return tab;
}

function extractJsonArrayParam(
  url: string,
  paramName: string,
  input: HTMLInputElement,
  report: Report,
  noParamMsg: string,
  invalidMsg: string,
  extractedMsg: (value: string) => string,
  parseFailedMsg: string
): void {
  try {
    const param = new URL(url).searchParams.get(paramName);
    if (!param) {
      report(noParamMsg, DANGER_COLOR);
      return;
    }
    const decoded = decodeURIComponent(param);
    const arr = JSON.parse(decoded) as string[];
    if (!Array.isArray(arr) || arr.length === 0) {
      report(invalidMsg, DANGER_COLOR);
      return;
    }
    const joined = arr.join(",");
    input.value = joined;
    report(extractedMsg(joined), SUCCESS_COLOR);
  } catch {
    report(parseFailedMsg, DANGER_COLOR);
  }
}

export function attachUrlExtractionHandlers(
  form: SearchFormElements,
  elements: UrlExtractionElements,
  strings: SearchStrings
): void {
  const { statusDiv } = elements;
  const resultLines: HTMLElement[] = [];

  // One visible result line right under each Get button, in addition to the sticky #status line.
  const bind = (
    button: HTMLButtonElement,
    handler: (tab: chrome.tabs.Tab | undefined, report: Report) => void | Promise<void>
  ): void => {
    const resultEl = document.createElement("small");
    resultEl.className = "url-result";
    resultEl.setAttribute("role", "status");
    resultEl.setAttribute("aria-live", "polite");
    button.insertAdjacentElement("afterend", resultEl);
    resultLines.push(resultEl);

    const report: Report = (text, color) => {
      statusDiv.textContent = text;
      statusDiv.style.color = color;
      resultEl.textContent = text;
      resultEl.style.color = color;
    };

    button.addEventListener("click", () => {
      for (const line of resultLines) line.textContent = "";
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        void Promise.resolve(handler(tabs[0], report)).catch(() => report(strings.companyPageFailed, DANGER_COLOR));
      });
    });
  };

  const bindSearchTab = (
    button: HTMLButtonElement,
    handler: (url: string, report: Report) => void
  ): void => {
    bind(button, (tab, report) => {
      const found = requireLinkedInSearchTab(tab, report, strings);
      if (!found || !found.url) return;
      handler(found.url, report);
    });
  };

  bindSearchTab(elements.getFromUrlButton, (url, report) =>
    extractJsonArrayParam(
      url, "currentCompany", form.companiesIdsInput, report,
      strings.noCompany, strings.invalidCompany,
      strings.companyExtracted, strings.parseCompanyFailed
    ));

  bindSearchTab(elements.getLocationFromUrlButton, (url, report) =>
    extractJsonArrayParam(
      url, "geoUrn", form.locationIdsInput, report,
      strings.noLocation, strings.invalidLocation,
      strings.locationExtracted, strings.parseLocationFailed
    ));

  // Company name: a company page is read through the extraction handler; a search URL only
  // carries the name when this extension generated it. A currentCompany ID is never a name.
  bind(elements.getCompanyNameFromUrlButton, async (tab, report) => {
    if (!tab || !tab.url) {
      report(strings.noTabUrl, DANGER_COLOR);
      return;
    }
    const source = resolveCompanyNameSource(tab.url);
    switch (source.kind) {
      case "companyPage": {
        report(strings.companyPagePending, PENDING_COLOR);
        let name = "";
        if (tab.id !== undefined) {
          try {
            const extraction = await requestExtraction(tab.id, "EXTRACT_COMPANY");
            name = typeof extraction?.companyName === "string" ? extraction.companyName.trim() : "";
          } catch {
            name = "";
          }
        }
        if (!name) {
          report(strings.companyPageFailed, DANGER_COLOR);
          return;
        }
        form.companyNameInput.value = name;
        report(strings.companyNameExtracted(name), SUCCESS_COLOR);
        return;
      }
      case "name":
        form.companyNameInput.value = source.name;
        report(strings.companyNameExtracted(source.name), SUCCESS_COLOR);
        return;
      case "idOnly":
        report(strings.companyIdOnly(source.ids.join(", ")), DANGER_COLOR);
        return;
      case "none":
        report(strings.noCompanyName, DANGER_COLOR);
        return;
      default:
        report(strings.companyNameWrongPage, DANGER_COLOR);
    }
  });

  bindSearchTab(elements.getTitleFromUrlButton, (url, report) => {
    const text = extractFreeText(url);
    if (!text) {
      report(strings.noTitle, DANGER_COLOR);
      return;
    }
    form.titleOfProspectInput.value = text;
    report(strings.titleExtracted(text), SUCCESS_COLOR);
  });

  bindSearchTab(elements.getConnectionDegreeFromUrlButton, (url, report) => {
    try {
      const param = new URL(url).searchParams.get("network");
      if (!param) {
        report(strings.noConnectionDegree, DANGER_COLOR);
        return;
      }
      const decoded = decodeURIComponent(param);
      const degrees = JSON.parse(decoded) as string[];
      if (!Array.isArray(degrees) || degrees.length === 0) {
        report(strings.invalidConnectionDegree, DANGER_COLOR);
        return;
      }
      Array.from(form.connectionDegreeInput.options).forEach(opt => {
        opt.selected = degrees.includes(opt.value);
      });
      report(strings.connectionDegreeExtracted(degrees.join(", ")), SUCCESS_COLOR);
    } catch {
      report(strings.parseConnectionDegreeFailed, DANGER_COLOR);
    }
  });

  bindSearchTab(elements.getStartPageFromUrlButton, (url, report) => {
    try {
      const param = new URL(url).searchParams.get("page");
      if (!param) {
        report(strings.noPage, DANGER_COLOR);
        return;
      }
      const n = parseInt(param);
      if (isNaN(n) || n < 1) {
        report(strings.invalidPage, DANGER_COLOR);
        return;
      }
      form.startPageInput.value = String(n);
      report(strings.pageExtracted(n), SUCCESS_COLOR);
    } catch {
      report(strings.parsePageFailed, DANGER_COLOR);
    }
  });
}

/**
 * Wires every `button[data-clear-for="<inputId>"]` under `root` to empty its text input or
 * textarea, fire a bubbling `input` event (so saved state and previews update) and refocus it.
 * Deliberately keyed on data-clear-for, not the Career tab's `.career-clear[data-key]` buttons.
 */
export function attachClearButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("button[data-clear-for]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.clearFor ?? "");
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      target.value = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.focus();
    });
  });
}

export interface GenerateUrlValues {
  companyName: string;
  companiesIds: string;
  titleOfProspect: string;
  locationIds: string;
  connectionDegree: string[];
  startPage: number;
}

export function generateLinkedInURL(values: GenerateUrlValues): string {
  const url = "https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH";
  const params: string[] = [];

  const companyName = values.companyName.trim();
  if (companyName) {
    params.push(`company=${encodeURIComponent(companyName)}`);
  }

  let keywords = "";
  const title = values.titleOfProspect.trim();
  if (title) {
    keywords = encodeURIComponent(title);
  }
  if (companyName) {
    keywords += (keywords ? "%20" : "") + encodeURIComponent(companyName);
  }
  if (keywords) {
    params.push(`keywords=${keywords}`);
  }

  const ids = values.companiesIds.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length > 0) {
    params.push(`currentCompany=${encodeURIComponent(JSON.stringify(ids))}`);
  }

  const locs = values.locationIds.split(",").map(s => s.trim()).filter(Boolean);
  if (locs.length > 0) {
    params.push(`geoUrn=${encodeURIComponent(JSON.stringify(locs))}`);
  }

  if (values.connectionDegree.length > 0) {
    params.push(`network=${encodeURIComponent(JSON.stringify(values.connectionDegree))}`);
  }

  params.push(`page=${values.startPage}`);

  if (title) {
    params.push(`titleFreeText=${encodeURIComponent(title)}`);
  }

  params.push("sid=BpI");

  return url + "&" + params.join("&");
}
