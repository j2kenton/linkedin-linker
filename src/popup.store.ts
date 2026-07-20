// Popup script for Career Connect — store build
// This file is the store-only entry point.
// No auto-send, no Live Mode, no batch processing, no self-update, no runtime script injection.
import { STORE_CONTENT_SCRIPT_HOST, extractableKind as pageDetectExtractableKind } from "./pageDetect";

interface MessageSettings {
  greetingPart1: string;
  includeFirstName: boolean;
  greetingPart2: string;
  messageText: string;
}

interface StorageData {
  companyName?: string;
  companiesIds?: string;
  titleOfProspect?: string;
  locationIds?: string;
  connectionDegree?: string;
  startPage?: string | number;
  greetingPart1?: string;
  includeFirstName?: boolean;
  greetingPart2?: string;
  messageText?: string;
}

interface PrepareMessage {
  action: string;
  messageSettings?: MessageSettings;
}

interface PrepareResponse {
  status: string;
  firstName?: string;
  error?: string;
}

document.addEventListener("DOMContentLoaded", function (): void {
  const prepareButton = document.getElementById("prepareButton") as HTMLButtonElement;
  const statusDiv = document.getElementById("status") as HTMLDivElement;

  // Search form elements
  const companyNameInput = document.getElementById("companyName") as HTMLInputElement;
  const companiesIdsInput = document.getElementById("companiesIds") as HTMLInputElement;
  const titleOfProspectInput = document.getElementById("titleOfProspect") as HTMLInputElement;
  const locationIdsInput = document.getElementById("locationIds") as HTMLInputElement;
  const connectionDegreeInput = document.getElementById("connectionDegree") as HTMLSelectElement;
  const startPageInput = document.getElementById("startPage") as HTMLInputElement;
  const goToSearchButton = document.getElementById("goToSearchButton") as HTMLButtonElement;
  const getFromUrlButton = document.getElementById("getFromUrlButton") as HTMLButtonElement;
  const getLocationFromUrlButton = document.getElementById("getLocationFromUrlButton") as HTMLButtonElement;
  const getCompanyNameFromUrlButton = document.getElementById("getCompanyNameFromUrlButton") as HTMLButtonElement;
  const getTitleFromUrlButton = document.getElementById("getTitleFromUrlButton") as HTMLButtonElement;
  const getConnectionDegreeFromUrlButton = document.getElementById("getConnectionDegreeFromUrlButton") as HTMLButtonElement;
  const getStartPageFromUrlButton = document.getElementById("getStartPageFromUrlButton") as HTMLButtonElement;

  // Message draft elements
  const greetingPart1Input = document.getElementById("greetingPart1") as HTMLInputElement;
  const includeFirstNameCheckbox = document.getElementById("includeFirstNameCheckbox") as HTMLInputElement;
  const greetingPart2Input = document.getElementById("greetingPart2") as HTMLInputElement;
  const messageTextTextarea = document.getElementById("messageText") as HTMLTextAreaElement;
  const messagePreviewDiv = document.getElementById("messagePreview") as HTMLDivElement;
  const saveSettingsButton = document.getElementById("saveSettingsButton") as HTMLButtonElement;

  // Load saved settings
  chrome.storage.local.get(
    ["companyName", "companiesIds", "titleOfProspect", "locationIds", "connectionDegree", "startPage",
     "greetingPart1", "includeFirstName", "greetingPart2", "messageText"],
    (result: StorageData) => {
      companyNameInput.value = result.companyName ?? "Microsoft";
      companiesIdsInput.value = result.companiesIds ?? "1035";
      titleOfProspectInput.value = result.titleOfProspect ?? "Engineering Manager";
      locationIdsInput.value = result.locationIds ?? "101620260";

      const savedDegrees = (result.connectionDegree ?? "F,S,O").split(",").map(d => d.trim());
      Array.from(connectionDegreeInput.options).forEach(opt => {
        opt.selected = savedDegrees.includes(opt.value);
      });

      startPageInput.value = result.startPage !== undefined ? String(result.startPage) : "1";

      greetingPart1Input.value = result.greetingPart1 ?? "";
      includeFirstNameCheckbox.checked = result.includeFirstName ?? false;
      greetingPart2Input.value = result.greetingPart2 ?? "";
      messageTextTextarea.value = result.messageText ?? "";

      updatePreview();
      updateStatus();
    }
  );

  function updatePreview(): void {
    let preview = greetingPart1Input.value;
    if (includeFirstNameCheckbox.checked) preview += " [First Name]";
    preview += ` ${greetingPart2Input.value}\n${messageTextTextarea.value}`;
    messagePreviewDiv.textContent = preview;
  }

  greetingPart1Input.addEventListener("input", updatePreview);
  includeFirstNameCheckbox.addEventListener("change", updatePreview);
  greetingPart2Input.addEventListener("input", updatePreview);
  messageTextTextarea.addEventListener("input", updatePreview);

  saveSettingsButton.addEventListener("click", () => {
    chrome.storage.local.set({
      greetingPart1: greetingPart1Input.value,
      includeFirstName: includeFirstNameCheckbox.checked,
      greetingPart2: greetingPart2Input.value,
      messageText: messageTextTextarea.value,
    }, () => {
      statusDiv.textContent = "Settings saved.";
      statusDiv.style.color = "#188038";
      setTimeout(updateStatus, 2000);
    });
  });

  // URL extraction helpers
  function requireLinkedInSearchTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | null {
    const tab = tabs[0];
    if (!tab?.url?.includes("linkedin.com/search/results/people")) {
      statusDiv.textContent = "Please navigate to a LinkedIn people search page first.";
      statusDiv.style.color = "#d93025";
      return null;
    }
    return tab;
  }

  getFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("currentCompany");
        if (!param) { statusDiv.textContent = "No company ID in URL."; statusDiv.style.color = "#d93025"; return; }
        const ids = (JSON.parse(decodeURIComponent(param)) as string[]).join(",");
        companiesIdsInput.value = ids;
        statusDiv.textContent = `Company ID(s) extracted: ${ids}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse company ID from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  getLocationFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("geoUrn");
        if (!param) { statusDiv.textContent = "No location ID in URL."; statusDiv.style.color = "#d93025"; return; }
        const ids = (JSON.parse(decodeURIComponent(param)) as string[]).join(",");
        locationIdsInput.value = ids;
        statusDiv.textContent = `Location ID(s) extracted: ${ids}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse location ID from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  getCompanyNameFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("company");
        if (!param) { statusDiv.textContent = "No company name in URL."; statusDiv.style.color = "#d93025"; return; }
        companyNameInput.value = decodeURIComponent(param);
        statusDiv.textContent = `Company name extracted: ${companyNameInput.value}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse company name from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  getTitleFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("titleFreeText");
        if (!param) { statusDiv.textContent = "No job title in URL."; statusDiv.style.color = "#d93025"; return; }
        titleOfProspectInput.value = decodeURIComponent(param);
        statusDiv.textContent = `Job title extracted: ${titleOfProspectInput.value}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse job title from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  getConnectionDegreeFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("network");
        if (!param) { statusDiv.textContent = "No connection degree in URL."; statusDiv.style.color = "#d93025"; return; }
        const degrees = JSON.parse(decodeURIComponent(param)) as string[];
        Array.from(connectionDegreeInput.options).forEach(opt => { opt.selected = degrees.includes(opt.value); });
        statusDiv.textContent = `Connection degrees extracted: ${degrees.join(", ")}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse connection degree from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  getStartPageFromUrlButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = requireLinkedInSearchTab(tabs);
      if (!tab?.url) return;
      try {
        const param = new URL(tab.url).searchParams.get("page");
        if (!param) { statusDiv.textContent = "No page number in URL."; statusDiv.style.color = "#d93025"; return; }
        const n = parseInt(param);
        if (isNaN(n) || n < 1) { statusDiv.textContent = "Invalid page number."; statusDiv.style.color = "#d93025"; return; }
        startPageInput.value = String(n);
        statusDiv.textContent = `Start page extracted: ${n}`;
        statusDiv.style.color = "#188038";
      } catch { statusDiv.textContent = "Failed to parse page number from URL."; statusDiv.style.color = "#d93025"; }
    });
  });

  goToSearchButton.addEventListener("click", () => {
    const selectedDegrees = Array.from(connectionDegreeInput.selectedOptions).map(o => o.value).join(",");
    chrome.storage.local.set({
      companyName: companyNameInput.value,
      companiesIds: companiesIdsInput.value,
      titleOfProspect: titleOfProspectInput.value,
      locationIds: locationIdsInput.value,
      connectionDegree: selectedDegrees,
      startPage: parseInt(startPageInput.value) || 1,
    }, () => {
      chrome.tabs.create({ url: generateLinkedInURL() });
      statusDiv.textContent = "Opening LinkedIn search page...";
      statusDiv.style.color = "#0077b5";
      setTimeout(() => window.close(), 1000);
    });
  });

  function generateLinkedInURL(): string {
    let url = "https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH";
    const params: string[] = [];

    const companyName = companyNameInput.value.trim();
    if (companyName) params.push(`company=${encodeURIComponent(companyName)}`);

    const title = titleOfProspectInput.value.trim();
    let keywords = title ? encodeURIComponent(title) : "";
    if (companyName) keywords += (keywords ? "%20" : "") + encodeURIComponent(companyName);
    if (keywords) params.push(`keywords=${keywords}`);

    const ids = companiesIdsInput.value.split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length) params.push(`currentCompany=${encodeURIComponent(JSON.stringify(ids))}`);

    const locs = locationIdsInput.value.split(",").map(s => s.trim()).filter(Boolean);
    if (locs.length) params.push(`geoUrn=${encodeURIComponent(JSON.stringify(locs))}`);

    const degrees = Array.from(connectionDegreeInput.selectedOptions).map(o => o.value);
    if (degrees.length) params.push(`network=${encodeURIComponent(JSON.stringify(degrees))}`);

    params.push(`page=${parseInt(startPageInput.value) || 1}`);
    if (title) params.push(`titleFreeText=${encodeURIComponent(title)}`);
    params.push("sid=BpI");

    return url + "&" + params.join("&");
  }

  prepareButton.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("linkedin.com/search/results/people")) {
      statusDiv.textContent = "Please navigate to a LinkedIn people search results page first.";
      statusDiv.style.color = "#d93025";
      return;
    }

    prepareButton.disabled = true;
    prepareButton.textContent = "Preparing...";
    statusDiv.textContent = "Finding next connectable profile...";
    statusDiv.style.color = "#666";

    const messageSettings: MessageSettings = {
      greetingPart1: greetingPart1Input.value,
      includeFirstName: includeFirstNameCheckbox.checked,
      greetingPart2: greetingPart2Input.value,
      messageText: messageTextTextarea.value,
    };

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "prepareNextInvite",
        messageSettings,
      } as PrepareMessage) as PrepareResponse;

      if (response?.status === "prepared") {
        const name = response.firstName ? ` for ${response.firstName}` : "";
        statusDiv.textContent = `Invite draft prepared${name}. Review and send it in LinkedIn.`;
        statusDiv.style.color = "#188038";
      } else {
        statusDiv.textContent = response?.error ?? "Could not prepare invite.";
        statusDiv.style.color = "#d93025";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const isConnectionError = msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist");
      statusDiv.textContent = isConnectionError
        ? "Could not reach the page script. Please reload the LinkedIn search page and try again."
        : "Error: " + msg;
      statusDiv.style.color = "#d93025";
    } finally {
      prepareButton.disabled = false;
      prepareButton.textContent = "Prepare next invite";
    }
  });

  function updateStatus(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (tab?.url?.includes("linkedin.com/search/results/people")) {
        statusDiv.textContent = "Ready — click 'Prepare next invite' to open the next invite dialog.";
        statusDiv.style.color = "#0077b5";
      } else {
        statusDiv.textContent = "Navigate to a LinkedIn people search page to get started.";
        statusDiv.style.color = "#666";
      }
    });
  }
});

// Career Tools. Available in both builds; consent-gated, requires the
// user's own Anthropic API key, and never sends data without an explicit
// per-run action after reviewing a transmission preview.
type CareerExtraction = Record<string, unknown> & { ready?: boolean; warnings?: { field?: string; message: string }[] };
const careerGet = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));
const careerSet = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
const careerElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const careerSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const extractableKind = (url: string): "profile" | "job" | "other" =>
  pageDetectExtractableKind(url, STORE_CONTENT_SCRIPT_HOST);

// Shared by the career-tool wiring below and the mode controller, so the
// chooser's Career Tools entry and the career view itself agree on readiness
// without sending CAREER_TOOLS_STATUS twice.
type CareerLock = { locked: boolean; reason?: string };
const careerLock: Promise<CareerLock> = chrome.runtime.sendMessage({ action: "CAREER_TOOLS_STATUS" })
  .then((lock: CareerLock | undefined | null) => lock ?? { locked: false, reason: "Career Tools are unavailable." })
  .catch(() => ({ locked: false, reason: "Career Tools service is not ready. Reload the extension." }));
document.addEventListener("DOMContentLoaded", () => {
  const tools = careerElement<HTMLElement>("careerTools"); const hint = careerElement<HTMLElement>("careerHint");
  const profileFields = careerElement<HTMLElement>("profileCareerFields"); const jobFields = careerElement<HTMLElement>("jobCareerFields");
  const consent = careerElement<HTMLInputElement>("careerConsent");
  const inputIds = ["careerApiKey", "careerModel", "careerCv", "careerJd", "careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"];
  const field = (id: string) => careerElement<HTMLInputElement | HTMLTextAreaElement>(id);

  // Inline, per-control feedback replaces the old single bottom-of-panel
  // status line: results render next to the action that produced them, and
  // validation errors render next to the field they're about.
  const setResult = (id: string, text: string, kind: "success" | "error" | "pending" | "") => {
    const el = careerElement<HTMLElement>(id);
    el.hidden = !text; el.textContent = text; el.className = "career-result" + (kind ? ` ${kind}` : "");
  };
  const showFieldError = (fieldId: string, errorId: string, message: string) => {
    field(fieldId).classList.add("invalid");
    const el = careerElement<HTMLElement>(errorId); el.textContent = message; el.hidden = false;
  };
  const clearFieldError = (fieldId: string, errorId: string) => {
    field(fieldId).classList.remove("invalid");
    const el = careerElement<HTMLElement>(errorId); el.hidden = true; el.textContent = "";
  };

  // Fields extraction can populate, tracked so the job snapshot and consent
  // preview can label each value as extracted from LinkedIn or manually
  // supplied, per the manual-fallback data contract.
  const SOURCE_FIELD_IDS = ["careerCv", "careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"] as const;
  const sourceStorageKey = (id: string) => `${id}Origin`;
  const fieldSource: Record<string, "manual" | "extracted"> = {};
  let approvedAction: (() => Promise<void>) | undefined;
  let pendingPreviewLabel = "Working…";
  // The background's response is authoritative for this worker lifetime. Do
  // not allow a hidden button, keyboard activation, or a scripted click to
  // persist Career Tools data before trusted storage is confirmed.
  let careerReady = false;
  const requireCareerReady = (): boolean => {
    if (careerReady) return true;
    hint.textContent = "Career Tools are not ready. Reload the extension and try again.";
    return false;
  };
  const preview = careerElement<HTMLDetailsElement>("careerPreview");
  const previewText = careerElement<HTMLPreElement>("careerPreviewText");
  const showPreview = (label: string, payload: Record<string, unknown>, action: () => Promise<void>, pendingLabel: string) => {
    if (!requireCareerReady()) return;
    if (!consent.checked) { showFieldError("careerConsent", "careerConsentError", "Confirm the per-run consent checkbox first."); return; }
    clearFieldError("careerConsent", "careerConsentError");
    approvedAction = action; pendingPreviewLabel = pendingLabel;
    setResult("careerPreviewResult", "", "");
    preview.hidden=false; preview.open=true;
    const isCompany = payload.kind === "company";
    const researchAvailable = payload.research !== false && /^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(String(payload.companyUrl || ""));
    previewText.textContent = isCompany
      ? researchAvailable
        ? `Research stage (web search; no CV or JD):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, companyUrl:payload.companyUrl, companyUrlSource:payload.companyUrlSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource}, null, 2)}\n\nSynthesis stage (no web access):\n${JSON.stringify({cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource, research: "research findings"}, null, 2)}\n\nWeb-search results are processed server-side by Anthropic. Each field above is labeled by its "…Source" value as either "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`
        : `No web research will occur. A valid LinkedIn company URL is required for the research stage.\n\nSynthesis stage (no web access):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource, cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource}, null, 2)}`
      : `${label} sent to Anthropic (no web access):\n${JSON.stringify(payload, null, 2)}\n\n"profileSource" is "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`;
  };
  careerElement<HTMLButtonElement>("careerPreviewConfirm").onclick = async () => {
    if (!approvedAction) return;
    const action = approvedAction; approvedAction = undefined;
    const button = careerElement<HTMLButtonElement>("careerPreviewConfirm");
    const originalLabel = button.textContent;
    button.disabled = true; button.textContent = pendingPreviewLabel;
    setResult("careerPreviewResult", pendingPreviewLabel, "pending");
    try { await action(); }
    finally { button.disabled = false; button.textContent = originalLabel; }
  };
  const run = async (input: Record<string, unknown>) => {
    if (!requireCareerReady()) return;
    await careerSet({ careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true });
    const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", consent:true, previewed:true, input });
    if (!response.ok) { setResult("careerPreviewResult", response.error, "error"); return; }
    chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?job=${encodeURIComponent(response.jobId)}`) });
    // The report streams in its own tab; leave a persistent confirmation here
    // instead of a stale "Starting report…" once that tab has been opened.
    setResult("careerPreviewResult", "Report opened in a new tab.", "success");
  };

  type ExtractOutcome = { ok: true; data: CareerExtraction } | { ok: false; message: string };
  // Distinguishes not-a-LinkedIn-tab / wrong-page-type / content-script-absent
  // (needs reload) / still-rendering, instead of a blanket catch{} that
  // discarded every failure reason and left the user with no explanation.
  const extract = async (action: "EXTRACT_PROFILE" | "EXTRACT_JOB", expectedKind: "profile" | "job"): Promise<ExtractOutcome> => {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab?.id || !tab.url) return { ok:false, message:"No active LinkedIn tab found." };
    const kind = extractableKind(tab.url);
    if (kind === "other") return { ok:false, message:"Open a LinkedIn profile or job page first." };
    if (kind !== expectedKind) return { ok:false, message: expectedKind === "profile" ? "This tab is a LinkedIn job page, not a profile page." : "This tab is a LinkedIn profile page, not a job page." };
    let lastReadyFalse: CareerExtraction | null = null;
    let lastReady: CareerExtraction | null = null;
    let lastError = "";
    for (let attempt=0; attempt<5; attempt++) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { action }, { frameId:0 }) as CareerExtraction;
        if (result.ready) {
          lastReady = result;
          // Experience/education/skills/activity mount lazily as LinkedIn
          // scrolls sections into view, so a "ready" profile can still be
          // missing them on an early attempt — keep polling within the
          // existing retry budget instead of settling on an incomplete
          // result the moment the core fields are present.
          const stillMounting = (result.warnings || []).some(w => w.field === "sections");
          if (!stillMounting) return { ok:true, data:result };
        } else {
          lastReadyFalse = result;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist")
          ? "Could not reach the LinkedIn page script. Reload the LinkedIn tab and try again."
          : `Extraction failed: ${msg}`;
      }
      // Skip the wait after the final attempt — nothing will re-check the result.
      if (attempt < 4) await careerSleep(1000);
    }
    if (lastReady) return { ok:true, data:lastReady };
    if (lastReadyFalse) {
      const warnings = (lastReadyFalse.warnings || []).map(w => w.message).join(" ");
      return { ok:false, message: warnings || "The page hasn't finished rendering. Reload LinkedIn and retry." };
    }
    return { ok:false, message: lastError || "Could not reach the LinkedIn page script. Reload the LinkedIn tab and try again." };
  };

  const withPending = async (button: HTMLButtonElement, resultId: string, pendingLabel: string, task: () => Promise<{ text: string; kind: "success" | "error" }>) => {
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = pendingLabel;
    setResult(resultId, pendingLabel, "pending");
    try {
      const { text, kind } = await task();
      setResult(resultId, text, kind);
    } finally { button.disabled = false; button.textContent = originalLabel; }
  };

  // LinkedIn is an SPA, so the page type must be re-evaluated whenever the
  // active tab's URL changes, not just once when the popup opens.
  const updateExtractionState = (url: string) => {
    const kind = extractableKind(url);
    const extractProfileButton = careerElement<HTMLButtonElement>("extractProfileButton");
    const extractCvButton = careerElement<HTMLButtonElement>("extractCvButton");
    const extractJobButton = careerElement<HTMLButtonElement>("extractJobButton");
    extractProfileButton.disabled = kind !== "profile";
    extractCvButton.disabled = kind !== "profile";
    extractJobButton.disabled = kind !== "job";
    const profileReason = kind === "profile" ? "" : "Open a LinkedIn profile page to use this.";
    extractProfileButton.title = profileReason; extractCvButton.title = profileReason;
    extractJobButton.title = kind === "job" ? "" : "Open a LinkedIn job page to use this.";
    hint.textContent = kind === "profile"
      ? "This is a LinkedIn profile page — extract the interviewer's details, or your own details into the CV field."
      : kind === "job"
        ? "This is a LinkedIn job page — extract the job details below."
        : "Manual inputs are always available. Open a LinkedIn profile or job page to enable extraction.";
  };

  careerLock.then(async (lock: CareerLock) => {
    if (!lock.locked) { hint.textContent=lock.reason || "Career Tools are unavailable."; return; }
    careerReady=true; tools.hidden=false; const saved = await careerGet<Record<string, string>>(inputIds); inputIds.forEach(id => { if (saved[id] !== undefined) field(id).value=saved[id]; });
    const savedSources = await careerGet<Record<string, string>>(SOURCE_FIELD_IDS.map(sourceStorageKey));
    SOURCE_FIELD_IDS.forEach(id => { fieldSource[id] = savedSources[sourceStorageKey(id)] === "extracted" ? "extracted" : "manual"; });
    inputIds.forEach(id => field(id).addEventListener("change", () => {
      const patch: Record<string, unknown> = { [id]:field(id).value };
      // A real user edit always means the current value is manually supplied,
      // even if it started from an earlier extraction.
      if ((SOURCE_FIELD_IDS as readonly string[]).includes(id)) { fieldSource[id]="manual"; patch[sourceStorageKey(id)]="manual"; }
      careerSet(patch).catch(error => { hint.textContent = String(error); });
    }));
    field("careerProfile").addEventListener("input", () => clearFieldError("careerProfile", "careerProfileError"));
    field("careerCompanyName").addEventListener("input", () => clearFieldError("careerCompanyName", "careerCompanyNameError"));
    consent.addEventListener("change", () => { if (consent.checked) clearFieldError("careerConsent", "careerConsentError"); });

    document.querySelectorAll<HTMLButtonElement>(".career-clear[data-key]").forEach(button => button.onclick = async () => {
      const key = button.dataset.key || "";
      if (!inputIds.includes(key)) return;
      const sourceKeys = (SOURCE_FIELD_IDS as readonly string[]).includes(key) ? [sourceStorageKey(key)] : [];
      await new Promise<void>(resolve => chrome.storage.local.remove([key, ...sourceKeys], resolve));
      // The field visibly emptying is the confirmation — no status message needed.
      field(key).value=""; if ((SOURCE_FIELD_IDS as readonly string[]).includes(key)) fieldSource[key]="manual";
      field(key).dispatchEvent(new Event("input"));
      field(key).focus();
    });
    careerElement<HTMLButtonElement>("clearReportsButton").onclick = async () => {
      await new Promise<void>(resolve => chrome.storage.local.remove(["careerToolJobs"], resolve));
      setResult("clearReportsResult", "Saved reports cleared.", "success");
    };

    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    // Manual fallback is first-class: keep both groups usable on any page.
    profileFields.hidden=false; jobFields.hidden=false;
    updateExtractionState(tab?.url || "");
    if (tab && tab.id !== undefined) {
      const watchedTabId = tab.id;
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (tabId !== watchedTabId || !changeInfo.url) return;
        updateExtractionState(changeInfo.url);
      });
    }
    const updateResearchState = () => { const valid=/^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(field("careerCompanyUrl").value); const state=careerElement<HTMLElement>("careerResearchState"); state.textContent=valid ? "Web research available." : "Web research unavailable — supply the company's LinkedIn URL to enable it. You can still run a no-research report."; };
    field("careerCompanyUrl").addEventListener("input", updateResearchState); updateResearchState();
    const known=["claude-opus-4-8", "claude-sonnet-4-5"]; const modelWarning=careerElement<HTMLElement>("careerModelWarning"); const updateModelWarning=()=>modelWarning.hidden=known.includes(field("careerModel").value.trim()); field("careerModel").addEventListener("input",updateModelWarning); updateModelWarning();
  }).catch(() => { hint.textContent="Career Tools service is not ready. Reload the extension."; });
  careerElement<HTMLButtonElement>("careerTestButton").onclick = () => {
    if (!requireCareerReady()) return;
    showPreview("Test connection", { model:field("careerModel").value, prompt:"OK", max_tokens:16 }, async () => {
      await careerSet({ careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true });
      const result = await chrome.runtime.sendMessage({ action:"CAREER_TEST", consent:true, previewed:true });
      setResult("careerPreviewResult", result.ok ? "Connection authenticated." : result.error, result.ok ? "success" : "error");
    }, "Testing connection…");
  };
  careerElement<HTMLButtonElement>("extractProfileButton").onclick = async () => {
    if (!requireCareerReady()) return;
    const button = careerElement<HTMLButtonElement>("extractProfileButton");
    await withPending(button, "extractProfileResult", "Extracting…", async () => {
      const outcome = await extract("EXTRACT_PROFILE", "profile");
      if (!outcome.ok) return { text: outcome.message, kind: "error" };
      field("careerProfile").value=JSON.stringify(outcome.data, null, 2);
      fieldSource.careerProfile="extracted";
      await careerSet({ careerProfile:field("careerProfile").value, [sourceStorageKey("careerProfile")]:"extracted" });
      clearFieldError("careerProfile", "careerProfileError");
      const warnings = (outcome.data.warnings || []).map(w => w.message).join(" ");
      return { text: warnings || "Profile extracted.", kind: "success" };
    });
  };
  careerElement<HTMLButtonElement>("extractCvButton").onclick = async () => {
    if (!requireCareerReady()) return;
    const button = careerElement<HTMLButtonElement>("extractCvButton");
    await withPending(button, "extractCvResult", "Extracting…", async () => {
      const outcome = await extract("EXTRACT_PROFILE", "profile");
      if (!outcome.ok) return { text: outcome.message, kind: "error" };
      field("careerCv").value=JSON.stringify(outcome.data, null, 2);
      fieldSource.careerCv="extracted";
      await careerSet({ careerCv:field("careerCv").value, [sourceStorageKey("careerCv")]:"extracted" });
      const warnings = (outcome.data.warnings || []).map(w => w.message).join(" ");
      return { text: warnings ? `${warnings} Extracted into the CV field.` : "Your details were extracted into the CV field.", kind: "success" };
    });
  };
  careerElement<HTMLButtonElement>("extractJobButton").onclick = async () => {
    if (!requireCareerReady()) return;
    const button = careerElement<HTMLButtonElement>("extractJobButton");
    await withPending(button, "extractJobResult", "Extracting…", async () => {
      const outcome = await extract("EXTRACT_JOB", "job");
      if (!outcome.ok) return { text: outcome.message, kind: "error" };
      const result = outcome.data;
      const map: Record<string,string> = { careerCompanyName:"companyName", careerCompanyUrl:"companyUrl", careerJobTitle:"title", careerSeniority:"seniority", careerLocation:"location", careerJobDescription:"description" };
      Object.entries(map).forEach(([target, source]) => { field(target).value=String(result[source] || ""); fieldSource[target]="extracted"; });
      // salary, benefits, and workplaceType have no dedicated fields; fold them
      // into the JD text so the synthesis stage still sees them, rather than
      // silently dropping extracted content.
      const extras = [
        result.workplaceType ? `Workplace type: ${result.workplaceType}` : "",
        result.salary ? `Salary: ${result.salary}` : "",
        result.benefits ? `Benefits: ${result.benefits}` : "",
      ].filter(Boolean).join("\n");
      if (extras) field("careerJobDescription").value = [field("careerJobDescription").value, extras].filter(Boolean).join("\n\n");
      await careerSet({ ...Object.fromEntries(Object.keys(map).map(id => [id, field(id).value])), ...Object.fromEntries(Object.keys(map).map(id => [sourceStorageKey(id), "extracted"])) });
      clearFieldError("careerCompanyName", "careerCompanyNameError");
      const warnings = (result.warnings || []).map(w=>w.message).join(" ");
      return { text: warnings || "Job extracted.", kind: "success" };
    });
  };
  careerElement<HTMLButtonElement>("interviewButton").onclick = () => {
    const input={ kind:"interview", profile:field("careerProfile").value, cv:field("careerCv").value, jd:field("careerJd").value, profileSource:fieldSource.careerProfile || "manual" };
    if (!input.profile.trim()) { showFieldError("careerProfile", "careerProfileError", "Extract or paste an interviewer profile first."); return; }
    clearFieldError("careerProfile", "careerProfileError");
    showPreview("Interview preparation",input,()=>run(input),"Starting report…");
  };
  careerElement<HTMLButtonElement>("companyButton").onclick = () => {
    const input={ kind:"company", companyName:field("careerCompanyName").value, companyUrl:field("careerCompanyUrl").value, title:field("careerJobTitle").value, seniority:field("careerSeniority").value, location:field("careerLocation").value, jd:field("careerJobDescription").value, cv:field("careerCv").value, research:careerElement<HTMLInputElement>("careerResearch").checked, companyNameSource:fieldSource.careerCompanyName || "manual", companyUrlSource:fieldSource.careerCompanyUrl || "manual", titleSource:fieldSource.careerJobTitle || "manual", senioritySource:fieldSource.careerSeniority || "manual", locationSource:fieldSource.careerLocation || "manual", jdSource:fieldSource.careerJobDescription || "manual" };
    if (!input.companyName.trim()) { showFieldError("careerCompanyName", "careerCompanyNameError", "Enter a company name first."); return; }
    clearFieldError("careerCompanyName", "careerCompanyNameError");
    showPreview("Company & Role Intelligence",input,()=>run(input),"Starting report…");
  };
});

// Mode controller — the popup always opens on the chooser; picking a tool
// shows only that view so Connection Assistant and Career Tools can no
// longer show contradictory status at the same time.
type PopupMode = "chooser" | "connection" | "career";
document.addEventListener("DOMContentLoaded", () => {
  const chooser = careerElement<HTMLElement>("modeChooser");
  const connectionView = careerElement<HTMLElement>("connectionView");
  const careerView = careerElement<HTMLElement>("careerView");
  const backButton = careerElement<HTMLButtonElement>("backButton");
  const chooseConnection = careerElement<HTMLButtonElement>("chooseConnection");
  const chooseCareer = careerElement<HTMLButtonElement>("chooseCareer");
  const modeNote = careerElement<HTMLElement>("modeNote");

  const show = (mode: PopupMode): void => {
    chooser.hidden = mode !== "chooser";
    connectionView.hidden = mode !== "connection";
    careerView.hidden = mode !== "career";
    backButton.hidden = mode === "chooser";
  };

  chooseConnection.onclick = () => show("connection");
  chooseCareer.onclick = () => show("career");
  backButton.onclick = () => show("chooser");

  careerLock.then((lock: CareerLock) => {
    chooseCareer.disabled = !lock.locked;
    if (!lock.locked) modeNote.textContent = lock.reason || "Career Tools are unavailable.";
  });

  show("chooser");
});
