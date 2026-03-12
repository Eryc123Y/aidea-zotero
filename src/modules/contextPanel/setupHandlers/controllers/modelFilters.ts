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
 * Classify a model into one of four groups based on its suffix.
 *   - "codex-max"  : ends with "-codex-max"
 *   - "codex"      : ends with "-codex" (exact, no further suffix)
 *   - "other-codex": contains "-codex-" but is NOT "-codex-max" (e.g. -codex-mini)
 *   - "non-codex"  : does not contain "-codex" at all
 */
function classifyCodexSuffix(model: string): "codex-max" | "codex" | "other-codex" | "non-codex" {
  if (/-codex-max$/i.test(model)) return "codex-max";
  if (/-codex$/i.test(model)) return "codex";
  if (/-codex-/i.test(model)) return "other-codex";
  return "non-codex";
}

/**
 * OpenAI / Codex filter rule:
 *
 *  1. Classify models into groups: non-codex, codex, codex-max, other-codex.
 *  2. Parse GPT version from each model's ID.
 *  3. Keep top 2 non-codex by version, top 1 codex, top 1 codex-max.
 *  4. Discard other-codex variants (e.g. -codex-mini).
 *  5. Non-GPT models (no version parseable) pass through unchanged.
 *
 * Example:
 *   Input:  gpt-5, gpt-5.1, gpt-5.2,
 *           gpt-5-codex, gpt-5.1-codex, gpt-5.3-codex,
 *           gpt-5.1-codex-max, gpt-5.2-codex-max,
 *           gpt-5-codex-mini, gpt-5.1-codex-mini
 *   Output: gpt-5.2, gpt-5.1,    (non-codex top 2)
 *           gpt-5.3-codex,        (codex top 1)
 *           gpt-5.2-codex-max     (codex-max top 1)
 */
function filterOpenAICodexModels(models: ModelChoice[]): ModelChoice[] {
  // Track top-N candidates for each group: { choice, version }
  const nonCodexTop: Array<{ choice: ModelChoice; version: number }> = [];
  let bestCodex: ModelChoice | null = null;
  let bestCodexVersion = -1;
  let bestCodexMax: ModelChoice | null = null;
  let bestCodexMaxVersion = -1;
  const nonGpt: ModelChoice[] = [];

  for (const choice of models) {
    const version = parseGptVersion(choice.model);
    if (version === null) {
      nonGpt.push(choice);
      continue;
    }

    const group = classifyCodexSuffix(choice.model);
    switch (group) {
      case "non-codex":
        nonCodexTop.push({ choice, version });
        break;
      case "codex":
        if (version > bestCodexVersion) {
          bestCodexVersion = version;
          bestCodex = choice;
        }
        break;
      case "codex-max":
        if (version > bestCodexMaxVersion) {
          bestCodexMaxVersion = version;
          bestCodexMax = choice;
        }
        break;
      case "other-codex":
        // discard (e.g. -codex-mini)
        break;
    }
  }

  // Sort non-codex by version descending and keep top 2
  nonCodexTop.sort((a, b) => b.version - a.version);
  const result: ModelChoice[] = nonCodexTop.slice(0, 2).map((e) => e.choice);
  if (bestCodex) result.push(bestCodex);
  if (bestCodexMax) result.push(bestCodexMax);
  result.push(...nonGpt);
  return result;
}
