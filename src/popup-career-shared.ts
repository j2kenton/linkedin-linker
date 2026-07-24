import { CAREER_VALUE_KEYS, FORM_ID, formToCareerInput, careerInputToForm, careerInputToSources, type CareerValueKey, type CareerValues, type CareerSources } from "./career/fields";
import { mergeExtraction, type MergeOutcome } from "./career/merge";
import { toPatch, hasUsefulCareerPatch, type ExtractTarget } from "./career/patch";
import type { JobExtraction } from "./extract/job";
import type { ProfileExtraction } from "./extract/profile";
import type { CompanyExtraction } from "./extract/company";
import type { GenericExtraction } from "./extract/generic";
import { KNOWN_MODELS, getKnownModelOption, resolveKnownModel } from "./models";
import { estimateRequestTokenUpperBound } from "./aiClient/modelBudget";
import type { Provider } from "./aiClient/provider";
import { classifyUrl, hasDeclaredContentScript, type LinkedInPageKind } from "./pageDetect";
import { readActiveTab, getExtractionCapabilities, requestBroadPageAccess, ensureExtractionHandler } from "./extract/capabilities";
import { isExtensionContextAlive, isContextInvalidatedError } from "./runtime/context";
import type { CareerJob, AnnotatedCareerJob } from "./aiClient";

/** Shown whenever this surface is orphaned by an extension reload/update — the only thing that recovers it is a page/side-panel reload. */
const RELOAD_REQUIRED_MESSAGE = "Career Connect was reloaded or updated. Reload this page (reopen the side panel), then try again.";

export type CareerExtraction = Record<string, unknown> & { ready?: boolean; warnings?: { field?: string; message: string }[] };
type AnyExtraction = JobExtraction | ProfileExtraction | CompanyExtraction | GenericExtraction;

export const careerGet = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));

export const careerSet = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));

export const careerElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const careerSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const FIELD_LABEL: Record<CareerValueKey, string> = {
  cv: "CV / resume", profile: "Interviewer profile / notes", companyName: "Company name", companyUrl: "Company LinkedIn URL",
  companyInfo: "Company information", jobTitle: "Role title", seniority: "Seniority", location: "Location",
  jobDescription: "Job description", stage: "Interview stage",
};

const TARGET_ACTION: Record<ExtractTarget, "EXTRACT_JOB" | "EXTRACT_PROFILE" | "EXTRACT_COMPANY"> = {
  job: "EXTRACT_JOB", profile: "EXTRACT_PROFILE", cv: "EXTRACT_PROFILE", company: "EXTRACT_COMPANY",
};

export interface CareerToolsOptions {
  /** Pattern the calling build's *declared* content script matches; null when it matches every page (the dev build's <all_urls>). */
  hostPattern: RegExp | null;
  careerLockPromise?: Promise<{ locked: boolean; reason?: string }>;
}

