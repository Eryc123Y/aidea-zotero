import type { ModelChoice } from "./modelSelectionController";

/**
 * Provider-specific model filter registry.
 *
 * Each key is a provider label (e.g., "Codex", "Gemini") matching the
 * `provider` field on ModelChoice entries.  The value is a filter function
 * that receives all choices belonging to that provider and returns the
 * subset that should be shown in the dropdown.
 *
 * To add filtering for a new provider, register a new entry here.
 */
const PROVIDER_FILTERS: Record<
  string,
  (models: ModelChoice[]) => ModelChoice[]
> = {
  Codex: filterOpenAICodexModels,
  // Future examples:
  // Gemini: filterGeminiModels,
};

/**
 * Apply provider-specific filters to the full model list.
 * Models whose provider has no registered filter pass through unchanged.
 */
export function applyModelFilters(choices: ModelChoice[]): ModelChoice[] {
  // Group choices by provider label
  const grouped = new Map<string, ModelChoice[]>();
  const passthrough: ModelChoice[] = [];

  for (const choice of choices) {
    const provider = choice.provider || "";
    if (provider && PROVIDER_FILTERS[provider]) {
      const group = grouped.get(provider) || [];
      group.push(choice);
      grouped.set(provider, group);
    } else {
      passthrough.push(choice);
    }
  }

  // Apply each provider's filter, then merge back
  const filtered: ModelChoice[] = [...passthrough];
  for (const [provider, group] of grouped) {
    const filter = PROVIDER_FILTERS[provider];
    filtered.push(...(filter ? filter(group) : group));
  }

  // Preserve original provider-group ordering
  filtered.sort(
    (a, b) => (a.provider || "").localeCompare(b.provider || ""),
  );

  return filtered;
}

// ─── OpenAI / Codex filter ────────────────────────────────────────────

const GPT_VERSION_RE = /^gpt-(\d+(?:\.\d+)?)/i;
const CODEX_SUFFIX_RE = /-codex(?:-|$)/i;

/**
 * Parse the GPT major.minor version from a model ID.
 * e.g., "gpt-5.2" → 5.2, "gpt-5.1-codex-max" → 5.1
 */
function parseGptVersion(model: string): number | null {
  const m = model.match(GPT_VERSION_RE);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * OpenAI / Codex filter rule:
 *
 *  1. Split models into two groups: codex (contains "-codex") and non-codex.
 *  2. Parse GPT version from each model's ID.
 *  3. Keep only the highest-version model from each group.
 *  4. Non-GPT models (no version parseable) pass through unchanged.
 *
 * Example:
 *   Input:  gpt-5, gpt-5.1, gpt-5.2, gpt-5-codex, gpt-5.1-codex,
 *           gpt-5.1-codex-max, gpt-5.1-codex-mini, gpt-5.2-codex,
 *           gpt-5.3-codex, gpt-5-codex-mini
 *   Output: gpt-5.2, gpt-5.3-codex
 */
function filterOpenAICodexModels(models: ModelChoice[]): ModelChoice[] {
  let bestCodex: ModelChoice | null = null;
  let bestCodexVersion = -1;
  let bestNonCodex: ModelChoice | null = null;
  let bestNonCodexVersion = -1;
  const nonGpt: ModelChoice[] = [];

  for (const choice of models) {
    const version = parseGptVersion(choice.model);
    if (version === null) {
      nonGpt.push(choice);
      continue;
    }
    const isCodex = CODEX_SUFFIX_RE.test(choice.model);
    if (isCodex) {
      if (version > bestCodexVersion) {
        bestCodexVersion = version;
        bestCodex = choice;
      }
    } else {
      if (version > bestNonCodexVersion) {
        bestNonCodexVersion = version;
        bestNonCodex = choice;
      }
    }
  }

  const result: ModelChoice[] = [];
  if (bestNonCodex) result.push(bestNonCodex);
  if (bestCodex) result.push(bestCodex);
  result.push(...nonGpt);
  return result;
}
