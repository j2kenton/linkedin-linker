// LinkedIn Connection Automator Background Script (Service Worker)

interface AutomationMessage {
  action: string;
  from?: string;
}

interface MessageResponse {
  status: string;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener(
  (
    request: AutomationMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean | void => {
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
  }
);

// Handle extension installation
chrome.runtime.onInstalled.addListener((): void => {
  console.log("LinkedIn Connection Automator installed");
});

// Handle extension startup
chrome.runtime.onStartup.addListener((): void => {
  console.log("LinkedIn Connection Automator started");
});
