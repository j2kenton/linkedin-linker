# Chrome Web Store Submission Notes

## Single Purpose

Career Connect is a LinkedIn relationship-and-career-research assistant. It helps a user act on LinkedIn page content they are already viewing by preparing something for their manual review: a personalized connection-invite draft, an AI-generated interview-preparation briefing, or an AI-generated company/role research report. In every case the extension prepares a draft or report for the user to read and act on — it never submits anything on the user's behalf. The invite-drafting feature works out of the box with only local browser permissions. The two Career Tools features (Interview Preparation and Company & Role Intelligence) are optional, off by default, and only activate when the user picks a provider (Anthropic or OpenAI), supplies that provider's own API key, and gives explicit, per-run consent to send specific page content to that provider's API.

## Permission Justifications

`activeTab`: Used only after the user opens the side panel to read the active tab URL and validate that it is a supported LinkedIn page — a people search results page (to prepare an invite draft), a personal profile page (to offer Interview Preparation), or a job page (to offer Company & Role Intelligence) — then send a message to the content script already running on that active page.

`storage`: Used to save search filters and message draft text locally in Chrome. It is also used, only for the optional Career Tools features, to save the user's own Anthropic and/or OpenAI API key (stored separately per provider), the selected provider, model choice, per-run consent flag, pasted CV/resume and job description text, manually entered company/role identity fields, and generated Career Tools reports — all locally in Chrome extension storage, never on a remote server operated by this extension.

`sidePanel`: Used to display the extension's UI as a persistent side panel alongside the LinkedIn page instead of a toolbar dropdown. The panel stays visible while the user interacts with LinkedIn, making it easier to fill search filters and review invite drafts without losing context.

## Host Access

The content script is declared against:

`https://www.linkedin.com/*`

- Used on LinkedIn people search results pages to find visible connect buttons, open LinkedIn's invite dialog, and fill the user-provided draft note.
- Used, only when the user opens Interview Preparation on a personal LinkedIn profile page (`/in/...`), to read the visible public profile content included in that specific request.
- Used, only when the user opens Company & Role Intelligence on a LinkedIn job page (`/jobs/...`), to read the visible job description and company identity included in that specific request.

The manifest additionally declares `https://api.anthropic.com/*` and `https://api.openai.com/*` under `host_permissions`. Neither is a content-script target; they are the API endpoints the extension's background service worker calls directly, and only the one matching the user's selected provider is ever called — only when the user has supplied that provider's own API key, given consent, reviewed a preview of the exact request, and clicked Test Connection, Generate Interview Prep, or Generate Company & Role Report for that specific run.

## Career Tools (Optional AI Features)

Career Tools are two additional, fully optional features on top of the core invite-drafting purpose:

- **Interview Preparation**, on LinkedIn personal profile pages (`/in/...`): combines visible public profile content with a CV/resume and job description the user pastes in, to produce non-diagnostic interview-preparation guidance.
- **Company & Role Intelligence**, on LinkedIn job pages (`/jobs/...`): researches a company using the selected provider's server-side web-search tool (given a LinkedIn company URL), then produces a company, role, and compensation report.

Both features are off by default and require, in order: the user's own API key for their selected provider (Anthropic or OpenAI), an explicit per-run consent checkbox, and a preview step that shows the exact data about to be sent — and to which provider — before the user clicks to run the analysis. Neither feature functions, and no data reaches either provider, until all three conditions are met for that specific run.

## Remote Code

No remote code is used. All extension logic — including the Career Tools features described above — is bundled in the submitted package. When a user opts into Career Tools, the extension makes a direct HTTPS API call to the user's selected provider (Anthropic or OpenAI) to generate a report; it does not fetch or execute any remote script, and the API response is rendered as text in a static report page bundled with the extension, never evaluated or run as code. This is a disclosed remote **data** call to a third-party API, not remote **code**.

## Data Use

The extension handles active-tab URL data, locally saved user settings, message draft text, and visible LinkedIn page content needed to prepare the next invite draft. This core invite-drafting feature does not send data to external servers and does not use analytics, ads, tracking, or third-party data sharing.

