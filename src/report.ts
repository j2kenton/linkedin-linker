import { renderMarkdown } from "./render/markdown";
import { COMBINED_HEADINGS, COMPANY_HEADINGS, INTERVIEW_HEADINGS } from "./prompts/common";
import { reconnectDelay } from "./report/reconnect";
import { isExtensionContextAlive } from "./runtime/context";

type Job = {
  id: string;
  kind: "company" | "interview" | "combined";
  status: string;
  stage: string;
  provider: "anthropic" | "openai";
  model?: string;
  createdAt?: number;
  reportText: string;
  error?: string;
  input: Record<string, string>;
  sources: { id: string; url: string; title?: string; citedText?: string }[];
  warnings?: string[];
  researchAvailable: boolean;
  validation?: { findings: { message: string; kind: string; line?: string }[]; withheldSections: string[]; invalidEstimateSections: string[] };
  /** True only when this job's freshest known state lives in the session recovery register rather than durable local storage. */
  unsaved?: boolean;
};

const HEADINGS_BY_KIND: Record<Job["kind"], readonly string[]> = {
  company: COMPANY_HEADINGS,
  interview: INTERVIEW_HEADINGS,
  combined: COMBINED_HEADINGS,
};

const FIELD_LABEL: Record<string, string> = {
  cv: "CV / resume", profile: "Interviewer profile / notes", companyName: "Company name", companyUrl: "Company LinkedIn URL",
  companyInfo: "Company information", title: "Role title", seniority: "Seniority", location: "Location",
  jd: "Job description", stage: "Interview stage",
};

const id = new URLSearchParams(location.search).get("job");
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const report = document.querySelector<HTMLElement>("#report")!;
let current: Job | undefined;
let port: chrome.runtime.Port | undefined;
let reconnectTimer: number | undefined;
let reconnectAttempts = 0;
let closing = false;
let contextLost = false;

/**
 * Terminal state for an orphaned tab: the extension was reloaded/updated since
 * this report page loaded, so chrome.runtime.connect can never succeed again
 * from this document. Stop the reconnect loop (otherwise it spins and its dead
 * chrome-extension:// resolutions flood the network log as .../invalid/) and
 * tell the user the one thing that fixes it — a reload. The saved report is
 * untouched; reloading re-subscribes to it.
 */
function reportContextLost(): void {
  contextLost = true;
  if (reconnectTimer !== undefined) { clearTimeout(reconnectTimer); reconnectTimer = undefined; }
  status.textContent = "Career Connect was reloaded or updated, so this tab lost its live connection. Reload this tab to reconnect — your saved report is safe.";
}

function isActive(job = current): boolean {
  return !job || ["running", "queued", "interrupted"].includes(job.status);
}

/** Places a compact "Copy" button inline on each section's rendered heading, wired to that section's raw Markdown slice. */
function copySections(job: Job): void {
  const headings = HEADINGS_BY_KIND[job.kind];
  const headingElements = [...report.querySelectorAll<HTMLElement>("h1, h2, h3")];
  for (const heading of headings) {
    const start = job.reportText.indexOf(heading);
    if (start < 0) continue;
    // Exclude the current heading from the boundary search — otherwise a
    // section body that happens to echo its own heading text (e.g. quoting
    // it verbatim) truncates the copied slice at that echo instead of at the
    // next real section.
    const later = headings.filter(item => item !== heading).map(item => job.reportText.indexOf(item, start + heading.length)).filter(index => index >= 0).sort((a, b) => a - b)[0];
    const text = job.reportText.slice(start, later === undefined ? undefined : later);
    const title = heading.replace(/^##\s*/, "");
    // Only headings that actually rendered as h1/h2/h3 get a button — a
    // heading string present in reportText but absent from the DOM (e.g.
    // withheld) has nowhere safe to anchor one.
    const element = headingElements.find(item => item.textContent?.startsWith(title));
    if (!element) continue;
    const button = document.createElement("button");
    button.className = "section-copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", `Copy ${title}`);
    wireCopyButton(button, () => text);
    element.append(button);
  }
}

/**
 * Announces a copy outcome in the shared visually-hidden `role="status"`
 * region, so screen readers hear the result without focus leaving the button.
 * The region is cleared after ~2s (matching the button-label reset) so a
 * repeat of the same outcome still registers as a content change and gets
 * re-announced. One shared timer: a newer announcement supersedes the
 * pending clear of an older one.
 */
