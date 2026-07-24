import { byteSize } from "../career/bytes";
import { getKnownModelOption } from "../models";
import { PROVIDER_LABEL, type Provider } from "./provider";

// Conservative, pre-request token budgeting. This is the worker's
// authoritative chokepoint: every streamed provider call (test, research,
// synthesis, retry, resume, regeneration) must pass its exact assembled
// request through assertRequestFitsModel immediately before the network
// call. On overflow this throws locally and no provider request is made.

/** The message array shape passed to streamProviderRequest — the same value whose serialized bytes are actually transmitted. */
export type ProviderRequest = Record<string, unknown>[];

export interface RequestBudget {
  contextWindowTokens: number;
  requestedOutputTokens: number;
  inputTokenUpperBound: number;
  maximumInputTokens: number;
}

/** Thrown by assertRequestFitsModel; callers should surface `.message` directly without making a provider call. */
export class ModelBudgetError extends Error {}

// Fixed per-request framing (provider envelope fields, headers folded into
// the JSON body, etc.) and a small per-message reserve (role field, JSON
// punctuation beyond what JSON.stringify already counts for content). Kept
// deliberately small since byte-based token estimation is itself already
// conservative.
const FRAMING_RESERVE_TOKENS: Record<Provider, number> = { anthropic: 200, openai: 200 };
const PER_MESSAGE_RESERVE_TOKENS = 8;

/**
 * A conservative upper bound on the number of tokens a request could occupy:
 * the exact UTF-8 byte size of the serialized request, treating each byte as
 * at least one possible token, plus fixed framing and per-message reserves.
 * Real tokenizers virtually always produce fewer tokens than bytes, so this
 * never underestimates.
 */
export function estimateRequestTokenUpperBound(provider: Provider, request: ProviderRequest): number {
  const serializedBytes = byteSize(JSON.stringify(request));
  const framing = FRAMING_RESERVE_TOKENS[provider];
  const perMessage = request.length * PER_MESSAGE_RESERVE_TOKENS;
  return serializedBytes + framing + perMessage;
}

/**
 * Validates a fully assembled request against the selected model's verified
 * capacity before it is sent. Reserves the requested output ceiling first,
 * then requires the conservative input estimate to fit what remains of the
 * context window. Throws ModelBudgetError (never makes a provider call) when
 * either bound is exceeded or the model is not a known, listed model.
 */
export function assertRequestFitsModel(provider: Provider, model: string, request: ProviderRequest, requestedOutputTokens: number): RequestBudget {
  const option = getKnownModelOption(provider, model);
  if (!option) throw new ModelBudgetError(`"${model}" is not a supported ${PROVIDER_LABEL[provider]} model — select a listed model.`);
  const { contextWindowTokens, maxOutputTokens, label } = option;
  if (requestedOutputTokens > maxOutputTokens) {
    throw new ModelBudgetError(`This request's output limit (${requestedOutputTokens} tokens) exceeds ${label}'s maximum output of ${maxOutputTokens} tokens.`);
  }
  const inputTokenUpperBound = estimateRequestTokenUpperBound(provider, request);
  const maximumInputTokens = Math.max(0, contextWindowTokens - requestedOutputTokens);
  if (inputTokenUpperBound > maximumInputTokens) {
    throw new ModelBudgetError(`This request is too large for ${label}: an estimated ${inputTokenUpperBound} input tokens exceeds the ${maximumInputTokens} tokens available after reserving ${requestedOutputTokens} for output (${contextWindowTokens}-token context window). Trim the context or select a model with more capacity.`);
  }
  return { contextWindowTokens, requestedOutputTokens, inputTokenUpperBound, maximumInputTokens };
}
