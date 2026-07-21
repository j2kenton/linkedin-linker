// Popup script for Career Connect
import { BUILD_TARGET } from "./build-target";
import { extractableKind as pageDetectExtractableKind } from "./pageDetect";
import { careerElement, initCareerTools } from "./popup-career-shared";
import { attachUrlExtractionHandlers, generateLinkedInURL } from "./popup-search-shared";
import type { SearchStrings } from "./popup-search-shared";
const _BUILD_TARGET: string = BUILD_TARGET;

interface MessageSettings {
  greetingPart1: string;
  includeFirstName: boolean;
  greetingPart2: string;
  messageText: string;
}

interface StorageData {
  liveMode?: boolean;
  companyName?: string;
  companiesIds?: string;
  titleOfProspect?: string;
  locationIds?: string;
  connectionDegree?: string;
  startPage?: string | number;
  stopPage?: string | number;
  maxConnections?: string;
  autoAdjust?: boolean;
  greetingPart1?: string;
  includeFirstName?: boolean;
  greetingPart2?: string;
  messageText?: string;
  lastCommit?: string;
}

interface AutomationMessage {
  action: string;
  liveMode?: boolean;
  messageSettings?: MessageSettings;
  maxPages?: string;
  maxConnections?: string;
  autoAdjust?: boolean;
}

interface AutomationResponse {
  status: string;
}

interface GitHubCommit {
  sha: string;
}

