import { interviewPrepPrompt } from "./prompts/interviewPrep";
import { companyResearchPrompt } from "./prompts/companyIntelResearch";
import { companySynthesisPrompt } from "./prompts/companyIntelSynthesis";
import { validateReport, type Validation } from "./validate/report";
import { DEFAULT_MODEL, streamProviderRequest } from "./aiClient/provider";
import { runResearchContinuation, type CareerSource, type ResearchLoopState } from "./aiClient/research";

export { buildRequestBody, classifyProviderError } from "./aiClient/provider";
export { appendResearchContinuation, runResearchContinuation, type ResearchLoopState } from "./aiClient/research";

export type CareerKind = "interview" | "company";
export type JobStatus = "queued" | "running" | "complete" | "error" | "cancelled" | "interrupted";
export interface CareerJob {
  id: string; kind: CareerKind; status: JobStatus; stage: "research" | "synthesis" | "complete";
  input: Record<string, string>; reportText: string; findings: string; sources: CareerSource[];
  researchMessages: Record<string, unknown>[]; researchAvailable: boolean; warnings: string[]; generation: number;
  /** Set only after a research response reaches end_turn. */
  researchComplete?: boolean;
  heartbeat?: number; error?: string; usage?: Record<string, unknown>; validation?: Validation; createdAt: number;
}
const JOB_KEY = "careerToolJobs"; const MAX_JOBS = 10; const MAX_JOB_BYTES = 4 * 1024 * 1024;
const controllers = new Map<string, AbortController>(); const heartbeats = new Map<string, number>();
const jobListeners = new Map<string, Set<(job: CareerJob) => void>>();
const get = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));
const set = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
const cleanText = (value: unknown, max = 30000) => String(value || "").normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
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
async function readJobs(): Promise<CareerJob[]> { return (await get<Record<string, CareerJob[]>>([JOB_KEY]))[JOB_KEY] || []; }
/** Applies the bounded local-retention policy before a job record is persisted. */
export function retainJobsForStorage(jobs: CareerJob[]): CareerJob[] { const kept = jobs.slice(0, MAX_JOBS); while (kept.length && new Blob([JSON.stringify(kept)]).size > MAX_JOB_BYTES) kept.pop(); return kept; }
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
async function saveJob(job: CareerJob, guardGeneration = false): Promise<void> {
  const existing = await latest(job.id);
  // A resumed worker run owns a higher generation. Never let a stale async run
  // overwrite its durable state after it has been superseded.
  if (!acceptsJobWrite(existing?.generation, job.generation, guardGeneration)) return;
  const jobs = (await readJobs()).filter(item => item.id !== job.id);
  jobs.unshift(job);
  await set({ [JOB_KEY]:retainJobsForStorage(jobs) });
  publishCareerJob(job);
}
async function latest(id: string): Promise<CareerJob | undefined> { return (await readJobs()).find(j => j.id === id); }
// The service worker is a singleton per extension: if this instance's
// in-memory `controllers` map does not hold the job, no execution of it is
// underway anywhere, regardless of how recently a heartbeat was written by a
// now-dead prior instance. Gating on heartbeat staleness on top of `isLive`
// left a job stuck "running" forever whenever a report page reconnected
// within 40s of the worker being killed.
export function jobNeedsResume(job: Pick<CareerJob, "status" | "heartbeat">, isLive: boolean, _now = Date.now()): boolean {
  return job.status === "running" && !isLive;
}
function startHeartbeat(job: CareerJob): void { stopHeartbeat(job.id); heartbeats.set(job.id, setInterval(() => { job.heartbeat=Date.now(); void saveJob(job, true); }, 20_000) as unknown as number); }
function stopHeartbeat(id:string): void { const timer=heartbeats.get(id); if (timer) clearInterval(timer); heartbeats.delete(id); }
/** A restarted stream must replace, not append to, its stale partial output. */
export function startFreshReportStream(job: Pick<CareerJob, "reportText" | "warnings">): void {
  job.reportText = "";
  job.warnings = job.warnings.filter(warning => !warning.startsWith("reasoning:"));
}
async function runJob(job: CareerJob, key:string, model:string): Promise<void> {
  const controller = new AbortController(); controllers.set(job.id, controller); startHeartbeat(job); let lastPersist=0;
  const persist = () => saveJob(job, true);
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
  try {
    if (job.kind === "interview") {
      // Interview streams cannot be continued after a worker restart. Clear
      // the durable partial before accepting fresh deltas so an active report
      // never displays the old partial followed by a duplicated new stream.
      startFreshReportStream(job);
      await persist();
      const output = await streamProviderRequest(key,model,[{role:"user",content:interviewPrepPrompt(job.input.profile || "",job.input.cv || "",job.input.jd || "")}],controller.signal,false,persistText);
      job.reportText = output.accumulatedText; job.usage = output.usage;
    } else {
      if (job.researchAvailable && !job.researchComplete) {
        job.stage="research";
        await persist();
        const initial: ResearchLoopState = {
          messages: job.researchMessages.length ? job.researchMessages : [{ role:"user", content:companyResearchPrompt(normalizeResearchIdentity(job.input)!) }],
          findings: job.findings,
          sources: job.sources,
          warnings: job.warnings,
        };
        const completed = await runResearchContinuation(
          initial,
          messages => streamProviderRequest(key, model, messages, controller.signal, true, () => {}),
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
            },
          },
        );
        job.researchMessages = completed.messages;
        job.findings = completed.findings;
        job.sources = completed.sources;
        job.warnings = completed.warnings;
        job.researchComplete = true;
        await persist();
      }
      job.stage="synthesis";
      startFreshReportStream(job);
      await persist();
      const synthesis = await streamProviderRequest(key,model,[{ role:"user", content:companySynthesisPrompt(job.input.jd || "",job.findings,job.researchAvailable,job.input.cv || "",job.sources) }],controller.signal,false,persistText);
      job.reportText = synthesis.accumulatedText; job.usage=synthesis.usage;
    }
    job.validation = validateReport(job.reportText, job.kind, job.sources.map(s => s.id), !job.researchAvailable);
    job.status="complete"; job.stage="complete";
  } catch (error) { job.status=controller.signal.aborted ? "cancelled" : "error"; job.error=error instanceof Error ? error.message : "Unknown provider error"; }
  finally { controllers.delete(job.id); stopHeartbeat(job.id); job.heartbeat=undefined; await persist(); }
}
async function settings() { return get<{ careerApiKey?:string; careerModel?:string; aiConsentGiven?:boolean }>(["careerApiKey","careerModel","aiConsentGiven"]); }
export async function handleCareerMessage(request: Record<string, unknown>, status:{ locked:boolean }): Promise<unknown> {
  if (!status.locked) return { ok:false, error:"Career Tools are unavailable until trusted storage is enabled." };
  if (request.action === "CAREER_LIST") return { ok:true, jobs:await readJobs() };
  if (request.action === "CAREER_CANCEL") { const job=await latest(String(request.id)); controllers.get(String(request.id))?.abort(); if (job && !controllers.has(job.id)) { job.status="cancelled"; await saveJob(job); } return { ok:true }; }
  if (request.action === "CAREER_DELETE") { await set({ [JOB_KEY]:(await readJobs()).filter(job => job.id !== request.id) }); return { ok:true }; }
  if (request.action === "ENSURE_JOB") {
    const job=await latest(String(request.id));
    if (!job) return { ok:false, error:"Report not found." };
    if (jobNeedsResume(job, controllers.has(job.id))) {
      // A worker can disappear during a stream. The last complete research
      // assistant message is durable, so resume from it; an incomplete stream
      // was never stored and is safely requested again.
      job.status="interrupted";
      job.error="The extension worker was interrupted; resuming from saved progress.";
      await saveJob(job);
      const auth=await settings();
      if (!auth.careerApiKey) return { ok:true, job };
      job.generation += 1;
      job.status="running";
      job.error=undefined;
      job.heartbeat=Date.now();
      await saveJob(job);
      void runJob(job, auth.careerApiKey, auth.careerModel || DEFAULT_MODEL);
    }
    return { ok:true, job };
  }
  const auth=await settings(); if (!auth.careerApiKey) return { ok:false, error:"Add an Anthropic API key first." };
  const model=auth.careerModel || DEFAULT_MODEL;
  if (request.action === "CAREER_TEST") {
    if (!request.consent || !request.previewed || !auth.aiConsentGiven) return { ok:false, error:"Review the transmission preview, consent, and explicitly test the connection." };
    const response=await streamProviderRequest(auth.careerApiKey,model,[{role:"user",content:"OK"}],new AbortController().signal,false,()=>{},true);
    return response.authenticated ? { ok:true } : { ok:false,error:"The provider did not establish an authenticated stream." };
  }
  if (request.action !== "CAREER_RUN" || !request.consent || !request.previewed || !auth.aiConsentGiven) return { ok:false, error:"Review the transmission preview and confirm consent before running." };
  const raw=(request.input || {}) as Record<string, unknown>; const kind=raw.kind === "company" ? "company" : "interview";
  const identity=kind === "company" ? normalizeResearchIdentity(raw) : null;
  const input=Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "kind" && key !== "research").map(([key,value]) => [key,cleanText(value)]));
  const job: CareerJob = { id:crypto.randomUUID(), kind, status:"queued", stage:kind === "company" && identity ? "research" : "synthesis", input, reportText:"", findings:"", sources:[], researchMessages:[], researchAvailable:Boolean(identity && raw.research !== false), warnings:identity || kind === "interview" ? [] : ["No valid LinkedIn company URL: no web research was performed."], generation:1, createdAt:Date.now() };
  await saveJob(job); job.status="running"; job.heartbeat=Date.now(); await saveJob(job); void runJob(job,auth.careerApiKey,model);
  return { ok:true, jobId:job.id };
}
