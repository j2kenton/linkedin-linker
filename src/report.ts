import { renderMarkdown } from "./render/markdown";
import { COMPANY_HEADINGS, INTERVIEW_HEADINGS } from "./prompts/common";
import { reconnectDelay } from "./report/reconnect";

type Job = {
  id: string;
  kind: "company" | "interview";
  status: string;
  stage: string;
  provider: "anthropic" | "openai";
  reportText: string;
  error?: string;
  input: Record<string, string>;
  sources: { id: string; url: string; title?: string; citedText?: string }[];
  warnings?: string[];
  researchAvailable: boolean;
  validation?: { findings: { message: string; kind: string; line?: string }[]; withheldSections: string[]; invalidEstimateSections: string[] };
};

const id = new URLSearchParams(location.search).get("job");
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const report = document.querySelector<HTMLElement>("#report")!;
let current: Job | undefined;
let port: chrome.runtime.Port | undefined;
let reconnectTimer: number | undefined;
let reconnectAttempts = 0;
let closing = false;

function isActive(job = current): boolean {
  return !job || ["running", "queued", "interrupted"].includes(job.status);
}

function copySections(job: Job): void {
  const root = document.querySelector<HTMLElement>("#sectionCopy")!;
  root.replaceChildren();
  const headings = job.kind === "company" ? COMPANY_HEADINGS : INTERVIEW_HEADINGS;
  for (const heading of headings) {
    const start = job.reportText.indexOf(heading);
    if (start < 0) continue;
    const later = headings.map(item => job.reportText.indexOf(item, start + heading.length)).filter(index => index >= 0).sort((a, b) => a - b)[0];
    const text = job.reportText.slice(start, later === undefined ? undefined : later);
    const button = document.createElement("button");
    button.textContent = `Copy ${heading.replace(/^##\s*/, "")}`;
    button.onclick = () => navigator.clipboard.writeText(text);
    root.append(button);
  }
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
  const headings = job.kind === "company" ? COMPANY_HEADINGS : INTERVIEW_HEADINGS;
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

function renderJob(job: Job): void {
  current = job;
  status.textContent = `${job.status}${job.stage ? ` — ${job.stage}` : ""}${job.error ? `: ${job.error}` : ""}`;
  const disclaimer = document.querySelector<HTMLDivElement>("#disclaimer")!;
  disclaimer.hidden = false;
  disclaimer.textContent = job.kind === "company"
    ? `AI-generated estimates and ranges — verify before relying on them${job.researchAvailable ? "." : ". No web research was performed."}`
    : "Hypotheses from public professional content, not an assessment of the person.";
  const reasoning = document.querySelector<HTMLParagraphElement>("#reasoning")!;
  const note = job.warnings?.find(warning => warning.startsWith("reasoning:"));
  reasoning.hidden = !note;
  reasoning.textContent = note ? `Reasoning… ${note.slice(10)}` : "";
  renderMarkdown(report, trustedText(job), job.sources);
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
  const elements = [...report.children] as HTMLElement[];
  const claimed = new Set<number>();
  for (const finding of findings) {
    const target = (finding.line as string).trim();
    const index = lines.findIndex((line, position) => !claimed.has(position) && line.trim() === target);
    if (index < 0 || !elements[index]) continue;
    claimed.add(index);
    const badge = document.createElement("span");
    badge.className = "estimate-row-invalid-badge";
    badge.textContent = finding.message.startsWith("Malformed") ? " ⚠ malformed row" : " ⚠ claim outside table";
    elements[index].append(badge);
  }
}

function scheduleReconnect(): void {
  if (closing || !isActive() || reconnectTimer !== undefined) return;
  const delay = reconnectDelay(reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
}

function connect(): void {
  if (!id || closing || port) return;
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
    status.textContent = "Unable to connect to the report worker; retrying…";
    scheduleReconnect();
  }
}

document.querySelector<HTMLButtonElement>("#copy")!.onclick = () => current && navigator.clipboard.writeText(current.reportText);
document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => chrome.runtime.sendMessage({ action:"CAREER_CANCEL", id });
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
  const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", consent:true, previewed:true, provider:current.provider, input:{ kind:current.kind, ...current.input, research:current.researchAvailable } });
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
