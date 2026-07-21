import type { AssembledStream } from "./streamAssembler";

export interface CareerSource { id:string; url:string; title?:string; citedText?:string; }
export interface ResearchLoopState {
  messages: Record<string, unknown>[];
  findings: string;
  sources: CareerSource[];
  warnings: string[];
  /** Set only when the provider's token limit ended research before end_turn; the caller decides how to surface it. */
  truncated?: boolean;
}

/** Returns the exact provider-owned assistant turn required after pause_turn. */
export function appendResearchContinuation(messages: Record<string, unknown>[], content: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...messages, { role:"assistant", content }];
}

export function sourceTable(blocks: Record<string, unknown>[]): CareerSource[] {
  const seen = new Map<string, CareerSource>();
  for (const block of blocks) for (const citation of (Array.isArray(block.citations) ? block.citations : [] as unknown[])) {
    const item = citation as Record<string, unknown>;
    const raw = String(item.url || "");
    let url: URL;
    // The renderer and validator trust this table as the sole source of link
    // targets; only http(s) may ever reach it.
    try { url = new URL(raw); } catch { continue; }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const key = url.toString();
    if (!seen.has(key)) seen.set(key, { id:`S${seen.size + 1}`, url:raw, title:typeof item.title === "string" ? item.title : undefined, citedText:typeof item.cited_text === "string" ? item.cited_text : undefined });
  }
  return [...seen.values()];
}

/** Renders the persisted source table as the [S#] → URL mapping Stage B must cite from. */
export function formatSourceTable(sources: CareerSource[]): string {
  if (!sources.length) return "(no sources — no web research was performed)";
  return sources.map(source => `${source.id}: ${source.title || source.url} — ${source.url}`).join("\n");
}

/** Server tool failures leave useful partial research; preserve that fact in the report. */
export function toolResultWarnings(blocks: Record<string, unknown>[]): string[] {
  const warnings: string[] = [];
  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content as Record<string, unknown> | undefined;
    const code = content && (content.error_code || content.error || content.type);
    if (typeof code === "string" && /(error|exceeded|unavailable|failed)/i.test(code)) warnings.push(`Web research was partially unavailable: ${code}.`);
  }
  return [...new Set(warnings)];
}

/**
 * Runs pause_turn continuation independently of storage so only complete,
 * canonical assembler output can be persisted or replayed by a job runner.
 */
export async function runResearchContinuation(
  initial: ResearchLoopState,
  request: (messages: Record<string, unknown>[]) => Promise<AssembledStream>,
  options: { signal: AbortSignal; maxTurns?: number; onTurn?: (state: ResearchLoopState) => Promise<void> | void } = { signal: new AbortController().signal },
): Promise<ResearchLoopState> {
  let state = { ...initial, messages:[...initial.messages], sources:[...initial.sources], warnings:[...initial.warnings] };
  const maxTurns = options.maxTurns ?? 6;
  for (let attempt = 0; attempt < maxTurns; attempt += 1) {
    if (options.signal.aborted) throw new DOMException("Research cancelled", "AbortError");
    const response = await request(state.messages);
    if (options.signal.aborted) throw new DOMException("Research cancelled", "AbortError");
    if (!response.complete) throw new Error("Research stream ended before message completion.");
    state = {
      ...state,
      messages: appendResearchContinuation(state.messages, response.content),
      findings: state.findings + response.accumulatedText,
      sources: sourceTable([...state.sources.map(source => ({ type:"text", citations:[{ url:source.url, title:source.title, cited_text:source.citedText }] })), ...response.content]),
      warnings: [...new Set([...state.warnings, ...toolResultWarnings(response.content)])],
    };
    await options.onTurn?.(state);
    if (response.stopReason === "end_turn") return state;
    // A token-limited research turn still has usable partial findings; end the
    // loop like end_turn rather than failing the whole job, and let the
    // caller surface the truncation the same way it surfaces a truncated
    // synthesis leg instead of dead-ending the report.
    if (response.stopReason === "max_tokens") return { ...state, truncated:true };
    if (response.stopReason !== "pause_turn") throw new Error(`Research stopped unexpectedly (${response.stopReason || "unknown"}).`);
  }
  throw new Error("Research paused too many times; regenerate the report.");
}
