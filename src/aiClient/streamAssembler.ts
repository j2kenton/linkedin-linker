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

/**
 * Reconstructs OpenAI Responses API streaming output into the same
 * AssembledStream shape StreamAssembler produces, so runJob/research.ts stay
 * provider-agnostic. Blocks are shaped to match Anthropic's content-block
 * contract (`text` + `citations`, `web_search_tool_result`) wherever the
 * downstream code (sourceTable, toolResultWarnings) reads them.
 */
export class OpenAIStreamAssembler {
  private items = new Map<number, Record<string, unknown>>();
  private text = "";
  private stopReason?: string;
  private usage?: Record<string, unknown>;
  private complete = false;

  private toBlock(item: Record<string, unknown>): Record<string, unknown> {
    if (item?.type === "message") return { type:"text", text:"" };
    if (item?.type === "reasoning") return { type:"thinking", thinking:"" };
    if (item?.type === "web_search_call") return { type:"server_tool_use", name:"web_search" };
    return { ...item };
  }

  apply(event: Record<string, unknown>): void {
    const type = String(event.type || "");
    if (type === "response.output_item.added") {
      const index = Number(event.output_index);
      if (!Number.isFinite(index)) throw new Error("Malformed output item start");
      this.items.set(index, this.toBlock((event.item as Record<string, unknown>) || {}));
      return;
    }
    if (type === "response.output_text.delta") {
      const index = Number(event.output_index);
      const block = this.items.get(index);
      if (!block) throw new Error("Delta received before item start");
      const delta = String(event.delta || "");
      block.text = String(block.text || "") + delta;
      this.text += delta;
      return;
    }
    if (type === "response.output_text.annotation.added") {
      const index = Number(event.output_index);
      const block = this.items.get(index);
      if (!block) throw new Error("Annotation received before item start");
      const annotation = event.annotation as Record<string, unknown> | undefined;
      if (annotation?.type === "url_citation") {
        const text = String(block.text || "");
        const start = Number(annotation.start_index);
        const end = Number(annotation.end_index);
        const citedText = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= text.length
          ? text.slice(start, end)
          : undefined;
        const citations = Array.isArray(block.citations) ? block.citations : [];
        citations.push({ url:annotation.url, title:annotation.title, cited_text:citedText });
        block.citations = citations;
      }
      return;
    }
    if (type === "response.reasoning_summary_text.delta") {
      const index = Number(event.output_index);
      const block = this.items.get(index);
      if (block) block.thinking = String(block.thinking || "") + String(event.delta || "");
      return;
    }
    if (type === "response.output_item.done") {
      const index = Number(event.output_index);
      const item = (event.item as Record<string, unknown>) || {};
      if (item.type === "web_search_call" && item.status !== "completed") {
        const error = item.error as Record<string, unknown> | undefined;
        this.items.set(index, { type:"web_search_tool_result", content:{ error_code:String(error?.code || item.status || "failed") } });
        return;
      }
      // Deltas already populated this item's block; a done event only needs
      // to backfill an item this assembler never saw start (forward-compat).
      if (!this.items.has(index)) this.items.set(index, this.toBlock(item));
      return;
    }
    if (type === "response.completed") {
      const response = (event.response as Record<string, unknown>) || {};
      this.usage = response.usage as Record<string, unknown> | undefined;
      this.stopReason = "end_turn";
      this.complete = true;
      return;
    }
    if (type === "response.incomplete") {
      const response = (event.response as Record<string, unknown>) || {};
      this.usage = response.usage as Record<string, unknown> | undefined;
      const reason = (response.incomplete_details as Record<string, unknown> | undefined)?.reason;
      this.stopReason = reason === "max_output_tokens" ? "max_tokens" : String(reason || "incomplete");
      this.complete = true;
      return;
    }
    if (type === "response.failed") {
      const response = (event.response as Record<string, unknown>) || {};
      throw new Error(String((response.error as Record<string, unknown>)?.message || "Provider stream error"));
    }
    // A delta event not explicitly handled above carries content (text,
    // function-call arguments, audio, refusals, …) this assembler doesn't
    // know how to fold into the block it belongs to — mirrors
    // StreamAssembler's fail-closed handling of unsupported content-block
    // deltas so unrecognized content is surfaced, not silently dropped.
    if (/\.delta$/.test(type)) throw new Error(`Unsupported stream delta: ${type}. This model streamed content this extension version can't safely replay.`);
    // response.created, response.in_progress, response.content_part.*,
    // response.web_search_call.*, response.reasoning_summary_part.* and any
    // future non-delta event types are forward-compatible no-ops here.
  }

  result(): AssembledStream {
    const content = [...this.items.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    return { content, accumulatedText:this.text, stopReason:this.stopReason, usage:this.usage, complete:this.complete };
  }
}
