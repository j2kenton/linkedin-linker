// Extension-context invalidation guards.
//
// After the extension is reloaded, updated, or has its service worker
// replaced, any page or content script left over from the previous instance
// keeps running but is orphaned: chrome.runtime.id becomes undefined and every
// chrome-extension:// URL it resolves points at .../invalid/. Long-lived
// reconnect/retry loops must consult these guards so an orphaned surface stops
// and asks for a reload instead of spinning forever — which is what both hangs
// the UI and floods the network log with failing chrome-extension://invalid/
// requests.

/**
 * True while this page's own extension runtime is still valid. Returns false
 * for an orphaned surface (extension reloaded/updated since this document
 * loaded), where retrying anything that touches chrome.* can never recover
 * without a page reload.
 */
export function isExtensionContextAlive(): boolean {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    // Touching chrome.runtime on a fully torn-down context can itself throw.
    return false;
  }
}

/**
 * True when an error thrown by chrome messaging means this context can no
 * longer reach the extension it belongs to (its runtime was invalidated), as
 * opposed to a transient "the receiver isn't up yet" miss that a retry can
 * still resolve. Callers pair this with isExtensionContextAlive() so they only
 * give up on errors a page reload is actually required to fix.
 */
export function isContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Deliberately narrow: only the unambiguous invalidation string. Transient
  // misses ("Receiving end does not exist", "message port closed") can still
  // succeed on retry and must not be treated as terminal here — the separate
  // isExtensionContextAlive() check is what catches a genuinely dead runtime.
  return /context invalidated/i.test(message);
}
