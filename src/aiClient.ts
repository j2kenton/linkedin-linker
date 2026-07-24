import { interviewPrepPrompt } from "./prompts/interviewPrep";
import { companyResearchPrompt } from "./prompts/companyIntelResearch";
import { companySynthesisPrompt } from "./prompts/companyIntelSynthesis";
import { careerReportPrompt } from "./prompts/careerReport";
import { validateReport, type Validation } from "./validate/report";
import { DEFAULT_MODEL, PROVIDER_LABEL, streamProviderRequest, resolveRequestedOutputTokens, type Provider } from "./aiClient/provider";
import { runResearchContinuation, type CareerSource, type ResearchLoopState } from "./aiClient/research";
import { normalizeCareerInput } from "./career/fields";
import { resolveKnownModel } from "./models";
import { byteSize, boundJobForPersistence, fixedFingerprint, type BoundableJob } from "./career/bytes";
import { assertRequestFitsModel } from "./aiClient/modelBudget";
import { normalizePersistedJob, type PersistedJob } from "./career/persistedJob";
import { reservePendingJob, clearPendingJob, clearAllPendingJobs, readPendingJob, readAllPendingJobs } from "./career/pendingJobs";

export { buildRequestBody, buildOpenAIRequestBody, classifyProviderError, DEFAULT_MODEL, PROVIDER_LABEL, type Provider } from "./aiClient/provider";
export { appendResearchContinuation, runResearchContinuation, type ResearchLoopState } from "./aiClient/research";

export type CareerKind = "interview" | "company" | "combined";
export type JobStatus = "queued" | "running" | "complete" | "error" | "cancelled" | "interrupted";
export interface CareerJob {
  id: string; kind: CareerKind; status: JobStatus; stage: "research" | "synthesis" | "complete";
  /** Stamped at job creation from the then-current provider setting; resumed/continued runs keep it, so one report never mixes providers. */
  provider: Provider;
  /** The exact model that generated (or is generating) this report — kept with the job so History can show it even after the popup's current selection changes. */
  model: string;
  input: Record<string, string>; reportText: string; findings: string; sources: CareerSource[];
  researchMessages: Record<string, unknown>[]; researchAvailable: boolean; warnings: string[]; generation: number;
  /** Set only after a research response reaches end_turn. */
  researchComplete?: boolean;
  heartbeat?: number; error?: string; usage?: Record<string, unknown>; validation?: Validation; createdAt: number;
}
/** Outbound-only: never part of the persisted schema, always derived at read time from whether a job's freshest known state lives only in the session recovery register. */
export type AnnotatedCareerJob = CareerJob & { unsaved?: true };

