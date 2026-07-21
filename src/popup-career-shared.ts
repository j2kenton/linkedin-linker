export type CareerExtraction = Record<string, unknown> & { ready?: boolean; warnings?: { field?: string; message: string }[] };

export const careerGet = <T>(keys: string[]) => new Promise<T>(resolve => chrome.storage.local.get(keys, resolve as (items: object) => void));

export const careerSet = (items: object) => new Promise<void>((resolve, reject) => chrome.storage.local.set(items, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));

export const careerElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const careerSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function initCareerTools(
  extractableKind: (url: string) => "profile" | "job" | "other",
  careerLockPromise?: Promise<{ locked: boolean; reason?: string }>
): void {
  document.addEventListener("DOMContentLoaded", () => {
    const tools = careerElement<HTMLElement>("careerTools"); const hint = careerElement<HTMLElement>("careerHint");
    const profileFields = careerElement<HTMLElement>("profileCareerFields"); const jobFields = careerElement<HTMLElement>("jobCareerFields");
    const consent = careerElement<HTMLInputElement>("careerConsent");
    const inputIds = ["careerProvider", "careerApiKey", "careerModel", "careerOpenAiApiKey", "careerOpenAiModel", "careerCv", "careerJd", "careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"];
    const field = (id: string) => careerElement<HTMLInputElement | HTMLTextAreaElement>(id);

    const providerSelect = careerElement<HTMLSelectElement>("careerProvider");
    const currentProvider = (): "anthropic" | "openai" => providerSelect.value === "openai" ? "openai" : "anthropic";
    const providerLabel = (provider: "anthropic" | "openai") => provider === "openai" ? "OpenAI" : "Anthropic";
    const currentProviderModel = () => currentProvider() === "openai" ? field("careerOpenAiModel").value : field("careerModel").value;
    const updateProviderUI = () => {
      const provider = currentProvider();
      careerElement<HTMLElement>("anthropicProviderFields").hidden = provider !== "anthropic";
      careerElement<HTMLElement>("openaiProviderFields").hidden = provider !== "openai";
      careerElement<HTMLElement>("careerConsentProvider").textContent = providerLabel(provider);
      careerElement<HTMLElement>("careerProviderIntro").textContent = `Profile and resume content is sent to ${providerLabel(provider)} only after you review the transmission preview and choose an action.`;
    };

    const setResult = (id: string, text: string, kind: "success" | "error" | "pending" | "") => {
      const el = careerElement<HTMLElement>(id);
      el.hidden = !text; el.textContent = text; el.className = "career-result" + (kind ? ` ${kind}` : "");
    };
    const showFieldError = (fieldId: string, errorId: string, message: string) => {
      field(fieldId).classList.add("invalid");
      const el = careerElement<HTMLElement>(errorId); el.textContent = message; el.hidden = false;
    };
    const clearFieldError = (fieldId: string, errorId: string) => {
      field(fieldId).classList.remove("invalid");
      const el = careerElement<HTMLElement>(errorId); el.hidden = true; el.textContent = "";
    };

    const SOURCE_FIELD_IDS = ["careerCv", "careerProfile", "careerCompanyName", "careerCompanyUrl", "careerJobTitle", "careerSeniority", "careerLocation", "careerJobDescription"] as const;
    const sourceStorageKey = (id: string) => `${id}Origin`;
    const fieldSource: Record<string, "manual" | "extracted"> = {};
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
    const showPreview = (label: string, payload: Record<string, unknown>, action: () => Promise<void>, pendingLabel: string) => {
      if (!requireCareerReady()) return;
      if (!consent.checked) { showFieldError("careerConsent", "careerConsentError", "Confirm the per-run consent checkbox first."); return; }
      clearFieldError("careerConsent", "careerConsentError");
      approvedAction = action; pendingPreviewLabel = pendingLabel;
      setResult("careerPreviewResult", "", "");
      preview.hidden=false; preview.open=true;
      const isCompany = payload.kind === "company";
      const researchAvailable = payload.research !== false && /^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(String(payload.companyUrl || ""));
      const provider = providerLabel(currentProvider());
      previewText.textContent = isCompany
        ? researchAvailable
          ? `Research stage (web search; no CV or JD):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, companyUrl:payload.companyUrl, companyUrlSource:payload.companyUrlSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource}, null, 2)}\n\nSynthesis stage (no web access):\n${JSON.stringify({cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource, research: "research findings"}, null, 2)}\n\nWeb-search results are processed server-side by ${provider}. Each field above is labeled by its "…Source" value as either "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`
          : `No web research will occur. A valid LinkedIn company URL is required for the research stage.\n\nSynthesis stage (no web access):\n${JSON.stringify({companyName:payload.companyName, companyNameSource:payload.companyNameSource, title:payload.title, titleSource:payload.titleSource, seniority:payload.seniority, senioritySource:payload.senioritySource, location:payload.location, locationSource:payload.locationSource, cv:payload.cv || "", jd:payload.jd || "", jdSource:payload.jdSource}, null, 2)}`
        : `${label} sent to ${provider} (no web access):\n${JSON.stringify(payload, null, 2)}\n\n"profileSource" is "extracted" (read from the LinkedIn page) or "manual" (typed or pasted by you).`;
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
        ? { careerProvider:provider, careerOpenAiApiKey:field("careerOpenAiApiKey").value, careerOpenAiModel:field("careerOpenAiModel").value, aiConsentGiven:true }
        : { careerProvider:provider, careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true });
      const response = await chrome.runtime.sendMessage({ action:"CAREER_RUN", consent:true, previewed:true, input });
      if (!response.ok) { setResult("careerPreviewResult", response.error, "error"); return; }
      chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?job=${encodeURIComponent(response.jobId)}`) });
      setResult("careerPreviewResult", "Report opened in a new tab.", "success");
    };

    type ExtractOutcome = { ok: true; data: CareerExtraction } | { ok: false; message: string };
    const extract = async (action: "EXTRACT_PROFILE" | "EXTRACT_JOB", expectedKind: "profile" | "job"): Promise<ExtractOutcome> => {
      const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
      if (!tab?.id || !tab.url) return { ok:false, message:"No active LinkedIn tab found." };
      const kind = extractableKind(tab.url);
      if (kind === "other") return { ok:false, message:"Open a LinkedIn profile or job page first." };
      if (kind !== expectedKind) return { ok:false, message: expectedKind === "profile" ? "This tab is a LinkedIn job page, not a profile page." : "This tab is a LinkedIn profile page, not a job page." };
      let lastReadyFalse: CareerExtraction | null = null;
      let lastReady: CareerExtraction | null = null;
      let lastError = "";
      for (let attempt=0; attempt<5; attempt++) {
        try {
          const result = await chrome.tabs.sendMessage(tab.id, { action }, { frameId:0 }) as CareerExtraction;
          if (result.ready) {
            lastReady = result;
            const stillMounting = (result.warnings || []).some(w => w.field === "sections");
            if (!stillMounting) return { ok:true, data:result };
          } else {
            lastReadyFalse = result;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = msg.includes("Could not establish connection") || msg.includes("Receiving end does not exist")
            ? "Could not reach the LinkedIn page script. Reload the LinkedIn tab and try again."
            : `Extraction failed: ${msg}`;
        }
        if (attempt < 4) await careerSleep(1000);
      }
      if (lastReady) return { ok:true, data:lastReady };
      if (lastReadyFalse) {
        const warnings = (lastReadyFalse.warnings || []).map(w => w.message).join(" ");
        return { ok:false, message: warnings || "The page hasn't finished rendering. Reload LinkedIn and retry." };
      }
      return { ok:false, message: lastError || "Could not reach the LinkedIn page script. Reload the LinkedIn tab and try again." };
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

    const updateExtractionState = (url: string) => {
      const kind = extractableKind(url);
      const extractProfileButton = careerElement<HTMLButtonElement>("extractProfileButton");
      const extractCvButton = careerElement<HTMLButtonElement>("extractCvButton");
      const extractJobButton = careerElement<HTMLButtonElement>("extractJobButton");
      extractProfileButton.disabled = kind !== "profile";
      extractCvButton.disabled = kind !== "profile";
      extractJobButton.disabled = kind !== "job";
      const profileReason = kind === "profile" ? "" : "Open a LinkedIn profile page to use this.";
      extractProfileButton.title = profileReason; extractCvButton.title = profileReason;
      extractJobButton.title = kind === "job" ? "" : "Open a LinkedIn job page to use this.";
      hint.textContent = kind === "profile"
        ? "This is a LinkedIn profile page — extract the interviewer's details, or your own details into the CV field."
        : kind === "job"
          ? "This is a LinkedIn job page — extract the job details below."
          : "Manual inputs are always available. Open a LinkedIn profile or job page to enable extraction.";
    };

    const lockPromise: Promise<{ locked: boolean; reason?: string }> = careerLockPromise ?? chrome.runtime.sendMessage({ action: "CAREER_TOOLS_STATUS" })
      .then((lock: unknown) => (lock as { locked: boolean; reason?: string } | undefined | null) ?? { locked: false, reason: "Career Tools are unavailable." })
      .catch(() => ({ locked: false, reason: "Career Tools service is not ready. Reload the extension." }));

    lockPromise.then(async (lock: { locked: boolean; reason?: string }) => {
      if (!lock.locked) { hint.textContent=lock.reason || "Career Tools are unavailable."; return; }
      careerReady=true; tools.hidden=false; const saved = await careerGet<Record<string, string>>(inputIds); inputIds.forEach(id => { if (saved[id] !== undefined) field(id).value=saved[id]; });
      const savedSources = await careerGet<Record<string, string>>(SOURCE_FIELD_IDS.map(sourceStorageKey));
      SOURCE_FIELD_IDS.forEach(id => { fieldSource[id] = savedSources[sourceStorageKey(id)] === "extracted" ? "extracted" : "manual"; });
      inputIds.forEach(id => field(id).addEventListener("change", () => {
        const patch: Record<string, unknown> = { [id]:field(id).value };
        if ((SOURCE_FIELD_IDS as readonly string[]).includes(id)) { fieldSource[id]="manual"; patch[sourceStorageKey(id)]="manual"; }
        careerSet(patch).catch(error => { hint.textContent = String(error); });
      }));
      field("careerProfile").addEventListener("input", () => clearFieldError("careerProfile", "careerProfileError"));
      field("careerCompanyName").addEventListener("input", () => clearFieldError("careerCompanyName", "careerCompanyNameError"));
      consent.addEventListener("change", () => { if (consent.checked) clearFieldError("careerConsent", "careerConsentError"); });

      document.querySelectorAll<HTMLButtonElement>(".career-clear[data-key]").forEach(button => button.onclick = async () => {
        const key = button.dataset.key || "";
        if (!inputIds.includes(key)) return;
        const sourceKeys = (SOURCE_FIELD_IDS as readonly string[]).includes(key) ? [sourceStorageKey(key)] : [];
        await new Promise<void>(resolve => chrome.storage.local.remove([key, ...sourceKeys], resolve));
        field(key).value=""; if ((SOURCE_FIELD_IDS as readonly string[]).includes(key)) fieldSource[key]="manual";
        field(key).dispatchEvent(new Event("input"));
        field(key).focus();
      });
      careerElement<HTMLButtonElement>("clearReportsButton").onclick = async () => {
        await new Promise<void>(resolve => chrome.storage.local.remove(["careerToolJobs"], resolve));
        setResult("clearReportsResult", "Saved reports cleared.", "success");
      };

      const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
      profileFields.hidden=false; jobFields.hidden=false;
      updateExtractionState(tab?.url || "");
      if (tab && tab.id !== undefined) {
        const watchedTabId = tab.id;
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
          if (tabId !== watchedTabId || !changeInfo.url) return;
          updateExtractionState(changeInfo.url);
        });
      }
      const updateResearchState = () => { const valid=/^https:\/\/(www\.)?linkedin\.com\/company\/[^/?#]+\/?$/i.test(field("careerCompanyUrl").value); const state=careerElement<HTMLElement>("careerResearchState"); state.textContent=valid ? "Web research available." : "Web research unavailable — supply the company's LinkedIn URL to enable it. You can still run a no-research report."; };
      field("careerCompanyUrl").addEventListener("input", updateResearchState); updateResearchState();
      const known=["claude-opus-4-8", "claude-sonnet-4-5"]; const modelWarning=careerElement<HTMLElement>("careerModelWarning"); const updateModelWarning=()=>modelWarning.hidden=known.includes(field("careerModel").value.trim()); field("careerModel").addEventListener("input",updateModelWarning); updateModelWarning();
      const knownOpenAi=["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]; const openAiModelWarning=careerElement<HTMLElement>("careerOpenAiModelWarning"); const updateOpenAiModelWarning=()=>openAiModelWarning.hidden=knownOpenAi.includes(field("careerOpenAiModel").value.trim()); field("careerOpenAiModel").addEventListener("input",updateOpenAiModelWarning); updateOpenAiModelWarning();
      updateProviderUI();
      providerSelect.addEventListener("change", updateProviderUI);
    }).catch(() => { hint.textContent="Career Tools service is not ready. Reload the extension."; });
    careerElement<HTMLButtonElement>("careerTestButton").onclick = () => {
      if (!requireCareerReady()) return;
      const provider = currentProvider();
      showPreview("Test connection", { model:currentProviderModel(), prompt:"OK", max_tokens:16 }, async () => {
        await careerSet(provider === "openai"
          ? { careerProvider:provider, careerOpenAiApiKey:field("careerOpenAiApiKey").value, careerOpenAiModel:field("careerOpenAiModel").value, aiConsentGiven:true }
          : { careerProvider:provider, careerApiKey:field("careerApiKey").value, careerModel:field("careerModel").value, aiConsentGiven:true });
        const result = await chrome.runtime.sendMessage({ action:"CAREER_TEST", consent:true, previewed:true });
        setResult("careerPreviewResult", result.ok ? "Connection authenticated." : result.error, result.ok ? "success" : "error");
      }, "Testing connection…");
    };
    careerElement<HTMLButtonElement>("extractProfileButton").onclick = async () => {
      if (!requireCareerReady()) return;
      const button = careerElement<HTMLButtonElement>("extractProfileButton");
      await withPending(button, "extractProfileResult", "Extracting…", async () => {
        const outcome = await extract("EXTRACT_PROFILE", "profile");
        if (!outcome.ok) return { text: outcome.message, kind: "error" };
        field("careerProfile").value=JSON.stringify(outcome.data, null, 2);
        fieldSource.careerProfile="extracted";
        await careerSet({ careerProfile:field("careerProfile").value, [sourceStorageKey("careerProfile")]:"extracted" });
        clearFieldError("careerProfile", "careerProfileError");
        const warnings = (outcome.data.warnings || []).map(w => w.message).join(" ");
        return { text: warnings || "Profile extracted.", kind: "success" };
      });
    };
    careerElement<HTMLButtonElement>("extractCvButton").onclick = async () => {
      if (!requireCareerReady()) return;
      const button = careerElement<HTMLButtonElement>("extractCvButton");
      await withPending(button, "extractCvResult", "Extracting…", async () => {
        const outcome = await extract("EXTRACT_PROFILE", "profile");
        if (!outcome.ok) return { text: outcome.message, kind: "error" };
        field("careerCv").value=JSON.stringify(outcome.data, null, 2);
        fieldSource.careerCv="extracted";
        await careerSet({ careerCv:field("careerCv").value, [sourceStorageKey("careerCv")]:"extracted" });
        const warnings = (outcome.data.warnings || []).map(w => w.message).join(" ");
        return { text: warnings ? `${warnings} Extracted into the CV field.` : "Your details were extracted into the CV field.", kind: "success" };
      });
    };
    careerElement<HTMLButtonElement>("extractJobButton").onclick = async () => {
      if (!requireCareerReady()) return;
      const button = careerElement<HTMLButtonElement>("extractJobButton");
      await withPending(button, "extractJobResult", "Extracting…", async () => {
        const outcome = await extract("EXTRACT_JOB", "job");
        if (!outcome.ok) return { text: outcome.message, kind: "error" };
        const result = outcome.data;
        const map: Record<string,string> = { careerCompanyName:"companyName", careerCompanyUrl:"companyUrl", careerJobTitle:"title", careerSeniority:"seniority", careerLocation:"location", careerJobDescription:"description" };
        Object.entries(map).forEach(([target, source]) => { field(target).value=String(result[source] || ""); fieldSource[target]="extracted"; });
        const extras = [
          result.workplaceType ? `Workplace type: ${result.workplaceType}` : "",
          result.salary ? `Salary: ${result.salary}` : "",
          result.benefits ? `Benefits: ${result.benefits}` : "",
        ].filter(Boolean).join("\n");
        if (extras) field("careerJobDescription").value = [field("careerJobDescription").value, extras].filter(Boolean).join("\n\n");
        await careerSet({ ...Object.fromEntries(Object.keys(map).map(id => [id, field(id).value])), ...Object.fromEntries(Object.keys(map).map(id => [sourceStorageKey(id), "extracted"])) });
        clearFieldError("careerCompanyName", "careerCompanyNameError");
        const warnings = (result.warnings || []).map(w=>w.message).join(" ");
        return { text: warnings || "Job extracted.", kind: "success" };
      });
    };
    careerElement<HTMLButtonElement>("interviewButton").onclick = () => {
      const input={ kind:"interview", profile:field("careerProfile").value, cv:field("careerCv").value, jd:field("careerJd").value, profileSource:fieldSource.careerProfile || "manual" };
      if (!input.profile.trim()) { showFieldError("careerProfile", "careerProfileError", "Extract or paste an interviewer profile first."); return; }
      clearFieldError("careerProfile", "careerProfileError");
      showPreview("Interview preparation",input,()=>run(input),"Starting report…");
    };
    careerElement<HTMLButtonElement>("companyButton").onclick = () => {
      const input={ kind:"company", companyName:field("careerCompanyName").value, companyUrl:field("careerCompanyUrl").value, title:field("careerJobTitle").value, seniority:field("careerSeniority").value, location:field("careerLocation").value, jd:field("careerJobDescription").value, cv:field("careerCv").value, research:careerElement<HTMLInputElement>("careerResearch").checked, companyNameSource:fieldSource.careerCompanyName || "manual", companyUrlSource:fieldSource.careerCompanyUrl || "manual", titleSource:fieldSource.careerJobTitle || "manual", senioritySource:fieldSource.careerSeniority || "manual", locationSource:fieldSource.careerLocation || "manual", jdSource:fieldSource.careerJobDescription || "manual" };
      if (!input.companyName.trim()) { showFieldError("careerCompanyName", "careerCompanyNameError", "Enter a company name first."); return; }
      clearFieldError("careerCompanyName", "careerCompanyNameError");
      showPreview("Company & Role Intelligence",input,()=>run(input),"Starting report…");
    };
  });
}
