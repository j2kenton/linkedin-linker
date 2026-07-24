import { StreamAssembler, OpenAIStreamAssembler, type AssembledStream } from "./streamAssembler";
import { DEFAULT_MODEL } from "../models";

export type Provider = "anthropic" | "openai";

// The verified per-provider model catalog lives in ../models.ts (it needs
// this file's Provider type); re-exported here so existing callers importing
// DEFAULT_MODEL from this module keep working unchanged.
export { DEFAULT_MODEL };

/** The single provider-name source of truth for error text, consent copy, and UI labels. */
export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_WEB_SEARCH_TOOL = "web_search_20260209";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_RESEARCH_MAX_TOKENS = 24000;
const TEST_MAX_TOKENS = 16;
const ANTHROPIC_SEARCH_MAX_TOKENS = 6000;
const SYNTHESIS_MAX_TOKENS = 9000;

/** The single source of truth for the requested output-token ceiling of every streamed call — used both to build the actual request body and to pre-flight it through assertRequestFitsModel before that request is sent. */
export function resolveRequestedOutputTokens(provider: Provider, search: boolean, test: boolean): number {
  if (test) return TEST_MAX_TOKENS;
  if (provider === "openai") return search ? OPENAI_RESEARCH_MAX_TOKENS : SYNTHESIS_MAX_TOKENS;
  return search ? ANTHROPIC_SEARCH_MAX_TOKENS : SYNTHESIS_MAX_TOKENS;
}

export function classifyProviderError(provider: Provider, status: number, body: string, research: boolean): string {
  const name = PROVIDER_LABEL[provider];
  if (status === 401) return `The ${name} API key was rejected.`;
  if (research && (status === 400 || status === 403)) {
    const text = body.toLowerCase();
    if (provider === "openai") {
      if (/(model|tool).*(support|compatib)|web_search.*(support|unsupported|not available)/.test(text)) return "This model doesn't support web search — pick another or clear the override.";
      if (/(organization|project|org).*(disable|unavailable|not allowed|verif)/.test(text)) return "Web search is disabled for your OpenAI organization — enable it in your OpenAI account's settings (or use a key from an organization where it's enabled), then retry.";
      return `Research request failed: ${body}`;
    }
    if (/(model|tool).*(support|compatib)|web_search.*model/.test(text)) return "This model doesn't support web search — pick another or clear the override.";
    if (/(organization|workspace|org).*(disable|unavailable)|permission_error.*web.?search/.test(text)) return "Web search is disabled for your Anthropic organization — enable it in the Console's tool settings (or use a key from a workspace where it's enabled), then retry.";
    return `Research request failed: ${body}`;
  }
  if (status === 429) return `${name} is rate-limiting this request; try again shortly.`;
  if (status >= 500) return `${name} is temporarily unavailable; try again shortly.`;
  return `Provider request failed (${status}): ${body}`;
}

/** The single serialized request shape for every streamed Anthropic call. */
export function buildRequestBody(model: string, messages: Record<string, unknown>[], search: boolean, test = false): Record<string, unknown> {
  const body: Record<string, unknown> = { model, max_tokens:resolveRequestedOutputTokens("anthropic", search, test), stream:true, thinking:{ type:"adaptive", display:"summarized" }, messages };
  if (search) body.tools = [{ type:ANTHROPIC_WEB_SEARCH_TOOL, name:"web_search", max_uses:8 }];
  return body;
}

// A 400 that rejects the `reasoning` parameter (some OpenAI models don't
// support reasoning summaries) is retried once without it; this flag then
// persists for the rest of the worker's lifetime so later calls don't pay
// the extra round trip again.
let openAiSkipReasoning = false;

/**
 * Flattens a persisted assistant turn's provider-owned content blocks (the
 * shape the Anthropic pause_turn continuation replays verbatim) down to
 * plain text. OpenAI's continuation loop normally returns after a single
 * complete turn, so this only matters when a worker crash between onTurn's
 * persist and the researchComplete persist forces a resumed job to replay
 * an already-appended assistant turn — those Anthropic-shaped blocks
 * (`type:"text"`, `"thinking"`, `"server_tool_use"`, `"web_search_tool_result"`)
 * are not valid Responses API input items and would otherwise 400 on every
 * retry.
 */
function toResponsesInput(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  return messages.map(message => {
    if (!Array.isArray(message.content)) return message;
    const text = (message.content as Record<string, unknown>[])
      .map(block => (typeof block.text === "string" ? block.text : ""))
      .join("");
    return { role:message.role, content:text };
  });
}

