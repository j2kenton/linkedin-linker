import { toBoundedExtensionDiagnostic, isLostUserGestureError } from "./diagnostics";

// Capability-aware, on-demand extraction handler flow (plan step 6.2).
// Capability truth always comes from the installed manifest plus API
// presence -- never from build-tooling identity constants, source-file
// names, or the assumption that shared B2 code merely compiled. This is
// what lets B1 (no "scripting", no optional_host_permissions) and B2 (both)
// share one implementation safely: B1 always resolves both capabilities to
// false and therefore never calls chrome.scripting or chrome.permissions.

export interface ExtractionCapabilities {
  canInject: boolean;
  canRequestBroadPageAccess: boolean;
}

export type BroadPageAccessOutcome =
  | { status: "granted" }
  | { status: "declined" }
  | { status: "gesture-rejected"; diagnostic: string }
  | { status: "request-failed"; diagnostic: string };

export type EnsureExtractionHandlerResult = "ready" | "reload-required" | "injection-failed";

const INJECTED_BUNDLE = "dist/extractInject.js";
const HANDLER_PROBE_ACTION = "EXTRACT_PING";

/** Reads the active tab in the current window, or null if none is available. */
export async function readActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

interface StoreManifestShape {
  permissions?: string[];
  optional_host_permissions?: string[];
}

/** Derives extraction capabilities from the installed manifest and current API availability. Missing APIs or partial capability states resolve to false rather than throwing. */
export function getExtractionCapabilities(): ExtractionCapabilities {
  let manifest: StoreManifestShape | undefined;
  try {
    manifest = chrome.runtime.getManifest() as unknown as StoreManifestShape;
  } catch {
    manifest = undefined;
  }
  const permissions = manifest?.permissions || [];
  const optionalHostPermissions = manifest?.optional_host_permissions || [];
  const canInject = permissions.includes("scripting") && typeof chrome.scripting?.executeScript === "function";
  const canRequestBroadPageAccess = optionalHostPermissions.includes("<all_urls>") && typeof chrome.permissions?.request === "function";
  return { canInject, canRequestBroadPageAccess };
}

/**
 * Requests optional broad page access. Callers must invoke this synchronously
 * as the first operation of a click handler -- no await, permission
 * inspection, or logging beforehand -- or Chrome may reject the request for
 * a lost user gesture.
 */
export async function requestBroadPageAccess(): Promise<BroadPageAccessOutcome> {
  try {
    const granted = await new Promise<boolean>((resolve, reject) => {
      chrome.permissions.request({ origins: ["<all_urls>"] }, result => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(lastError);
          return;
        }
        resolve(Boolean(result));
      });
    });
    return granted ? { status: "granted" } : { status: "declined" };
  } catch (error) {
    if (isLostUserGestureError(error)) {
      return { status: "gesture-rejected", diagnostic: toBoundedExtensionDiagnostic("lost-user-gesture", error) };
    }
    return { status: "request-failed", diagnostic: toBoundedExtensionDiagnostic("permission-exception", error) };
  }
}

async function hasReceiver(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { action: HANDLER_PROBE_ACTION }, { frameId: 0 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the shared extraction message handler is reachable in the active
 * tab. Injects the on-demand bundle only when the manifest declares
 * "scripting" (capabilities.canInject) -- a B1-shaped manifest can never
 * reach the injection branch.
 */
export async function ensureExtractionHandler(tabId: number, capabilities: ExtractionCapabilities): Promise<EnsureExtractionHandlerResult> {
  if (await hasReceiver(tabId)) return "ready";
  if (!capabilities.canInject) return "reload-required";
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [INJECTED_BUNDLE] });
  } catch {
    return "injection-failed";
  }
  return (await hasReceiver(tabId)) ? "ready" : "injection-failed";
}