let announceTimer: number | undefined;
function announceCopyResult(message: string): void {
  const region = document.querySelector<HTMLElement>("#copyStatus");
  if (!region) return;
  if (announceTimer !== undefined) clearTimeout(announceTimer);
  region.textContent = message;
  announceTimer = window.setTimeout(() => {
    region.textContent = "";
    announceTimer = undefined;
  }, 2000);
}

/**
 * Wires a copy button to show transient feedback: "Copied!" on success,
 * "Copy failed" when the clipboard write is rejected, restoring the original
 * label after ~2s. Each click takes a sequence token and only the newest
 * click's outcome may touch the button, so an older clipboard write that
 * resolves late can never overwrite fresher feedback, and exactly one reset
 * timer is ever pending.
 */
function wireCopyButton(button: HTMLButtonElement, getText: () => string | undefined): void {
  const originalLabel = button.textContent || "Copy";
  let resetTimer: number | undefined;
  let clickSeq = 0;
  button.onclick = async () => {
    const text = getText();
    if (text === undefined) return;
    const seq = ++clickSeq;
    let succeeded = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      succeeded = false;
    }
    if (seq !== clickSeq) return;
    if (resetTimer !== undefined) clearTimeout(resetTimer);
    button.textContent = succeeded ? "Copied!" : "Copy failed";
    button.classList.toggle("copy-failed", !succeeded);
    announceCopyResult(succeeded ? "Copied to clipboard." : "Copy failed — clipboard was not available.");
    resetTimer = window.setTimeout(() => {
      button.textContent = originalLabel;
      button.classList.remove("copy-failed");
      resetTimer = undefined;
    }, 2000);
  };
}

function isSafeLinkUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function renderSources(job: Job): void {
  const section = document.querySelector<HTMLElement>("#sources")!;
  const list = document.querySelector<HTMLElement>("#sourceList")!;
  list.replaceChildren();
  for (const source of job.sources || []) {
    const label = `[${source.id}] ${source.title || source.url}`;
    if (isSafeLinkUrl(source.url)) {
      const anchor = document.createElement("a");
      anchor.href = source.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = label;
      anchor.className = "source";
      list.append(anchor);
    } else {
      const plain = document.createElement("span");
      plain.textContent = label;
      plain.className = "source unverified-reference";
      list.append(plain);
    }
    if (source.citedText) {
      const excerpt = document.createElement("p");
      excerpt.textContent = source.citedText;
      list.append(excerpt);
    }
  }
  section.hidden = !job.sources?.length;
}

function trustedText(job: Job): string {
  const withheld = job.validation?.withheldSections || [];
  if (!withheld.length) return job.reportText;
  const headings = HEADINGS_BY_KIND[job.kind];
  let text = job.reportText;
  for (const heading of withheld) {
    const start = text.indexOf(heading);
    if (start < 0) continue;
    const rest = text.slice(start + heading.length);
    const next = headings.map(item => rest.indexOf(item)).filter(index => index >= 0).sort((a, b) => a - b)[0];
    text = `${text.slice(0, start + heading.length)}\nContent withheld because it triggered a safety screen.\n${next === undefined ? "" : rest.slice(next)}`;
  }
  return text;
}

/** Consistent with the popup's History "Retry save" action: surfaces the same recovery guidance (copy the text now, retry saving) whenever this report's freshest state is only in the session recovery register. */
function renderRecoveryNotice(job: Job): void {
  const notice = document.querySelector<HTMLElement>("#recoveryNotice");
  if (!notice) return;
  notice.hidden = !job.unsaved;
  const text = document.querySelector<HTMLElement>("#recoveryNoticeText");
  if (text) text.textContent = "This report has not been saved to local storage yet — it's only recoverable until the browser closes. Copy it as Markdown now, or retry saving.";
}

