# Chrome Web Store Submission Notes

## Single Purpose

Connection Request Assistant prepares LinkedIn connection invite drafts for manual user review on LinkedIn people search results pages.

## Permission Justifications

`activeTab`: Used only after the user opens the popup to read the active tab URL, validate that it is a LinkedIn people search results page, and send a message to the content script on that active page.

`storage`: Used to save search filters, message draft text, and the optional max-profiles session limit locally in Chrome.

## Host Access

The content script is restricted to:

`https://www.linkedin.com/search/results/people/*`

This access is needed to find visible connect buttons on LinkedIn people search results pages, open LinkedIn's invite dialog, and fill the user-provided draft note.

## Remote Code

No remote code is used. All extension logic is bundled in the submitted package.

## Data Use

The extension handles active-tab URL data, locally saved user settings, message draft text, and visible LinkedIn page content needed to prepare the next invite draft. It does not send this data to external servers and does not use analytics, ads, tracking, or third-party data sharing.

## Reviewer Test Instructions

1. Install the extension.
2. Open a LinkedIn people search results page.
3. Open the extension popup.
4. Enter a short message draft and click "Save settings".
5. Click "Prepare next invite".
6. Verify that the extension opens LinkedIn's invite dialog and fills the note.
7. Verify that the extension does not click Send. The reviewer can close the LinkedIn dialog without sending.

## Listing Copy

Short description:

Prepare LinkedIn connection invite drafts one at a time, then review and send them yourself.

Detailed description:

Connection Request Assistant helps prepare connection invite drafts from LinkedIn people search results. It saves your search filters and message draft locally, opens LinkedIn's invite dialog for the next visible connectable profile, and fills the note for review. The extension does not click Send; you review the recipient and message in LinkedIn and decide whether to send, edit, or close the invite.

Not affiliated with or endorsed by LinkedIn.
