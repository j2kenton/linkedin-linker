// Popup script for LinkedIn Automator extension

document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startButton');
  const statusDiv = document.getElementById('status');

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
      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "startAutomation"
      });

      if (response && response.status === "started") {
        startButton.textContent = 'Running...';
        statusDiv.textContent = '✅ Automation started! Check console for progress.';
        statusDiv.style.color = '#188038';
      }
    } catch (error) {
      console.error('Error starting automation:', error);
      startButton.disabled = false;
      startButton.textContent = 'Start Automation';
      statusDiv.textContent = '❌ Error: Could not start automation';
      statusDiv.style.color = '#d93025';
    }
  });

  // Check current tab on popup open
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab.url && currentTab.url.includes('linkedin.com/search/results/people')) {
      statusDiv.textContent = '✅ Ready to start on this LinkedIn search page';
      statusDiv.style.color = '#188038';
    } else {
      statusDiv.textContent = 'Navigate to LinkedIn search results page';
      statusDiv.style.color = '#666';
    }
  });
});
