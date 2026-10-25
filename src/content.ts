import { BUILD_TARGET } from "./build-target";
import { registerExtractionListener } from "./extract/messageHandler";
import { buildNote, generateRandomTimeout, extractProspectFirstName, findConnectButton, findModal, collectProspectCards, type MessageSettings } from "./content-shared";

// Career Connect Content Script
// esbuild inlines this generated build target into the developer bundle.
const _BUILD_TARGET: string = BUILD_TARGET;

interface StartAutomationRequest {
  action: "startAutomation" | "ping";
  liveMode?: boolean;
  messageSettings?: MessageSettings;
  maxPages?: string;
  maxConnections?: string;
  autoAdjust?: boolean;
}

interface MessageResponse {
  status: string;
}

// TrustedTypes interface for CSP compliance
interface TrustedHTML { readonly __brand: unique symbol; }
interface TrustedScript { readonly __brand: unique symbol; }
interface TrustedScriptURL { readonly __brand: unique symbol; }

interface TrustedTypesPolicy {
  createHTML: (input: string) => TrustedHTML;
  createScript: (input: string) => TrustedScript;
  createScriptURL: (input: string) => TrustedScriptURL;
}

interface TrustedTypes {
  createPolicy: (
    name: string,
    policy: {
      createHTML?: (input: string) => TrustedHTML;
      createScript?: (input: string) => TrustedScript;
      createScriptURL?: (input: string) => TrustedScriptURL;
    }
  ) => TrustedTypesPolicy;
}

// Extend Window interface to include trustedTypes
/*
declare global {
  interface Window {
    trustedTypes?: TrustedTypes;
  }
}
*/

// Fallback function for clipboard-based text insertion
// Note: document.execCommand('paste') is deprecated and not supported in modern browsers.
// This function writes to clipboard and then directly sets the textarea value.
async function fallbackToClipboard(message: string, noteTextArea: HTMLTextAreaElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(message);
    noteTextArea.focus();
    noteTextArea.select();
    // Directly use the message parameter instead of reading from clipboard
    noteTextArea.value = message;
    noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
  } catch (e) {
    console.log("Clipboard fallback failed:", e);
    // Final fallback to direct assignment
    try {
      noteTextArea.value = message;
      noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (finalError) {
      console.log("All text insertion methods failed:", finalError);
    }
  }
}

let prospectsProcessed = 0;
let currentPage = 1;
let pagesProcessed = 0;
let currentProspectsList: Element[] = [];
let currentProspectIndex = 0;
let isLiveMode = false;
let messageSettings: MessageSettings = {
  greetingPart1: "",
  includeFirstName: false,
  greetingPart2: "",
  messageText: ""
};
let maxPages: number | null = null; // null means no limit
let maxConnections: number | null = null; // null means no limit
let autoAdjust = false; // auto-adjust max connections setting
let isRunning = false;
let emptyPagesSeen = 0; // pages where no Connect buttons were found at all
let abortReason: string | null = null;

// One completion message per run, with a human-readable outcome for the popup status line.
const notifyCompleted = (): void => {
  const mode = isLiveMode ? "LIVE" : "TEST";
  let summary = `Done (${mode}): ${prospectsProcessed} prospect(s) processed.`;
  if (abortReason) {
    summary = `Stopped (${mode}) after ${prospectsProcessed} prospect(s): ${abortReason}`;
  } else if (prospectsProcessed === 0 && emptyPagesSeen > 0) {
    summary = `No Connect buttons found on this page (${mode}). Everyone shown may already be connected or pending, or LinkedIn changed its layout.`;
  }
  chrome.runtime.sendMessage({ action: "automationCompleted", summary }).catch(() => undefined);
};

// Called after a connection request is successfully sent (both builds).
// Handles the auto-adjust decrement and notifies the popup of the new limit.
const onSentOrSkipped = (): void => {
  if (autoAdjust && maxConnections !== null && maxConnections > 0) {
    maxConnections--;
    console.log(`Auto-adjust: Decreased max connections limit to ${maxConnections}`);
    chrome.runtime.sendMessage({ action: "setMaxConnections", maxConnections: maxConnections.toString() }).catch(() => undefined);
    chrome.runtime.sendMessage({ type: "maxConnectionsUpdated", maxConnections }).catch(() => undefined);
  }
};

