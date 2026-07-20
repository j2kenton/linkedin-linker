// Popup script for Career Connect
import { BUILD_TARGET } from "./build-target";
import { classifyUrl } from "./pageDetect";
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

  // Handle "Get from current URL" button (Company)
  getFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract currentCompany parameter from URL
      const url = new URL(currentTab.url);
      const currentCompanyParam = url.searchParams.get('currentCompany');

      if (!currentCompanyParam) {
        statusDiv.textContent = 'No company information found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode and parse the JSON array
        const decodedParam = decodeURIComponent(currentCompanyParam);
        const companyIdsArray = JSON.parse(decodedParam) as string[];

        if (!Array.isArray(companyIdsArray) || companyIdsArray.length === 0) {
          statusDiv.textContent = 'Invalid company data in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        // Join with comma and set to field
        const companyIdsString = companyIdsArray.join(',');
        companiesIdsInput.value = companyIdsString;

        statusDiv.textContent = `Company ID(s) extracted: ${companyIdsString}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing company data:', error);
        statusDiv.textContent = 'Failed to parse company data from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Location)
  getLocationFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract geoUrn parameter from URL
      const url = new URL(currentTab.url);
      const geoUrnParam = url.searchParams.get('geoUrn');

      if (!geoUrnParam) {
        statusDiv.textContent = 'No location information found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode and parse the JSON array
        const decodedParam = decodeURIComponent(geoUrnParam);
        const locationIdsArray = JSON.parse(decodedParam) as string[];

        if (!Array.isArray(locationIdsArray) || locationIdsArray.length === 0) {
          statusDiv.textContent = 'Invalid location data in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        // Join with comma and set to field
        const locationIdsString = locationIdsArray.join(',');
        locationIdsInput.value = locationIdsString;

        statusDiv.textContent = `Location ID(s) extracted: ${locationIdsString}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing location data:', error);
        statusDiv.textContent = 'Failed to parse location data from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Company Name)
  getCompanyNameFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract company parameter from URL
      const url = new URL(currentTab.url);
      const companyParam = url.searchParams.get('company');

      if (!companyParam) {
        statusDiv.textContent = 'No company name found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode the company name
        const companyName = decodeURIComponent(companyParam);
        companyNameInput.value = companyName;

        statusDiv.textContent = `Company name extracted: ${companyName}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing company name:', error);
        statusDiv.textContent = 'Failed to parse company name from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Title)
  getTitleFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract titleFreeText parameter from URL
      const url = new URL(currentTab.url);
      const titleParam = url.searchParams.get('titleFreeText');

      if (!titleParam) {
        statusDiv.textContent = 'No job title found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode the job title
        const jobTitle = decodeURIComponent(titleParam);
        titleOfProspectInput.value = jobTitle;

        statusDiv.textContent = `Job title extracted: ${jobTitle}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing job title:', error);
        statusDiv.textContent = 'Failed to parse job title from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Connection Degree)
  getConnectionDegreeFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract network parameter from URL
      const url = new URL(currentTab.url);
      const networkParam = url.searchParams.get('network');

      if (!networkParam) {
        statusDiv.textContent = 'No connection degree found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode and parse the JSON array
        const decodedParam = decodeURIComponent(networkParam);
        const connectionDegrees = JSON.parse(decodedParam) as string[];

        if (!Array.isArray(connectionDegrees) || connectionDegrees.length === 0) {
          statusDiv.textContent = 'Invalid connection degree data in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        // Clear existing selections
        Array.from(connectionDegreeInput.options).forEach(option => {
          option.selected = false;
        });

        // Select the matching options
        connectionDegrees.forEach(degree => {
          const option = Array.from(connectionDegreeInput.options).find(opt => opt.value === degree);
          if (option) {
            option.selected = true;
          }
        });

        statusDiv.textContent = `Connection degrees extracted: ${connectionDegrees.join(', ')}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing connection degrees:', error);
        statusDiv.textContent = 'Failed to parse connection degrees from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Start Page)
  getStartPageFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = 'Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = 'Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract page parameter from URL
      const url = new URL(currentTab.url);
      const pageParam = url.searchParams.get('page');

      if (!pageParam) {
        statusDiv.textContent = 'No page number found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Parse the page number
        const pageNumber = parseInt(pageParam);
        if (isNaN(pageNumber) || pageNumber < 1) {
          statusDiv.textContent = 'Invalid page number in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        startPageInput.value = String(pageNumber);
        statusDiv.textContent = `Start page extracted: ${pageNumber}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing page number:', error);
        statusDiv.textContent = 'Failed to parse page number from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

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
    const selectedDegrees = Array.from(connectionDegreeInput.selectedOptions).map(option => option.value).join(',');
    const params = {
      companyName: companyNameInput.value,
      companiesIds: companiesIdsInput.value,
      titleOfProspect: titleOfProspectInput.value,
      locationIds: locationIdsInput.value,
      connectionDegree: selectedDegrees,
      startPage: parseInt(startPageInput.value) || 1,
      stopPage: stopPageInput.value ? parseInt(stopPageInput.value) : ''
    };

    chrome.storage.local.set(params, () => {
      // Generate URL and open in new tab
      const url = generateLinkedInURL();
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

  // Function to generate LinkedIn search URL
  function generateLinkedInURL(): string {
    let url = 'https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH';
    const params: string[] = [];

    // Company Name
    const companyName = companyNameInput.value.trim();
    if (companyName) {
      params.push(`company=${encodeURIComponent(companyName)}`);
    }

    // Keywords: combine title and companyName if present
    let keywords = '';
    const titleOfProspect = titleOfProspectInput.value.trim();
    if (titleOfProspect) {
      keywords = encodeURIComponent(titleOfProspect);
    }
    if (companyName) {
      keywords += (keywords ? '%20' : '') + encodeURIComponent(companyName);
    }
    if (keywords) {
      params.push(`keywords=${keywords}`);
    }

    // Companies IDs
    const companiesIds = companiesIdsInput.value.split(',').map(id => id.trim()).filter(id => id);
    if (companiesIds.length > 0) {
      const companiesIdsString = JSON.stringify(companiesIds);
      params.push(`currentCompany=${encodeURIComponent(companiesIdsString)}`);
    }

    // Location IDs
    const locationIds = locationIdsInput.value.split(',').map(id => id.trim()).filter(id => id);
    if (locationIds.length > 0) {
      const locationIdsString = JSON.stringify(locationIds);
      params.push(`geoUrn=${encodeURIComponent(locationIdsString)}`);
    }

    // Connection Degree
    const connectionDegree = Array.from(connectionDegreeInput.selectedOptions).map(option => option.value);
    if (connectionDegree.length > 0) {
      const connectionDegreeString = JSON.stringify(connectionDegree);
      params.push(`network=${encodeURIComponent(connectionDegreeString)}`);
    }

    // Start Page
    const startPage = parseInt(startPageInput.value) || 1;
    params.push(`page=${startPage}`);

    // Title Free Text
    if (titleOfProspect) {
      params.push(`titleFreeText=${encodeURIComponent(titleOfProspect)}`);
    }

    // Add sid
    params.push('sid=BpI');

    if (params.length > 0) {
      url += '&' + params.join('&');
    }

    return url;
  }

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

// Developer-only Career Tools.  The automation popup remains available unchanged.
type CareerExtraction = Record<string, unknown> & { ready?: boolean; warnings?: { message: string }[] };
const careerGet = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));
const careerSet = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
const careerElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function careerPage(url: string): "profile" | "job" | "other" { return classifyUrl(url); }
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
  chrome.runtime.sendMessage({ action:"CAREER_TOOLS_STATUS" }).then(async (lock: { locked:boolean; reason?:string }) => {
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