function renderJob(job: Job): void {
  current = job;
  status.textContent = `${job.status}${job.stage ? ` — ${job.stage}` : ""}${job.error ? `: ${job.error}` : ""}`;
  renderRecoveryNotice(job);
  const disclaimer = document.querySelector<HTMLDivElement>("#disclaimer")!;
  disclaimer.hidden = false;
  disclaimer.textContent = job.kind === "interview"
    ? "Hypotheses from public professional content, not an assessment of the person."
    : job.kind === "combined"
      ? `AI-generated report adapted to the context you supplied — estimates and interviewer observations are hypotheses, not facts; verify before relying on them${job.researchAvailable ? "." : ". No web research was performed."}`
      : `AI-generated estimates and ranges — verify before relying on them${job.researchAvailable ? "." : ". No web research was performed."}`;
  const reasoning = document.querySelector<HTMLParagraphElement>("#reasoning")!;
  const note = job.warnings?.find(warning => warning.startsWith("reasoning:"));
  reasoning.hidden = !note;
  reasoning.textContent = note ? `Reasoning… ${note.slice(10)}` : "";
  renderMarkdown(report, trustedText(job), job.sources);
  renderGenerationContext(job);
  markInvalidEstimateSections(job);
  markInvalidEstimateRows(job);
  copySections(job);
  renderSources(job);
  const issues = document.querySelector<HTMLDivElement>("#issues")!;
  const findings = job.validation?.findings || [];
  issues.hidden = !findings.length;
  issues.textContent = findings.length ? `Structure issues — regenerate recommended: ${findings.map(finding => finding.message).join("; ")}` : "";
  for (const heading of job.validation?.withheldSections || []) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `Show withheld content: ${heading.replace(/^##\s*/, "")}`;
    const pre = document.createElement("pre");
    const start = job.reportText.indexOf(heading);
    pre.textContent = start < 0 ? "" : job.reportText.slice(start);
    details.append(summary, pre);
    report.append(details);
  }
}

/** Renders the collapsed "Generation context" section: the exact input snapshot and provider/model metadata used to generate this report. All text is inserted via textContent, never innerHTML — the snapshot may contain arbitrary user- or page-derived text. */
function renderGenerationContext(job: Job): void {
  const container = document.querySelector<HTMLElement>("#generationContext");
  if (!container) return;
  container.replaceChildren();
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Generation context";
  details.append(summary);

  const meta = document.createElement("p");
  const metaParts = [
    `Provider: ${job.provider}`,
    job.model ? `Model: ${job.model}` : "Model: (not recorded — generated before model tracking was added)",
    `Research: ${job.researchAvailable ? "performed" : "not performed"}`,
    job.createdAt ? `Created: ${new Date(job.createdAt).toLocaleString()}` : "",
  ].filter(Boolean);
  meta.textContent = metaParts.join(" · ");
  details.append(meta);

  const entries = Object.entries(job.input || {}).filter(([key]) => !key.endsWith("Source") && key !== "kind" && key !== "research");
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No input snapshot is available for this report.";
    details.append(empty);
  }
  for (const [key, value] of entries) {
    if (!value) continue;
    const label = document.createElement("p");
    const strong = document.createElement("strong");
    const source = (job.input || {})[`${key}Source`];
    strong.textContent = `${FIELD_LABEL[key] || key}${source ? ` [${source}]` : ""}:`;
    label.append(strong);
    details.append(label);
    const pre = document.createElement("pre");
    pre.textContent = value;
    details.append(pre);
  }

  container.append(details);
}