Separately, the extension provides two optional, off-by-default Career Tools features: Interview Preparation and Company & Role Intelligence. These remain disabled until the user picks a provider and supplies that provider's own API key, gives explicit per-run consent, and clicks to run a specific analysis after reviewing an exact preview of the data about to be sent. When run, Interview Preparation sends visible LinkedIn profile content, the user's pasted CV/resume, and the target job description to the selected provider's API. Company & Role Intelligence sends normalized company name/URL, role title, seniority, and location to the selected provider's API for a server-side web-search research stage — the CV and full job description are never included in that stage — then sends the resulting findings, the full job description, and the user's CV/resume to the selected provider's API for a second, no-web-access synthesis request that produces the report.

Outside of these two opt-in, consent-gated Career Tools runs, the extension does not send user data to any external server. Career Tools data (both providers' API keys, CV/resume, job description, saved profile/company identity, and generated reports) is stored locally in Chrome extension storage, can be deleted by the user from the side panel — including either provider's key individually — and is cleared when the extension is uninstalled. None of this data — from the core feature or from Career Tools — is sold, or used for advertising, analytics, or unrelated third-party sharing.

## Reviewer Test Instructions

1. Install the extension.
2. Open a LinkedIn people search results page.
3. Open the extension side panel and choose "Connection Assistant".
4. Enter a short message draft and click "Save settings".
5. Click "Prepare next invite".
6. Verify that the extension opens LinkedIn's invite dialog and fills the note.
7. Verify that the extension does not click Send. The reviewer can close the LinkedIn dialog without sending.

Career Tools (optional AI features) — testing requires an Anthropic API key (create one at <https://console.anthropic.com/>) or an OpenAI API key (create one at <https://platform.openai.com/>); if none is available, this list still demonstrates the consent gating without completing a run:

1. Career Tools appear only on LinkedIn personal profile pages (`/in/...`) and LinkedIn job pages (`/jobs/...`).
2. Open a LinkedIn profile page, open the extension side panel, and choose "Career Tools". Verify the provider selector defaults to Anthropic, and that the Interview Preparation controls are disabled/inactive until an API key is entered for the selected provider.
3. Enter an API key for the selected provider, tick the per-run consent checkbox, and click "Review & test connection". Verify the extension displays the exact data — and destination provider — it is about to send before anything is transmitted.
4. Click "Generate". Verify the extension opens a new report tab and streams the AI-generated report only after that explicit click.
5. Repeat on a LinkedIn job page (`/jobs/view/...`) for Company & Role Intelligence. Verify the same API-key-plus-consent gating and preview step.
6. Switch the provider selector to OpenAI. Verify the key field's label/placeholder and the Model ID field's known-model list update, and that the previously entered Anthropic key is still present after switching back.
7. Verify that without an API key for the selected provider, or without checking consent, no request is sent to either provider.

Note: on some Chrome versions, Career Tools may show an "update Chrome" message instead of the controls above. This is expected fail-safe behavior — Career Tools require a Chrome version that supports restricting extension storage to trusted contexts, and stay disabled rather than storing sensitive data (API key, CV) less safely.

## Listing Copy

Short description:

Prepare LinkedIn invite drafts, plus optional AI interview prep and company research using your own Anthropic or OpenAI API key.

Detailed description:

Career Connect helps prepare connection invite drafts from LinkedIn people search results. It saves your search filters and message draft locally, opens LinkedIn's invite dialog for the next visible connectable profile, and fills the note for review. The extension does not click Send; you review the recipient and message in LinkedIn and decide whether to send, edit, or close the invite.

Career Tools add two optional, opt-in AI research features on LinkedIn profile and job pages. Interview Preparation reads a LinkedIn profile plus your own pasted CV/resume and target job description to produce interview-prep guidance. Company & Role Intelligence reads a LinkedIn job page, researches the company, and produces a role and compensation report. Both features are off by default, let you choose Anthropic or OpenAI as the provider, require your own API key for that provider, and only run after you review exactly what will be sent and give per-run consent.

Not affiliated with or endorsed by LinkedIn.
