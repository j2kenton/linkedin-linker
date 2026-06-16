# LinkedIn Connection Automator

This repository contains two Chrome extension builds from one codebase:

| | Developer build | Store build |
| --- | --- | --- |
| **Purpose** | Full automation for local/developer use | One-at-a-time invite assistant for Chrome Web Store |
| **Send behavior** | Clicks LinkedIn's Send button automatically (Live Mode) | Never clicks Send — you review and send each invite yourself |
| **Batch processing** | Yes — processes all profiles across pages | No — prepares one invite per button click |
| **Limits** | Pages and connection count limits | None needed (single-step flow) |
| **Install method** | Load unpacked via `chrome://extensions` | Load unpacked or install from Chrome Web Store |
| **Build command** | `npm run build` | `npm run build:store` |
| **Output** | `dist/` + root `manifest.json` | `release/store/` (self-contained) |

This project is not affiliated with or endorsed by LinkedIn.

## Screenshots

| Search setup | Connect & send |
| --- | --- |
| ![Search filters step in the extension popup](assets/screenshots/screenshot-1.png) | ![Auto-adjust and Live Mode connect step in the extension popup](assets/screenshots/screenshot-2.png) |

## Developer Build

Full automation with Test Mode and Live Mode. Intended for local/developer use only. Users who run this build are responsible for how they use it, including compliance with LinkedIn's terms, Chrome extension policies, and applicable law.

### Developer: What It Does

- Builds LinkedIn people-search URLs from company, title, location, connection-degree, and page inputs.
- Reads filter values from the active LinkedIn search URL.
- Saves search and message settings in local Chrome extension storage.
- Finds visible LinkedIn profiles with Connect buttons across pages.
- Opens the LinkedIn invite dialog, adds a personalized note, and processes profiles sequentially.
- **Test Mode:** opens and cancels invite dialogs without sending requests.
- **Live Mode:** clicks LinkedIn's Send button and sends connection requests.
- Supports limits for pages and max connection requests with optional auto-decrement.
- Includes random delays between actions.

### Developer: Installation

1. Clone or download this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Build:

   ```sh
   npm run build
   ```

4. Open Chrome and go to `chrome://extensions/`.
5. Enable Developer Mode.
6. Click **Load unpacked** and select this project folder.

If the extension was already loaded, click reload on the extension card after rebuilding.

### Developer: Usage

1. Open the extension popup.
2. Fill in search filters or extract them from the current LinkedIn search URL.
3. Click **Save & search** to open a LinkedIn people search page.
4. Write the connection note and save settings.
5. Choose Test Mode or Live Mode.
6. Click **Send connection requests**.

Use Test Mode first. Live Mode sends real LinkedIn connection requests.

## Store Build

A separate, store-policy-compliant variant that prepares one invite draft at a time. The extension never clicks Send — it opens LinkedIn's invite dialog, fills the note you composed, and leaves the dialog open for you to review and send yourself.

### Store: What It Does

- Same search URL builder and message draft composer as the developer build.
- On each "Prepare next invite" click: finds the next connectable profile on the current page, opens its invite dialog, and fills the note.
- Tracks which profiles have been prepared in the current page session so repeated clicks advance through the list without revisiting the same profile.
- No batch processing, no Send click, no Live Mode.

### Store: Installation

```sh
npm install
npm run build:store
```

The store build is assembled into `release/store/`. Load it in Chrome via `chrome://extensions` → **Load unpacked** → select `release/store/`.

### Store: Usage

1. Open the extension popup.
2. Fill in search filters and click **Save & open search** to navigate to LinkedIn.
3. Compose your message draft and click **Save settings**.
4. Click **Prepare next invite** — the extension opens LinkedIn's invite dialog and fills your note.
5. Review the recipient and message in LinkedIn, then click Send (or close the dialog to skip).
6. Click **Prepare next invite** again for the next profile.

If the page script is not reachable (e.g. the LinkedIn tab was open before the extension was installed), reload the LinkedIn search page and try again.

## Development

```sh
npm install
npm run build        # developer build → dist/
npm run build:store  # store build → release/store/
npm run watch        # developer build in watch mode
```

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Developer build manifest |
| `manifest.store.json` | Store build manifest (used by `build:store`) |
| `src/content.ts` | Developer build content script (automation) |
| `src/content.store.ts` | Store build content script (single-step, no Send) |
| `src/popup.ts` | Developer build popup logic |
| `src/popup.store.ts` | Store build popup logic |
| `src/background.ts` | Shared background service worker |
| `popup.html` | Developer build popup UI |
| `popup.store.html` | Store build popup UI |
| `scripts/set-build-target.js` | Injects `BUILD_TARGET` constant before `tsc` |
| `scripts/package-store.js` | Assembles `release/store/` from store build output |
| `tsconfig.json` | Developer TypeScript config |
| `tsconfig.store.json` | Store TypeScript config (separate entry points) |