// Function to connect to prospect at current index in the preserved list
const connectToProspectAtIndex = async (): Promise<void> => {
  return new Promise((resolve) => {
    // Check if we've reached the max connections limit BEFORE processing
    if (maxConnections !== null && prospectsProcessed >= maxConnections) {
      console.log(`MAX LIMIT REACHED: Already processed ${prospectsProcessed}/${maxConnections} connections. Stopping automation.`);
      resolve();
      return;
    }

    // Check if we've processed all prospects in current list
    if (currentProspectIndex >= currentProspectsList.length) {
      console.log("No more prospects in current list.");
      resolve();
      return;
    }

    // Get the prospect at current index
    const prospectElement = currentProspectsList[currentProspectIndex] as HTMLElement;

    if (!prospectElement) {
      console.log(
        `No prospect element found for index ${currentProspectIndex}, skipping...`
      );
      currentProspectIndex++; // Move to next prospect
      resolve();
      return;
    }

    const firstName = extractProspectFirstName(prospectElement);

    // Find the connect button within this specific prospect
    const connectButton = findConnectButton(prospectElement);

    if (!connectButton) {
      console.log(
        `No connect button found for prospect ${firstName}, skipping...`
      );
      currentProspectIndex++; // Move to next prospect
      resolve();
      return;
    }

    console.log(
      `${isLiveMode ? "LIVE" : "TEST"}: Processing prospect ${
        currentProspectIndex + 1
      }/${currentProspectsList.length}: ${firstName} (Total processed: ${prospectsProcessed})`
    );

    // Check if we've reached the max connections limit BEFORE processing
    if (maxConnections !== null && prospectsProcessed >= maxConnections) {
      console.log(`Reached maximum connections limit (${maxConnections}). Stopping automation.`);

      // Don't process this prospect since we've reached the limit
      resolve();
      return;
    }

    // Increment counter BEFORE processing
    prospectsProcessed++;
    currentProspectIndex++; // Increment index for next call
    connectButton.dispatchEvent(new Event('click', { bubbles: true }));
    setTimeout(() => {
      const modal = findModal();
      if (modal) {
        const addNoteButton = modal.querySelector('button[aria-label^="Add"]') as HTMLButtonElement | null;
        if (addNoteButton) {
          addNoteButton.dispatchEvent(new Event('click', { bubbles: true }));
          setTimeout(async () => {
            const noteTextArea = modal.querySelector("textarea") as HTMLTextAreaElement | null;
            if (noteTextArea) {
              const message = buildNote(firstName, messageSettings);

              // Try to use Trusted Types if available
              // Directly assign the message string to textarea value
              noteTextArea.value = message;
              noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
              if (isLiveMode) {
                const sendButton = modal.querySelector(
                  'button[aria-label^="Send"]'
                ) as HTMLButtonElement | null;
                if (sendButton) {
                  if (_BUILD_TARGET === "store") {
                    // Store build: pause and ask the user to confirm before sending.
                    // Automation resumes when the popup replies with confirmSend or skipSend.
                    await new Promise<void>((resolveInner) => {
                      chrome.runtime.sendMessage({
                        action: "pendingConfirmation",
                        firstName: firstName
                      });

                      const confirmationListener = (msg: { action: string }) => {
                        if (msg.action === "confirmSend") {
                          sendButton.dispatchEvent(new Event('click', { bubbles: true }));
                          console.log(`STORE-LIVE: User confirmed send for ${firstName}`);
                          onSentOrSkipped();
                          chrome.runtime.onMessage.removeListener(confirmationListener);
                          resolveInner();
                        } else if (msg.action === "skipSend") {
                          // Close the modal without sending
                          const cancelButton = modal.querySelector('button[aria-label^="Cancel"]') as HTMLButtonElement | null;
                          const dismissButton = modal.querySelector('button[aria-label^="Dismiss"]') as HTMLButtonElement | null;
                          if (cancelButton) cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
                          else if (dismissButton) dismissButton.dispatchEvent(new Event('click', { bubbles: true }));
                          console.log(`STORE-LIVE: User skipped ${firstName}`);
                          chrome.runtime.onMessage.removeListener(confirmationListener);
                          resolveInner();
                        }
                      };

                      chrome.runtime.onMessage.addListener(confirmationListener);
                    });
                  } else {
                    // Developer build: auto-send with random delay (original behaviour)
                    await new Promise<void>((resolveInner) => {
                      setTimeout(() => {
                        sendButton.dispatchEvent(new Event('click', { bubbles: true }));
                        console.log(
                          `LIVE: Sent connection request to ${firstName}`
                        );
                        onSentOrSkipped();
                        resolveInner();
                      }, generateRandomTimeout(5000));
                    });
                  }
                } else {
                  console.log(
                    `LIVE: Send button not found for ${firstName}`
                  );
                }
              } else {
                const cancelButton = modal.querySelector(
                  'button[aria-label^="Cancel"]'
                ) as HTMLButtonElement | null;
                if (cancelButton) {
                  // Add random delay before clicking cancel
                  await new Promise<void>((resolveInner) => {
                    setTimeout(() => {
                      cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
                      resolveInner();
                    }, generateRandomTimeout(5000));
                  });

                  // Wait a bit then dismiss the modal
                  await new Promise<void>((resolveInner) => {
                    setTimeout(() => {
                      const dismissButton = modal.querySelector(
                        'button[aria-label^="Dismiss"]'
                      ) as HTMLButtonElement | null;
                      if (dismissButton) {
                        dismissButton.dispatchEvent(new Event('click', { bubbles: true }));
                      }
                      resolveInner();
                    }, generateRandomTimeout(5000));
                  });
                }
              }
            }
            resolve();
          }, generateRandomTimeout(5000));
        } else {
          resolve();
        }
      } else {
        console.log(`Modal not found for ${firstName}. Aborting automation.`);
        abortReason = `Clicked Connect for ${firstName || "a prospect"} but LinkedIn's invite dialog wasn't found.`;
        resolve();
        return;
      }
    }, generateRandomTimeout(5000));
  });
};

