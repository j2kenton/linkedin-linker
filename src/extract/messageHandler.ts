import { extractProfile } from "./profile";
import { extractJob } from "./job";
import { extractCompany } from "./company";
import { extractGenericPage } from "./generic";

export type ExtractionAction = "EXTRACT_PROFILE" | "EXTRACT_JOB" | "EXTRACT_COMPANY" | "EXTRACT_PAGE" | "EXTRACT_PING";
const EXTRACTION_ACTIONS: readonly string[] = ["EXTRACT_PROFILE", "EXTRACT_JOB", "EXTRACT_COMPANY", "EXTRACT_PAGE", "EXTRACT_PING"];

/** Runs the extractor for one message action against the current document. Shared by every content-script entry point (declared and on-demand injected) so they cannot drift. EXTRACT_PING is a cheap, side-effect-free readiness probe used by the capability-aware injection flow. */
export function handleExtractionMessage(action: string, document: Document): unknown {
  if (action === "EXTRACT_PROFILE") return extractProfile(document);
  if (action === "EXTRACT_JOB") return extractJob(document);
  if (action === "EXTRACT_COMPANY") return extractCompany(document);
  if (action === "EXTRACT_PAGE") return extractGenericPage(document);
  if (action === "EXTRACT_PING") return { ready: true };
  return undefined;
}

declare global { interface Window { __careerExtractionRegistered?: boolean; } }

/**
 * Registers the shared extraction listener on the current frame. Career
 * Tools only ever reads visible page text, and only from the top frame —
 * `sender.frameId` describes the sender's frame, not this receiver's, so a
 * request from the popup has no tab-frame sender at all and only this
 * frame's own top-frame identity can gate the response. Idempotent: safe to
 * call repeatedly (e.g. if the on-demand injection bundle runs more than
 * once for the same page) without registering duplicate listeners.
 */
export function registerExtractionListener(): void {
  if (window.top !== window) return;
  if (window.__careerExtractionRegistered) return;
  window.__careerExtractionRegistered = true;
  chrome.runtime.onMessage.addListener((request: { action?: string }, _sender, sendResponse) => {
    if (!request.action || !EXTRACTION_ACTIONS.includes(request.action)) return;
    sendResponse(handleExtractionMessage(request.action, document));
  });
}
