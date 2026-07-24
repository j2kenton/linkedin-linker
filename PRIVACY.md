# Privacy Policy

Career Connect prepares connection invite drafts on LinkedIn people search results pages. It also includes an optional, opt-in AI research tool — Career — that generates one combined interview/company-preparation report, described in "Career Tools" below. It is not affiliated with or endorsed by LinkedIn.

## Data Handled

The extension handles:

- The active tab URL when the user opens the side panel or clicks a "Get from current URL" button.
- User-entered search settings and message draft text.
- Visible LinkedIn people-search page content needed to identify the next connectable profile and the first name for the draft greeting.
- Only when the optional Career Tools features described below are enabled and used: visible page content the user chooses to extract (LinkedIn profile, job, and company pages, and other pages when the user clicks an extraction control), a user-pasted CV/resume, job description text, manually entered or extracted company/role/interviewer context, an Anthropic and/or OpenAI API key (whichever provider is selected), and the resulting reports and their saved input snapshots.

## Storage

Search settings and message draft settings are stored locally using Chrome extension storage. They are used only to populate the side panel and prepare invite drafts.

## Sharing

The extension does not sell user data, and does not use analytics, advertising, tracking, or remote-code services. It does not share user data with any third party **except** the one described below: when a user opts into Career Tools, chooses Anthropic or OpenAI as the provider, supplies that provider's own API key, and explicitly runs an analysis, the data described in the "Career Tools" and "Network Requests" sections below is sent directly to the selected provider's API to generate that analysis. No data is sent to Anthropic, OpenAI, or any other third party, outside of that opt-in flow — and only the provider the user selected for that run ever receives the request.

## Career Tools

Career Tools are optional, off by default, and remain disabled until Chrome confirms that extension local storage is restricted to trusted contexts. If a Chrome version does not support this, Career Tools stay disabled with an update-Chrome message rather than storing sensitive data less safely. Every provider request, including a test connection, requires a user-supplied key for the selected provider and an explicit action; the extension shows a transmission preview of exactly what will be sent — and a transmission notice naming which provider it goes to — before that action is available. There is no separate recurring consent checkbox: reviewing the preview and clicking the explicit send/test action is the confirmation, every time.

The combined report request can include whatever context the user has supplied or extracted: CV/resume, job description, interviewer profile/notes, company name/URL/additional information, role title, seniority, location, and interview stage. When a valid LinkedIn company URL is supplied, an optional web-research stage sends only normalized company identity, role title, seniority, and location — CV text and the full job description never enter that web-search-enabled request. The selected provider processes web-search results server-side; the later, no-web-access synthesis request sends the returned findings together with all the other supplied context to generate the final report. The model used for a request is always one from a fixed, maintained list for the selected provider — never arbitrary free-text input.

Anthropic and OpenAI API keys and model selections are stored under separate keys in trusted extension-local storage, so switching the selected provider never overwrites the other provider's saved key or model choice; both are kept alongside CVs, extracted/manual context, and reports. Every generated report is saved together with the complete input snapshot used to generate it, viewable in a collapsed "Generation context" section on the report page. Reports are not automatically deleted; users can reopen prior reports from History, delete a report individually, or clear all saved reports. Users can also remove saved Career Tools data — including either provider's key individually — from the side panel, and uninstalling the extension clears extension-local data. The extension does not use this data for advertising, analytics, or sale.

If a report cannot be saved to local storage right away, it is held in a `chrome.storage.session` recovery anchor — a fallback that survives an extension worker restart but not the end of the browser session — and History flags it as not yet saved with a **Retry save** action; clearing all saved reports removes both the local and the session copy. History also shows total storage used and, if any saved record cannot be read back, an unreadable-record count so the user knows it can be removed via clear-all.

### Page extraction

Extraction is best-effort and user-initiated: clicking an Extract control in the Career tab reads visible content from the current tab only, and only ever adds missing details to the Career form — it never overwrites what the user already entered or previously extracted. Extraction can be attempted on any current page, not only recognised LinkedIn profile, job, or company URLs; on a page with nothing useful, the extension reports that instead of guessing. In the developer build, the content script that performs this reading is already declared for all pages, so no extra permission is ever requested.

In the Chrome Web Store build, whose declared content script is limited to `https://www.linkedin.com/*`, the shipped (B1) variant performs no on-demand script injection at all: LinkedIn pages are read through the declared content script exactly as above, and a non-LinkedIn page is reported as unavailable for extraction in this build rather than requesting any additional access. A separate, gated variant (B2) — not shipped until a publisher approves it and it passes live validation — adds an explicit, section-local "Allow page access" control that, only when clicked, requests Chrome's one-time optional `<all_urls>` permission for that single extraction attempt; declining it leaves LinkedIn extraction and every other feature unaffected, and the prompt is never shown automatically or for LinkedIn pages (whose declared host permission already covers them).

## Network Requests

Outside of the optional, opt-in Career Tools described above, the extension does not send user data to an external server. It opens LinkedIn search pages only when the user clicks "Save and open search".

When Career Tools are enabled and used, the extension sends the data described in that section directly to the selected provider's API (Anthropic's or OpenAI's, whichever the user chose), and only after the user has supplied a key for that provider, reviewed the transmission preview, and clicked an explicit action for that run.

## User Control

The extension does not click LinkedIn's Send button. Users review each invite recipient and message in LinkedIn's own dialog and decide whether to send, edit, or close it.

## Limited Use

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.
