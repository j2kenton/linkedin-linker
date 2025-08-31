// Popup script for LinkedIn Automator extension

document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startButton');
  const statusDiv = document.getElementById('status');
  const liveModeCheckbox = document.getElementById('liveModeCheckbox');

  // Form elements
  const companyNameInput = document.getElementById('companyName');
  const companiesIdsInput = document.getElementById('companiesIds');
  const titleOfProspectInput = document.getElementById('titleOfProspect');
  const locationIdsInput = document.getElementById('locationIds');
  const connectionDegreeInput = document.getElementById('connectionDegree');
  const startPageInput = document.getElementById('startPage');
  const goToSearchButton = document.getElementById('goToSearchButton');
  const getFromUrlButton = document.getElementById('getFromUrlButton');
  const getLocationFromUrlButton = document.getElementById('getLocationFromUrlButton');

  // Check for updates when popup opens
  checkForUpdates();

  // Load saved settings
  chrome.storage.local.get(['liveMode', 'companyName', 'companiesIds', 'titleOfProspect', 'locationIds', 'connectionDegree', 'startPage'], (result) => {
    const liveMode = result.liveMode !== undefined ? result.liveMode : false;
    liveModeCheckbox.checked = liveMode;

    // Load search parameters with defaults
    companyNameInput.value = result.companyName !== undefined ? result.companyName : 'Microsoft';
    companiesIdsInput.value = result.companiesIds !== undefined ? result.companiesIds : '1035';
    titleOfProspectInput.value = result.titleOfProspect !== undefined ? result.titleOfProspect : 'Engineering Manager';
    locationIdsInput.value = result.locationIds !== undefined ? result.locationIds : '101620260';

    // Handle connection degree multi-select
    const savedDegrees = (result.connectionDegree !== undefined ? result.connectionDegree : 'S,O').split(',').map(d => d.trim());
    Array.from(connectionDegreeInput.options).forEach(option => {
      option.selected = savedDegrees.includes(option.value);
    });

    startPageInput.value = result.startPage !== undefined ? result.startPage : 1;
  });

  // Handle "Get from current URL" button (Company)
  getFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = '❌ Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = '❌ Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract currentCompany parameter from URL
      const url = new URL(currentTab.url);
      const currentCompanyParam = url.searchParams.get('currentCompany');

      if (!currentCompanyParam) {
        statusDiv.textContent = '❌ No company information found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode and parse the JSON array
        const decodedParam = decodeURIComponent(currentCompanyParam);
        const companyIdsArray = JSON.parse(decodedParam);

        if (!Array.isArray(companyIdsArray) || companyIdsArray.length === 0) {
          statusDiv.textContent = '❌ Invalid company data in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        // Join with comma and set to field
        const companyIdsString = companyIdsArray.join(',');
        companiesIdsInput.value = companyIdsString;

        statusDiv.textContent = `✅ Company ID(s) extracted: ${companyIdsString}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing company data:', error);
        statusDiv.textContent = '❌ Failed to parse company data from URL';
        statusDiv.style.color = '#d93025';
      }
    });
  });

  // Handle "Get from current URL" button (Location)
  getLocationFromUrlButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url) {
        statusDiv.textContent = '❌ Unable to get current tab URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      if (!currentTab.url.includes('linkedin.com/search/results/people')) {
        statusDiv.textContent = '❌ Please navigate to a LinkedIn search results page first';
        statusDiv.style.color = '#d93025';
        return;
      }

      // Extract geoUrn parameter from URL
      const url = new URL(currentTab.url);
      const geoUrnParam = url.searchParams.get('geoUrn');

      if (!geoUrnParam) {
        statusDiv.textContent = '❌ No location information found in current search URL';
        statusDiv.style.color = '#d93025';
        return;
      }

      try {
        // Decode and parse the JSON array
        const decodedParam = decodeURIComponent(geoUrnParam);
        const locationIdsArray = JSON.parse(decodedParam);

        if (!Array.isArray(locationIdsArray) || locationIdsArray.length === 0) {
          statusDiv.textContent = '❌ Invalid location data in URL';
          statusDiv.style.color = '#d93025';
          return;
        }

        // Join with comma and set to field
        const locationIdsString = locationIdsArray.join(',');
        locationIdsInput.value = locationIdsString;

        statusDiv.textContent = `✅ Location ID(s) extracted: ${locationIdsString}`;
        statusDiv.style.color = '#188038';
      } catch (error) {
        console.error('Error parsing location data:', error);
        statusDiv.textContent = '❌ Failed to parse location data from URL';
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
      statusDiv.textContent = '🔴 Live Mode: Will send actual connection requests';
      statusDiv.style.color = '#d93025';
    } else {
      statusDiv.textContent = '🟡 Test Mode: Will only log actions (safe)';
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
      startPage: parseInt(startPageInput.value) || 1
    };

    chrome.storage.local.set(params, () => {
      // Generate URL and open in new tab
      const url = generateLinkedInURL();
      chrome.tabs.create({ url: url });

      // Update status
      statusDiv.textContent = '🔗 Opening LinkedIn search page...';
      statusDiv.style.color = '#0077b5';

      // Hide the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });

  // Function to generate LinkedIn search URL
  function generateLinkedInURL() {
    let url = 'https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH';
    const params = [];

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
    // Check if we're on a LinkedIn search results page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('linkedin.com/search/results/people')) {
      // Generate URL and open it
      const url = generateLinkedInURL();
      chrome.tabs.create({ url: url }, () => {
        statusDiv.textContent = '🔗 Opening LinkedIn search page...';
        statusDiv.style.color = '#0077b5';
        setTimeout(() => {
          updateStatusBasedOnTab();
        }, 3000);
      });
      return;
    }

    // Update button state
    startButton.disabled = true;
    startButton.textContent = 'Starting...';
    liveModeCheckbox.disabled = true; // Disable live mode checkbox while running
    statusDiv.textContent = '🚀 Starting automation...';
    statusDiv.style.color = '#666';

    try {
      // Send message to content script with live mode setting
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "startAutomation",
        liveMode: liveModeCheckbox.checked
      });

      if (response && response.status === "started") {
        startButton.textContent = 'Running...';
        statusDiv.textContent = `✅ Automation started in ${liveModeCheckbox.checked ? 'LIVE' : 'TEST'} mode! Check console for progress.`;
        statusDiv.style.color = liveModeCheckbox.checked ? '#d93025' : '#f57c00';
      }
    } catch (error) {
      console.error('Error starting automation:', error);
      startButton.disabled = false;
      startButton.textContent = 'Start Automation';
      liveModeCheckbox.disabled = false; // Re-enable checkbox on error
      statusDiv.textContent = '❌ Error: Could not start automation';
      statusDiv.style.color = '#d93025';
    }
  });

  // Function to update status based on current tab
  function updateStatusBasedOnTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab.url && currentTab.url.includes('linkedin.com/search/results/people')) {
        if (liveModeCheckbox.checked) {
          statusDiv.textContent = '🔴 Ready to start (Live Mode)';
          statusDiv.style.color = '#d93025';
        } else {
          statusDiv.textContent = '🟡 Ready to start (Test Mode - Safe)';
          statusDiv.style.color = '#f57c00';
        }
      } else {
        statusDiv.textContent = 'Navigate to LinkedIn search results page';
        statusDiv.style.color = '#666';
      }
    });
  }

  // Check current tab on popup open
  updateStatusBasedOnTab();

  // Listen for completion message from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "automationCompleted") {
      // Re-enable UI elements
      startButton.disabled = false;
      startButton.textContent = 'Start Automation';
      liveModeCheckbox.disabled = false;
      statusDiv.textContent = '✅ Automation completed! Ready for next run.';
      statusDiv.style.color = '#188038';
    }
  });
});

// Function to check for extension updates
async function checkForUpdates() {
  try {
    console.log('Checking for extension updates...');

    // Get latest commit from GitHub
    const response = await fetch('https://api.github.com/repos/j2kenton/linkedin-linker/commits?per_page=1');
    const commits = await response.json();
    const latestCommit = commits[0].sha;

    // Get last known commit from storage
    chrome.storage.local.get(['lastCommit'], (result) => {
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
function showUpdateNotification() {
  const statusDiv = document.getElementById('status');

  // Create update notification HTML
  statusDiv.innerHTML = `
    <div style="color: #f57c00; border: 1px solid #f57c00; padding: 10px; border-radius: 4px; margin: 10px 0; background-color: #fff3cd;">
      📦 <strong>Update Available!</strong><br>
      <small>New version of LinkedIn Automator is ready.</small><br>
      <button id="updateBtn" style="margin-top: 8px; padding: 6px 12px; background: #0077b5; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">Update Now</button>
    </div>
  `;

  // Add click handler for update button
  document.getElementById('updateBtn').addEventListener('click', () => {
    runUpdateScript();
  });
}

// Function to run the update script
function runUpdateScript() {
  const statusDiv = document.getElementById('status');

  // Show loading state
  statusDiv.innerHTML = `
    <div style="color: #666; border: 1px solid #ddd; padding: 10px; border-radius: 4px; margin: 10px 0;">
      🔄 <strong>Updating extension...</strong><br>
      <small>Running git pull to download latest changes.</small>
    </div>
  `;

  // Note: In a real Chrome extension, you can't directly run batch files
  // For actual implementation, you might need to use Chrome's native messaging
  // or create a browser-specific solution

  setTimeout(() => {
    statusDiv.innerHTML = `
      <div style="color: #188038; border: 1px solid #188038; padding: 10px; border-radius: 4px; margin: 10px 0;">
        ✅ <strong>Update complete!</strong><br>
        <small>Please reload the extension in Chrome extensions page (chrome://extensions/).</small>
      </div>
    `;
  }, 2000);
}