/** Marks each estimate-bearing section the validator flagged, so a grammar failure is visible where it occurred. */
function markInvalidEstimateSections(job: Job): void {
  const invalid = job.validation?.invalidEstimateSections || [];
  if (!invalid.length) return;
  const headingElements = [...report.querySelectorAll<HTMLElement>("h1, h2, h3")];
  for (const heading of invalid) {
    const title = heading.replace(/^##\s*/, "");
    const element = headingElements.find(item => item.textContent?.startsWith(title));
    if (!element) continue;
    const badge = document.createElement("span");
    badge.className = "estimate-invalid-badge";
    badge.textContent = " ⚠ estimates failed validation";
    element.append(badge);
  }
}

/** Flags the individual malformed table row or out-of-table quantitative claim the validator located, not just its section. */
function markInvalidEstimateRows(job: Job): void {
  const findings = (job.validation?.findings || []).filter(finding => finding.kind === "estimate" && finding.line !== undefined);
  if (!findings.length) return;
  const lines = trustedText(job).split(/\r?\n/);
  const claimed = new Set<number>();
  for (const finding of findings) {
    const target = (finding.line as string).trim();
    const index = lines.findIndex((line, position) => !claimed.has(position) && line.trim() === target);
    if (index < 0) continue;
    // Tables/lists no longer keep a 1:1 index alignment with report.children,
    // so the source line is looked up via the data-md-line stamp the
    // renderer attaches to every element that maps to exactly one line.
    const element = report.querySelector<HTMLElement>(`[data-md-line="${index}"]`);
    if (!element) continue;
    claimed.add(index);
    const badge = document.createElement("span");
    badge.className = "estimate-row-invalid-badge";
    badge.textContent = finding.message.startsWith("Malformed") ? " ⚠ malformed row" : " ⚠ claim outside table";
    // A stray inline element appended directly to a <tr> gets reparented out
    // of the table by the browser; anchor it inside the row's last cell instead.
    const host = element.tagName === "TR" ? element.querySelector("td:last-child") || element : element;
    host.append(badge);
  }
}

function scheduleReconnect(): void {
  if (closing || contextLost || !isActive() || reconnectTimer !== undefined) return;
  // A dead runtime never recovers without a reload; retrying would only spin
  // and emit chrome-extension://invalid/ requests. A merely-cycled service
  // worker leaves this page's context alive, so that case still reconnects.
  if (!isExtensionContextAlive()) { reportContextLost(); return; }
  const delay = reconnectDelay(reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
}

function connect(): void {
  if (!id || closing || contextLost || port) return;
  try {
    const nextPort = chrome.runtime.connect({ name:"career-report" });
    port = nextPort;
    nextPort.onMessage.addListener(message => {
      if (message?.type === "CAREER_JOB") {
        reconnectAttempts = 0;
        renderJob(message.job as Job);
      }
      if (message?.type === "CAREER_ERROR") status.textContent = String(message.error || "Report not found.");
    });
    nextPort.onDisconnect.addListener(() => {
      if (port !== nextPort) return;
      port = undefined;
      if (isActive()) {
        status.textContent = "Report connection interrupted; refreshing saved progress…";
        scheduleReconnect();
      }
    });
    nextPort.postMessage({ action:"CAREER_SUBSCRIBE", id });
  } catch {
    port = undefined;
    if (!isExtensionContextAlive()) { reportContextLost(); return; }
    status.textContent = "Unable to connect to the report worker; retrying…";
    scheduleReconnect();
  }
}

wireCopyButton(document.querySelector<HTMLButtonElement>("#copy")!, () => current?.reportText);
document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => chrome.runtime.sendMessage({ action:"CAREER_CANCEL", id });
document.querySelector<HTMLButtonElement>("#retrySave")?.addEventListener("click", async () => {
  // Sending the tab's own in-memory copy (when available) lets the worker
  // rebuild the report even if its recovery anchor was lost after this tab
  // loaded — an id-only retry can only re-attempt whatever the worker still
  // has anchored, which is null in that case.
  const response = await chrome.runtime.sendMessage({ action:"CAREER_SAVE_JOB", id, job:current });
  status.textContent = response?.ok ? `${current?.status || ""} — saved.` : (response?.error || "Could not save this report.");
});
document.querySelector<HTMLButtonElement>("#regenerate")!.onclick = async () => {
  if (!current) return;
  const preview = current.kind === "company"
    ? `Research stage (no CV/JD): ${JSON.stringify({ companyName:current.input.companyName, companyNameSource:current.input.companyNameSource, companyUrl:current.input.companyUrl, companyUrlSource:current.input.companyUrlSource, title:current.input.title, titleSource:current.input.titleSource, seniority:current.input.seniority, senioritySource:current.input.senioritySource, location:current.input.location, locationSource:current.input.locationSource })}\n\nSynthesis stage (no web access): ${JSON.stringify({ cv:current.input.cv || "", jd:current.input.jd || "", jdSource:current.input.jdSource, research:"saved findings" })}`
    : JSON.stringify(current.input);
  // Regenerating deliberately reuses the job's own provider, not whatever is
  // currently selected in the popup, so a report never silently switches
  // which vendor its data goes to on re-run.
  const providerName = current.provider === "openai" ? "OpenAI" : "Anthropic";
  if (!window.confirm(`Transmission preview — regenerate will send the following saved data to ${providerName} (the provider this report was created with):\n\n${preview}\n\nContinue?`)) return;
  const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", previewed:true, provider:current.provider, input:{ kind:current.kind, ...current.input, research:current.researchAvailable } });
  if (response.ok) location.replace(`report.html?job=${encodeURIComponent(response.jobId)}`);
  else status.textContent = response.error;
};

window.addEventListener("beforeunload", () => {
  closing = true;
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
  port?.disconnect();
});

if (!id) status.textContent = "Missing report id.";
else connect();
