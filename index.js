// // const companyName = "Microsoft";
// // const urlEncodedCompanyName = encodeURIComponent(companyName);

// // const companiesIds = ["1035"]; // 1441 for google
// // const companiesIdsString = JSON.stringify(companiesIds);
// // const urlEncodedCompaniesIds = encodeURIComponent(companiesIdsString);

// // const titleOfProspect = "Engineering Manager";
// // const urlEncodedTitle = encodeURIComponent(titleOfProspect);

// // const locationIds = ["101620260"];
// // const locationIdsString = JSON.stringify(locationIds);
// // const urlEncodedLocationIds = encodeURIComponent(locationIdsString);

// const startPage = 1;

// const startingUrl = `https://www.linkedin.com/search/results/people/?currentCompany=${urlEncodedCompaniesIds}&geoUrn=${urlEncodedLocationIds}&keywords=${urlEncodedTitle}%20${urlEncodedCompanyName}&origin=FACETED_SEARCH&page=${startPage}&sid=BpI&titleFreeText=${urlEncodedTitle}`;

// let IS_LIVE_MODE = false;

// const buildNote = (firstName) => {
//   return `Hi ${firstName || ""} 👋,
// It's been a privilege to be part of ILDC for the last 4 years. I'm moving on now but I wanted to personally wish you all the best in the future!
// Jonathan

// P.S. if you're ever looking for a Frontend Developer... 😉
// (Matan Borenkraout was my tech lead)`;
// };

// const generateRandomTimeout = (multiplier = 10000) =>
//   Math.floor(Math.random() * multiplier) + 1000;

// let prospectsProcessed = 0;
// let currentPage = 1;
// let currentProspectsList = [];
// let currentProspectIndex = 0;

// // Function to navigate to starting page and wait for it to load
// const navigateToStartingPage = async () => {
//   return new Promise((resolve) => {
//     console.log("Navigating to starting page...");
//     window.location.href = startingUrl;

//     // Wait for page to load and search results to appear
//     const checkInterval = setInterval(() => {
//       const searchResults = document.querySelectorAll(
//         ".search-results-container ul[role=list] li"
//       );
//       if (searchResults.length > 0) {
//         clearInterval(checkInterval);
//         console.log(
//           "Page loaded successfully, found",
//           searchResults.length,
//           "prospects"
//         );
//         prospectsProcessed = 0; // Reset counter for new page
//         resolve();
//       }
//     }, 1000);

//     // Safety timeout in case page doesn't load properly
//     setTimeout(() => {
//       clearInterval(checkInterval);
//       console.log("Safety timeout reached, proceeding anyway...");
//       prospectsProcessed = 0; // Reset counter for new page
//       resolve();
//     }, 15000); // 15 second safety timeout
//   });
// };

// // Function to connect to prospect at current index in the preserved list
// const connectToProspectAtIndex = async () => {
//   return new Promise((resolve) => {
//     // Check if we've processed all prospects in current list
//     if (currentProspectIndex >= currentProspectsList.length) {
//       console.log("No more prospects in current list.");
//       resolve();
//       return;
//     }

//     // Get the prospect at current index
//     const prospectElement = currentProspectsList[currentProspectIndex];
//     const firstName = prospectElement.innerText.trim().split(" ")[0];

//     // Find the connect button within this specific prospect
//     const connectButton = prospectElement.querySelector(
//       "button[aria-label$='connect']"
//     );

//     if (!connectButton) {
//       console.log(
//         `No connect button found for prospect ${firstName}, skipping...`
//       );
//       currentProspectIndex++; // Move to next prospect
//       resolve();
//       return;
//     }

//     console.log(
//       `Processing prospect ${currentProspectIndex + 1}/${
//         currentProspectsList.length
//       }: ${firstName}`
//     );
//     prospectsProcessed++;
//     currentProspectIndex++; // Increment index for next call

//     connectButton.click();
//     setTimeout(() => {
//       const modal = document.querySelector(".ember-view .send-invite");
//       if (modal) {
//         const addNoteButton = modal.querySelector('button[aria-label^="Add"]');
//         if (addNoteButton) {
//           addNoteButton.click();
//           setTimeout(async () => {
//             const noteTextArea = modal.querySelector("textarea");
//             if (noteTextArea) {
//               await new Promise((resolveInner) =>
//                 setTimeout(resolveInner, generateRandomTimeout())
//               );
//               noteTextArea.value = buildNote(firstName);
//               noteTextArea.dispatchEvent(new Event("input", { bubbles: true }));
//               // programmatically make text area dirty
//               await new Promise((resolveInner) =>
//                 setTimeout(resolveInner, generateRandomTimeout())
//               );

