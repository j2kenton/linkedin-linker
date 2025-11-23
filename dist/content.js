// LinkedIn Connection Automator Content Script
const buildNote = (firstName, messageSettings) => {
    const { greetingPart1, includeFirstName, greetingPart2, messageText } = messageSettings;
    let message = greetingPart1;
    if (includeFirstName && firstName) {
        message += ` ${firstName}`;
    }
    message += ` ${greetingPart2}\n${messageText}`;
    return message;
};
const generateRandomTimeout = (multiplier = 5000) => Math.floor(Math.random() * multiplier) + 500;
// Fallback function for clipboard-based text insertion
// Note: document.execCommand('paste') is deprecated and not supported in modern browsers.
// We attempt to use the Clipboard API's readText() as a best-effort fallback, but this requires user interaction.
async function fallbackToClipboard(message, noteTextArea) {
    try {
        await navigator.clipboard.writeText(message);
        noteTextArea.focus();
        noteTextArea.select();
        // Attempt to use Clipboard API's readText as a fallback for paste (requires user gesture in most browsers)
        try {
            const clipboardText = await navigator.clipboard.readText();
            noteTextArea.value = clipboardText;
            noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        catch (readError) {
            // If readText fails (likely due to lack of user gesture), fall back to direct assignment below
            noteTextArea.value = message;
            noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
    catch (e) {
        console.log("Clipboard fallback failed:", e);
        // Final fallback to direct assignment
        try {
            noteTextArea.value = message;
            noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        catch (finalError) {
            console.log("All text insertion methods failed:", finalError);
        }
    }
}
// Function to extract first name with regional accent support
const extractFirstName = (prospectText) => {
    if (!prospectText)
        return "";
    // Get first sequence of alphanumeric chars (including accented letters)
    const match = prospectText.match(/[\p{L}\p{N}]+/u);
    if (match) {
        const firstName = match[0];
        // Capitalize first letter and make rest lowercase
        return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    }
    return "";
};
let prospectsProcessed = 0;
let currentPage = 1;
let pagesProcessed = 0;
let currentProspectsList = [];
let currentProspectIndex = 0;
let isLiveMode = false;
let messageSettings = {
    greetingPart1: "",
    includeFirstName: false,
    greetingPart2: "",
    messageText: ""
};
let maxPages = null; // null means no limit
let maxConnections = null; // null means no limit
let autoAdjust = false; // auto-adjust max connections setting
// Function to connect to prospect at current index in the preserved list
const connectToProspectAtIndex = async () => {
    return new Promise((resolve) => {
        // Check if we've reached the max connections limit BEFORE processing
        if (maxConnections !== null && prospectsProcessed >= maxConnections) {
            console.log(`MAX LIMIT REACHED: Already processed ${prospectsProcessed}/${maxConnections} connections. Stopping automation.`);
            console.log("Connection process completed.");
            // Send completion message to popup
            chrome.runtime.sendMessage({ action: "automationCompleted" });
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
        const prospectElement = currentProspectsList[currentProspectIndex];
        if (!prospectElement) {
            console.log(`No prospect element found for index ${currentProspectIndex}, skipping...`);
            currentProspectIndex++; // Move to next prospect
            resolve();
            return;
        }
        const firstName = extractFirstName(prospectElement.innerText);
        // Find the connect button within this specific prospect
        const connectButton = prospectElement.querySelector("button[aria-label$='connect']");
        if (!connectButton) {
            console.log(`No connect button found for prospect ${firstName}, skipping...`);
            currentProspectIndex++; // Move to next prospect
            resolve();
            return;
        }
        console.log(`${isLiveMode ? "LIVE" : "TEST"}: Processing prospect ${currentProspectIndex + 1}/${currentProspectsList.length}: ${firstName} (Total processed: ${prospectsProcessed})`);
        // Check if we've reached the max connections limit BEFORE processing
        if (maxConnections !== null && prospectsProcessed >= maxConnections) {
            console.log(`Reached maximum connections limit (${maxConnections}). Stopping automation.`);
            console.log("Connection process completed.");
            // Send completion message to popup
            chrome.runtime.sendMessage({ action: "automationCompleted" });
            // Don't process this prospect since we've reached the limit
            resolve();
            return;
        }
        // Increment counter BEFORE processing
        prospectsProcessed++;
        currentProspectIndex++; // Increment index for next call
        connectButton.dispatchEvent(new Event('click', { bubbles: true }));
        setTimeout(() => {
            const modal = document.querySelector(".ember-view .send-invite");
            if (modal) {
                const addNoteButton = modal.querySelector('button[aria-label^="Add"]');
                if (addNoteButton) {
                    addNoteButton.dispatchEvent(new Event('click', { bubbles: true }));
                    setTimeout(async () => {
                        const noteTextArea = modal.querySelector("textarea");
                        if (noteTextArea) {
                            const message = buildNote(firstName, messageSettings);
                            // Try to use Trusted Types if available
                            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                                try {
                                    // Create a policy with an allowed name from CSP
                                    const policy = window.trustedTypes.createPolicy('jSecure', {
                                        createHTML: (string) => string,
                                        createScript: (string) => string,
                                        createScriptURL: (string) => string,
                                    });
                                    // Use the policy to create trusted content
                                    noteTextArea.value = policy.createHTML(message);
                                    noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
                                }
                                catch (trustedError) {
                                    console.log("Trusted Types failed:", trustedError);
                                    // Fallback to clipboard approach
                                    await fallbackToClipboard(message, noteTextArea);
                                }
                            }
                            else {
                                // No Trusted Types support, use clipboard
                                await fallbackToClipboard(message, noteTextArea);
                            }
                            if (isLiveMode) {
                                const sendButton = modal.querySelector('button[aria-label^="Send"]');
                                if (sendButton) {
                                    // Add random delay before clicking send
                                    await new Promise((resolveInner) => {
                                        setTimeout(() => {
                                            sendButton.dispatchEvent(new Event('click', { bubbles: true }));
                                            console.log(`LIVE: Sent connection request to ${firstName}`);
                                            // Auto-adjust: decrement max connections limit if enabled
                                            if (autoAdjust && maxConnections !== null && maxConnections > 0) {
                                                maxConnections--;
                                                console.log(`Auto-adjust: Decreased max connections limit to ${maxConnections}`);
                                                // Update the stored value in chrome.storage.local
                                                chrome.storage.local.set({ maxConnections: maxConnections.toString() }, () => {
                                                    if (chrome.runtime.lastError) {
                                                        console.error('Error updating maxConnections in storage:', chrome.runtime.lastError);
                                                    }
                                                    else {
                                                        // Notify popup UI of the change
                                                        chrome.runtime.sendMessage({
                                                            type: "maxConnectionsUpdated",
                                                            maxConnections: maxConnections
                                                        });
                                                    }
                                                });
                                            }
                                            resolveInner();
                                        }, generateRandomTimeout());
                                    });
                                }
                                else {
                                    console.log(`LIVE: Send button not found for ${firstName}`);
                                }
                            }
                            else {
                                const cancelButton = modal.querySelector('button[aria-label^="Cancel"]');
                                if (cancelButton) {
                                    // Add random delay before clicking cancel
                                    await new Promise((resolveInner) => {
                                        setTimeout(() => {
                                            cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
                                            resolveInner();
                                        }, generateRandomTimeout());
                                    });
                                    // Wait a bit then dismiss the modal
                                    await new Promise((resolveInner) => {
                                        setTimeout(() => {
                                            const dismissButton = modal.querySelector('button[aria-label^="Dismiss"]');
                                            if (dismissButton) {
                                                dismissButton.dispatchEvent(new Event('click', { bubbles: true }));
                                            }
                                            resolveInner();
                                        }, generateRandomTimeout());
                                    });
                                }
                            }
                        }
                        resolve();
                    }, generateRandomTimeout());
                }
                else {
                    resolve();
                }
            }
            else {
                console.log(`LIVE: Modal not found for ${firstName}. Aborting automation.`);
                console.log("Connection process aborted due to modal not found.");
                // Send completion message to popup
                chrome.runtime.sendMessage({ action: "automationCompleted" });
                resolve();
                return;
            }
        }, generateRandomTimeout());
    });
};
// Function to initialize prospects list for current page
const initializeCurrentPageList = () => {
    // Use all selectors together for maximum coverage
    const prospects = [
        // Search results specific selectors
        ...document.querySelectorAll("div[role=main] div > a"),
        ...document.querySelectorAll(".search-results-container ul li"),
        // General people card selectors
        ...document.querySelectorAll("div[data-test-id*='profile-card']"),
        ...document.querySelectorAll("div[data-test-id*='connection-card']"),
        ...document.querySelectorAll("div[data-test-id*='people-card']"),
        ...document.querySelectorAll("div.entity-result__item"),
        ...document.querySelectorAll("div.discovery-card"),
        ...document.querySelectorAll("div[data-control-name*='people_card']")
    ];
    // Filter to only include elements that have connect buttons
    currentProspectsList = prospects.filter(element => {
        const connectButton = element.querySelector("button[aria-label$='connect']");
        return connectButton !== null;
    });
    currentProspectIndex = 0; // Reset index for new page
    console.log(`Initialized page with ${currentProspectsList.length} prospects`);
};
// Function to scroll to the bottom of the page
const scrollToBottom = () => {
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
const clickMoreButton = () => {
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
        let moreElement = null;
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent ? element.textContent.toLowerCase() : '';
                const ariaLabel = element.getAttribute('aria-label') ? element.getAttribute('aria-label').toLowerCase() : '';
                const title = element.getAttribute('title') ? element.getAttribute('title').toLowerCase() : '';
                // Only look for "more results" variants
                if (text.includes('more results') || ariaLabel.includes('more results') || title.includes('more results') ||
                    text.includes('show more results') || ariaLabel.includes('show more results') || title.includes('show more results') ||
                    text.includes('load more results') || ariaLabel.includes('load more results') || title.includes('load more results')) {
                    moreElement = element;
                    console.log(`Found 'more results' element: ${selector} with text: "${text}" aria-label: "${ariaLabel}"`);
                    break;
                }
            }
            if (moreElement)
                break;
        }
        if (moreElement) {
            console.log("Clicking 'more results' element...");
            moreElement.click();
            // Wait for content to load after clicking
            setTimeout(() => {
                console.log("'More results' element clicked, waiting for content...");
                resolve();
            }, 3000); // 3 second delay
        }
        else {
            console.log("No 'more results' element found.");
            resolve();
        }
    });
};
// Function to check if new prospects were loaded after scrolling
const checkForNewProspects = (previousCount) => {
    // Re-scan for prospects
    const newProspects = [
        // Search results specific selectors
        ...document.querySelectorAll("div[role=main] div > a"),
        ...document.querySelectorAll(".search-results-container ul li"),
        // General people card selectors
        ...document.querySelectorAll("div[data-test-id*='profile-card']"),
        ...document.querySelectorAll("div[data-test-id*='connection-card']"),
        ...document.querySelectorAll("div[data-test-id*='people-card']"),
        ...document.querySelectorAll("div.entity-result__item"),
        ...document.querySelectorAll("div.discovery-card"),
        ...document.querySelectorAll("div[data-control-name*='people_card']")
    ];
    // Filter to only include elements that have connect buttons
    const newFilteredProspects = newProspects.filter(element => {
        const connectButton = element.querySelector("button[aria-label$='connect']");
        return connectButton !== null;
    });
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
const processCurrentPage = async () => {
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
        // Add delay between prospects
        await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));
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
                await new Promise((resolve) => setTimeout(resolve, 10000));
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
            }
            else {
                console.log(`No new prospects found after ${maxScrollAttempts} scroll attempts.`);
            }
        }
    }
    console.log(`Finished processing page. Total prospects processed: ${prospectsProcessed}`);
};
// Function to start the connection process
const processSearchResults = async () => {
    // Add a small delay after navigation to ensure everything is ready
    await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));
    // Process all prospects on the current page
    await processCurrentPage();
    // Increment pages processed counter
    pagesProcessed++;
    // Check if we've reached the max pages limit
    if (maxPages !== null && pagesProcessed >= maxPages) {
        console.log(`Reached maximum pages limit (${maxPages}). Stopping automation.`);
        console.log("Connection process completed.");
        // Send completion message to popup
        chrome.runtime.sendMessage({ action: "automationCompleted" });
        return;
    }
    // Check if we've reached the max connections limit
    if (maxConnections !== null && prospectsProcessed >= maxConnections) {
        console.log(`Reached maximum connections limit (${maxConnections}). Stopping automation.`);
        console.log("Connection process completed.");
        // Send completion message to popup
        chrome.runtime.sendMessage({ action: "automationCompleted" });
        return;
    }
    // Check if there's a next page
    const nextPageButton = document.querySelector("button[aria-label='Next']");
    if (nextPageButton && !nextPageButton.disabled) {
        console.log("Moving to next page...");
        nextPageButton.dispatchEvent(new Event('click', { bubbles: true }));
        // Increment page counter
        currentPage++;
        // Wait for the next page to load
        await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));
        // Continue processing the next page
        setTimeout(() => {
            processSearchResults();
        }, generateRandomTimeout());
    }
    else {
        console.log("No more pages to process or next page button is disabled.");
        console.log("Connection process completed.");
        // Send completion message to popup
        chrome.runtime.sendMessage({ action: "automationCompleted" });
    }
};
// Function to get current page number from URL
const getCurrentPageFromURL = () => {
    const url = new URL(window.location.href);
    const pageParam = url.searchParams.get('page');
    return pageParam ? parseInt(pageParam) : 1;
};
// Function to start the connection process
const startConnectionProcess = async () => {
    console.log("Starting connection process...");
    // Set currentPage based on URL page parameter
    currentPage = getCurrentPageFromURL();
    pagesProcessed = 0; // Reset pages processed counter
    console.log(`Starting on page ${currentPage}`);
    // Add a small delay to ensure everything is ready
    await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));
    // Start processing prospects
    await processSearchResults();
    console.log("Connection process completed.");
    // Send completion message to popup
    chrome.runtime.sendMessage({ action: "automationCompleted" });
};
// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        // Respond to ping to indicate content script is ready
        sendResponse({ status: "ready" });
    }
    else if (request.action === "startAutomation") {
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
        console.log(`${isLiveMode ? "Starting in LIVE mode" : "Starting in TEST mode"}`);
        if (maxPages !== null) {
            console.log(`Max pages limit set to: ${maxPages}`);
        }
        else {
            console.log("No max pages limit set");
        }
        if (maxConnections !== null) {
            console.log(`Max connections limit set to: ${maxConnections}`);
        }
        else {
            console.log("No max connections limit set");
        }
        startConnectionProcess();
        sendResponse({ status: "started" });
    }
});
export {};
