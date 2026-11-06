// Popup script for Career Connect — store build
// This file is the store-only entry point.
// No auto-send, no Live Mode, no batch processing, no self-update, no runtime script injection.
import { STORE_CONTENT_SCRIPT_HOST } from "./pageDetect";
import { initCareerTools } from "./popup-career-shared";
import { initPopupTabs } from "./popup-tabs";
import { attachUrlExtractionHandlers, attachClearButtons, generateLinkedInURL } from "./popup-search-shared";
import type { SearchStrings } from "./popup-search-shared";
import { measureNote, assessNoteLength } from "./content-shared";

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
  const messageLengthDiv = document.getElementById("messageLength") as HTMLDivElement;
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

    // Advisory only: never blocks Save or Prepare, and never truncates the message.
    const { fixed, includesName } = measureNote({
      greetingPart1: greetingPart1Input.value,
      includeFirstName: includeFirstNameCheckbox.checked,
      greetingPart2: greetingPart2Input.value,
      messageText: messageTextTextarea.value,
    });
    const assessment = assessNoteLength(fixed, includesName);
    messageLengthDiv.textContent = assessment.message;
    messageLengthDiv.className = `note-length note-length-${assessment.level}`;
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
      statusDiv.style.color = "#057642";
      setTimeout(updateStatus, 2000);
    });
  });

  const storeSearchStrings: SearchStrings = {
    noTabUrl: "Please navigate to a LinkedIn people search page first.",
    notSearchPage: "This button reads a LinkedIn people search results page (linkedin.com/search/results/people/...). Open one in this tab, then click again.",
    noCompany: "No company ID in URL.",
    invalidCompany: "Invalid company data in URL",
    companyExtracted: (ids) => `Company ID(s) extracted: ${ids}`,
    parseCompanyFailed: "Failed to parse company ID from URL.",
    noLocation: "No location ID in URL.",
    invalidLocation: "Invalid location data in URL",
    locationExtracted: (ids) => `Location ID(s) extracted: ${ids}`,
    parseLocationFailed: "Failed to parse location ID from URL.",
    noCompanyName: "No company name in this search URL. Open the company's LinkedIn page (linkedin.com/company/...) and click again, or type the name.",
    companyNameExtracted: (name) => `Company name extracted: ${name}`,
    parseCompanyNameFailed: "Failed to parse company name from URL.",
    companyPagePending: "Reading company name from this page...",
    companyPageFailed: "Could not read the company name from this page. Wait for the page to finish loading and click again, or type the name.",
    companyIdOnly: (ids) => `This search URL only has company ID ${ids}; LinkedIn search URLs do not include the company name. Open the company's LinkedIn page (linkedin.com/company/...) and click again, or type the name.`,
    companyNameWrongPage: "Open the company's LinkedIn page (linkedin.com/company/...) or a LinkedIn people search that includes the company, then click again.",
    noTitle: "No search keywords in this search URL (it needs a keywords or titleFreeText parameter).",
    titleExtracted: (title) => `Search keywords extracted: ${title}`,
    parseTitleFailed: "Failed to parse search keywords from URL.",
    noConnectionDegree: "No connection degree in URL.",
    invalidConnectionDegree: "Invalid connection degree data in URL",
    connectionDegreeExtracted: (degrees) => `Connection degrees extracted: ${degrees}`,
    parseConnectionDegreeFailed: "Failed to parse connection degree from URL.",
    noPage: "No page number in URL.",
    invalidPage: "Invalid page number.",
    pageExtracted: (page) => `Start page extracted: ${page}`,
    parsePageFailed: "Failed to parse page number from URL.",
  };

  attachUrlExtractionHandlers(
    { companyNameInput, companiesIdsInput, titleOfProspectInput, locationIdsInput, connectionDegreeInput, startPageInput },
    { statusDiv, getFromUrlButton, getLocationFromUrlButton, getCompanyNameFromUrlButton, getTitleFromUrlButton, getConnectionDegreeFromUrlButton, getStartPageFromUrlButton },
    storeSearchStrings
  );

  attachClearButtons(document);

  goToSearchButton.addEventListener("click", () => {
    const selectedDegrees = Array.from(connectionDegreeInput.selectedOptions).map(o => o.value);
    chrome.storage.local.set({
      companyName: companyNameInput.value,
      companiesIds: companiesIdsInput.value,
      titleOfProspect: titleOfProspectInput.value,
      locationIds: locationIdsInput.value,
      connectionDegree: selectedDegrees.join(","),
      startPage: parseInt(startPageInput.value) || 1,
    }, () => {
      const url = generateLinkedInURL({
        companyName: companyNameInput.value,
        companiesIds: companiesIdsInput.value,
        titleOfProspect: titleOfProspectInput.value,
        locationIds: locationIdsInput.value,
        connectionDegree: selectedDegrees,
        startPage: parseInt(startPageInput.value) || 1,
      });
      chrome.tabs.create({ url });
      statusDiv.textContent = "Opening LinkedIn search page...";
      statusDiv.style.color = "#0A66C2";
      setTimeout(() => updateStatus(), 1000);
    });
  });

  prepareButton.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("linkedin.com/search/results/people")) {
      statusDiv.textContent = "Please navigate to a LinkedIn people search results page first.";
      statusDiv.style.color = "#B3261E";
      return;
    }

    prepareButton.disabled = true;
    prepareButton.textContent = "Preparing...";
    statusDiv.textContent = "Finding next connectable profile...";
    statusDiv.style.color = "#56687A";

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
        statusDiv.style.color = "#057642";
      } else {
        statusDiv.textContent = response?.error ?? "Could not prepare invite.";
        statusDiv.style.color = "#B3261E";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const isConnectionError = msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist");
      statusDiv.textContent = isConnectionError
        ? "Could not reach the page script. Please reload the LinkedIn search page and try again."
        : "Error: " + msg;
      statusDiv.style.color = "#B3261E";
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
        statusDiv.style.color = "#0A66C2";
      } else {
        statusDiv.textContent = "Navigate to a LinkedIn people search page to get started.";
        statusDiv.style.color = "#56687A";
      }
    });
  }

  chrome.tabs.onActivated.addListener(() => {
    setTimeout(updateStatus, 100);
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      setTimeout(updateStatus, 100);
    }
  });
});

type CareerLock = { locked: boolean; reason?: string };
const careerLock: Promise<CareerLock> = chrome.runtime.sendMessage({ action: "CAREER_TOOLS_STATUS" })
  .then((lock: CareerLock | undefined | null) => lock ?? { locked: false, reason: "Career Tools are unavailable." })
  .catch(() => ({ locked: false, reason: "Career Tools service is not ready. Reload the extension." }));

// On-demand extraction for pages outside this build's declared content
// script (https://www.linkedin.com/* only — see manifest.store.json) is
// handled centrally by src/extract/capabilities.ts's ensureExtractionHandler,
// which only injects dist/extractInject.js when the installed manifest
// declares "scripting" (the B2 store variant). The B1 variant (the default,
// checked-in manifest.store.json) declares neither "scripting" nor optional
// broad host access, so it never calls chrome.scripting at all — a missing
// declared handler there surfaces as a reload prompt instead.
initCareerTools({ hostPattern: STORE_CONTENT_SCRIPT_HOST, careerLockPromise: careerLock });
initPopupTabs();