const JOB_KEY = "careerToolJobs";
// No count-based eviction and no automatic deletion of any job record: every
// generated report is kept until the user explicitly deletes it. This byte
// ceiling is only a last-resort safety net against unbounded growth. When
// crossed, retainJobsForStorage compacts resume-only state (research
// transcripts, reasoning warnings) from complete/cancelled jobs — it never
// removes a job.
const MAX_JOB_BYTES = 50 * 1024 * 1024;
/** Surfaced on a job whose latest write could not reach chrome.storage.local and fell back to the session recovery anchor; cleared automatically once a local write succeeds again. */
export const STORAGE_WARNING = "storage: this report could not be saved to local storage; it is recoverable until the browser closes. Use Retry save.";
const controllers = new Map<string, AbortController>(); const heartbeats = new Map<string, number>();
const jobListeners = new Map<string, Set<(job: CareerJob) => void>>();
const get = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));
const set = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
// Built from character codes, not a \u/\x regex escape, so the control-character range (NUL..US, DEL) stays as reviewable source text.
const CONTROL_CHAR_PATTERN = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]", "g");
const cleanText = (value: unknown, max = 30000) => String(value || "").normalize("NFC").replace(CONTROL_CHAR_PATTERN, " ").replace(/\s+/g, " ").trim().slice(0, max);
export function normalizeResearchIdentity(input: Record<string, unknown>): { companyName:string; companyUrl:string; title:string; seniority:string; location:string } | null {
  const cap = (v: unknown, length: number) => cleanText(v, length);
  const companyUrl = String(input.companyUrl || "").trim();
  let parsed: URL; try { parsed = new URL(companyUrl); } catch { return null; }
  // A research identity is deliberately a canonical company page, not a
  // general LinkedIn URL. Reject decorations rather than silently dropping
  // them so the value shown in consent is exactly the value used for search.
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash || !/(^|\.)linkedin\.com$/i.test(parsed.hostname) || !/^\/company\/[^/?#]+\/?$/i.test(parsed.pathname)) return null;
  const companyName = cap(input.companyName, 120); if (!companyName) return null;
  return { companyName, companyUrl:`https://www.linkedin.com${parsed.pathname.replace(/\/$/, "")}/`, title:cap(input.title,120), seniority:cap(input.seniority,40), location:cap(input.location,120) };
}
export async function initializeCareerTools(): Promise<{ locked: boolean; reason?: string }> {
  try {
    if (!chrome.storage.local.setAccessLevel) throw new Error("unsupported");
    await chrome.storage.local.setAccessLevel({ accessLevel:"TRUSTED_CONTEXTS" }); return { locked:true };
  } catch { return { locked:false, reason:"Career Tools requires a newer version of Chrome that supports locking extension storage — please update Chrome and reload the extension." }; }
}
/** Every local-storage read is re-validated through the same ingress untrusted records go through — a stored shape is a migration hint, never proof of validity. */
async function readJobsWithDiagnostics(): Promise<{ jobs: CareerJob[]; unreadableCount: number }> {
  const raw = (await get<Record<string, unknown[]>>([JOB_KEY]))[JOB_KEY] || [];
  const jobs: CareerJob[] = [];
  let unreadableCount = 0;
  for (const item of raw) {
    const normalized = normalizePersistedJob(item);
    if (normalized) jobs.push(normalized as unknown as CareerJob);
    else unreadableCount += 1;
  }
  return { jobs, unreadableCount };
}
async function readJobs(): Promise<CareerJob[]> { return (await readJobsWithDiagnostics()).jobs; }
const isCompactable = (status: JobStatus): boolean => status === "complete" || status === "cancelled";
const fitsByteBudget = (jobs: CareerJob[]): boolean => byteSize(JSON.stringify(jobs)) <= MAX_JOB_BYTES;

/**
 * No automatic eviction by count, age, or byte pressure — every report is
 * kept until the user explicitly deletes it (History's Delete action) so
 * prior cases stay available for follow-up interviews or later stages with
 * the same company. If the whole set would otherwise exceed the hard byte
 * safety net, this sheds only resume-only state — research transcripts and
 * reasoning-only warnings — from complete/cancelled jobs (oldest first,
 * research transcripts before warnings), never from an error/interrupted job
 * that may still be explicitly regenerated, and never removes a job record.
 */
export function retainJobsForStorage(jobs: CareerJob[]): CareerJob[] {
  const kept = jobs.map(job => ({ ...job }));
  if (fitsByteBudget(kept)) return kept;
  for (let i = kept.length - 1; i >= 0 && !fitsByteBudget(kept); i--) {
    const job = kept[i];
    if (isCompactable(job.status) && job.researchMessages.length) kept[i] = { ...job, researchMessages: [] };
  }
  for (let i = kept.length - 1; i >= 0 && !fitsByteBudget(kept); i--) {
    const job = kept[i];
    if (!isCompactable(job.status)) continue;
    const trimmed = job.warnings.filter(w => !w.startsWith("reasoning:"));
    if (trimmed.length !== job.warnings.length) kept[i] = { ...job, warnings: trimmed };
  }
  return kept;
}
export function acceptsJobWrite(existingGeneration: number | undefined, nextGeneration: number, guardGeneration: boolean): boolean {
  return !guardGeneration || existingGeneration === undefined || existingGeneration <= nextGeneration;
}
/**
 * Delivers in-memory job updates to report pages. Storage remains the durable
 * source of truth; listeners only make active reports render stream deltas
 * immediately rather than waiting for the next throttled persistence write.
 */
export function subscribeCareerJob(id: string, listener: (job: CareerJob) => void): () => void {
  const listeners = jobListeners.get(id) || new Set<(job: CareerJob) => void>();
  listeners.add(listener);
  jobListeners.set(id, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) jobListeners.delete(id);
  };
}
export function publishCareerJob(job: CareerJob): void {
  for (const listener of jobListeners.get(job.id) || []) {
    try { listener(job); } catch { /* A disconnected report must not stop the job. */ }
  }
}
async function writeJobsLocal(jobs: CareerJob[]): Promise<void> { await set({ [JOB_KEY]: jobs }); }

