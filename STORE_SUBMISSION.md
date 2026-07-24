# Chrome Web Store Submission Notes

## Single Purpose

Career Connect is a LinkedIn relationship-and-career-research assistant. It helps a user act on page content they are already viewing by preparing something for their manual review: a personalized connection-invite draft, or one AI-generated, combined interview/company-preparation report. In every case the extension prepares a draft or report for the user to read and act on — it never submits anything on the user's behalf. The invite-drafting feature works out of the box with only local browser permissions. The Career feature is optional, off by default, and only sends data when the user picks a provider (Anthropic or OpenAI), supplies that provider's own API key, reviews the exact transmission preview, and clicks an explicit action for that run.

## Permission Justifications

`activeTab`: Used only after the user opens the side panel (or clicks an Extract control) to read the active tab's URL and, for Career extraction, its visible content for that one click.

`storage` / `unlimitedStorage`: Used to save search filters and message draft text locally in Chrome. Also used, only for the optional Career feature, to save the user's own Anthropic and/or OpenAI API key (stored separately per provider), the selected provider and model, pasted/extracted CV, job description, interviewer, and company context, and generated reports together with the input snapshot each was generated from — all locally in Chrome extension storage, never on a remote server operated by this extension. `unlimitedStorage` reflects that reports are kept until the user deletes them, rather than automatically evicted after a fixed count. If a `chrome.storage.local` write ever fails, the extension falls back to a capacity-checked `chrome.storage.session` recovery anchor (cleared once the local write succeeds) rather than losing the report or starting further provider work without it; this session fallback does not persist past the end of the browser session.

`sidePanel`: Used to display the extension's UI as a persistent side panel alongside the current page instead of a toolbar dropdown. The panel stays visible while the user interacts with LinkedIn, making it easier to fill search filters and review invite drafts or Career context without losing context.

## Host Access

The content script is declared against:

`https://www.linkedin.com/*`

- Used on LinkedIn people search results pages to find visible connect buttons, open LinkedIn's invite dialog, and fill the user-provided draft note.
- Used, only when the user clicks an Extract control in the Career tab, to read visible profile, job, company, or other page content for that one request — never automatically and never for any purpose besides populating the Career form fields the user can see and edit.

The manifest additionally declares `https://api.anthropic.com/*` and `https://api.openai.com/*` under `host_permissions`. Neither is a content-script target; they are the API endpoints the extension's background service worker calls directly, and only the one matching the user's selected provider is ever called — only when the user has supplied that provider's own API key, reviewed a preview of the exact request, and clicked Test Connection or Generate on that specific run.

## Store Build Variants (B1 / B2)

The store build has two variants produced from the same source commit by the same pipeline, differing only in one fixed permission delta and the presence of one injection bundle. The checked-in `manifest.store.json` is always the B1 base; packaging never modifies it.

| Variant | Build command | Package command | Extra permissions vs. B1 | Ships `extractInject.js`? |
| --- | --- | --- | --- | --- |
| B1 (default, shipped today) | `npm run build:store` | `npm run package` → `release/store.zip` | none | No |
| B2 (requires publisher approval before release) | `npm run build:store:b2` | `npm run package:b2` → `release/store-b2.zip` | `scripting`, `optional_host_permissions: ["<all_urls>"]` | Yes |

**B1 (shipped today):** extraction is available on LinkedIn profile, job, job-search-result, and company pages (covered by the declared `https://www.linkedin.com/*` content script) and on any other page whose URL happens to be readable via the ordinary `activeTab` grant *when the extension can already reach it without `chrome.scripting`* — in practice, this build performs no on-demand script injection at all, so extraction outside `https://www.linkedin.com/*` is not available. A missing content-script handler surfaces as "Could not run the reader; reload the tab and try again." B1 never calls `chrome.scripting` or `chrome.permissions.request`.

