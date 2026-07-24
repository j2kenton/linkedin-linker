import { sliceToBytes } from "../career/bytes";

// The only boundary that turns a thrown exception, chrome.runtime.lastError,
// or a test-stub error shape into user/evidence-facing text. Raw error
// objects and raw runtime.lastError.message strings must never reach the UI,
// storage, or STORE_SUBMISSION.md evidence directly -- only this function's
// output may.

export type ExtensionDiagnosticKind =
  | "lost-user-gesture"
  | "permission-runtime-error"
  | "permission-exception"
  | "injection-runtime-error"
  | "injection-exception"
  | "unknown-runtime-error";

const MAX_DIAGNOSTIC_BYTES = 200;

/** Known, sanitized Chrome/API phrases. Only these -- never the raw message -- may appear in a diagnostic. */
const ALLOWLIST: { pattern: RegExp; phrase: string }[] = [
  { pattern: /must be called during a user gesture/i, phrase: "must be called during a user gesture" },
  { pattern: /transient activation/i, phrase: "requires transient activation" },
  { pattern: /the user did not grant/i, phrase: "user did not grant the requested permission" },
  { pattern: /permission.*denied/i, phrase: "permission denied" },
  { pattern: /could not establish connection/i, phrase: "could not establish a connection to the page" },
  { pattern: /receiving end does not exist/i, phrase: "the page has no listener for this request" },
  { pattern: /cannot access.*contents of.*page/i, phrase: "cannot access the contents of this page" },
  { pattern: /cannot be scripted/i, phrase: "this page cannot be scripted" },
  { pattern: /no tab with id/i, phrase: "no tab with the given id" },
  { pattern: /no current window/i, phrase: "no current window" },
];

/** Recognized (conservatively matched) lost-user-gesture behavior, checked before generic classification. */
const GESTURE_PATTERNS = [/user gesture/i, /transient activation/i];

// Built from code points (rather than a \u escape literal) so no raw
// control byte or escape sequence is embedded in this source file.
const CONTROL_CODE_POINTS = Array.from({ length: 32 }, (_, i) => i).concat([127]);
const CONTROL_CHAR_PATTERN = new RegExp(`[${CONTROL_CODE_POINTS.map(code => String.fromCharCode(code)).join("")}]`, "g");

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return typeof error === "string" ? error : "";
}

function normalize(text: string): string {
  return text.replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

/** True when `error` (an exception, chrome.runtime.lastError, or equivalent test stub) matches a recognized lost-user-gesture rejection. */
export function isLostUserGestureError(error: unknown): boolean {
  const normalized = normalize(rawMessage(error));
  return GESTURE_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Sanitizes any thrown exception, chrome.runtime.lastError, or test-stub
 * error shape into a stable, bounded diagnostic string. The raw message is
 * inspected only long enough to match it against an allowlist of known,
 * content-free Chrome/API phrases; anything unmatched collapses to a generic
 * per-kind phrase so URLs, page titles, and extracted text can never leak
 * into a diagnostic.
 */
export function toBoundedExtensionDiagnostic(kind: ExtensionDiagnosticKind, error: unknown): string {
  const normalized = normalize(rawMessage(error));
  const matched = ALLOWLIST.find(entry => entry.pattern.test(normalized));
  const detail = matched ? matched.phrase : "unspecified reason";
  return sliceToBytes(`${kind}: ${detail}`, MAX_DIAGNOSTIC_BYTES);
}
