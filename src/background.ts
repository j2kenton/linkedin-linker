// LinkedIn Connection Automator Background Script (Service Worker)

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "automationCompleted") {
    console.log("Automation completed message received from content script");

    // Send notification to popup if it's open
    chrome.runtime.sendMessage({
      action: "automationCompleted",
      from: "background"
    }).catch(() => {
      // Popup might not be open, that's okay
    });

    sendResponse({ status: "received" });
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("LinkedIn Connection Automator installed");
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("LinkedIn Connection Automator started");
});
