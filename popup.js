// Popup script for LinkedIn Automator extension

document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startButton');
  const statusDiv = document.getElementById('status');
  const liveModeCheckbox = document.getElementById('liveModeCheckbox');

  // Load saved live mode setting
  chrome.storage.local.get(['liveMode'], (result) => {
    const liveMode = result.liveMode !== undefined ? result.liveMode : false;
    liveModeCheckbox.checked = liveMode;
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

  startButton.addEventListener('click', async () => {
    // Check if we're on a LinkedIn search results page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('linkedin.com/search/results/people')) {
      statusDiv.textContent = '❌ Please navigate to a LinkedIn search results page first';
      statusDiv.style.color = '#d93025';
      return;
    }

    // Update button state
    startButton.disabled = true;
    startButton.textContent = 'Starting...';
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
});
