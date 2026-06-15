// Popup script for LinkedIn Connection Assistant — store build
// This file is the store-only entry point.
// No auto-send, no Live Mode, no batch processing, no self-update, no runtime script injection.

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
