// LinkedIn Connection Automator Content Script

const buildNote = (firstName) => {
  return `Hi ${firstName || ""} 👋,
It's been a privilege to be part of ILDC for the last 4 years. I'm moving on now but I wanted to personally wish you all the best in the future!
Jonathan

P.S. if you're ever looking for a Frontend Developer... 😉
(Matan Borenkraout was my tech lead)`;
};

const generateRandomTimeout = (multiplier = 5000) =>
  Math.floor(Math.random() * multiplier) + 500;

// Function to extract first name with regional accent support
const extractFirstName = (prospectText) => {
  if (!prospectText) return "";

  // Get first sequence of alphanumeric chars (including accented letters)
  const match = prospectText.match(/[\p{L}\p{N}]+/u);

  return match ? match[0] : "";
};

let prospectsProcessed = 0;
let currentPage = 1;
let currentProspectsList = [];
let currentProspectIndex = 0;
let isLiveMode = false;

// Function to connect to prospect at current index in the preserved list
const connectToProspectAtIndex = async () => {
  return new Promise((resolve) => {
    // Check if we've processed all prospects in current list
    if (currentProspectIndex >= currentProspectsList.length) {
      console.log("No more prospects in current list.");
      resolve();
      return;
    }

    // Get the prospect at current index
    const prospectElement = currentProspectsList[currentProspectIndex];
    const firstName = extractFirstName(prospectElement.innerText);

    // Find the connect button within this specific prospect
    const connectButton = prospectElement.querySelector(
      "button[aria-label$='connect']"
    );

    if (!connectButton) {
      console.log(
        `No connect button found for prospect ${firstName}, skipping...`
      );
      currentProspectIndex++; // Move to next prospect
      resolve();
      return;
    }

    console.log(
      `${isLiveMode ? "🔴 LIVE" : "🟡 TEST"}: Processing prospect ${
        currentProspectIndex + 1
      }/${currentProspectsList.length}: ${firstName}`
    );
    prospectsProcessed++;
    currentProspectIndex++; // Increment index for next call

    connectButton.click();
    setTimeout(() => {
      const modal = document.querySelector(".ember-view .send-invite");
      if (modal) {
        const addNoteButton = modal.querySelector('button[aria-label^="Add"]');
        if (addNoteButton) {
          addNoteButton.click();
          setTimeout(async () => {
            const noteTextArea = modal.querySelector("textarea");
            if (noteTextArea) {
              noteTextArea.value = buildNote(firstName);
              // programmatically make text area dirty
              noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));

              if (isLiveMode) {
                const sendButton = modal.querySelector(
                  'button[aria-label^="Send"]'
                );
                if (sendButton) {
                  // Add random delay before clicking send
                  await new Promise((resolveInner) => {
                    setTimeout(() => {
                      sendButton.click();
                      console.log(
                        `🔴 LIVE: Sent connection request to ${firstName}`
                      );
                      resolveInner();
                    }, generateRandomTimeout());
                  });
                } else {
                  console.log(
                    `🔴 LIVE: Send button not found for ${firstName}`
                  );
                }
              } else {
                const cancelButton = modal.querySelector(
                  'button[aria-label^="Cancel"]'
                );
                if (cancelButton) {
                  // Add random delay before clicking cancel
                  await new Promise((resolveInner) => {
                    setTimeout(() => {
                      cancelButton.click();
                      resolveInner();
                    }, generateRandomTimeout());
                  });

                  // Wait a bit then dismiss the modal
                  await new Promise((resolveInner) => {
                    setTimeout(() => {
                      const dismissButton = modal.querySelector(
                        'button[aria-label^="Dismiss"]'
                      );
                      if (dismissButton) {
                        dismissButton.click();
                      }
                      resolveInner();
                    }, generateRandomTimeout());
                  });
                }
              }
            }
            resolve();
          }, generateRandomTimeout());
        } else {
          resolve();
        }
      } else {
        console.log(`🔴 LIVE: Modal not found for ${firstName}`);
        resolve();
      }
    }, generateRandomTimeout());
  });
};

// Function to initialize prospects list for current page
const initializeCurrentPageList = () => {
  // Capture all prospects on current page
  currentProspectsList = [
    ...document.querySelectorAll(".search-results-container ul[role=list] li"),
  ];
  currentProspectIndex = 0; // Reset index for new page

  console.log(`Initialized page with ${currentProspectsList.length} prospects`);
};

// Function to process all prospects on the current page
const processCurrentPage = async () => {
  console.log("Starting to process prospects on current page...");

  // Initialize the prospects list for this page
  initializeCurrentPageList();

  // Keep processing prospects by index until we've processed all in the list
  while (currentProspectIndex < currentProspectsList.length) {
    await connectToProspectAtIndex();

    // Add delay between prospects
    await new Promise((resolve) =>
      setTimeout(resolve, generateRandomTimeout())
    );
  }

  console.log(
    `Finished processing page. Total prospects processed: ${prospectsProcessed}`
  );
};

// Function to start the connection process
const processSearchResults = async () => {
  // Add a small delay after navigation to ensure everything is ready
  await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));

  // Process all prospects on the current page
  await processCurrentPage();

  // Check if there's a next page
  const nextPageButton = document.querySelector("button[aria-label='Next']");
  if (nextPageButton) {
    console.log("Moving to next page...");
    nextPageButton.click();

    // Wait for the next page to load
    await new Promise((resolve) =>
      setTimeout(resolve, generateRandomTimeout())
    );

    // Continue processing the next page
    setTimeout(() => {
      processSearchResults();
    }, generateRandomTimeout());
  } else {
    console.log("No more pages to process.");
  }
};

// Function to start the connection process
const startConnectionProcess = async () => {
  console.log("Starting connection process...");

  // Add a small delay to ensure everything is ready
  await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));

  // Start processing prospects
  await processSearchResults();

  console.log("Connection process completed.");
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startAutomation") {
    // Set live mode based on popup setting
    isLiveMode = request.liveMode || false;
    console.log(
      `${isLiveMode ? "🔴 Starting in LIVE mode" : "🟡 Starting in TEST mode"}`
    );

    startConnectionProcess();
    sendResponse({ status: "started" });
  }
});