/** The single serialized request shape for every streamed OpenAI Responses call. */
export function buildOpenAIRequestBody(model: string, messages: Record<string, unknown>[], search: boolean, test = false, skipReasoning = false): Record<string, unknown> {
  const body: Record<string, unknown> = { model, input:toResponsesInput(messages), max_output_tokens:resolveRequestedOutputTokens("openai", search, test), stream:true };
  if (!skipReasoning) body.reasoning = { summary:"auto" };
  if (search) body.tools = [{ type:"web_search", search_context_size:"medium" }];
  return body;
}

export interface ProviderStreamResult extends AssembledStream { authenticated: boolean; }

async function readEventStream(response: Response, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const packet of events) {
      const data = packet.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      onEvent(JSON.parse(data) as Record<string, unknown>);
    }
  }
}

async function streamAnthropic(
  key: string,
  model: string,
  messages: Record<string, unknown>[],
  signal: AbortSignal,
  search: boolean,
  onText: (text: string, thinking: string) => void,
  test: boolean,
): Promise<ProviderStreamResult> {
  const response = await fetch(ANTHROPIC_URL, { method:"POST", signal, headers:{ "content-type":"application/json", "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" }, body:JSON.stringify(buildRequestBody(model,messages,search,test)) });
  if (!response.ok || !response.body) throw new Error(classifyProviderError("anthropic", response.status, await response.text(), search));

  const assembler = new StreamAssembler();
  let sawStart = false;
  await readEventStream(response, event => {
    if (event.type === "error") throw new Error(String((event.error as Record<string, unknown>)?.message || "Provider stream error"));
    if (event.type === "message_start") sawStart = true;
    const before = assembler.result();
    assembler.apply(event as never);
    const after = assembler.result();
    const deltaText = after.accumulatedText.slice(before.accumulatedText.length);
    const thinking = event.type === "content_block_delta" && (event.delta as Record<string,unknown>)?.type === "thinking_delta" ? String((event.delta as Record<string,unknown>).thinking || "") : "";
    if (deltaText || thinking) onText(deltaText, thinking);
  });
  const result = assembler.result();
  if (!result.complete && !test) throw new Error("Provider stream ended before message completion.");
  return { ...result, authenticated:sawStart };
}

async function streamOpenAI(
  key: string,
  model: string,
  messages: Record<string, unknown>[],
  signal: AbortSignal,
  search: boolean,
  onText: (text: string, thinking: string) => void,
  test: boolean,
): Promise<ProviderStreamResult> {
  const headers = { "content-type":"application/json", "authorization":`Bearer ${key}` };
  let response = await fetch(OPENAI_URL, { method:"POST", signal, headers, body:JSON.stringify(buildOpenAIRequestBody(model,messages,search,test,openAiSkipReasoning)) });
  if (!response.ok && response.status === 400 && !openAiSkipReasoning) {
    const rejection = await response.text();
    if (/reasoning/i.test(rejection)) {
      openAiSkipReasoning = true;
      response = await fetch(OPENAI_URL, { method:"POST", signal, headers, body:JSON.stringify(buildOpenAIRequestBody(model,messages,search,test,true)) });
    } else {
      throw new Error(classifyProviderError("openai", response.status, rejection, search));
    }
  }
  if (!response.ok || !response.body) throw new Error(classifyProviderError("openai", response.status, await response.text(), search));

  const assembler = new OpenAIStreamAssembler();
  let sawStart = false;
  await readEventStream(response, event => {
    const type = String(event.type || "");
    if (type === "error") throw new Error(String(event.message || "Provider stream error"));
    if (type === "response.created" || type === "response.in_progress") sawStart = true;
    const before = assembler.result();
    assembler.apply(event);
    const after = assembler.result();
    const deltaText = after.accumulatedText.slice(before.accumulatedText.length);
    const thinking = type === "response.reasoning_summary_text.delta" ? String(event.delta || "") : "";
    if (deltaText || thinking) onText(deltaText, thinking);
  });
  const result = assembler.result();
  if (!result.complete && !test) throw new Error("Provider stream ended before message completion.");
  return { ...result, authenticated:sawStart };
}

/**
 * Streams a provider response into the lossless assembler. This module owns
 * HTTP/SSE details; the job coordinator only receives complete message turns.
 */
export async function streamProviderRequest(
  provider: Provider,
  key: string,
  model: string,
  messages: Record<string, unknown>[],
  signal: AbortSignal,
  search: boolean,
  onText: (text: string, thinking: string) => void,
  test = false,
): Promise<ProviderStreamResult> {
  return provider === "openai"
    ? streamOpenAI(key, model, messages, signal, search, onText, test)
    : streamAnthropic(key, model, messages, signal, search, onText, test);
}