document.addEventListener('DOMContentLoaded', function(): void {
  const startButton = document.getElementById('startButton') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;
  const liveModeCheckbox = document.getElementById('liveModeCheckbox') as HTMLInputElement;

  // Form elements
  const companyNameInput = document.getElementById('companyName') as HTMLInputElement;
  const companiesIdsInput = document.getElementById('companiesIds') as HTMLInputElement;
  const titleOfProspectInput = document.getElementById('titleOfProspect') as HTMLInputElement;
  const locationIdsInput = document.getElementById('locationIds') as HTMLInputElement;
  const connectionDegreeInput = document.getElementById('connectionDegree') as HTMLSelectElement;
  const startPageInput = document.getElementById('startPage') as HTMLInputElement;
  const stopPageInput = document.getElementById('stopPage') as HTMLInputElement;
  const maxConnectionsInput = document.getElementById('maxConnections') as HTMLInputElement;
  const goToSearchButton = document.getElementById('goToSearchButton') as HTMLButtonElement;
  const getFromUrlButton = document.getElementById('getFromUrlButton') as HTMLButtonElement;
  const getLocationFromUrlButton = document.getElementById('getLocationFromUrlButton') as HTMLButtonElement;
  const getCompanyNameFromUrlButton = document.getElementById('getCompanyNameFromUrlButton') as HTMLButtonElement;
  const getTitleFromUrlButton = document.getElementById('getTitleFromUrlButton') as HTMLButtonElement;
  const getConnectionDegreeFromUrlButton = document.getElementById('getConnectionDegreeFromUrlButton') as HTMLButtonElement;
  const getStartPageFromUrlButton = document.getElementById('getStartPageFromUrlButton') as HTMLButtonElement;

  // Message settings elements
  const greetingPart1Input = document.getElementById('greetingPart1') as HTMLInputElement;
  const includeFirstNameCheckbox = document.getElementById('includeFirstNameCheckbox') as HTMLInputElement;
  const greetingPart2Input = document.getElementById('greetingPart2') as HTMLInputElement;
  const messageTextTextarea = document.getElementById('messageText') as HTMLTextAreaElement;
  const messagePreviewDiv = document.getElementById('messagePreview') as HTMLDivElement;
  const autoAdjustCheckbox = document.getElementById('autoAdjustCheckbox') as HTMLInputElement;
  const saveMessageButton = document.getElementById('saveMessageButton') as HTMLButtonElement;

  // Check for updates when popup opens
  checkForUpdates();

  // Load saved settings
  chrome.storage.local.get(['liveMode', 'companyName', 'companiesIds', 'titleOfProspect', 'locationIds', 'connectionDegree', 'startPage', 'stopPage', 'maxConnections', 'autoAdjust', 'greetingPart1', 'includeFirstName', 'greetingPart2', 'messageText'], (result: StorageData) => {
    const liveMode = result.liveMode !== undefined ? result.liveMode : false;
    liveModeCheckbox.checked = liveMode;

    // Load search parameters with defaults
    companyNameInput.value = result.companyName !== undefined ? result.companyName : 'Microsoft';
    companiesIdsInput.value = result.companiesIds !== undefined ? result.companiesIds : '1035';
    titleOfProspectInput.value = result.titleOfProspect !== undefined ? result.titleOfProspect : 'Engineering Manager';
    locationIdsInput.value = result.locationIds !== undefined ? result.locationIds : '101620260';

    // Handle connection degree multi-select
    const savedDegrees = (result.connectionDegree !== undefined ? result.connectionDegree : 'F,S,O').split(',').map(d => d.trim());
    Array.from(connectionDegreeInput.options).forEach(option => {
      option.selected = savedDegrees.includes(option.value);
    });

    startPageInput.value = result.startPage !== undefined ? String(result.startPage) : '1';
    stopPageInput.value = result.stopPage !== undefined ? String(result.stopPage) : '';
    maxConnectionsInput.value = result.maxConnections !== undefined ? result.maxConnections : '200';
    autoAdjustCheckbox.checked = result.autoAdjust !== undefined ? result.autoAdjust : false;

    // Load message settings with defaults
    greetingPart1Input.value = result.greetingPart1 !== undefined ? result.greetingPart1 : '';
    includeFirstNameCheckbox.checked = result.includeFirstName !== undefined ? result.includeFirstName : false;
    greetingPart2Input.value = result.greetingPart2 !== undefined ? result.greetingPart2 : '';
    messageTextTextarea.value = result.messageText !== undefined ? result.messageText : '';

    // Update preview after loading settings
    updateMessagePreview();
  });

  // Function to update message preview
  function updateMessagePreview(): void {
    const greetingPart1 = greetingPart1Input.value || '';
    const includeFirstName = includeFirstNameCheckbox.checked;
    const greetingPart2 = greetingPart2Input.value || '';
    const messageText = messageTextTextarea.value || '';

    let previewMessage = greetingPart1;

    if (includeFirstName) {
      previewMessage += ' [First Name]';
    }

    previewMessage += ` ${greetingPart2}\n${messageText}`;

    messagePreviewDiv.textContent = previewMessage;
  }

  // Add event listeners for real-time preview updates
  greetingPart1Input.addEventListener('input', updateMessagePreview);
  includeFirstNameCheckbox.addEventListener('change', updateMessagePreview);
  greetingPart2Input.addEventListener('input', updateMessagePreview);
  messageTextTextarea.addEventListener('input', updateMessagePreview);

  // Handle "Save auto-connect settings" button
  saveMessageButton.addEventListener('click', () => {
    const autoConnectParams = {
      greetingPart1: greetingPart1Input.value,
      includeFirstName: includeFirstNameCheckbox.checked,
      greetingPart2: greetingPart2Input.value,
      messageText: messageTextTextarea.value,
      liveMode: liveModeCheckbox.checked,
      stopPage: stopPageInput.value,
      maxConnections: maxConnectionsInput.value,
      autoAdjust: autoAdjustCheckbox.checked
    };

    chrome.storage.local.set(autoConnectParams, () => {
      // Show success message
      statusDiv.textContent = 'Auto-connect settings saved successfully!';
      statusDiv.style.color = '#188038';

      // Clear success message after 3 seconds
      setTimeout(() => {
        updateStatusBasedOnTab();
      }, 3000);
    });
  });

  const devSearchStrings: SearchStrings = {
    noTabUrl: "Unable to get current tab URL",
    notSearchPage: "Please navigate to a LinkedIn search results page first",
    noCompany: "No company information found in current search URL",
    invalidCompany: "Invalid company data in URL",
    companyExtracted: (ids) => `Company ID(s) extracted: ${ids}`,
    parseCompanyFailed: "Failed to parse company data from URL",
    noLocation: "No location information found in current search URL",
    invalidLocation: "Invalid location data in URL",
    locationExtracted: (ids) => `Location ID(s) extracted: ${ids}`,
    parseLocationFailed: "Failed to parse location data from URL",
    noCompanyName: "No company name found in current search URL",
    companyNameExtracted: (name) => `Company name extracted: ${name}`,
    parseCompanyNameFailed: "Failed to parse company name from URL",
    noTitle: "No job title found in current search URL",
    titleExtracted: (title) => `Job title extracted: ${title}`,
    parseTitleFailed: "Failed to parse job title from URL",
    noConnectionDegree: "No connection degree found in current search URL",
    invalidConnectionDegree: "Invalid connection degree data in URL",
    connectionDegreeExtracted: (degrees) => `Connection degrees extracted: ${degrees}`,
    parseConnectionDegreeFailed: "Failed to parse connection degrees from URL",
    noPage: "No page number found in current search URL",
    invalidPage: "Invalid page number in URL",
    pageExtracted: (page) => `Start page extracted: ${page}`,
    parsePageFailed: "Failed to parse page number from URL",
  };

  attachUrlExtractionHandlers(
    { companyNameInput, companiesIdsInput, titleOfProspectInput, locationIdsInput, connectionDegreeInput, startPageInput },
    { statusDiv, getFromUrlButton, getLocationFromUrlButton, getCompanyNameFromUrlButton, getTitleFromUrlButton, getConnectionDegreeFromUrlButton, getStartPageFromUrlButton },
    devSearchStrings
  );

  // Handle live mode checkbox changes
  liveModeCheckbox.addEventListener('change', () => {
    const liveMode = liveModeCheckbox.checked;
    chrome.storage.local.set({ liveMode: liveMode });

    // Update status to show current mode
    if (liveMode) {
      statusDiv.textContent = 'Live Mode: Will send actual connection requests';
      statusDiv.style.color = '#d93025';
    } else {
      statusDiv.textContent = 'Test Mode: Will only log actions (safe)';
      statusDiv.style.color = '#f57c00';
    }

    // Clear status after 3 seconds
    setTimeout(() => {
      updateStatusBasedOnTab();
    }, 3000);
  });

  // Handle "Take me to search results" button
  goToSearchButton.addEventListener('click', () => {
    const selectedDegrees = Array.from(connectionDegreeInput.selectedOptions).map(option => option.value);
    const params = {
      companyName: companyNameInput.value,
      companiesIds: companiesIdsInput.value,
      titleOfProspect: titleOfProspectInput.value,
      locationIds: locationIdsInput.value,
      connectionDegree: selectedDegrees.join(','),
      startPage: parseInt(startPageInput.value) || 1,
      stopPage: stopPageInput.value ? parseInt(stopPageInput.value) : '',
      maxConnections: maxConnectionsInput.value,
    };

    chrome.storage.local.set(params, () => {
      const url = generateLinkedInURL({
        companyName: companyNameInput.value,
        companiesIds: companiesIdsInput.value,
        titleOfProspect: titleOfProspectInput.value,
        locationIds: locationIdsInput.value,
        connectionDegree: selectedDegrees,
        startPage: parseInt(startPageInput.value) || 1,
      });
      chrome.tabs.create({ url: url });

      // Update status
      statusDiv.textContent = 'Opening LinkedIn search page...';
      statusDiv.style.color = '#0077b5';

      // Hide the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });

  startButton.addEventListener('click', async () => {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      // Handle the error gracefully, e.g., show an error message and abort
      statusDiv.textContent = 'Error: No active tab found. Please open a tab and try again.';
      statusDiv.style.color = '#d93025';
      return;
    }

    // Update button state
    startButton.disabled = true;
    startButton.textContent = 'Starting...';
    liveModeCheckbox.disabled = true; // Disable live mode checkbox while running
    statusDiv.textContent = 'Starting automation...';
    statusDiv.style.color = '#666';

    try {
      // First check if content script is ready by sending a ping
      console.log('Checking if content script is ready...');


      let pingResponse: AutomationResponse | null = null;
      try {
        pingResponse = await chrome.tabs.sendMessage(tab.id!, {
          action: "ping"
        });
      } catch {
        pingResponse = null;
      }

      if (!pingResponse) {
        // Content script not ready, try to inject it
        console.log('Content script not ready, attempting to inject...');

        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['dist/content.js']
          });
          console.log('Content script injected successfully');

          // Wait a moment for the script to initialize
          await new Promise<void>(resolve => setTimeout(resolve, 1000));
        } catch (injectError) {
          console.error('Failed to inject content script:', injectError);
          throw new Error('Could not load automation script on this page');
        }
      }

      // Collect message settings
      const messageSettings: MessageSettings = {
        greetingPart1: greetingPart1Input.value,
        includeFirstName: includeFirstNameCheckbox.checked,
        greetingPart2: greetingPart2Input.value,
        messageText: messageTextTextarea.value
      };

      // Send message to content script with live mode setting, message settings, max pages, max connections, and auto-adjust
      const response = await chrome.tabs.sendMessage(tab.id!, {
        action: "startAutomation",
        liveMode: liveModeCheckbox.checked,
        messageSettings: messageSettings,
        maxPages: stopPageInput.value,
        maxConnections: maxConnectionsInput.value,
        autoAdjust: autoAdjustCheckbox.checked
      } as AutomationMessage) as AutomationResponse;

      if (response && response.status === "started") {
        startButton.textContent = 'Running...';
        statusDiv.textContent = `Automation started in ${liveModeCheckbox.checked ? 'LIVE' : 'TEST'} mode! Check console for progress.`;
        statusDiv.style.color = liveModeCheckbox.checked ? '#d93025' : '#f57c00';
      } else {
        throw new Error('Content script did not respond properly');
      }
    } catch (error) {
      console.error('Error starting automation:', error);
      startButton.disabled = false;
      startButton.textContent = 'Start Automation';
      liveModeCheckbox.disabled = false; // Re-enable checkbox on error

      // Provide more specific error messages
      let errorMessage = 'Error: Could not start automation';
      if (error instanceof Error && error.message) {
        errorMessage += ` - ${error.message}`;
      }
      statusDiv.textContent = errorMessage;
      statusDiv.style.color = '#d93025';
    }
  });

  // Function to update status based on current tab
  function updateStatusBasedOnTab(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab.url && currentTab.url.includes('linkedin.com/search/results/people')) {
        if (liveModeCheckbox.checked) {
          statusDiv.textContent = 'Ready to start (Live Mode)';
          statusDiv.style.color = '#d93025';
        } else {
          statusDiv.textContent = 'Ready to start (Test Mode - Safe)';
          statusDiv.style.color = '#f57c00';
        }
      } else {
        statusDiv.textContent = '';
        statusDiv.style.color = '#666';
      }
    });
  }

  // Check current tab on popup open
  updateStatusBasedOnTab();

  // Listen for completion message from content script
  chrome.runtime.onMessage.addListener((request: { action: string }, sender, sendResponse) => {
    if (request.action === "automationCompleted") {
      // Re-enable UI elements
      startButton.disabled = false;
      startButton.textContent = 'Start Automation';
      liveModeCheckbox.disabled = false;
      statusDiv.textContent = 'Automation completed! Ready for next run.';
      statusDiv.style.color = '#188038';
      hideConfirmationPanel();
    }
  });

  // Store build only: listen for pendingConfirmation and show Send/Skip panel
  if (_BUILD_TARGET === "store") {
    chrome.runtime.onMessage.addListener((request: { action: string; firstName?: string }) => {
      if (request.action === "pendingConfirmation") {
        showConfirmationPanel(request.firstName ?? "");
      }
    });
  }

  function showConfirmationPanel(firstName: string): void {
    let panel = document.getElementById('confirmPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'confirmPanel';
      panel.style.cssText = 'margin-top:12px;padding:12px;background:#fff3cd;border:1px solid #f0ad4e;border-radius:4px;font-size:13px;';
      statusDiv.parentNode!.insertBefore(panel, statusDiv.nextSibling);
    }
    panel.innerHTML = `
      <strong>Ready to send to ${firstName ? firstName : 'this person'}?</strong>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button id="confirmSendBtn" style="flex:1;padding:7px;background:#0077b5;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Send</button>
        <button id="skipSendBtn" style="flex:1;padding:7px;background:#e9ecef;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Skip</button>
      </div>
    `;
    (document.getElementById('confirmSendBtn') as HTMLButtonElement).addEventListener('click', () => {
      hideConfirmationPanel();
      sendConfirmationToTab("confirmSend");
    });
    (document.getElementById('skipSendBtn') as HTMLButtonElement).addEventListener('click', () => {
      hideConfirmationPanel();
      sendConfirmationToTab("skipSend");
    });
  }

  function hideConfirmationPanel(): void {
    const panel = document.getElementById('confirmPanel');
    if (panel) panel.remove();
  }

  function sendConfirmationToTab(action: "confirmSend" | "skipSend"): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action });
      }
    });
  }
});

