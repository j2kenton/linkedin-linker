// On-demand extraction bundle — store build, B2 variant only. Only that
// variant's packaged manifest declares "scripting" (see
// scripts/package-store.js and src/extract/capabilities.ts); the checked-in,
// default B1 variant never bundles or injects this file at all (see
// scripts/build-store.js). When present, it is injected via
// chrome.scripting.executeScript into the current tab only when the user
// clicks an Extract button on a page the store build's declared content
// script (https://www.linkedin.com/* only) cannot reach, and only after
// ensureExtractionHandler finds no existing receiver. It only registers the
// same shared extraction listener the declared content scripts use; the
// popup then sends its usual EXTRACT_* message exactly as it does on
// LinkedIn.
import { registerExtractionListener } from "./extract/messageHandler";

registerExtractionListener();
