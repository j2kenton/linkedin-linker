import { StreamAssembler, type AssembledStream } from "./streamAssembler";

export const DEFAULT_MODEL = "claude-opus-4-8";
const WEB_SEARCH_TOOL = "web_search_20260209";

export function classifyProviderError(status: number, body: string, research: boolean): string {
  if (status === 401) return "The Anthropic API key was rejected.";
  if (research && (status === 400 || status === 403)) {
    const text = body.toLowerCase();
    if (/(model|tool).*(support|compatib)|web_search.*model/.test(text)) return "This model doesn't support web search — pick another or clear the override.";
    if (/(organization|workspace|org).*(disable|unavailable)|permission_error.*web.?search/.test(text)) return "Web search is disabled for your Anthropic organization — enable it in the Console's tool settings (or use a key from a workspace where it's enabled), then retry.";
    return `Research request failed: ${body}`;
  }
  if (status === 429) return "Anthropic is rate-limiting this request; try again shortly.";
  if (status >= 500) return "Anthropic is temporarily unavailable; try again shortly.";
  return `Provider request failed (${status}): ${body}`;
}

/** The single serialized request shape for every streamed Anthropic call. */
export function buildRequestBody(model: string, messages: Record<string, unknown>[], search: boolean, test = false): Record<string, unknown> {
  const body: Record<string, unknown> = { model, max_tokens:test ? 16 : search ? 6000 : 9000, stream:true, thinking:{ type:"adaptive", display:"summarized" }, messages };
  if (search) body.tools = [{ type:WEB_SEARCH_TOOL, name:"web_search", max_uses:8 }];
  return body;
}

export interface ProviderStreamResult extends AssembledStream { authenticated: boolean; }

/**
 * Streams a provider response into the lossless assembler. This module owns
 * HTTP/SSE details; the job coordinator only receives complete message turns.
 */
export async function streamProviderRequest(
  key: string,
  model: string,
  messages: Record<string, unknown>[],
  signal: AbortSignal,
  search: boolean,
  onText: (text: string, thinking: string) => void,
  test = false,
): Promise<ProviderStreamResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", signal, headers:{ "content-type":"application/json", "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" }, body:JSON.stringify(buildRequestBody(model,messages,search,test)) });
  if (!response.ok || !response.body) throw new Error(classifyProviderError(response.status, await response.text(), search));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const assembler = new StreamAssembler();
  let buffer = "";
  let sawStart = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const packet of events) {
      const data = packet.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as Record<string, unknown>;
      if (event.type === "error") throw new Error(String((event.error as Record<string, unknown>)?.message || "Provider stream error"));
      if (event.type === "message_start") sawStart = true;
      const before = assembler.result();
      assembler.apply(event as never);
      const after = assembler.result();
      const deltaText = after.accumulatedText.slice(before.accumulatedText.length);
      const thinking = event.type === "content_block_delta" && (event.delta as Record<string,unknown>)?.type === "thinking_delta" ? String((event.delta as Record<string,unknown>).thinking || "") : "";
      if (deltaText || thinking) onText(deltaText, thinking);
    }
  }
  const result = assembler.result();
  if (!result.complete && !test) throw new Error("Provider stream ended before message completion.");
  return { ...result, authenticated:sawStart };
}
