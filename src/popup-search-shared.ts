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

function setStatus(statusDiv: HTMLDivElement, text: string, color: string): void {
  statusDiv.textContent = text;
  statusDiv.style.color = color;
}

function requireLinkedInSearchTab(
  tabs: chrome.tabs.Tab[],
  statusDiv: HTMLDivElement,
  strings: SearchStrings
): chrome.tabs.Tab | null {
  const tab = tabs[0];
  if (!tab || !tab.url) {
    setStatus(statusDiv, strings.noTabUrl, "#d93025");
    return null;
  }
  if (!tab.url.includes("linkedin.com/search/results/people")) {
    setStatus(statusDiv, strings.notSearchPage, "#d93025");
    return null;
  }
  return tab;
}

function extractJsonArrayParam(
  url: string,
  paramName: string,
  input: HTMLInputElement,
  statusDiv: HTMLDivElement,
  noParamMsg: string,
  invalidMsg: string,
  extractedMsg: (value: string) => string,
  parseFailedMsg: string
): void {
  try {
    const param = new URL(url).searchParams.get(paramName);
    if (!param) {
      setStatus(statusDiv, noParamMsg, "#d93025");
      return;
    }
    const decoded = decodeURIComponent(param);
    const arr = JSON.parse(decoded) as string[];
    if (!Array.isArray(arr) || arr.length === 0) {
      setStatus(statusDiv, invalidMsg, "#d93025");
      return;
    }
    const joined = arr.join(",");
    input.value = joined;
    setStatus(statusDiv, extractedMsg(joined), "#188038");
  } catch {
    setStatus(statusDiv, parseFailedMsg, "#d93025");
  }
}

export function attachUrlExtractionHandlers(
  form: SearchFormElements,
  elements: UrlExtractionElements,
  strings: SearchStrings
): void {
  const { statusDiv } = elements;

  elements.getFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      extractJsonArrayParam(
        tab.url, "currentCompany", form.companiesIdsInput, statusDiv,
        strings.noCompany, strings.invalidCompany,
        strings.companyExtracted, strings.parseCompanyFailed
      );
    });
  });

  elements.getLocationFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      extractJsonArrayParam(
        tab.url, "geoUrn", form.locationIdsInput, statusDiv,
        strings.noLocation, strings.invalidLocation,
        strings.locationExtracted, strings.parseLocationFailed
      );
    });
  });

  elements.getCompanyNameFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("company");
        if (!param) {
          setStatus(statusDiv, strings.noCompanyName, "#d93025");
          return;
        }
        const name = decodeURIComponent(param);
        form.companyNameInput.value = name;
        setStatus(statusDiv, strings.companyNameExtracted(name), "#188038");
      } catch {
        setStatus(statusDiv, strings.parseCompanyNameFailed, "#d93025");
      }
    });
  });

  elements.getTitleFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("titleFreeText");
        if (!param) {
          setStatus(statusDiv, strings.noTitle, "#d93025");
          return;
        }
        const title = decodeURIComponent(param);
        form.titleOfProspectInput.value = title;
        setStatus(statusDiv, strings.titleExtracted(title), "#188038");
      } catch {
        setStatus(statusDiv, strings.parseTitleFailed, "#d93025");
      }
    });
  });

  elements.getConnectionDegreeFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("network");
        if (!param) {
          setStatus(statusDiv, strings.noConnectionDegree, "#d93025");
          return;
        }
        const decoded = decodeURIComponent(param);
        const degrees = JSON.parse(decoded) as string[];
        if (!Array.isArray(degrees) || degrees.length === 0) {
          setStatus(statusDiv, strings.invalidConnectionDegree, "#d93025");
          return;
        }
        Array.from(form.connectionDegreeInput.options).forEach(opt => {
          opt.selected = degrees.includes(opt.value);
        });
        setStatus(statusDiv, strings.connectionDegreeExtracted(degrees.join(", ")), "#188038");
      } catch {
        setStatus(statusDiv, strings.parseConnectionDegreeFailed, "#d93025");
      }
    });
  });

  elements.getStartPageFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = requireLinkedInSearchTab(tabs, statusDiv, strings);
      if (!tab || !tab.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("page");
        if (!param) {
          setStatus(statusDiv, strings.noPage, "#d93025");
          return;
        }
        const n = parseInt(param);
        if (isNaN(n) || n < 1) {
          setStatus(statusDiv, strings.invalidPage, "#d93025");
          return;
        }
        form.startPageInput.value = String(n);
        setStatus(statusDiv, strings.pageExtracted(n), "#188038");
      } catch {
        setStatus(statusDiv, strings.parsePageFailed, "#d93025");
      }
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
