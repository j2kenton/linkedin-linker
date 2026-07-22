# Career Connect

## Turn LinkedIn research into better conversations

[Install the Chrome Web Store build](https://chromewebstore.google.com/detail/linkedin-connection-assis/poedmlfffaldgihhpffkbknjegmkpclj)

Career Connect is a Chrome extension for the part of networking that normally becomes a tedious collection of tabs, copy-and-paste, and half-finished notes.

It helps you:

- find relevant LinkedIn people with precise search criteria;
- prepare personalized connection invites at scale;
- research a company and role before an interview; and
- turn a public professional profile, your CV, and a job description into practical interview preparation.

The result is a focused workflow from **discover → understand → reach out**. It keeps the human in control of the final message and the final decision.

![Career Connect side panel](assets/screenshots/screenshot-1.png)

![Connection workflow with Test Mode and Live Mode](assets/screenshots/screenshot-2.png)

## One workflow for the work around networking

Networking usually means moving between search results, profiles, job descriptions, notes, and interview preparation. Career Connect brings those moments into the browser tab where the research is happening.

### A product with two deliberately different experiences

The same codebase produces two builds:

| | Developer build | Chrome Web Store build |
| --- | --- | --- |
| Best for | Personal workflows and local automation | Safe, review-first outreach |
| Connection requests | Can process many profiles across pages | Prepares one invite at a time |
| Send behavior | Test Mode or Live Mode | Never clicks LinkedIn's Send button |
| User control | Configurable limits and explicit mode selection | Review every recipient and message before sending |

The store build is not simply a restricted flag on the developer build. It is a separate packaged experience with its own manifest, content entry point, UI, and release verification while sharing the underlying feature logic.

### Career preparation with your own context

Career Tools use a bring-your-own-key model: the user chooses Anthropic or OpenAI and pays the provider directly. The extension provides:

- interview preparation grounded in visible profile content, a pasted CV, and a target job description;
- company and role intelligence with a research stage and a synthesis stage;
- streamed reports in a dedicated report view;
- source-aware output and explicit distinctions between researched facts, user-provided context, and modeled estimates;
- provider-specific request handling, error messages, and separate saved credentials; and
- a transmission preview and explicit confirmation before sensitive content leaves the browser.

Career Tools are optional and the core connection workflow works without an API key.

### Two ways to use the connection workflow

The developer build supports a safe Test Mode before Live Mode. Test Mode opens and cancels invite dialogs so the workflow can be inspected without sending requests. Live Mode is bounded by page and connection limits and uses deliberate pacing between actions.

The store build takes the more conservative approach required for a public extension: it prepares one invite draft, fills the user's note, and leaves LinkedIn's dialog open. The user reviews, edits, sends, or skips it.

### Built around trust and continuity

- streamed provider responses are assembled incrementally and persisted while they arrive;
- reports can reconnect to a running background job after a page or worker interruption;
- provider changes never silently change the provider used by an existing report;
- profile and job extraction has readiness checks and fallback behavior for rendered or incomplete pages;
- report output is validated before it is presented, including structured estimate sections and citation handling;
- user and extracted content is rendered as text rather than injected as HTML; and
- sensitive Career data is kept in trusted extension storage and is only sent through an explicit user action.

A missed selector produces a useful explanation, a dropped connection does not lose a report, and a powerful action has an inspectable path before it becomes irreversible.

## See it in action

### Connection workflow

1. Enter company, title, location, connection-degree, and page filters—or extract filters from a LinkedIn search URL.
2. Preview and save a personalized message.
3. Run in Test Mode to inspect the flow, or choose Live Mode in the developer build.
4. Let Career Connect move through visible, connectable profiles sequentially.

### Career workflow

1. Open Career Tools from a LinkedIn profile or job page.
2. Choose Anthropic or OpenAI and enter your own key for that provider.
3. Add a CV, job description, and any manual profile or company context.
4. Review the exact transmission preview.
5. Generate a report, follow the streamed result, and reopen saved reports when needed.

Company research is organization-level research performed by the selected provider. The extension keeps the CV and full job description out of that web-search request, then uses the returned findings for the final report.

## Run locally

```sh
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer Mode, choose **Load unpacked**, and select the repository directory. The developer build is emitted to `dist/`.

To build the review-first Web Store variant:

```sh
npm run build:store
```

Load `release/store/` as an unpacked extension, or install it from the Web Store using the link above.

## Verification

Automated coverage exercises the parts of the extension where a small mistake has an outsized effect: provider request contracts, streaming assembly, error classification, trusted-storage capability checks, profile and job extraction, safe report rendering, report reconnection, provider isolation, report validation, and store-build baselines.

Useful commands:

```sh
npm test
npm run verify:clean-checkout
npm run verify:store-baseline
```

`verify:clean-checkout` reconstructs a fresh checkout from repository-visible files and runs the install-and-test path there. That protects against a project appearing healthy only because of generated or ignored files on one developer's machine. The store-baseline check protects the packaged review-first build from accidental behavioral drift.

## Architecture at a glance

The implementation keeps the two products aligned without forcing them to behave identically:

- `src/popup-career-shared.ts` — shared Career Tools state, extraction actions, provider controls, previews, and saved reports;
- `src/popup-search-shared.ts` — shared search and connection workflow behavior;
- `src/aiClient.ts` — durable Career jobs, streaming lifecycle, persistence, and background orchestration;
- `src/aiClient/provider.ts` — Anthropic/OpenAI request construction and provider error handling;
- `src/extract/profile.ts` and `src/extract/job.ts` — page extraction and readiness handling;
- `src/report.ts` and `src/render/markdown.ts` — report presentation, copying, sources, and regeneration;
- `src/content.ts` / `src/content.store.ts` — developer automation versus single-invite content behavior; and
- `scripts/build-*.js` and `scripts/package-*.js` — reproducible build and packaging paths.

The code is TypeScript, compiled into Manifest V3 Chrome extension assets, with shared modules used by both builds and Vitest coverage for the most failure-prone contracts.

## Product direction

The next iteration is moving Career Connect toward one unified Career workspace: a Career tab alongside Connect, one adaptive combined report, additive extraction from more LinkedIn contexts, constrained searchable model selection, and durable case history with complete input snapshots. The direction is documented in `.ensemble/2026-07-21_task_4/` and is intentionally described as in progress rather than presented as shipped functionality.

This project is not affiliated with or endorsed by LinkedIn.
