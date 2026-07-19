/**
 * Wait for the storage-lock initialization before replying to a popup. Keeping
 * this independent of the MV3 entry point makes the conservative first-use
 * contract directly testable.
 */
export function respondAfterCareerInitialization(
  status: Promise<{ locked: boolean; reason?: string }>,
  sendResponse: (response: { locked: boolean; reason?: string }) => void,
): true {
  void status.then(sendResponse);
  return true;
}