// Function to initialize prospects list for current page
const initializeCurrentPageList = (): void => {
  currentProspectsList = collectProspectCards();
  currentProspectIndex = 0; // Reset index for new page
  if (currentProspectsList.length === 0) emptyPagesSeen++;

  console.log(`Initialized page with ${currentProspectsList.length} prospects`);
};

// Function to scroll to the bottom of the page
const scrollToBottom = (): Promise<void> => {
  return new Promise((resolve) => {
    console.log("Scrolling to bottom of page...");

    // Scroll to the bottom of the page
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });

    // Wait a bit for the scroll to complete
    setTimeout(() => {
      console.log("Scroll to bottom completed");
      resolve();
    }, 2000); // 2 second delay for smooth scroll
  });
};

// Function to look for and click a button containing "more results"
const clickMoreButton = (): Promise<void> => {
  return new Promise((resolve) => {
    console.log("Looking for 'more results' button...");

    // Find all clickable elements that might contain "more results"
    const selectors = [
      'button',
      'a',
      'div[role="button"]',
      'span[role="button"]',
      '[data-control-name*="more"]',
      '[aria-label*="more results" i]',
      '[aria-label*="show more results" i]',
      '[aria-label*="load more results" i]'
    ];

    let moreElement: Element | null = null;

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent ? element.textContent.toLowerCase() : '';
        const ariaLabel = element.getAttribute('aria-label') ? element.getAttribute('aria-label')!.toLowerCase() : '';
        const title = element.getAttribute('title') ? element.getAttribute('title')!.toLowerCase() : '';

        // Only look for "more results" variants
        if (text.includes('more results') || ariaLabel.includes('more results') || title.includes('more results') ||
            text.includes('show more results') || ariaLabel.includes('show more results') || title.includes('show more results') ||
            text.includes('load more results') || ariaLabel.includes('load more results') || title.includes('load more results')) {
          moreElement = element;
          console.log(`Found 'more results' element: ${selector} with text: "${text}" aria-label: "${ariaLabel}"`);
          break;
        }
      }
      if (moreElement) break;
    }

    if (moreElement) {
      console.log("Clicking 'more results' element...");
      (moreElement as HTMLElement).click();
      // Wait for content to load after clicking
      setTimeout(() => {
        console.log("'More results' element clicked, waiting for content...");
        resolve();
      }, 3000); // 3 second delay
    } else {
      console.log("No 'more results' element found.");
      resolve();
    }
  });
};