**B2 (interim, gated):** adds on-demand injection of a read-only extraction bundle (`extractInject.js`) into the active tab, and an explicit, section-local "Allow page access" control that requests optional `<all_urls>` only when the user clicks it. Granting, declining, a lost-user-gesture rejection, and other permission-request failures are tracked as distinct outcomes (see the decision log below). `<all_urls>` is optional and is never requested at install or automatically; LinkedIn extraction never triggers the prompt, since the declared host permission already makes those pages readable. B2 may ship only after the entries below are complete — a B1-only release remains an explicitly reduced-scope interim release and does not close the "extraction from any current page" requirement in the store build.

Upload commands: `npm run webstore:upload` uploads the B1 archive (`release/store.zip`); `npm run webstore:upload:b2` uploads the B2 archive (`release/store-b2.zip`). The invocation used must match the release-gate decision recorded below.

### B2 sign-off and validation log (append-only)

_No rows yet. Publisher approval, preliminary live side-panel checks, and final packaged-candidate validation against the exact `release/store-b2` archive must all be recorded here — with store variant, source commit, submitted archive SHA-256, packaged manifest permission state, Chrome channel/version, OS, date, and per-scenario permission pre/post-state — before B2 may ship. Until this section has completed rows, only the B1 build may be released, and it must be labelled reduced-scope (no non-LinkedIn extraction) in its release notes._

## Provider Model Catalog Verification Log (append-only)

_No rows yet._ Each `KNOWN_MODELS` entry in `src/models.ts` must be backed by a row here recording: provider, endpoint, UTC date, non-secret account environment, verified model ID, capacity source and values (context-window and max-output tokens), whether it is the provider's default, whether it was live-tested via `CAREER_TEST`, the result, tester, and source commit. Rows are never edited or deleted — corrections append a new row referencing the superseded one. The context-window/max-output figures currently in `src/models.ts` are carried over from the model catalog already in use in this codebase and have **not** been re-verified against current authoritative provider documentation as part of this change; that verification, and the corresponding rows here, remain outstanding before those capacity values can be treated as merge-gated evidence rather than best-effort defaults.

## Career Tools (Optional AI Feature)

Career is one optional feature on top of the core invite-drafting purpose: it combines whatever context the user has supplied or extracted — CV/resume, job description, interviewer profile/notes, company name/URL/additional information, role, seniority, location, and interview stage — into one adaptive interview/company-preparation report. When a valid LinkedIn company URL is supplied, an optional stage researches the company using the selected provider's server-side web-search tool first.

The feature is off by default and requires, in order: the user's own API key for their selected provider (Anthropic or OpenAI), a model chosen from a fixed, maintained per-provider list (never free-text), and a preview step that shows the exact data about to be sent — and a transmission notice naming the destination provider — before the user clicks to run the analysis. No data reaches either provider until an API key is present and the user has reviewed the preview and clicked the explicit action for that run; there is no separate persistent consent checkbox beyond that per-action review.

## Remote Code

No remote code is used. All extension logic — including the Career feature described above — is bundled in the submitted package. When a user opts into Career, the extension makes a direct HTTPS API call to the user's selected provider (Anthropic or OpenAI) to generate a report; it does not fetch or execute any remote script, and the API response is rendered as text in a static report page bundled with the extension, never evaluated or run as code. This is a disclosed remote **data** call to a third-party API, not remote **code**.

## Data Use

The extension handles active-tab URL data, locally saved user settings, message draft text, and visible LinkedIn page content needed to prepare the next invite draft. This core invite-drafting feature does not send data to external servers and does not use analytics, ads, tracking, or third-party data sharing.

Separately, the extension provides one optional, off-by-default Career feature. It remains disabled until the user picks a provider, supplies that provider's own API key, and clicks to run the combined report after reviewing an exact preview of the data about to be sent. When run, it sends whatever context the user has supplied or extracted (CV/resume, job description, interviewer profile/notes, company name/URL/additional information, role, seniority, location, and interview stage) to the selected provider's API. When a valid LinkedIn company URL is present, an optional first stage sends only normalized company name/URL, role title, seniority, and location for a server-side web-search research stage — the CV and full job description are never included in that stage — then the resulting findings, together with all the other supplied context, are sent to the selected provider's API for a second, no-web-access synthesis request that produces the report.

Extraction that populates this context is user-initiated per click, reads only the current tab, and only ever adds missing details — it never overwrites data the user already entered or a prior extraction already found.