//               if (IS_LIVE_MODE) {
//                 const sendButton = modal.querySelector(
//                   'button[aria-label^="Send"]'
//                 );
//                 if (sendButton) {
//                   // Add random delay before clicking send
//                   await new Promise((resolveInner) => {
//                     setTimeout(() => {
//                       sendButton.click();
//                       resolveInner();
//                     }, generateRandomTimeout());
//                   });
//                 }
//               } else {
//                 const cancelButton = modal.querySelector(
//                   'button[aria-label^="Cancel"]'
//                 );
//                 if (cancelButton) {
//                   // Add random delay before clicking cancel
//                   await new Promise((resolveInner) => {
//                     setTimeout(() => {
//                       cancelButton.click();
//                       resolveInner();
//                     }, generateRandomTimeout());
//                   });

//                   // Wait a bit then dismiss the modal
//                   await new Promise((resolveInner) => {
//                     setTimeout(() => {
//                       const dismissButton = modal.querySelector(
//                         'button[aria-label^="Dismiss"]'
//                       );
//                       if (dismissButton) {
//                         dismissButton.click();
//                       }
//                       resolveInner();
//                     }, generateRandomTimeout());
//                   });
//                 }
//               }
//             }
//             resolve();
//           }, generateRandomTimeout());
//         } else {
//           resolve();
//         }
//       } else {
//         resolve();
//       }
//     }, generateRandomTimeout());
//   });
// };

// // Function to initialize prospects list for current page
// const initializeCurrentPageList = () => {
//   // Capture all prospects on current page
//   currentProspectsList = [
//     ...document.querySelectorAll(".search-results-container ul[role=list] li"),
//   ];
//   currentProspectIndex = 0; // Reset index for new page

//   console.log(`Initialized page with ${currentProspectsList.length} prospects`);
// };

// // Function to process all prospects on the current page
// const processCurrentPage = async () => {
//   console.log("Starting to process prospects on current page...");

//   // Initialize the prospects list for this page
//   initializeCurrentPageList();

//   // Keep processing prospects by index until we've processed all in the list
//   while (currentProspectIndex < currentProspectsList.length) {
//     await connectToProspectAtIndex();

//     // Add delay between prospects
//     await new Promise((resolve) =>
//       setTimeout(resolve, generateRandomTimeout())
//     );
//   }

//   console.log(
//     `Finished processing page. Total prospects processed: ${prospectsProcessed}`
//   );
// };

// // Function to start the connection process
// const processSearchResults = async () => {
//   // Add a small delay after navigation to ensure everything is ready
//   await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));

//   // Process all prospects on the current page
//   await processCurrentPage();

//   // Check if there's a next page
//   const nextPageButton = document.querySelector("button[aria-label='Next']");
//   if (nextPageButton) {
//     console.log("Moving to next page...");
//     nextPageButton.click();

//     // Wait for the next page to load
//     await new Promise((resolve) =>
//       setTimeout(resolve, generateRandomTimeout())
//     );

//     // Continue processing the next page
//     setTimeout(() => {
//       processSearchResults();
//     }, generateRandomTimeout());
//   } else {
//     console.log("No more pages to process.");
//   }
// };

// // Function to start the connection process
// // const startConnectionProcess = async () => {
// //   console.log("Starting connection process...");

// //   // Check if we're already on the starting page by comparing URLs
// //   if (window.location.href !== startingUrl) {
// //     console.log("Not on starting page, navigating...");
// //     await navigateToStartingPage();
// //   } else {
// //     console.log("Already on starting page, proceeding...");
// //   }

// //   // Add a small delay to ensure everything is ready
// //   await new Promise((resolve) => setTimeout(resolve, generateRandomTimeout()));

// //   // Start processing prospects
// //   await processSearchResults();

// //   console.log("Connection process completed.");
// // };

// // To start the process, call: startConnectionProcess(); // processSearchResults