// Function to check if new prospects were loaded after scrolling
const checkForNewProspects = (previousCount: number): boolean => {
  // Re-scan for prospects
  const newFilteredProspects = collectProspectCards();

  const newCount = newFilteredProspects.length;
  const newProspectsFound = newCount > previousCount;

  console.log(`Previous prospects: ${previousCount}, New prospects: ${newCount}, New found: ${newProspectsFound}`);

  if (newProspectsFound) {
    // Update the current prospects list with new prospects
    currentProspectsList = newFilteredProspects;
    currentProspectIndex = previousCount; // Start processing from where we left off
  }

  return newProspectsFound;
};

// Function to process all prospects on the current page
const processCurrentPage = async (): Promise<void> => {
  console.log("Starting to process prospects on current page...");

  // Check if we've already reached the max connections limit
  if (maxConnections !== null && prospectsProcessed >= maxConnections) {
    console.log(`Already reached maximum connections limit (${maxConnections}). Skipping page processing.`);
    return;
  }

  // Initialize the prospects list for this page
  initializeCurrentPageList();

  let scrollAttempts = 0;
  const maxScrollAttempts = 5; // Prevent infinite scrolling

  // Keep processing prospects and scrolling for more until no new prospects found
  while (currentProspectIndex < currentProspectsList.length && scrollAttempts < maxScrollAttempts) {
    // Check if we've reached the max connections limit during processing
    if (maxConnections !== null && prospectsProcessed >= maxConnections) {
      console.log(`Reached maximum connections limit (${maxConnections}) during page processing. Stopping.`);
      break;
    }

    await connectToProspectAtIndex();
    if (abortReason) break;

    // Add delay between prospects
    await new Promise<void>((resolve) =>
      setTimeout(resolve, generateRandomTimeout(5000))
    );

    // If we've processed all current prospects, try to scroll for more
    if (currentProspectIndex >= currentProspectsList.length) {
      console.log("All current prospects processed. Checking for more...");

      const previousCount = currentProspectsList.length;
      let newProspectsFound = false;

      // Keep scrolling until we find new prospects or reach max attempts
      while (!newProspectsFound && scrollAttempts < maxScrollAttempts) {
        console.log(`Scroll attempt ${scrollAttempts + 1}/${maxScrollAttempts}...`);

        // Scroll to bottom
        await scrollToBottom();

        // Look for and click 'more' button if found
        await clickMoreButton();

        // Wait 10 seconds for new content to load
        console.log("Waiting 10 seconds for new content to load...");
        await new Promise<void>((resolve) => setTimeout(resolve, 10000));

        // Check if new prospects were loaded
        newProspectsFound = checkForNewProspects(previousCount);

        if (!newProspectsFound) {
          console.log("No new prospects found after scrolling. Trying again...");
          scrollAttempts++;
        }
      }

      if (newProspectsFound) {
        console.log("New prospects found! Continuing processing...");
        scrollAttempts = 0; // Reset scroll attempts when new prospects are found
      } else {
        console.log(`No new prospects found after ${maxScrollAttempts} scroll attempts.`);
      }
    }
  }

  console.log(
    `Finished processing page. Total prospects processed: ${prospectsProcessed}`
  );
};