export function initCareerTools(options: CareerToolsOptions): void {
  document.addEventListener("DOMContentLoaded", () => {
    const tools = careerElement<HTMLElement>("careerTools");
    const hint = careerElement<HTMLElement>("careerHint");
    type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const field = (id: string) => careerElement<FieldEl>(id);

    const providerSelect = careerElement<HTMLSelectElement>("careerProvider");
    const currentProvider = (): Provider => providerSelect.value === "openai" ? "openai" : "anthropic";
    const providerLabel = (provider: Provider) => provider === "openai" ? "OpenAI" : "Anthropic";

    const anthropicSelect = careerElement<HTMLSelectElement>("careerModel");
    const anthropicFilter = careerElement<HTMLInputElement>("careerModelFilter");
    const openAiSelect = careerElement<HTMLSelectElement>("careerOpenAiModel");
    const openAiFilter = careerElement<HTMLInputElement>("careerOpenAiModelFilter");
    const migrationNote = careerElement<HTMLElement>("careerModelMigrationNote");
    const currentProviderModel = () => currentProvider() === "openai" ? openAiSelect.value : anthropicSelect.value;

    /** A constrained, searchable model selector: a native <select> (so only listed IDs can ever be chosen) paired with a text filter that jumps to the first match as the user types. */
    const setupModelSelect = (provider: Provider, select: HTMLSelectElement, filterInput: HTMLInputElement, onChange: (modelId: string) => void) => {
      select.replaceChildren();
      for (const option of KNOWN_MODELS[provider]) {
        const el = document.createElement("option");
        el.value = option.id; el.textContent = option.label;
        select.append(el);
      }
      select.addEventListener("change", () => onChange(select.value));
      filterInput.addEventListener("input", () => {
        const query = filterInput.value.trim().toLowerCase();
        if (!query) return;
        const match = KNOWN_MODELS[provider].find(o => o.id.toLowerCase().includes(query) || o.label.toLowerCase().includes(query));
        if (match) { select.value = match.id; onChange(match.id); }
      });
    };

    const restoreModel = (provider: Provider, select: HTMLSelectElement, saved: string) => {
      const resolved = resolveKnownModel(provider, saved);
      select.value = resolved;
      if (saved && resolved !== saved) {
        migrationNote.hidden = false;
        migrationNote.textContent = `Saved ${providerLabel(provider)} model "${saved}" is no longer supported — reset to ${getKnownModelOption(provider, resolved)?.label || resolved}.`;
      }
      return resolved;
    };

    const updateProviderUI = () => {
      const provider = currentProvider();
      careerElement<HTMLElement>("anthropicProviderFields").hidden = provider !== "anthropic";
      careerElement<HTMLElement>("openaiProviderFields").hidden = provider !== "openai";
      careerElement<HTMLElement>("careerTransmissionNotice").textContent = `Submitting sends the information shown in the transmission preview to ${providerLabel(provider)}.`;
    };

    const setResult = (id: string, text: string, kind: "success" | "error" | "pending" | "") => {
      const el = careerElement<HTMLElement>(id);
      el.hidden = !text; el.textContent = text; el.className = "career-result" + (kind ? ` ${kind}` : "");
    };

    const SOURCE_KEYS: CareerValueKey[] = CAREER_VALUE_KEYS.filter(key => key !== "stage");
    const fieldSource: Record<string, "manual" | "extracted" | "mixed"> = {};
    let approvedAction: (() => Promise<void>) | undefined;
    let pendingPreviewLabel = "Working…";
    let careerReady = false;
    const requireCareerReady = (): boolean => {
      if (careerReady) return true;
      hint.textContent = "Career Tools are not ready. Reload the extension and try again.";
      return false;
    };

    const preview = careerElement<HTMLDetailsElement>("careerPreview");
    const previewText = careerElement<HTMLPreElement>("careerPreviewText");
    const showPreview = (payload: string, action: () => Promise<void>, pendingLabel: string) => {
      if (!requireCareerReady()) return;
      approvedAction = action; pendingPreviewLabel = pendingLabel;
      setResult("careerPreviewResult", "", "");
      preview.hidden = false; preview.open = true;
      previewText.textContent = payload;
    };
    careerElement<HTMLButtonElement>("careerPreviewConfirm").onclick = async () => {
      if (!approvedAction) return;
      const action = approvedAction; approvedAction = undefined;
      const button = careerElement<HTMLButtonElement>("careerPreviewConfirm");
      const originalLabel = button.textContent;
      button.disabled = true; button.textContent = pendingPreviewLabel;
      setResult("careerPreviewResult", pendingPreviewLabel, "pending");
      try { await action(); }
      finally { button.disabled = false; button.textContent = originalLabel; }
    };

    const run = async (input: Record<string, unknown>) => {
      if (!requireCareerReady()) return;
      const provider = currentProvider();
      await careerSet(provider === "openai"
        ? { careerProvider:provider, careerOpenAiApiKey:field("careerOpenAiApiKey").value, careerOpenAiModel:openAiSelect.value }
        : { careerProvider:provider, careerApiKey:field("careerApiKey").value, careerModel:anthropicSelect.value });
      const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", previewed:true, input });
      if (!response.ok) { setResult("careerPreviewResult", response.error, "error"); return; }
      chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?job=${encodeURIComponent(response.jobId)}`) });
      setResult("careerPreviewResult", "Report opened in a new tab.", "success");
      void loadHistory();
    };

    const withPending = async (button: HTMLButtonElement, resultId: string, pendingLabel: string, task: () => Promise<{ text: string; kind: "success" | "error" }>) => {
      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = pendingLabel;
      setResult(resultId, pendingLabel, "pending");
      try {
        const { text, kind } = await task();
        setResult(resultId, text, kind);
      } finally { button.disabled = false; button.textContent = originalLabel; }
    };

    // --- Extraction ---------------------------------------------------

    type ReachOutcome = { ok: true } | { ok: false; message: string; needsGrant?: boolean };

    /**
     * Determines whether the active tab can be reached for extraction
     * without ever calling chrome.permissions or chrome.scripting when it
     * isn't needed. A readable tab.url means the declared content script (or,
     * capability permitting, on-demand injection) can be used directly; an
     * unreadable tab.url means only the capability-gated broad-page-access
     * grant can help (and only in a build that declares it).
     */
    async function ensureReachable(tab: chrome.tabs.Tab): Promise<ReachOutcome> {
      if (!tab.url) {
        const capabilities = getExtractionCapabilities();
        if (!capabilities.canRequestBroadPageAccess) return { ok:false, message:"Extraction outside LinkedIn is not available in this build." };
        return { ok:false, message:"Career Connect cannot read this tab yet.", needsGrant:true };
      }
      const kind = classifyUrl(tab.url);
      if (kind === "unsupported") return { ok:false, message:"Chrome blocks extensions from reading this kind of page." };
      if (hasDeclaredContentScript(tab.url, options.hostPattern)) return { ok:true };
      if (!tab.id) return { ok:false, message:"No active tab found." };
      const capabilities = getExtractionCapabilities();
      const handlerResult = await ensureExtractionHandler(tab.id, capabilities);
      if (handlerResult === "ready") return { ok:true };
      return { ok:false, message:"Could not run the reader; reload the tab and try again." };
    }

    async function requestExtraction(tabId: number, action: "EXTRACT_JOB" | "EXTRACT_PROFILE" | "EXTRACT_COMPANY" | "EXTRACT_PAGE"): Promise<CareerExtraction | null> {
      let lastReady: CareerExtraction | null = null;
      let lastReadyFalse: CareerExtraction | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const result = await chrome.tabs.sendMessage(tabId, { action }, { frameId:0 }) as CareerExtraction;
          if (result.ready) {
            lastReady = result;
            const stillMounting = (result.warnings || []).some(w => w.field === "sections");
            if (!stillMounting) return result;
          } else {
            lastReadyFalse = result;
          }
        } catch (error) {
          // A dead side-panel runtime can never reach any tab; retrying just
          // burns ~10s (reading as a hang) while emitting failing
          // chrome-extension://invalid/ requests. Surface the reload it needs.
          if (isContextInvalidatedError(error) || !isExtensionContextAlive()) throw error;
          /* else: content script not responding yet; retry */
        }
        if (attempt < 4) await careerSleep(1000);
      }
      return lastReady || lastReadyFalse;
    }

    const getValues = (): CareerValues => Object.fromEntries(CAREER_VALUE_KEYS.map(key => [key, field(FORM_ID[key]).value])) as CareerValues;
    const getSources = (): CareerSources => Object.fromEntries(SOURCE_KEYS.map(key => [key, fieldSource[FORM_ID[key]] || "manual"])) as CareerSources;
    const applyMerge = (outcome: MergeOutcome) => {
      const patch: Record<string, unknown> = {};
      CAREER_VALUE_KEYS.forEach(key => {
        const value = outcome.values[key];
        if (value === undefined) return;
        field(FORM_ID[key]).value = value;
        patch[FORM_ID[key]] = value;
      });
      SOURCE_KEYS.forEach(key => {
        const source = outcome.sources[key];
        if (!source) return;
        fieldSource[FORM_ID[key]] = source;
        patch[`${FORM_ID[key]}Origin`] = source;
      });
      careerSet(patch).catch(error => { hint.textContent = String(error); });
    };

    async function runExtractionForTab(tab: chrome.tabs.Tab, target: ExtractTarget): Promise<{ text: string; kind: "success" | "error" }> {
      if (!tab.id) return { text:"No active tab found.", kind:"error" };
      try {
        return await extractInto(tab, target);
      } catch (error) {
        if (isContextInvalidatedError(error) || !isExtensionContextAlive()) return { text:RELOAD_REQUIRED_MESSAGE, kind:"error" };
        throw error;
      }
    }

    async function extractInto(tab: chrome.tabs.Tab, target: ExtractTarget): Promise<{ text: string; kind: "success" | "error" }> {
      if (!tab.id) return { text:"No active tab found.", kind:"error" };
      const targeted = await requestExtraction(tab.id, TARGET_ACTION[target]);
      let patch = targeted ? toPatch(target, targeted as unknown as AnyExtraction) : {};
      let usedGeneric = false;

      if (!targeted || !hasUsefulCareerPatch(patch)) {
        const generic = await requestExtraction(tab.id, "EXTRACT_PAGE");
        if (generic && generic.ready) { patch = toPatch(target, generic as unknown as AnyExtraction, true); usedGeneric = true; }
      }

      if (!hasUsefulCareerPatch(patch)) {
        const warnings = (targeted?.warnings || []).map(w => w.message).filter(Boolean).join(" ");
        return { text: warnings || "Reached the page but found nothing new to add.", kind:"error" };
      }

      const outcome = mergeExtraction(getValues(), getSources(), patch, { url:tab.url || "", label:tab.title || tab.url || "" });
      applyMerge(outcome);
      if (!outcome.added.length) return { text:"Reached the page but found nothing new to add.", kind:"success" };
      const labels = outcome.added.map(key => FIELD_LABEL[key] || key).join(", ");
      return { text:`Added: ${labels}.${usedGeneric ? " (best-effort page extraction)" : ""}`, kind:"success" };
    }

    async function runExtraction(target: ExtractTarget): Promise<{ text: string; kind: "success" | "error" }> {
      if (!isExtensionContextAlive()) return { text:RELOAD_REQUIRED_MESSAGE, kind:"error" };
      const tab = await readActiveTab();
      if (!tab?.id) return { text:"No active tab found.", kind:"error" };

      const reachable = await ensureReachable(tab);
      if (!reachable.ok) {
        if (reachable.needsGrant) { pendingExtractTarget = target; showGrantButton(target); }
        else hideGrantButton();
        return { text:reachable.message, kind:"error" };
      }
      hideGrantButton();
      return runExtractionForTab(tab, target);
    }

    const RESULT_ID_FOR_TARGET: Record<ExtractTarget, string> = {
      job: "extractJobResult", profile: "extractProfileResult", cv: "extractCvResult", company: "extractCompanyResult",
    };

    let pendingExtractTarget: ExtractTarget | null = null;
    const allowContainer = careerElement<HTMLElement>("allowPageAccessContainer");
    const allowButton = careerElement<HTMLButtonElement>("allowPageAccessButton");

    /** Moves the single grant-access node next to whichever section initiated the request — never duplicates it, so there is only ever one click listener. */
    function showGrantButton(target: ExtractTarget): void {
      const anchor = careerElement<HTMLElement>(RESULT_ID_FOR_TARGET[target]);
      anchor.insertAdjacentElement("afterend", allowContainer);
      allowContainer.hidden = false;
      allowButton.disabled = false;
      setResult("allowPageAccessResult", "", "");
    }

    function hideGrantButton(): void {
      allowContainer.hidden = true;
    }

    allowButton.onclick = () => {
      // Per the extraction-capabilities contract, chrome.permissions.request
      // must be the first operation of this handler — no await, permission
      // inspection, or logging beforehand — or Chrome may reject the request
      // for a lost user gesture.
      const outcomePromise = requestBroadPageAccess();
      allowButton.disabled = true;
      setResult("allowPageAccessResult", "Requesting page access…", "pending");
      void (async () => {
        const outcome = await outcomePromise;
        allowButton.disabled = false;
        if (outcome.status === "granted") {
          setResult("allowPageAccessResult", "Access granted — retrying extraction…", "pending");
          const target = pendingExtractTarget;
          const tab = target ? await readActiveTab() : null;
          if (target && tab) {
            const result = await runExtractionForTab(tab, target);
            setResult(RESULT_ID_FOR_TARGET[target], result.text, result.kind);
          }
          hideGrantButton();
          return;
        }
        if (outcome.status === "declined") {
          setResult("allowPageAccessResult", "Page access was declined. Click Allow page access again, or grant it from the extension's Site access settings.", "error");
          return;
        }
        if (outcome.status === "gesture-rejected") {
          setResult("allowPageAccessResult", "Chrome could not open the page-access prompt. Click Allow page access again.", "error");
          return;
        }
        setResult("allowPageAccessResult", `Could not request page access (${outcome.diagnostic}). Try again, or use the extension's Site access settings.`, "error");
      })();
    };

    const wireExtractButton = (buttonId: string, resultId: string, target: ExtractTarget) => {
      careerElement<HTMLButtonElement>(buttonId).onclick = async () => {
        if (!requireCareerReady()) return;
        await withPending(careerElement<HTMLButtonElement>(buttonId), resultId, "Extracting…", () => runExtraction(target));
      };
    };

    const updateExtractionState = (url: string) => {
      const kind: LinkedInPageKind = classifyUrl(url);
      const messages: Record<LinkedInPageKind, string> = {
        profile: "This is a LinkedIn profile page — try Extract profile or Extract my details.",
        job: "This is a LinkedIn job page — try Extract job.",
        company: "This is a LinkedIn company page — try Extract company.",
        generic: "Extraction is best-effort on this page — any Extract button will try, and useful details are added without overwriting your existing entries.",
        unsupported: "Chrome blocks extensions from reading this kind of page. Extraction controls are still available on other pages.",
      };
      hint.textContent = messages[kind];
    };

    // --- History --------------------------------------------------------

    const formatStorageBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /** Replaces the active case's form fields with a saved report's own input, after confirmation. Never edits the saved job itself. */
    function replaceCurrentCase(job: CareerJob): void {
      const patch = careerInputToForm(job.input);
      const sources = careerInputToSources(job.input);
      const values: Record<string, unknown> = {};
      CAREER_VALUE_KEYS.forEach(key => {
        const value = patch[key] || "";
        field(FORM_ID[key]).value = value;
        values[FORM_ID[key]] = value;
        if (key !== "stage") {
          fieldSource[FORM_ID[key]] = sources[key] || "manual";
          values[`${FORM_ID[key]}Origin`] = sources[key] || "manual";
        }
      });
      careerSet(values).catch(error => { hint.textContent = String(error); });
    }

    /** Additively merges a saved report's own input into the active case, using the same never-overwrite merge as page extraction. */
    function addToCurrentCase(job: CareerJob): MergeOutcome {
      const patch = careerInputToForm(job.input);
      const label = [job.input?.companyName, job.input?.title || job.input?.jobTitle].filter(Boolean).join(" — ") || "saved report";
      const outcome = mergeExtraction(getValues(), getSources(), patch, { label });
      applyMerge(outcome);
      return outcome;
    }

    async function loadHistory(): Promise<void> {
      const list = careerElement<HTMLElement>("careerHistoryList");
      const summary = careerElement<HTMLElement>("historySummary");
      let jobs: AnnotatedCareerJob[] = [];
      let unreadableCount = 0;
      let storageBytes = 0;
      try {
        const response = await chrome.runtime.sendMessage({ action:"CAREER_LIST" }) as { ok?: boolean; jobs?: AnnotatedCareerJob[]; unreadableCount?: number; storageBytes?: number };
        jobs = response?.ok ? response.jobs || [] : [];
        unreadableCount = response?.unreadableCount || 0;
        storageBytes = response?.storageBytes || 0;
      } catch { /* worker not reachable yet */ }
      list.replaceChildren();
      const parts = [`${jobs.length} saved report${jobs.length === 1 ? "" : "s"}`, formatStorageBytes(storageBytes)];
      if (unreadableCount) parts.push(`${unreadableCount} unreadable record${unreadableCount === 1 ? "" : "s"} (clearable below)`);
      summary.textContent = `${parts.join(" · ")}.`;
      for (const job of jobs) {
        const row = document.createElement("div");
        row.className = "history-row";
        const title = document.createElement("strong");
        title.textContent = [job.input?.companyName, job.input?.title || job.input?.jobTitle].filter(Boolean).join(" — ") || job.kind;
        const meta = document.createElement("div");
        meta.className = "history-meta";
        const stage = job.input?.stage;
        meta.textContent = `${job.kind}${stage ? ` · ${stage}` : ""} · ${job.status} · ${new Date(job.createdAt).toLocaleString()} · ${job.provider}${job.model ? `/${job.model}` : ""}`;
        const status = document.createElement("div");
        status.className = "history-status";
        if (job.unsaved) status.textContent = "Not yet saved to local storage — recoverable until the browser closes.";

        const openButton = document.createElement("button");
        openButton.type = "button"; openButton.textContent = "Open";
        openButton.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?job=${encodeURIComponent(job.id)}`) });

        const addButton = document.createElement("button");
        addButton.type = "button"; addButton.textContent = "Add to current case";
        addButton.onclick = () => {
          const outcome = addToCurrentCase(job);
          status.textContent = outcome.added.length
            ? `Added to current case: ${outcome.added.map(key => FIELD_LABEL[key] || key).join(", ")}.`
            : "Nothing new to add — the current case already has this data.";
        };

        const replaceButton = document.createElement("button");
        replaceButton.type = "button"; replaceButton.textContent = "Replace current case";
        replaceButton.onclick = () => {
          if (!window.confirm("Replace the current case with this saved report's data? Any unsaved changes in the current case will be overwritten.")) return;
          replaceCurrentCase(job);
          status.textContent = "Replaced the current case with this saved report's data.";
        };

        const deleteButton = document.createElement("button");
        deleteButton.type = "button"; deleteButton.textContent = "Delete";
        deleteButton.onclick = async () => {
          if (!window.confirm("Delete this saved report? This can't be undone.")) return;
          await chrome.runtime.sendMessage({ action:"CAREER_DELETE", id: job.id });
          void loadHistory();
        };

        row.append(title, meta, openButton, addButton, replaceButton, deleteButton);
        if (job.unsaved) {
          const retryButton = document.createElement("button");
          retryButton.type = "button"; retryButton.textContent = "Retry save";
          retryButton.onclick = async () => {
            const response = await chrome.runtime.sendMessage({ action:"CAREER_SAVE_JOB", id: job.id }) as { ok?: boolean; error?: string };
            status.textContent = response?.ok ? "Saved." : (response?.error || "Could not save this report.");
            void loadHistory();
          };
          row.append(retryButton);
        }
        row.append(status);
        list.append(row);
      }
    }

    // --- Boot -------------------------------------------------------------

    const PERSISTED_IDS = ["careerProvider", "careerApiKey", "careerOpenAiApiKey", ...CAREER_VALUE_KEYS.map(key => FORM_ID[key])];

    const lockPromise: Promise<{ locked: boolean; reason?: string }> = options.careerLockPromise ?? chrome.runtime.sendMessage({ action: "CAREER_TOOLS_STATUS" })
      .then((lock: unknown) => (lock as { locked: boolean; reason?: string } | undefined | null) ?? { locked: false, reason: "Career Tools are unavailable." })
      .catch(() => ({ locked: false, reason: "Career Tools service is not ready. Reload the extension." }));

    lockPromise.then(async (lock: { locked: boolean; reason?: string }) => {
      if (!lock.locked) { hint.textContent = lock.reason || "Career Tools are unavailable."; return; }
      careerReady = true; tools.hidden = false;

      const saved = await careerGet<Record<string, string>>([...PERSISTED_IDS, "careerModel", "careerOpenAiModel", "careerJd"]);
      PERSISTED_IDS.forEach(id => { if (saved[id] !== undefined) field(id).value = saved[id]; });
      const savedSources = await careerGet<Record<string, string>>(SOURCE_KEYS.map(key => `${FORM_ID[key]}Origin`));
      SOURCE_KEYS.forEach(key => {
        const id = FORM_ID[key];
        const value = savedSources[`${id}Origin`];
        fieldSource[id] = value === "extracted" ? "extracted" : value === "mixed" ? "mixed" : "manual";
      });

      // One-time migration: the old separate "target job description" field
      // (careerJd) is folded additively into careerJobDescription, never
      // overwriting anything already there.
      if (saved.careerJd) {
        const jobDescId = FORM_ID.jobDescription;
        const current = field(jobDescId).value;
        const merged = current
          ? `${current}\n\n[Migrated from the previous "Target job description" field]\n${saved.careerJd}`
          : saved.careerJd;
        field(jobDescId).value = merged;
        await careerSet({ [jobDescId]: merged });
        await new Promise<void>(resolve => chrome.storage.local.remove(["careerJd", "careerJdOrigin"], resolve));
      }

      setupModelSelect("anthropic", anthropicSelect, anthropicFilter, modelId => { careerSet({ careerModel: modelId }).catch(() => undefined); });
      setupModelSelect("openai", openAiSelect, openAiFilter, modelId => { careerSet({ careerOpenAiModel: modelId }).catch(() => undefined); });
      const resolvedAnthropic = restoreModel("anthropic", anthropicSelect, saved.careerModel || "");
      const resolvedOpenAi = restoreModel("openai", openAiSelect, saved.careerOpenAiModel || "");
      if (saved.careerModel && resolvedAnthropic !== saved.careerModel) await careerSet({ careerModel: resolvedAnthropic });
      if (saved.careerOpenAiModel && resolvedOpenAi !== saved.careerOpenAiModel) await careerSet({ careerOpenAiModel: resolvedOpenAi });

      PERSISTED_IDS.forEach(id => field(id).addEventListener("change", () => {
        const patch: Record<string, unknown> = { [id]: field(id).value };
        const valueKey = CAREER_VALUE_KEYS.find(key => FORM_ID[key] === id && key !== "stage");
        if (valueKey) { fieldSource[id] = "manual"; patch[`${id}Origin`] = "manual"; }
        careerSet(patch).catch(error => { hint.textContent = String(error); });
      }));

      document.querySelectorAll<HTMLButtonElement>(".career-clear[data-key]").forEach(button => button.onclick = async () => {
        const key = button.dataset.key || "";
        if (!PERSISTED_IDS.includes(key)) return;
        const valueKey = CAREER_VALUE_KEYS.find(k => FORM_ID[k] === key && k !== "stage");
        const sourceKeys = valueKey ? [`${key}Origin`] : [];
        await new Promise<void>(resolve => chrome.storage.local.remove([key, ...sourceKeys], resolve));
        field(key).value = "";
        if (valueKey) fieldSource[key] = "manual";
        field(key).dispatchEvent(new Event("change"));
      });

      careerElement<HTMLButtonElement>("clearReportsButton").onclick = async () => {
        if (!window.confirm("Delete every saved report? This can't be undone.")) return;
        // Routed through the worker (not a direct storage.local.remove) so the
        // session recovery anchor is cleared too — otherwise a report that most
        // recently fell back to session storage would reappear after "clear all".
        await chrome.runtime.sendMessage({ action:"CAREER_CLEAR_ALL" });
        setResult("clearReportsResult", "All saved reports cleared.", "success");
        void loadHistory();
      };

      careerElement<HTMLButtonElement>("newCaseButton").onclick = async () => {
        const caseKeys = CAREER_VALUE_KEYS.filter(key => key !== "cv");
        const removeStorageKeys = caseKeys.flatMap(key => key === "stage" ? [FORM_ID[key]] : [FORM_ID[key], `${FORM_ID[key]}Origin`]);
        await new Promise<void>(resolve => chrome.storage.local.remove(removeStorageKeys, resolve));
        caseKeys.forEach(key => { field(FORM_ID[key]).value = ""; if (key !== "stage") fieldSource[FORM_ID[key]] = "manual"; });
        setResult("newCaseResult", "Started a new case. Your CV, provider settings, and history were kept.", "success");
      };

      wireExtractButton("extractJobButton", "extractJobResult", "job");
      wireExtractButton("extractProfileButton", "extractProfileResult", "profile");
      wireExtractButton("extractCvButton", "extractCvResult", "cv");
      wireExtractButton("extractCompanyButton", "extractCompanyResult", "company");

      const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
      updateExtractionState(tab?.url || "");
      if (tab && tab.id !== undefined) {
        const watchedTabId = tab.id;
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
          if (tabId !== watchedTabId || !changeInfo.url) return;
          updateExtractionState(changeInfo.url);
        });
      }

      const updateResearchState = () => {
        const valid = /^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(field(FORM_ID.companyUrl).value);
        careerElement<HTMLElement>("careerResearchState").textContent = valid ? "Web research available." : "Web research unavailable — supply the company's LinkedIn URL to enable it. You can still generate a report without it.";
      };
      field(FORM_ID.companyUrl).addEventListener("input", updateResearchState);
      updateResearchState();

      updateProviderUI();
      providerSelect.addEventListener("change", updateProviderUI);

      careerElement<HTMLButtonElement>("generateReportButton").onclick = () => {
        const values = getValues();
        const sources = getSources();
        const input: Record<string, unknown> = { ...formToCareerInput(values, sources), research: careerElement<HTMLInputElement>("careerResearch").checked };
        const preview = CAREER_VALUE_KEYS
          .map(key => {
            const value = values[key] || "";
            const shown = value.length > 300 ? `${value.slice(0, 300)}…` : value;
            const source = key === "stage" ? "" : ` [${sources[key] || "manual"}]`;
            return `${FIELD_LABEL[key]}${source}: ${shown || "(empty)"}`;
          })
          .join("\n");
        // Early, non-authoritative heads-up using the same conservative
        // estimator the worker enforces before every provider call — the
        // worker's own assertRequestFitsModel check remains the real gate.
        const provider = currentProvider();
        const option = getKnownModelOption(provider, currentProviderModel());
        let warning = "";
        if (option) {
          const estimatedTokens = estimateRequestTokenUpperBound(provider, [{ role:"user", content:JSON.stringify(input) }]);
          if (estimatedTokens > option.contextWindowTokens) {
            warning = `⚠ This request's estimated size (~${estimatedTokens} tokens) may exceed ${option.label}'s ${option.contextWindowTokens}-token context window — generation may fail. Trim the context or pick a model with more capacity.\n\n`;
          }
        }
        showPreview(`${warning}${preview}`, () => run(input), "Starting report…");
      };

      void loadHistory();
    }).catch(() => { hint.textContent = "Career Tools service is not ready. Reload the extension."; });

    careerElement<HTMLButtonElement>("careerTestButton").onclick = () => {
      if (!requireCareerReady()) return;
      const provider = currentProvider();
      showPreview(`Test connection: model "${currentProviderModel()}", prompt "OK" sent to ${providerLabel(provider)}.`, async () => {
        await careerSet(provider === "openai"
          ? { careerProvider:provider, careerOpenAiApiKey:field("careerOpenAiApiKey").value, careerOpenAiModel:openAiSelect.value }
          : { careerProvider:provider, careerApiKey:field("careerApiKey").value, careerModel:anthropicSelect.value });
        const result = await chrome.runtime.sendMessage({ action:"CAREER_TEST", previewed:true });
        setResult("careerPreviewResult", result.ok ? "Connection authenticated." : result.error, result.ok ? "success" : "error");
      }, "Testing connection…");
    };
  });
}
