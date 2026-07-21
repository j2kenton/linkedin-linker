// Career Connect Background Script (Service Worker)
import { wireCareerTools } from "./careerBackground";

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
  ): void => {
    if (request.action === "automationCompleted") {
      console.log("Automation completed message received from content script");

      // Send notification to side panel if it's open
      chrome.runtime.sendMessage({
        action: "automationCompleted",
        from: "background"
      }).catch(() => {
        // Panel might not be open, that's okay
      });

      sendResponse({ status: "received" });
    }
  }
);

// Handle extension installation
chrome.runtime.onInstalled.addListener((): void => {
  console.log("Career Connect installed");
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Handle extension startup
chrome.runtime.onStartup.addListener((): void => {
  console.log("Career Connect started");
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

wireCareerTools();