Outside of this opt-in Career run, the extension does not send user data to any external server. Career data (both providers' API keys and model choices, CV/resume, job description, interviewer/company context, and generated reports with their input snapshots) is stored locally in Chrome extension storage, can be deleted by the user from the side panel — a single saved report, either provider's key individually, or everything — and is cleared when the extension is uninstalled. Deleting a single report or clearing every saved report also clears any of that report's data held in the session recovery fallback described above. Every saved-report list shows total storage used and, when a stored record cannot be read back, an unreadable-record count so the user can clear it. None of this data — from the core feature or from Career — is sold, or used for advertising, analytics, or unrelated third-party sharing.

## Reviewer Test Instructions

1. Install the extension.
2. Open the extension side panel. Verify it opens on the **Career** tab by default, with **Connect** alongside it.
3. Select the **Connect** tab, open a LinkedIn people search results page, enter a short message draft, and click "Save settings".
4. Click "Prepare next invite".
5. Verify that the extension opens LinkedIn's invite dialog and fills the note.
6. Verify that the extension does not click Send. The reviewer can close the LinkedIn dialog without sending.
7. Close and reopen the side panel; verify it restores the last tab used (Connect).

Career (optional AI feature) — testing requires an Anthropic API key (create one at <https://console.anthropic.com/>) or an OpenAI API key (create one at <https://platform.openai.com/>); if none is available, this list still demonstrates the preview/transmission gating without completing a run:

1. Select the **Career** tab. Verify the provider selector defaults to Anthropic, and the model field is a list you pick from (typing filters it) rather than free text.
2. Verify the four sections — job description & role details, interviewer information, company information, generate — are all visible and editable at once, in that order, with no requirement to fill any of them before the others.
3. On a LinkedIn profile, job, or company page, click that section's Extract control. Verify it fills in details without erasing anything already typed. Try it again on a page with little relevant content (e.g. the LinkedIn feed) and verify it reports a helpful outcome rather than erroring.
4. Enter an API key for the selected provider and click "Review & test connection". Verify the extension displays the exact data — and a transmission notice naming the destination provider — before anything is transmitted, and that nothing is sent without clicking the explicit confirm action.
5. Click "Generate combined report". Verify the extension opens a new report tab and streams one combined report only after that explicit click, and that the report page shows a collapsed "Generation context" section with the exact input used.
6. Switch the provider selector to OpenAI. Verify the key field's label/placeholder and the model list update, and that the previously entered Anthropic key and model choice are still present after switching back.
7. Verify that without an API key for the selected provider, no request is sent to either provider.
8. In History, verify the generated report is listed; click Open to reopen it, and Delete to remove it. Click **New** and verify it clears the case fields (job/company/interviewer/stage) but keeps the CV, provider settings, and the report still in History.

Note: on some Chrome versions, Career may show an "update Chrome" message instead of the controls above. This is expected fail-safe behavior — Career requires a Chrome version that supports restricting extension storage to trusted contexts, and stays disabled rather than storing sensitive data (API key, CV) less safely.

## Listing Copy

Short description:

Prepare LinkedIn invite drafts, plus one optional AI-generated combined interview-and-company-prep report using your own Anthropic or OpenAI API key.

Detailed description:

Career Connect helps prepare connection invite drafts from LinkedIn people search results. It saves your search filters and message draft locally, opens LinkedIn's invite dialog for the next visible connectable profile, and fills the note for review. The extension does not click Send; you review the recipient and message in LinkedIn and decide whether to send, edit, or close the invite.

Career adds one optional, opt-in AI research feature, in its own tab alongside Connect. It combines whatever you supply — CV, job description, interviewer notes, and company details, extracted from the current page or typed in — into one adaptive interview-and-company-preparation report, with an optional company-research stage when a LinkedIn company URL is available. It's off by default, lets you choose Anthropic or OpenAI as the provider from your own API key, and only runs after you review exactly what will be sent. Reports are saved with the exact input used to generate them, so you can reopen a prior case for a later interview stage without losing your work.

Not affiliated with or endorsed by LinkedIn.
