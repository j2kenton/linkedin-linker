// Session-storage recovery anchor for career jobs that could not be durably
// written to chrome.storage.local (plan §8.6). chrome.storage.local (with the
// unlimitedStorage permission) succeeds for the overwhelming majority of
// writes, so this module is a fallback path, not the common case: it exists
// so a provider request is never started or resumed without *some* durable
// place to recover its progress from if the worker restarts before the next
// local write succeeds.
//
// Session storage survives a service-worker restart but not the end of the
// browser session — callers must still lead with "copy as Markdown" and
// "retry save" as the durable fallback for the user.

import { baseBytes, byteSize, fixedFingerprint } from "./bytes";
import { normalizePersistedJob, type PersistedJob } from "./persistedJob";

const SESSION_KEY = "careerPendingJobs";
/** Chrome's documented default session-storage quota, used only when QUOTA_BYTES is unavailable (e.g. an older Chrome, or a test stub). */
const DEFAULT_SESSION_QUOTA_BYTES = 10 * 1024 * 1024;
/** Headroom left for the rest of the extension's own session-storage usage. */
const SESSION_HEADROOM_BYTES = 2 * 1024 * 1024;
/** Hard ceiling on how much of the session budget this feature will ever claim, independent of how large QUOTA_BYTES is reported to be. */
const MAX_PENDING_BUDGET_BYTES = 8 * 1024 * 1024;
/** Growth ceiling reserved for a still-running job, mirroring bytes.ts's MAX_GROWTH_TOTAL_BYTES, since its final persisted size isn't known yet. */
const RUNNING_JOB_RESERVE_BYTES = 2 * 1024 * 1024;
const TERMINAL_SLACK_BYTES = 4 * 1024;
/** Conservative per-entry map/key/envelope overhead, folded into every reserve so admission control never under-counts what chrome.storage.session actually charges. */
const ENTRY_ENVELOPE_BYTES = 256;

interface PendingEntry {
  job: PersistedJob;
  reserve: number;
  fixedBytes: number;
  fixedPrint: string;
}

type PendingRegister = Record<string, PendingEntry>;

function sessionArea(): chrome.storage.SessionStorageArea | undefined {
  return typeof chrome !== "undefined" ? chrome.storage?.session : undefined;
}

function sessionGet(): Promise<PendingRegister> {
  const area = sessionArea();
  if (!area) return Promise.resolve({});
  return new Promise(resolve => area.get([SESSION_KEY], items => resolve((items as Record<string, PendingRegister>)[SESSION_KEY] || {})));
}

function sessionSet(register: PendingRegister): Promise<void> {
  const area = sessionArea();
  if (!area) return Promise.reject(new Error("Session storage is unavailable."));
  return new Promise((resolve, reject) => area.set({ [SESSION_KEY]: register }, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
}

/** Total bytes this feature is willing to hold in session storage right now. */
function budgetBytes(): number {
  const area = sessionArea();
  const quota = area && Number.isFinite(area.QUOTA_BYTES) ? area.QUOTA_BYTES : DEFAULT_SESSION_QUOTA_BYTES;
  return Math.min(MAX_PENDING_BUDGET_BYTES, Math.max(0, quota - SESSION_HEADROOM_BYTES));
}

function reserveFor(job: PersistedJob): number {
  const live = job.status === "running" || job.status === "queued";
  const size = live ? baseBytes(job) + RUNNING_JOB_RESERVE_BYTES : byteSize(JSON.stringify(job)) + TERMINAL_SLACK_BYTES;
  return size + ENTRY_ENVELOPE_BYTES;
}

/**
 * Reserves (or re-anchors) a session-storage recovery slot for this job.
 * Never evicts an existing entry to admit a new or larger one — a capacity
 * shortfall is reported as a failed reservation, not resolved by discarding
 * someone else's recoverable progress.
 */
export async function reservePendingJob(job: PersistedJob): Promise<boolean> {
  if (!sessionArea()) return false;
  const register = await sessionGet();
  const print = fixedFingerprint(job);
  const existing = register[job.id];
  // A fixed-part mismatch on an existing anchor means the stored entry no
  // longer describes the same job identity/context — an anchor failure to
  // report, not permission to silently overwrite it.
  if (existing && existing.fixedPrint !== print) return false;

  const reserve = reserveFor(job);
  const budget = budgetBytes();
  const othersTotal = Object.entries(register)
    .filter(([id]) => id !== job.id)
    .reduce((sum, [, entry]) => sum + entry.reserve, 0);
  if (othersTotal + reserve > budget) return false;

  const candidate: PendingRegister = { ...register, [job.id]: { job, reserve, fixedBytes: baseBytes(job), fixedPrint: print } };
  // The reserve above is an estimate; only the exact serialized bytes of the
  // register we are about to write are authoritative.
  if (byteSize(JSON.stringify(candidate)) > budget) return false;

  try {
    await sessionSet(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Removes a pending anchor once its job has a durable local write. Safe to call even when no anchor exists. */
export async function clearPendingJob(id: string): Promise<void> {
  if (!sessionArea()) return;
  const register = await sessionGet();
  if (!(id in register)) return;
  const rest = { ...register };
  delete rest[id];
  try { await sessionSet(rest); } catch { /* best-effort cleanup; a stale anchor is re-validated (and pruned) on next read */ }
}

/** Wipes every pending anchor. Only for explicit bulk clear ("delete every saved report") — per-job deletion must use clearPendingJob so it never touches an unrelated job's recoverable progress. */
export async function clearAllPendingJobs(): Promise<void> {
  if (!sessionArea()) return;
  try { await sessionSet({}); } catch { /* best-effort cleanup; a stale register is re-validated (and pruned) on next read */ }
}

/** Looks up one pending job, re-validating it through the same ingress every stored record goes through — the register's own metadata is never trusted directly. */
export async function readPendingJob(id: string): Promise<PersistedJob | null> {
  const register = await sessionGet();
  const entry = register[id];
  return entry ? normalizePersistedJob(entry.job) : null;
}

/** All currently pending (not yet durably local) jobs, each re-validated. */
export async function readAllPendingJobs(): Promise<PersistedJob[]> {
  const register = await sessionGet();
  const jobs = Object.values(register).map(entry => normalizePersistedJob(entry.job));
  return jobs.filter((job): job is PersistedJob => Boolean(job));
}