/**
 * The single fail-closed persistence chokepoint (plan §8.7): every job write
 * is first bounded to its per-record byte ceilings, then attempted against
 * chrome.storage.local (retried once), and only falls back to the
 * chrome.storage.session recovery anchor if both local attempts fail. Only
 * rejects when neither a durable local write nor a reserved session anchor
 * is available — callers that gate provider work on this promise therefore
 * never start or resume a request without *some* recoverable place for its
 * progress to live.
 */
async function saveJob(job: CareerJob, guardGeneration = false): Promise<void> {
  const existing = await latest(job.id);
  // A resumed worker run owns a higher generation. Never let a stale async run
  // overwrite its durable state after it has been superseded.
  if (!acceptsJobWrite(existing?.generation, job.generation, guardGeneration)) return;

  const bounded = boundJobForPersistence(job as unknown as BoundableJob);
  if (bounded.job !== job) Object.assign(job, bounded.job);

  const jobs = (await readJobs()).filter(item => item.id !== job.id);
  jobs.unshift(job);
  const toWrite = retainJobsForStorage(jobs);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeJobsLocal(toWrite);
      if (job.warnings.includes(STORAGE_WARNING)) job.warnings = job.warnings.filter(w => w !== STORAGE_WARNING);
      await clearPendingJob(job.id).catch(() => undefined);
      publishCareerJob(job);
      return;
    } catch { /* one retry, then fall back to the session anchor below */ }
  }

  if (!job.warnings.includes(STORAGE_WARNING)) job.warnings = [...job.warnings, STORAGE_WARNING];
  const reserved = await reservePendingJob(job as unknown as PersistedJob);
  // Live report-page listeners must see the same unsaved state CAREER_LIST
  // and ENSURE_JOB would report for this job right now.
  const published: AnnotatedCareerJob = reserved ? { ...job, unsaved: true } : job;
  publishCareerJob(published);
  if (!reserved) throw new Error("This report could not be saved: local storage failed and no recovery slot is available. Copy the report text now if you need it.");
}

async function latest(id: string): Promise<CareerJob | undefined> { return (await readJobs()).find(j => j.id === id); }

/** Combines the durable local copy with the session recovery register, preferring whichever holds the higher generation, and flags the result unsaved when the session copy won. */
async function latestAnnotated(id: string): Promise<AnnotatedCareerJob | undefined> {
  const local = await latest(id);
  const pending = await readPendingJob(id);
  if (pending && (!local || pending.generation > local.generation)) return { ...(pending as unknown as CareerJob), unsaved: true };
  return local;
}

/** CAREER_LIST's merge of the durable list with any session-only recoverable jobs, so History can surface a report that local storage never durably received. */
async function mergeWithPending(jobs: CareerJob[]): Promise<AnnotatedCareerJob[]> {
  const pending = await readAllPendingJobs();
  if (!pending.length) return jobs;
  const byId = new Map<string, AnnotatedCareerJob>(jobs.map(job => [job.id, job]));
  const order = jobs.map(job => job.id);
  for (const entry of pending) {
    const pendingJob = entry as unknown as CareerJob;
    const local = byId.get(pendingJob.id);
    if (local && pendingJob.generation <= local.generation) continue;
    byId.set(pendingJob.id, { ...pendingJob, unsaved: true });
    if (!local) order.unshift(pendingJob.id);
  }
  return order.map(id => byId.get(id)).filter((job): job is AnnotatedCareerJob => Boolean(job));
}

/**
 * After an explicit deletion frees local-storage space, retries every
 * still-pending (session-anchored, unsaved) job oldest first — the same
 * ordering a real user hitting Retry save one at a time would produce — so a
 * job that only failed to save because a sibling was too large becomes
 * durable without a manual retry. A job that still doesn't fit stays
 * anchored for the next opportunity; this never evicts or edits any other
 * job. Returns the ids that became durably saved, so callers can refresh.
 */
async function retryPendingJobsOldestFirst(): Promise<string[]> {
  const pending = await readAllPendingJobs();
  const ordered = [...pending].sort((a, b) => a.createdAt - b.createdAt);
  const saved: string[] = [];
  for (const job of ordered) {
    try { await saveJob(job as unknown as CareerJob); saved.push(job.id); }
    catch { /* still doesn't fit; it remains anchored for the next opportunity */ }
  }
  return saved;
}