// Function to start the connection process
const processSearchResults = async (): Promise<void> => {
  // Add a small delay after navigation to ensure everything is ready
  await new Promise<void>((resolve) => setTimeout(resolve, generateRandomTimeout(5000)));

  // Process all prospects on the current page
  await processCurrentPage();
  if (abortReason) return;

  // Increment pages processed counter
  pagesProcessed++;

  // Check if we've reached the max pages limit
  if (maxPages !== null && pagesProcessed >= maxPages) {
    console.log(`Reached maximum pages limit (${maxPages}). Stopping automation.`);
    return;
  }

  // Check if we've reached the max connections limit
  if (maxConnections !== null && prospectsProcessed >= maxConnections) {
    console.log(`Reached maximum connections limit (${maxConnections}). Stopping automation.`);
    return;
  }

  // Scroll to bottom to ensure pagination controls are visible
  await scrollToBottom();

  // Check if there's a next page
  const nextPageButton = document.querySelector("button[data-testid='pagination-controls-next-button-visible']") as HTMLButtonElement | null;
  if (nextPageButton && !nextPageButton.disabled) {
    console.log("Moving to next page...");
    nextPageButton.dispatchEvent(new Event('click', { bubbles: true }));

    // Increment page counter
    currentPage++;

    // Wait for the next page to load
    await new Promise<void>((resolve) =>
      setTimeout(resolve, generateRandomTimeout(5000))
    );

    // Continue processing the next page; awaited so completion is reported only once, at the very end
    await new Promise<void>((resolve) => setTimeout(resolve, generateRandomTimeout(5000)));
    await processSearchResults();
  } else {
    console.log("No more pages to process or next page button is disabled.");
  }
};

// Function to get current page number from URL
const getCurrentPageFromURL = (): number => {
  const url = new URL(window.location.href);
  const pageParam = url.searchParams.get('page');
  return pageParam ? parseInt(pageParam) : 1;
};

// Function to start the connection process
const startConnectionProcess = async (): Promise<void> => {
  console.log("Starting connection process...");

  // Set currentPage based on URL page parameter
  currentPage = getCurrentPageFromURL();
  pagesProcessed = 0; // Reset pages processed counter
  prospectsProcessed = 0;
  emptyPagesSeen = 0;
  abortReason = null;
  console.log(`Starting on page ${currentPage}`);

  try {
    // Add a small delay to ensure everything is ready
    await new Promise<void>((resolve) => setTimeout(resolve, generateRandomTimeout(5000)));

    // Start processing prospects
    await processSearchResults();
  } finally {
    isRunning = false;
    console.log("Connection process completed.");
    notifyCompleted();
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    request: StartAutomationRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean | undefined => {
    if (request.action === "ping") {
      // Respond to ping to indicate content script is ready
      sendResponse({ status: "ready" });
    } else if (request.action === "startAutomation") {
      // The content script is injected into every frame; only the top page drives automation,
      // and a second Start while a run is in flight must not spawn a parallel run.
      if (window !== window.top) return undefined;
      if (isRunning) {
        sendResponse({ status: "alreadyRunning" });
        return true;
      }
      isRunning = true;

      // Set live mode based on popup setting
      isLiveMode = request.liveMode || false;

      // Store message settings from popup
      if (request.messageSettings) {
        messageSettings = request.messageSettings;
      }

      // Store max pages setting
      maxPages = request.maxPages !== undefined && request.maxPages !== '' ? parseInt(request.maxPages) : null;

      // Store max connections setting
      maxConnections = request.maxConnections !== undefined && request.maxConnections !== '' ? parseInt(request.maxConnections) : null;

      // Store auto-adjust setting
      autoAdjust = request.autoAdjust || false;

      console.log(
        `${isLiveMode ? "Starting in LIVE mode" : "Starting in TEST mode"}`
      );

      if (maxPages !== null) {
        console.log(`Max pages limit set to: ${maxPages}`);
      } else {
        console.log("No max pages limit set");
      }

      if (maxConnections !== null) {
        console.log(`Max connections limit set to: ${maxConnections}`);
      } else {
        console.log("No max connections limit set");
      }

      startConnectionProcess();
      sendResponse({ status: "started" });
    }
    return true;
  }
);

registerExtractionListener();
