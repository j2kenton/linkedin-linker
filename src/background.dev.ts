import "./background";
import { wireCareerTools } from "./careerBackground";

wireCareerTools();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "setMaxConnections" && typeof request.maxConnections === "string") {
    chrome.storage.local.set({ maxConnections: request.maxConnections });
    sendResponse({ status: "received" });
  }
});