// The service worker is a singleton per extension: if this instance's
// in-memory `controllers` map does not hold the job, no execution of it is
// underway anywhere, regardless of how recently a heartbeat was written by a
// now-dead prior instance. Gating on heartbeat staleness on top of `isLive`
// left a job stuck "running" forever whenever a report page reconnected
// within 40s of the worker being killed.
export function jobNeedsResume(job: Pick<CareerJob, "status" | "heartbeat">, isLive: boolean, _now = Date.now()): boolean {
  return job.status === "running" && !isLive;
}
function startHeartbeat(job: CareerJob, persist: () => Promise<void>): void { stopHeartbeat(job.id); heartbeats.set(job.id, setInterval(() => { job.heartbeat=Date.now(); void persist(); }, 20_000) as unknown as number); }
function stopHeartbeat(id:string): void { const timer=heartbeats.get(id); if (timer) clearInterval(timer); heartbeats.delete(id); }
/** A restarted stream must replace, not append to, its stale partial output. */
export function startFreshReportStream(job: Pick<CareerJob, "reportText" | "warnings">): void {
  job.reportText = "";
  job.warnings = job.warnings.filter(warning => !warning.startsWith("reasoning:"));
}
async function runJob(job: CareerJob, key:string, model:string): Promise<void> {
  const provider = job.provider;
  const controller = new AbortController(); controllers.set(job.id, controller);
  // Every persist attempt for this job — heartbeat and stream deltas alike —
  // runs through this one serialized chain (plan §8.7) so two concurrent
  // writes can never race, and a failure is only ever handled once: the
  // first observed anchor failure (saveJob rejecting, meaning neither a
  // local write nor a session reservation succeeded) aborts the request and
  // leaves the job in a recoverable error state rather than silently
  // continuing to stream into the void.
  let persistChain: Promise<void> = Promise.resolve();
  const persist = (): Promise<void> => {
    persistChain = persistChain.then(() => saveJob(job, true), () => saveJob(job, true)).catch(error => {
      if (controller.signal.aborted) return;
      job.status = "error";
      job.error = error instanceof Error ? error.message : "This report could not be saved; generation was stopped to avoid losing more work.";
      publishCareerJob(job);
      controller.abort();
    });
    return persistChain;
  };
  startHeartbeat(job, persist);
  let lastPersist=0;
  const persistText = (text:string, thinking:string) => {
    if (text) job.reportText += text;
    if (thinking) job.warnings = [...job.warnings.filter(w => !w.startsWith("reasoning:")), `reasoning:${thinking.slice(-500)}`];
    // Report pages receive each delta over their runtime port. Persisting on
    // the existing throttle keeps worker-restart recovery bounded without
    // sacrificing progressive rendering while the worker is alive.
    if (text || thinking) publishCareerJob(job);
    const now=Date.now();
    if (now-lastPersist > 1200 || job.reportText.length % 4096 < text.length) {
      lastPersist=now;
      job.heartbeat=now;
      void persist();
    }
  };
  let synthesisStopReason: string | undefined;
  let researchTruncated = false;
  try {
    if (job.kind === "interview") {
      // Interview streams cannot be continued after a worker restart. Clear
      // the durable partial before accepting fresh deltas so an active report
      // never displays the old partial followed by a duplicated new stream.
      startFreshReportStream(job);
      await persist();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const interviewMessages = [{role:"user",content:interviewPrepPrompt(job.input.profile || "",job.input.cv || "",job.input.jd || "")}];
      assertRequestFitsModel(provider, model, interviewMessages, resolveRequestedOutputTokens(provider, false, false));
      const output = await streamProviderRequest(provider,key,model,interviewMessages,controller.signal,false,persistText);
      job.reportText = output.accumulatedText; job.usage = output.usage; synthesisStopReason = output.stopReason;
    } else {
      // "company" and "combined" both optionally run a research stage first,
      // sharing the identical continuation loop; only the synthesis prompt
      // they build afterward differs.
      if (job.researchAvailable && !job.researchComplete) {
        job.stage="research";
        await persist();
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const initial: ResearchLoopState = {
          messages: job.researchMessages.length ? job.researchMessages : [{ role:"user", content:companyResearchPrompt(normalizeResearchIdentity(job.input)!) }],
          findings: job.findings,
          sources: job.sources,
          warnings: job.warnings,
        };
        const completed = await runResearchContinuation(
          initial,
          messages => (async () => {
            // Thrown synchronously inside an async IIFE so a budget failure
            // always surfaces as a rejected promise here — identical to how
            // a network/provider failure would already propagate through
            // this callback — rather than as a raw synchronous throw whose
            // interaction with runResearchContinuation's own error handling
            // would otherwise be unpredictable.
            assertRequestFitsModel(provider, model, messages, resolveRequestedOutputTokens(provider, true, false));
            return streamProviderRequest(provider, key, model, messages, controller.signal, true, () => {});
          })(),
          {
            signal: controller.signal,
            onTurn: async state => {
              // Anthropic's pause_turn protocol resumes from provider-owned
              // blocks verbatim. `runResearchContinuation` receives only a
              // complete StreamAssembler result, never a partial stream.
              job.researchMessages = state.messages;
              job.findings = state.findings;
              job.sources = state.sources;
              job.warnings = state.warnings;
              await persist();
              if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
            },
          },
        );
        job.researchMessages = completed.messages;
        job.findings = completed.findings;
        job.sources = completed.sources;
        job.warnings = completed.warnings;
        job.researchComplete = true;
        researchTruncated = Boolean(completed.truncated);
        await persist();
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      }
      job.stage="synthesis";
      startFreshReportStream(job);
      await persist();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const prompt = job.kind === "combined"
        ? careerReportPrompt({
            cv: job.input.cv, jobDescription: job.input.jd, profile: job.input.profile,
            companyName: job.input.companyName, companyUrl: job.input.companyUrl, companyInfo: job.input.companyInfo,
            jobTitle: job.input.title, seniority: job.input.seniority, location: job.input.location, stage: job.input.stage,
          }, job.findings, job.researchAvailable, job.sources)
        : companySynthesisPrompt(job.input.jd || "",job.findings,job.researchAvailable,job.input.cv || "",job.sources);
      const synthesisMessages = [{ role:"user", content:prompt }];
      assertRequestFitsModel(provider, model, synthesisMessages, resolveRequestedOutputTokens(provider, false, false));
      const synthesis = await streamProviderRequest(provider,key,model,synthesisMessages,controller.signal,false,persistText);
      job.reportText = synthesis.accumulatedText; job.usage=synthesis.usage; synthesisStopReason = synthesis.stopReason;
    }
    job.validation = validateReport(job.reportText, job.kind, job.sources.map(s => s.id), !job.researchAvailable);
    // The provider truncated a leg before it finished; reuse the existing
    // "regenerate recommended" schema-finding path rather than adding a new
    // UI affordance, since a truncated report may still have every heading
    // present and pass structural validation otherwise.
    if (researchTruncated) {
      job.validation.findings = [...job.validation.findings, { kind:"schema", message:"Research reached the provider's token limit before finishing; findings may be incomplete — regenerate for fuller research." }];
      job.validation.valid = false;
    }
    if (synthesisStopReason === "max_tokens") {
      job.validation.findings = [...job.validation.findings, { kind:"schema", message:"Report was truncated at the provider's output token limit — regenerate for a complete report." }];
      job.validation.valid = false;
    }
    if (job.status !== "error") { job.status="complete"; job.stage="complete"; }
  } catch (error) { if (job.status !== "error") { job.status=controller.signal.aborted ? "cancelled" : "error"; job.error=error instanceof Error ? error.message : "Unknown provider error"; } }
  finally { controllers.delete(job.id); stopHeartbeat(job.id); job.heartbeat=undefined; await persist(); }
}
async function settings() {
  return get<{ careerProvider?:Provider; careerApiKey?:string; careerModel?:string; careerOpenAiApiKey?:string; careerOpenAiModel?:string }>(
    ["careerProvider","careerApiKey","careerModel","careerOpenAiApiKey","careerOpenAiModel"],
  );
}
type Settings = Awaited<ReturnType<typeof settings>>;
/** The active provider and its own key/model — never the other provider's. Every model value passes through the verified catalog, so a stale or forged custom model ID can never reach a provider request. */
function providerAuth(auth: Settings, provider: Provider): { key?:string; model:string } {
  return provider === "openai"
    ? { key:auth.careerOpenAiApiKey, model:resolveKnownModel("openai", auth.careerOpenAiModel) }
    : { key:auth.careerApiKey, model:resolveKnownModel("anthropic", auth.careerModel) };
}
const storageFailureMessage = (error: unknown): string => error instanceof Error ? error.message : "This report could not be saved. Copy the report text now if you need it.";

