import {
  MODEL_PROFILE_ORDER,
  type ModelProfileKey,
} from "../../constants";
import {
  getApiProfiles,
  getStringPref,
} from "../../prefHelpers";
import { selectedModelCache } from "../../state";
import { applyModelFilters } from "./modelFilters";

/**
 * Detect provider label from apiBase URL.
 */
function detectProvider(apiBase: string): string {
  if (apiBase.includes("openai-codex")) return "Codex";
  if (apiBase.includes("google-gemini")) return "Gemini";
  return "";
}

/**
 * Normalize model identifier for dedup comparison.
 */
function normalizeModelId(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export type ModelChoice = {
  key: ModelProfileKey;
  model: string;
  provider?: string;
};

/**
 * Collect available model choices from API profiles and OAuth cache.
 */
export function getModelChoices() {
  const profiles = getApiProfiles();
  const primaryModel = profiles.primary.model.trim();
  const choices: ModelChoice[] = [];
  const seenModels = new Set<string>();

  for (const key of MODEL_PROFILE_ORDER) {
    const model = (
      key === "primary" ? primaryModel : profiles[key].model
    ).trim();
    if (!model) continue;
    const normalized = normalizeModelId(model);
    if (seenModels.has(normalized)) continue;
    seenModels.add(normalized);
    const provider = detectProvider(profiles[key].apiBase);
    choices.push({ key, model, provider });
  }

  // Also read the full OAuth model cache to include all dynamically fetched
  // models beyond the 4 profile slots.
  try {
    const cacheRaw = getStringPref("oauthModelListCache").trim();
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw) as Record<string, Array<{ id: string }>>;
      const profileKeys: ModelProfileKey[] = ["primary", "secondary", "tertiary", "quaternary"];
      let slotIdx = choices.length;
      const providerLabels: Record<string, string> = {
        "openai-codex": "Codex",
        "google-gemini-cli": "Gemini",
      };
      for (const [providerKey, providerModels] of Object.entries(cache)) {
        if (!Array.isArray(providerModels)) continue;
        const providerLabel = providerLabels[providerKey] || providerKey;
        for (const m of providerModels) {
          const id = String(m.id || "").trim();
          if (!id) continue;
          const normalized = normalizeModelId(id);
          if (seenModels.has(normalized)) continue;
          seenModels.add(normalized);
          const key = profileKeys[slotIdx % profileKeys.length] || "primary";
          choices.push({ key, model: id, provider: providerLabel });
          slotIdx++;
        }
      }
    }
  } catch {
    // ignore cache parse errors
  }
  // Sort by provider so models from the same provider are grouped together
  choices.sort((a, b) => (a.provider || "").localeCompare(b.provider || ""));

  // Check if user wants all models shown (no filtering)
  let showAll = false;
  try {
    const v = Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.showAllModels`, true);
    showAll = v === true || `${v || ""}`.toLowerCase() === "true";
  } catch { /* ignore */ }

  // Apply provider-specific filters to reduce dropdown clutter (unless show-all is on)
  const filtered = showAll ? choices : applyModelFilters(choices);

  return { profiles, choices: filtered };
}

/**
 * Pick the best default model from choices:
 * Highest version gpt-X.Y that does NOT end with "-codex", "-codex-mini", "-codex-max", etc.
 * Falls back to the first model if none match.
 */
export function pickBestDefaultModel(choices: ModelChoice[]): string {
  const parseGptVersion = (model: string): number | null => {
    const m = model.match(/^gpt-(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    return parseFloat(m[1]);
  };
  const isCodexSuffix = (model: string): boolean =>
    /-(codex|codex-mini|codex-max)$/i.test(model);

  let bestModel = "";
  let bestVersion = -1;
  for (const entry of choices) {
    const version = parseGptVersion(entry.model);
    if (version === null) continue;
    if (isCodexSuffix(entry.model)) continue;
    if (version > bestVersion) {
      bestVersion = version;
      bestModel = entry.model;
    }
  }
  return bestModel || choices[0]?.model || "";
}

const LAST_MODEL_NAME_PREF = "lastUsedModelName";

export function getPersistedModelName(): string {
  return getStringPref(LAST_MODEL_NAME_PREF).trim();
}

export function persistModelName(modelName: string): void {
  try {
    Zotero.Prefs.set(
      `${addon.data.config.prefsPrefix}.${LAST_MODEL_NAME_PREF}`,
      modelName,
      true,
    );
  } catch { /* ignore */ }
}

/**
 * Resolve the currently selected model for the given item.
 * Checks: session cache → persisted pref → best default → first available.
 */
export function getSelectedModelInfo(itemId: number | null) {
  const { choices } = getModelChoices();
  if (itemId === null) {
    return {
      selected: "primary" as const,
      choices,
      currentModel: choices[0]?.model || "",
    };
  }

  // 1. In-session cache (current session selection for this item)
  const cachedSelection = selectedModelCache.get(itemId);
  if (cachedSelection) {
    const isProfileKey = (["primary", "secondary", "tertiary", "quaternary"] as const)
      .includes(cachedSelection as ModelProfileKey);
    if (!isProfileKey) {
      const byModel = choices.find((e) => e.model === cachedSelection);
      if (byModel) {
        return {
          selected: byModel.key,
          choices,
          currentModel: byModel.model,
        };
      }
    }
    const byKey = choices.find((e) => e.key === cachedSelection);
    if (byKey) {
      return {
        selected: cachedSelection,
        choices,
        currentModel: byKey.model,
      };
    }
  }

  // 2. Persisted model name from previous session/conversation
  const persistedModel = getPersistedModelName();
  if (persistedModel) {
    const byPersisted = choices.find(
      (e) => e.model.toLowerCase() === persistedModel.toLowerCase(),
    );
    if (byPersisted) {
      selectedModelCache.set(itemId, byPersisted.model);
      return {
        selected: byPersisted.key,
        choices,
        currentModel: byPersisted.model,
      };
    }
  }

  // 3. Pick best default: highest gpt-X without -codex suffix
  const bestDefault = pickBestDefaultModel(choices);
  if (bestDefault) {
    selectedModelCache.set(itemId, bestDefault);
    return {
      selected: choices.find((e) => e.model === bestDefault)?.key || "primary",
      choices,
      currentModel: bestDefault,
    };
  }

  // 4. Ultimate fallback
  const first = choices[0];
  return {
    selected: first?.key || "primary",
    choices,
    currentModel: first?.model || "",
  };
}
