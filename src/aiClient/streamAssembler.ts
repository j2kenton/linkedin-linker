export interface AssembledStream { content: Record<string, unknown>[]; accumulatedText: string; stopReason?: string; usage?: Record<string, unknown>; complete: boolean; }

/** Reconstructs provider blocks without narrowing or reserializing provider-owned fields. */
export class StreamAssembler {
  private blocks = new Map<number, Record<string, unknown>>();
  private stopped = new Set<number>();
  private text = "";
  private stopReason?: string;
  private usage?: Record<string, unknown>;
  private complete = false;

  apply(event: { type?: string; index?: number; content_block?: Record<string, unknown>; delta?: Record<string, unknown>; usage?: Record<string, unknown> }): void {
    if (event.type === "message_delta") { this.stopReason = String(event.delta?.stop_reason || ""); this.usage = event.usage || this.usage; return; }
    if (event.type === "message_stop") { this.complete = true; return; }
    if (event.type === "ping" || event.type === "message_start") return;
    if (event.type === "content_block_start") {
      if (typeof event.index !== "number" || !event.content_block) throw new Error("Malformed content block start");
      this.blocks.set(event.index, { ...event.content_block }); return;
    }
    if (event.type === "content_block_stop") {
      if (typeof event.index !== "number" || !this.blocks.has(event.index)) throw new Error("Malformed content block stop");
      const block = this.blocks.get(event.index)!;
      if (typeof block.partial_json === "string") {
        const partial = block.partial_json; delete block.partial_json;
        try { block.input = partial ? JSON.parse(partial) : {}; } catch { throw new Error("Malformed streamed tool input"); }
      }
      this.stopped.add(event.index); return;
    }
    if (event.type !== "content_block_delta" || typeof event.index !== "number") return; // unknown top-level events are forward compatible
    const block = this.blocks.get(event.index); const delta = event.delta || {};
    if (!block) throw new Error("Delta received before block start");
    if (delta.type === "text_delta") { const value = String(delta.text || ""); block.text = String(block.text || "") + value; this.text += value; }
    else if (delta.type === "thinking_delta") block.thinking = String(block.thinking || "") + String(delta.thinking || "");
    else if (delta.type === "signature_delta") block.signature = String(delta.signature || "");
    else if (delta.type === "input_json_delta") block.partial_json = String(block.partial_json || "") + String(delta.partial_json || "");
    else if (delta.type === "citations_delta") { const citations = Array.isArray(block.citations) ? block.citations : []; citations.push(delta.citation); block.citations = citations; }
    else throw new Error(`Unsupported stream delta: ${String(delta.type)}. This model streamed content this extension version can't safely replay.`);
  }

  result(): AssembledStream {
    const content = [...this.blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    return { content, accumulatedText:this.text, stopReason:this.stopReason, usage:this.usage, complete:this.complete };
  }
}