export async function handleCareerMessage(request: Record<string, unknown>, status:{ locked:boolean }): Promise<unknown> {
  if (!status.locked) return { ok:false, error:"Career Tools are unavailable until trusted storage is enabled." };
  if (request.action === "CAREER_LIST") {
    const { jobs, unreadableCount } = await readJobsWithDiagnostics();
    const annotated = await mergeWithPending(jobs);
    return { ok:true, jobs:annotated, unreadableCount, storageBytes: byteSize(JSON.stringify(jobs)) };
  }
  if (request.action === "CAREER_CANCEL") { const job=await latest(String(request.id)); controllers.get(String(request.id))?.abort(); if (job && !controllers.has(job.id)) { job.status="cancelled"; try { await saveJob(job); } catch { /* best-effort: the job is already stopped either way */ } } return { ok:true }; }
  if (request.action === "CAREER_DELETE") {
    await set({ [JOB_KEY]:(await readJobs()).filter(job => job.id !== request.id) });
    await clearPendingJob(String(request.id)).catch(() => undefined);
    const savedIds = await retryPendingJobsOldestFirst();
    return { ok:true, savedIds };
  }
  if (request.action === "CAREER_CLEAR_ALL") {
    // Explicit bulk clear: unlike CAREER_DELETE, this must not resurrect a
    // session-anchored ("unsaved") job afterward — the user asked for every
    // saved report gone, not just the durable ones.
    await set({ [JOB_KEY]: [] });
    await clearAllPendingJobs().catch(() => undefined);
    return { ok:true };
  }
  if (request.action === "CAREER_SAVE_JOB") {
    const requestedJob = request.job && typeof request.job === "object" ? request.job as Record<string, unknown> : undefined;
    const id = typeof request.id === "string" && request.id ? request.id : typeof requestedJob?.id === "string" ? requestedJob.id : "";
    if (!id) return { ok:false, error:"Missing report id." };

    if (!requestedJob) {
      // Retry-by-id: re-attempt saving whatever is currently anchored
      // (local or session) for this job — never evicts or edits any other job.
      const current = await latestAnnotated(id);
      if (!current) return { ok:false, error:"No recoverable report found for that id." };
      const { unsaved: _unsaved, ...job } = current;
      try { await saveJob(job); return { ok:true, job: (await latestAnnotated(id)) ?? job }; }
      catch (error) { return { ok:false, error: storageFailureMessage(error) }; }
    }

    // Full-record retry submitted from an open report tab: it is untrusted
    // and goes through the same ingress every stored record passes.
    const normalized = normalizePersistedJob(requestedJob);
    if (!normalized || normalized.id !== id) return { ok:false, error:"That report's data could not be validated." };
    const anchor = await latestAnnotated(id);
    let job: CareerJob;
    if (anchor) {
      const { unsaved: _unsavedAnchor, ...anchorJob } = anchor;
      if (fixedFingerprint(anchorJob as unknown as BoundableJob) === fixedFingerprint(normalized as unknown as BoundableJob)) {
        // Same identity/context: accept only the tab's mutable/growth fields, retaining the anchor's fixed part untouched.
        job = {
          ...anchorJob, status:normalized.status as JobStatus, stage:normalized.stage, reportText:normalized.reportText,
          findings:normalized.findings, sources:normalized.sources, researchMessages:normalized.researchMessages,
          warnings:normalized.warnings, generation:normalized.generation, researchComplete:normalized.researchComplete,
          heartbeat:normalized.heartbeat, error:normalized.error, usage:normalized.usage, validation:normalized.validation as Validation | undefined,
        };
      } else {
        job = { ...anchorJob, warnings: [...anchorJob.warnings, "context: the open report tab's data no longer matches this report's saved context; only its progress fields were retried."] };
      }
    } else {
      job = normalized as unknown as CareerJob;
    }
    try { await saveJob(job); return { ok:true, job: (await latestAnnotated(id)) ?? job }; }
    catch (error) { return { ok:false, error: storageFailureMessage(error) }; }
  }
  if (request.action === "ENSURE_JOB") {
    const annotated = await latestAnnotated(String(request.id));
    if (!annotated) return { ok:false, error:"Report not found." };
    const { unsaved: _unsaved, ...job } = annotated;
    // Jobs persisted before multi-provider support carry no provider field;
    // they were always Anthropic.
    job.provider = job.provider || "anthropic";
    job.model = job.model || DEFAULT_MODEL[job.provider];
    if (jobNeedsResume(job, controllers.has(job.id))) {
      // A worker can disappear during a stream. The last complete research
      // assistant message is durable, so resume from it; an incomplete stream
      // was never stored and is safely requested again.
      job.status="interrupted";
      job.error="The extension worker was interrupted; resuming from saved progress.";
      try { await saveJob(job); } catch (error) { return { ok:false, error: storageFailureMessage(error) }; }
      const auth=await settings();
      const { key, model } = providerAuth(auth, job.provider);
      if (!key) return { ok:true, job: (await latestAnnotated(job.id)) ?? job };
      job.model = model;
      job.generation += 1;
      job.status="running";
      job.error=undefined;
      job.heartbeat=Date.now();
      try { await saveJob(job); }
      catch (error) { job.status="error"; job.error=storageFailureMessage(error); return { ok:true, job }; }
      void runJob(job, key, model);
    }
    return { ok:true, job: (await latestAnnotated(job.id)) ?? job };
  }
  const auth=await settings();
  // Regenerate passes the job's own provider explicitly so a re-run never
  // silently switches vendors just because the popup's global setting has
  // since changed; a fresh job from the popup has no provider opinion of its
  // own and falls through to the current global setting.
  const requestedProvider = request.action === "CAREER_RUN" && (request.provider === "openai" || request.provider === "anthropic") ? request.provider as Provider : undefined;
  const provider: Provider = requestedProvider || (auth.careerProvider === "openai" ? "openai" : "anthropic");
  const { key, model } = providerAuth(auth, provider);
  if (!key) return { ok:false, error:`Add an ${PROVIDER_LABEL[provider]} API key first.` };
  if (request.action === "CAREER_TEST") {
    if (!request.previewed) return { ok:false, error:"Review the transmission preview and explicitly test the connection." };
    const testMessages = [{role:"user",content:"OK"}];
    try { assertRequestFitsModel(provider, model, testMessages, resolveRequestedOutputTokens(provider, false, true)); }
    catch (error) { return { ok:false, error: error instanceof Error ? error.message : "Request too large for the selected model." }; }
    const response=await streamProviderRequest(provider,key,model,testMessages,new AbortController().signal,false,()=>{},true);
    return response.authenticated ? { ok:true } : { ok:false,error:"The provider did not establish an authenticated stream." };
  }
  if (request.action !== "CAREER_RUN" || !request.previewed) return { ok:false, error:"Review the transmission preview and confirm before running." };
  const raw=(request.input || {}) as Record<string, unknown>;
  const kind: CareerKind = raw.kind === "company" ? "company" : raw.kind === "combined" ? "combined" : "interview";
  const needsIdentity = kind === "company" || kind === "combined";
  const identity = needsIdentity ? normalizeResearchIdentity(raw) : null;
  const input = kind === "combined"
    ? normalizeCareerInput(raw)
    : Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "kind" && key !== "research").map(([key,value]) => [key,cleanText(value)]));
  const job: CareerJob = { id:crypto.randomUUID(), kind, status:"queued", stage:needsIdentity && identity ? "research" : "synthesis", provider, model, input, reportText:"", findings:"", sources:[], researchMessages:[], researchAvailable:Boolean(identity && raw.research !== false), warnings:needsIdentity && !identity ? ["No valid LinkedIn company URL: no web research was performed."] : [], generation:1, createdAt:Date.now() };
  try { await saveJob(job); }
  catch (error) { return { ok:false, error: storageFailureMessage(error) }; }
  job.status="running"; job.heartbeat=Date.now();
  try { await saveJob(job); }
  catch (error) { return { ok:false, error: storageFailureMessage(error) }; }
  void runJob(job,key,model);
  return { ok:true, jobId:job.id };
}
