import { extractJob } from "./extract/job";
import { extractProfile } from "./extract/profile";

{
// LinkedIn Connection Assistant Content Script — store build
// Behaviour: find the next unvisited connectable profile on the current page,
// open LinkedIn's invite dialog, fill the note, then STOP.
// The extension never clicks Send. The user reviews and decides.

interface MessageSettings {
  greetingPart1: string;
  includeFirstName: boolean;
  greetingPart2: string;
  messageText: string;
}

interface PrepareRequest {
  action: "prepareNextInvite" | "ping";
  messageSettings?: MessageSettings;
}

interface MessageResponse {
  status: string;
  firstName?: string;
  error?: string;
}

const buildNote = (firstName: string, settings: MessageSettings): string => {
  let message = settings.greetingPart1;
  if (settings.includeFirstName && firstName) {
    message += ` ${firstName}`;
  }
  message += ` ${settings.greetingPart2}\n${settings.messageText}`;
  return message;
};

const generateRandomTimeout = (multiplier: number = 3000): number =>
  Math.floor(Math.random() * multiplier) + 500;

const extractFirstName = (prospectText: string): string => {
  if (!prospectText) return "";
  const match = prospectText.match(/[\p{L}\p{N}]+/u);
  if (match) {
    const name = match[0];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return "";
};

const findConnectButton = (container: Element): HTMLElement | null => {
  const button = container.querySelector("button[aria-label$='connect']");
  if (button) return button as HTMLElement;
  const anchor = container.querySelector(
    "a[href*='search-custom-invite'], a[aria-label*='connect' i], a[aria-label*='Connect' i]"
  );
  if (anchor) return anchor as HTMLElement;
  return null;
};

const findModal = (): HTMLElement | null => {
  let modal = document.querySelector("div[role='dialog'].send-invite") as HTMLElement | null;
  if (modal) return modal;
  const shadowHost = document.querySelector("#interop-outlet");
  if (shadowHost && shadowHost.shadowRoot) {
    modal = shadowHost.shadowRoot.querySelector("div[role='dialog'].send-invite") as HTMLElement | null;
  }
  return modal;
};

// Track which profile URLs have already had an invite prepared this session,
// so repeated "Prepare next invite" clicks advance through the page without revisiting.
const preparedProfileUrls = new Set<string>();

const getProfileUrl = (container: Element): string | null => {
  const anchor = container.querySelector("a[href*='/in/']") as HTMLAnchorElement | null;
  if (anchor) {
    // Normalise to just the /in/slug/ portion so query-string variants don't create duplicates
    const match = anchor.href.match(/(\/in\/[^/?#]+)/);
    return match ? match[1] : anchor.href;
  }
  return null;
};

// Collect connectable profiles on the current page, deduped by profile URL.
const collectProspects = (): Element[] => {
  const candidates: Element[] = [
    ...document.querySelectorAll(".search-results-container ul li"),
    ...document.querySelectorAll("div.entity-result__item"),
    ...document.querySelectorAll("div[data-test-id*='profile-card']"),
    ...document.querySelectorAll("div[data-test-id*='connection-card']"),
    ...document.querySelectorAll("div[data-test-id*='people-card']"),
    ...document.querySelectorAll("div.discovery-card"),
    ...document.querySelectorAll("div[data-control-name*='people_card']"),
  ];

  const seen = new Set<string>();
  const deduped: Element[] = [];

  for (const el of candidates) {
    if (!findConnectButton(el)) continue;
    const url = getProfileUrl(el) ?? el.textContent?.trim().slice(0, 60) ?? "";
    if (url && seen.has(url)) continue;
    if (url) seen.add(url);
    deduped.push(el);
  }

  return deduped;
};

// Find and prepare the next invite — open the dialog, fill the note, stop.
// Returns the first name on success or throws on failure.
const prepareNextInvite = (messageSettings: MessageSettings): Promise<string> => {
  return new Promise((resolve, reject) => {
    const prospects = collectProspects();
    const next = prospects.find(el => {
      const url = getProfileUrl(el);
      return !url || !preparedProfileUrls.has(url);
    });

    if (!next) {
      reject(new Error("No more connectable profiles found on this page."));
      return;
    }

    const profileUrl = getProfileUrl(next);
    const firstName = extractFirstName((next as HTMLElement).innerText ?? "");
    const connectButton = findConnectButton(next)!;

    connectButton.dispatchEvent(new Event("click", { bubbles: true }));

    setTimeout(() => {
      const modal = findModal();
      if (!modal) {
        reject(new Error("LinkedIn's invite dialog did not open. Try scrolling the profile into view first."));
        return;
      }

      const addNoteButton = modal.querySelector('button[aria-label^="Add"]') as HTMLButtonElement | null;
      if (!addNoteButton) {
        // Dialog opened but no "Add a note" button — profile may already be connected or pending
        reject(new Error(`No "Add a note" button found for ${firstName || "this profile"}.`));
        return;
      }

      addNoteButton.dispatchEvent(new Event("click", { bubbles: true }));

      setTimeout(() => {
        const noteTextArea = modal.querySelector("textarea") as HTMLTextAreaElement | null;
        if (!noteTextArea) {
          reject(new Error("Note textarea not found in invite dialog."));
          return;
        }

        const note = buildNote(firstName, messageSettings);
        noteTextArea.value = note;
        noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));

        // Only mark as prepared after the note is successfully filled so a
        // failed attempt can be retried without reloading the page.
        if (profileUrl) preparedProfileUrls.add(profileUrl);

        console.log(`[Connection Assistant] Invite prepared for ${firstName || "profile"}. Review and send it yourself.`);
        resolve(firstName);
      }, generateRandomTimeout());
    }, generateRandomTimeout());
  });
};

chrome.runtime.onMessage.addListener(
  (
    request: PrepareRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean => {
    if (request.action === "ping") {
      sendResponse({ status: "ready" });
    } else if (request.action === "prepareNextInvite") {
      if (!request.messageSettings) {
        sendResponse({ status: "error", error: "No message settings provided." });
        return true;
      }
      prepareNextInvite(request.messageSettings)
        .then(firstName => sendResponse({ status: "prepared", firstName }))
        .catch(err => sendResponse({ status: "error", error: (err as Error).message }));
    }
    return true;
  }
);

// Career Tools read visible LinkedIn text only, and are ignored by subframes.
// `sender.frameId` describes the sender's frame, not this receiver's — a
// request from the popup has no tab-frame sender at all, so only this
// frame's own top-frame identity may gate the response.
chrome.runtime.onMessage.addListener((request: { action?: string }, _sender, sendResponse) => {
  if (window.top !== window) return;
  if (request.action === "EXTRACT_PROFILE") { sendResponse(extractProfile(document)); return; }
  if (request.action === "EXTRACT_JOB") sendResponse(extractJob(document));
});
}
