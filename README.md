# LinkedIn Connection Automator

A developer/local Chrome extension for automating parts of the LinkedIn connection-request workflow from people search results pages.

This project is source code, not a Chrome Web Store-ready public extension. It is not affiliated with or endorsed by LinkedIn.

## What It Does

- Builds LinkedIn people-search URLs from company, title, location, connection-degree, and page inputs.
- Reads filter values from the active LinkedIn people-search URL.
- Saves search and message settings in local Chrome extension storage.
- Finds visible LinkedIn profiles with Connect buttons.
- Opens the LinkedIn invite dialog, adds a note, and processes profiles sequentially.
- Supports two runtime modes:
  - **Test Mode:** opens/cancels invite dialogs without sending requests.
  - **Live Mode:** clicks LinkedIn's Send button and sends connection requests.
- Supports limits for pages and max connection requests.
- Includes random delays between actions.

## Important Distribution Note

The current project is built around automation, including a Live Mode that can send connection requests on behalf of the user. That is the central functionality of this codebase.

Because of that, this project should be treated as a local/developer tool rather than a public Chrome Web Store extension. A Chrome Web Store version would need a materially different product design, such as requiring the user to review and confirm each recipient and message before anything is sent.

The current manifest also requests broad permissions and injects the content script broadly:

- `activeTab`
- `storage`
- `tabs`
- `clipboardWrite`
- `scripting`
- `<all_urls>` host access
- content script matches on `<all_urls>`

Those choices are useful during local development, but they are not appropriate for a polished public store submission without review and narrowing.

## Responsibility

Users who run or modify this source code are responsible for how they use it, including compliance with LinkedIn's terms, Chrome extension policies, workplace policies, and applicable law.

This repository does not claim that automated LinkedIn connection sending is approved by LinkedIn or suitable for public marketplace distribution.

## Installation From Source

1. Clone or download this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Build the extension scripts:

   ```sh
   npm run build
   ```

4. Open Chrome and go to `chrome://extensions/`.
5. Enable Developer Mode.
6. Click **Load unpacked**.
7. Select this project folder.

If the extension was already loaded, click reload on the extension card after rebuilding.

## Usage

1. Open the extension popup.
2. Fill in the search filters or extract them from the current LinkedIn search URL.
3. Click **Save & search** to open a LinkedIn people search page.
4. Write the connection note and save the auto-connect settings.
5. Choose Test Mode or Live Mode.
6. Click **Send connection requests**.

Use Test Mode first. Live Mode sends real LinkedIn connection requests.

## Development

```sh
npm install
npm run build
```

For continuous TypeScript compilation:

```sh
npm run watch
```

The extension loads compiled files from `dist/`.

## Files

- `manifest.json`: Chrome extension manifest.
- `src/content.ts`: LinkedIn page automation logic.
- `src/popup.ts`: Popup UI behavior and settings.
- `src/background.ts`: Extension background service worker.
- `popup.html`: Popup interface.
- `scripts/update_extension.bat`: Local update helper for source installs.

## Notes For A Future Public Version

A public Chrome Web Store version should be designed and packaged differently:

- Require user confirmation for every recipient and message before sending.
- Remove automatic batch sending.
- Remove or replace the source-level GitHub update flow.
- Narrow host permissions to the exact LinkedIn pages needed.
- Remove unused permissions.
- Add production icons, screenshots, privacy disclosures, and store listing copy.
- Package only the files needed by the extension runtime.
