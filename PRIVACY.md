# Privacy Policy

Career Connect prepares connection invite drafts on LinkedIn people search results pages. It also includes two optional, opt-in AI research tools — Interview Preparation and Company & Role Intelligence — described in "Career Tools" below. It is not affiliated with or endorsed by LinkedIn.

## Data Handled

The extension handles:

- The active tab URL when the user opens the popup or clicks a "Get from current URL" button.
- User-entered search settings and message draft text.
- Visible LinkedIn people-search page content needed to identify the next connectable profile and the first name for the draft greeting.
- Only when the optional Career Tools features described below are enabled and used: visible LinkedIn profile or job-page content, a user-pasted CV/resume, job description text, manually entered company/role identity fields, an Anthropic API key, and the resulting reports.

## Storage

Search settings and message draft settings are stored locally using Chrome extension storage. They are used only to populate the popup and prepare invite drafts.

## Sharing

The extension does not sell user data, and does not use analytics, advertising, tracking, or remote-code services. It does not share user data with any third party **except** the one described below: when a user opts into Career Tools, supplies their own Anthropic API key, and explicitly runs an analysis, the data described in the "Career Tools" and "Network Requests" sections below is sent directly to Anthropic's API to generate that analysis. No data is sent to Anthropic, or to any other third party, outside of that opt-in flow.

## Career Tools

Career Tools are optional, off by default, and remain disabled until Chrome confirms that extension local storage is restricted to trusted contexts. If a Chrome version does not support this, Career Tools stay disabled with an update-Chrome message rather than storing sensitive data less safely. Every Anthropic request, including a test connection, requires a user-supplied key, a consent confirmation, and an explicit action; the extension shows a preview of exactly what will be sent before that action is available.

For Interview Preparation, the approved request can include visible LinkedIn profile content (or a manual profile), CV/resume, and the target JD. For Company & Role Intelligence, the optional web-research stage sends only normalized company identity, role title, seniority, and location. CV text and the full JD never enter web-search-enabled requests. Anthropic processes web-search results server-side; the later, no-web-access synthesis request sends the returned findings, the full JD, **and the user's CV/resume** to generate the report.

API keys, CVs, JDs, manual profile/job identity, and reports are kept in trusted extension-local storage. Users can remove saved Career Tools data from the popup, and uninstalling the extension clears extension-local data. The extension does not use this data for advertising, analytics, or sale.

## Network Requests

Outside of the optional, opt-in Career Tools described above, the extension does not send user data to an external server. It opens LinkedIn search pages only when the user clicks "Save and open search".

When Career Tools are enabled and used, the extension sends the data described in that section directly to Anthropic's API, and only after the user has supplied a key, given consent, reviewed the transmission preview, and clicked an explicit action for that run.

## User Control

The extension does not click LinkedIn's Send button. Users review each invite recipient and message in LinkedIn's own dialog and decide whether to send, edit, or close it.

## Limited Use

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.