// Function to check for extension updates
async function checkForUpdates(): Promise<void> {
  try {
    console.log('Checking for extension updates...');

    // Get latest commit from GitHub
    const response = await fetch('https://api.github.com/repos/j2kenton/linkedin-linker/commits?per_page=1');
    const commits = await response.json() as GitHubCommit[];
    const latestCommit = commits[0].sha;

    // Get last known commit from storage
    chrome.storage.local.get(['lastCommit'], (result: StorageData) => {
      const lastCommit = result.lastCommit;

      if (!lastCommit || lastCommit !== latestCommit) {
        // Update available - show notification
        showUpdateNotification();
        // Store the new commit hash
        chrome.storage.local.set({ lastCommit: latestCommit });
      } else {
        console.log('Extension is up to date');
      }
    });
  } catch (error) {
    console.log('Update check failed:', error);
  }
}

// Function to show update notification in popup
function showUpdateNotification(): void {
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  // Create update notification HTML
  statusDiv.innerHTML = `
    <div style="color: #f57c00; border: 1px solid #f57c00; padding: 10px; border-radius: 4px; margin: 10px 0; background-color: #fff3cd;">
      <strong>Update Available!</strong><br>
      <small>New version of Career Connect is ready.</small><br>
      <button id="updateBtn" style="margin-top: 8px; padding: 6px 12px; background: #0077b5; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">Update Now</button>
    </div>
  `;

  // Add click handler for update button
  const updateBtn = document.getElementById('updateBtn');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      runUpdateScript();
    });
  }
}

// Function to run the update script
function runUpdateScript(): void {
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  // Show loading state
  statusDiv.innerHTML = `
    <div style="color: #666; border: 1px solid #ddd; padding: 10px; border-radius: 4px; margin: 10px 0;">
      <strong>Updating extension...</strong><br>
      <small>Running git pull to download latest changes.</small>
    </div>
  `;

  // Note: In a real Chrome extension, you can't directly run batch files
  // For actual implementation, you might need to use Chrome's native messaging
  // or create a browser-specific solution

  setTimeout(() => {
    statusDiv.innerHTML = `
      <div style="color: #188038; border: 1px solid #188038; padding: 10px; border-radius: 4px; margin: 10px 0;">
        <strong>Update complete!</strong><br>
        <small>Please reload the extension in Chrome extensions page (chrome://extensions/).</small>
      </div>
    `;
  }, 2000);
}

const _extractableKind = (url: string): "profile" | "job" | "other" => pageDetectExtractableKind(url, null);
initCareerTools(_extractableKind);
