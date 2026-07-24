import type { Provider } from "./aiClient/provider";

export interface ModelOption {
  id: string;
  label: string;
  /** Total input+output token budget the provider admits for this model. */
  contextWindowTokens: number;
  /** The largest output-token limit this model accepts for a single request. */
  maxOutputTokens: number;
}

/**
 * Maintained static catalog of supported provider model IDs. The combined
 * report's model selector only ever offers these — no free-text model IDs.
 * Update this list (and DEFAULT_MODEL below) as providers ship new models.
 *
 * contextWindowTokens/maxOutputTokens are deliberately conservative
 * placeholders carried over pending the Slice A live catalog/capacity
 * verification gate (see the "Provider Model Catalog Verification Log" in
 * STORE_SUBMISSION.md) — that verification requires a live, authorized
 * account against each provider's current API/documentation, which cannot be
 * performed in this environment. Do not treat these numbers as authoritative
 * until a corresponding log row exists; assertRequestFitsModel deliberately
 * errs toward rejecting a borderline request over risking a provider-side
 * overflow.
 */
export const KNOWN_MODELS: Record<Provider, readonly ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", contextWindowTokens: 200_000, maxOutputTokens: 32_000 },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", contextWindowTokens: 200_000, maxOutputTokens: 64_000 },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", contextWindowTokens: 200_000, maxOutputTokens: 64_000 },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", contextWindowTokens: 200_000, maxOutputTokens: 64_000 },
  ],
  openai: [
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", contextWindowTokens: 272_000, maxOutputTokens: 128_000 },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", contextWindowTokens: 272_000, maxOutputTokens: 128_000 },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", contextWindowTokens: 128_000, maxOutputTokens: 16_000 },
    { id: "gpt-5.6", label: "GPT-5.6", contextWindowTokens: 272_000, maxOutputTokens: 64_000 },
  ],
};

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-5.6-terra",
};

export function getKnownModelOption(provider: Provider, model: string | undefined | null): ModelOption | undefined {
  const trimmed = (model || "").trim();
  if (!trimmed) return undefined;
  return KNOWN_MODELS[provider].find(option => option.id === trimmed);
}

/** Replaces an empty, stale, or custom saved model value with the verified default for that provider. */
export function resolveKnownModel(provider: Provider, value: string | undefined | null): string {
  return getKnownModelOption(provider, value)?.id ?? DEFAULT_MODEL[provider];
}
