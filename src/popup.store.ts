// Popup script for Career Connect — store build
// This file is the store-only entry point.
// No auto-send, no Live Mode, no batch processing, no self-update, no runtime script injection.
import { classifyUrl } from "./pageDetect";

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
type CareerExtraction = Record<string, unknown> & { ready?: boolean; warnings?: { message: string }[] };
const careerGet = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));
const careerSet = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
const careerElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function careerPage(url: string): "profile" | "job" | "other" { return classifyUrl(url); }

// Shared by the career-tool wiring below and the mode controller, so the
// chooser's Career Tools entry and the career view itself agree on readiness
// without sending CAREER_TOOLS_STATUS twice.
type CareerLock = { locked: boolean; reason?: string };
const careerLock: Promise<CareerLock> = chrome.runtime.sendMessage({ action: "CAREER_TOOLS_STATUS" })
  .then((lock: CareerLock | undefined | null) => lock ?? { locked: false, reason: "Career Tools are unavailable." })
  .catch(() => ({ locked: false, reason: "Career Tools service is not ready. Reload the extension." }));
document.addEventListener("DOMContentLoaded", () => {
  const tools = careerElement<HTMLElement>("careerTools"); const status = careerElement<HTMLElement>("careerStatus");
  const profileFields = careerElement<HTMLElement>("profileCareerFields"); const jobFields = careerElement<HTMLElement>("jobCareerFields");
  const consent = careerElement<HTMLInputElement>("careerConsent");
  const inputIds = ["careerApiKey", "careerModel", "careerCv", "careerJd", "careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"];
  const field = (id: string) => careerElement<HTMLInputElement | HTMLTextAreaElement>(id);
  // Fields extraction can populate, tracked so the job snapshot and consent
  // preview can label each value as extracted from LinkedIn or manually
  // supplied, per the manual-fallback data contract.
  const SOURCE_FIELD_IDS = ["careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"] as const;
  const sourceStorageKey = (id: string) => `${id}Origin`;
  const fieldSource: Record<string, "manual" | "extracted"> = {};
  let approvedAction: (() => Promise<void>) | undefined;
  // The background's response is authoritative for this worker lifetime. Do
  // not allow a hidden button, keyboard activation, or a scripted click to
  // persist Career Tools data before trusted storage is confirmed.
  let careerReady = false;
  const requireCareerReady = (): boolean => {
    if (careerReady) return true;
    status.textContent = "Career Tools are not ready. Reload the extension and try again.";
    return false;
  };
  const preview = careerElement<HTMLDetailsElement>("careerPreview");
  const previewText = careerElement<HTMLPreElement>("careerPreviewText");
  const showPreview = (label: string, payload: Record<string, unknown>, action: () => Promise<void>) => {
    if (!requireCareerReady()) return;
    if (!consent.checked) { status.textContent="Confirm the per-run consent checkbox first."; return; }
    approvedAction = action; preview.hidden=false; preview.open=true;
    const isCompany = payload.kind === "company";
    const researchAvailable = payload.research !== false && /^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(String(payload.companyUrl || ""));
    previewText.textContent = isCompany
      ? researchAvailable
        ? `Research stage (web search; no CV or JD):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, companyUrl:payload.companyUrl, companyUrlSource:payload.companyUrlSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource}, null, 2)}\n\nSynthesis stage (no web access):\n${JSON.stringify({cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource, research: "research findings"}, null, 2)}\n\nWeb-search results are processed server-side by Anthropic. Each field above is labeled by its "…Source" value as either "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`
        : `No web research will occur. A valid LinkedIn company URL is required for the research stage.\n\nSynthesis stage (no web access):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource, cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource}, null, 2)}`
      : `${label} sent to Anthropic (no web access):\n${JSON.stringify(payload, null, 2)}\n\n"profileSource" is "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`;
  };
  careerElement<HTMLButtonElement>("careerPreviewConfirm").onclick = async () => { if (!approvedAction) return; const action=approvedAction; approvedAction=undefined; preview.hidden=true; await action(); };
  const run = async (input: Record<string, unknown>) => { if (!requireCareerReady()) return; await careerSet({ careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true }); status.textContent="Starting report…"; const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", consent:true, previewed:true, input }); if (!response.ok) { status.textContent=response.error; return; } chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?job=${encodeURIComponent(response.jobId)}`) }); };
  const extract = async (action: "EXTRACT_PROFILE" | "EXTRACT_JOB"): Promise<CareerExtraction | null> => { const [tab] = await chrome.tabs.query({ active:true, currentWindow:true }); if (!tab?.id) return null; for (let attempt=0; attempt<5; attempt++) { try { const result = await chrome.tabs.sendMessage(tab.id, { action }, { frameId:0 }) as CareerExtraction; if (result.ready) return result; } catch { /* LinkedIn may still be loading */ } await new Promise(resolve => setTimeout(resolve, 1000)); } status.textContent="Extraction did not finish. Reload LinkedIn and retry, or use the manual fields."; return null; };
  careerLock.then(async (lock: CareerLock) => {
    if (!lock.locked) { status.textContent=lock.reason || "Career Tools are unavailable."; return; }
    careerReady=true; tools.hidden=false; const saved = await careerGet<Record<string, string>>(inputIds); inputIds.forEach(id => { if (saved[id] !== undefined) field(id).value=saved[id]; });
    const savedSources = await careerGet<Record<string, string>>(SOURCE_FIELD_IDS.map(sourceStorageKey));
    SOURCE_FIELD_IDS.forEach(id => { fieldSource[id] = savedSources[sourceStorageKey(id)] === "extracted" ? "extracted" : "manual"; });
    inputIds.forEach(id => field(id).addEventListener("change", () => {
      const patch: Record<string, unknown> = { [id]:field(id).value };
      // A real user edit always means the current value is manually supplied,
      // even if it started from an earlier extraction.
      if ((SOURCE_FIELD_IDS as readonly string[]).includes(id)) { fieldSource[id]="manual"; patch[sourceStorageKey(id)]="manual"; }
      careerSet(patch).catch(error => status.textContent=String(error));
    }));
    document.querySelectorAll<HTMLButtonElement>(".career-delete").forEach(button => button.onclick = async () => {
      const keys=(button.dataset.key || "").split(",");
      const sourceKeys=keys.filter(key => (SOURCE_FIELD_IDS as readonly string[]).includes(key)).map(sourceStorageKey);
      await new Promise<void>(resolve => chrome.storage.local.remove([...keys, ...sourceKeys], resolve));
      keys.filter(key => inputIds.includes(key)).forEach(key => { field(key).value=""; if ((SOURCE_FIELD_IDS as readonly string[]).includes(key)) fieldSource[key]="manual"; });
      status.textContent=`Deleted ${button.textContent || "saved data"}.`;
    });
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true }); const page = careerPage(tab?.url || "");
    // Manual fallback is first-class: keep both groups usable on any page.
    profileFields.hidden=false; jobFields.hidden=false;
    if (page === "other") status.textContent="Manual inputs are available. Open LinkedIn to use extraction.";
    const updateResearchState = () => { const valid=/^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(field("careerCompanyUrl").value); const state=careerElement<HTMLElement>("careerResearchState"); state.textContent=valid ? "Web research available." : "Web research unavailable — supply the company's LinkedIn URL to enable it. You can still run a no-research report."; };
    field("careerCompanyUrl").addEventListener("input", updateResearchState); updateResearchState();
    const known=["claude-opus-4-8", "claude-sonnet-4-5"]; const modelWarning=careerElement<HTMLElement>("careerModelWarning"); const updateModelWarning=()=>modelWarning.hidden=known.includes(field("careerModel").value.trim()); field("careerModel").addEventListener("input",updateModelWarning); updateModelWarning();
  }).catch(() => { status.textContent="Career Tools service is not ready. Reload the extension."; });
  careerElement<HTMLButtonElement>("careerTestButton").onclick = () => { if (!requireCareerReady()) return; showPreview("Test connection", { model:field("careerModel").value, prompt:"OK", max_tokens:16 }, async () => { await careerSet({ careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true }); const result=await chrome.runtime.sendMessage({ action:"CAREER_TEST", consent:true, previewed:true }); status.textContent=result.ok ? "Connection authenticated." : result.error; }); };
  careerElement<HTMLButtonElement>("extractProfileButton").onclick = async () => { if (!requireCareerReady()) return; const result = await extract("EXTRACT_PROFILE"); if (result) { field("careerProfile").value=JSON.stringify(result, null, 2); fieldSource.careerProfile="extracted"; await careerSet({ careerProfile:field("careerProfile").value, [sourceStorageKey("careerProfile")]:"extracted" }); status.textContent=(result.warnings || []).map(w => w.message).join(" ") || "Profile extracted."; } };
  careerElement<HTMLButtonElement>("extractJobButton").onclick = async () => {
    if (!requireCareerReady()) return;
    const result = await extract("EXTRACT_JOB");
    if (!result) return;
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
    status.textContent=(result.warnings || []).map(w=>w.message).join(" ") || "Job extracted.";
  };
  careerElement<HTMLButtonElement>("interviewButton").onclick = () => { const input={ kind:"interview", profile:field("careerProfile").value, cv:field("careerCv").value, jd:field("careerJd").value, profileSource:fieldSource.careerProfile || "manual" }; if (!input.profile.trim()) { status.textContent="Extract or paste an interviewer profile first."; return; } showPreview("Interview preparation",input,()=>run(input)); };
  careerElement<HTMLButtonElement>("companyButton").onclick = () => { const input={ kind:"company", companyName:field("careerCompanyName").value, companyUrl:field("careerCompanyUrl").value, title:field("careerJobTitle").value, seniority:field("careerSeniority").value, location:field("careerLocation").value, jd:field("careerJobDescription").value, cv:field("careerCv").value, research:careerElement<HTMLInputElement>("careerResearch").checked, companyNameSource:fieldSource.careerCompanyName || "manual", companyUrlSource:fieldSource.careerCompanyUrl || "manual", titleSource:fieldSource.careerJobTitle || "manual", senioritySource:fieldSource.careerSeniority || "manual", locationSource:fieldSource.careerLocation || "manual", jdSource:fieldSource.careerJobDescription || "manual" }; if (!input.companyName.trim()) { status.textContent="Enter a company name first."; return; } showPreview("Company & Role Intelligence",input,()=>run(input)); };
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
