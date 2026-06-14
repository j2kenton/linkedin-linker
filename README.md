# Connection Request Assistant

A Chrome extension that prepares LinkedIn connection invite drafts on people search results pages. It works one profile at a time: the extension opens LinkedIn's invite dialog and fills the note, then the user reviews the recipient and message and clicks Send manually.

This project is not affiliated with or endorsed by LinkedIn.

## What It Does

- Builds LinkedIn people-search URLs from saved company, title, location, and connection-degree filters.
- Reads filter values from the active LinkedIn people-search URL.
- Saves message draft settings locally in Chrome storage.
- Prepares the next visible connectable profile on the current search-results page.
- Leaves the final send decision to the user in LinkedIn's own dialog.

## Chrome Web Store Readiness

The extension is scoped to `https://www.linkedin.com/search/results/people/*` and requests only:

- `activeTab`: read the active tab URL after the user opens the popup.
- `storage`: save local search and message settings.

It does not use remote code, external scripts, analytics, ads, or a custom update mechanism. Chrome Web Store builds should be created with:

```sh
npm run package
```

The package script creates a review zip under `release/` containing only the runtime files needed by Chrome:

- `manifest.json`
- `popup.html`
- `dist/content.js`
- `dist/popup.js`
- `assets/icons/*.png`

## Local Development

```sh
npm install
npm run generate:icons
npm run build
```

Then open `chrome://extensions`, enable Developer Mode, choose "Load unpacked", and select this project folder.

If the popup says the content script is not ready, reload the LinkedIn people search tab after installing or rebuilding the extension.

## Store Submission Notes

Use the copy in [STORE_SUBMISSION.md](STORE_SUBMISSION.md) for single-purpose, permission, privacy, and reviewer-instruction fields. Host [PRIVACY.md](PRIVACY.md) publicly and use that URL in the Chrome Web Store dashboard.
