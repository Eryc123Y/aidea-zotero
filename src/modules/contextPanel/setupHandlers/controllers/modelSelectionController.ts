import {
  MODEL_PROFILE_ORDER,
  type ModelProfileKey,
} from "../../constants";
import {
  getApiProfiles,
  getStringPref,
} from "../../prefHelpers";
import { selectedModelCache } from "../../state";
import {
  markerToProvider,
  type OAuthProviderId,
  type ProviderModelOption,
} from "../../../../utils/oauthCli";
import {
  getSelectedProviderModels,
  normalizeModelId,
  parseModelSelectionCache,
} from "../../../../utils/oauthModelSelection";

function detectProvider(apiBase: string): string {
  if (apiBase.includes("openai-codex")) return "Codex";
  if (apiBase.includes("google-gemini")) return "Gemini";
  if (apiBase.includes("qwen")) return "Qwen";
  if (apiBase.includes("github-copilot")) return "Copilot";
  return "";
}

function detectOAuthProvider(apiBase: string): OAuthProviderId | null {
  const normalized = String(apiBase || "").trim();
  if (!normalized) return null;
  return markerToProvider(normalized);
}

function parseOAuthModelCache():
  Partial<Record<OAuthProviderId, ProviderModelOption[]>> {
  const cacheRaw = getStringPref("oauthModelListCache").trim();
  if (!cacheRaw) return {};
  try {
    const parsed = JSON.parse(
      cacheRaw,
    ) as Partial<Record<OAuthProviderId, ProviderModelOption[]>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export type ModelChoice = {
  key: ModelProfileKey;
  model: string;
  provider?: string;
};

export function getModelChoices() {
  const profiles = getApiProfiles();
  const primaryModel = profiles.primary.model.trim();
  const choices: ModelChoice[] = [];
  const seenModels = new Set<string>();
  const modelCache = parseOAuthModelCache();
  const selectionCache = parseModelSelectionCache(
    getStringPref("oauthModelSelectionCache"),
  );

  for (const key of MODEL_PROFILE_ORDER) {
    const model = (
      key === "primary" ? primaryModel : profiles[key].model
    ).trim();
    if (!model) continue;

    const providerId = detectOAuthProvider(profiles[key].apiBase);
    const normalized = normalizeModelId(model);
    if (providerId) {
      const providerModels = modelCache[providerId] || [];
      if (providerModels.length > 0) {
        const selectedIds = new Set(
          getSelectedProviderModels(
            providerId,
            providerModels,
            selectionCache,
          ).map((row) => normalizeModelId(row.id)),
        );
        if (!selectedIds.has(normalized)) continue;
      }
    }

    if (seenModels.has(normalized)) continue;
    seenModels.add(normalized);
    choices.push({
      key,
      model,
      provider: detectProvider(profiles[key].apiBase),
    });
  }

  const profileKeys: ModelProfileKey[] = [
    "primary",
    "secondary",
    "tertiary",
    "quaternary",
  ];
  let slotIdx = choices.length;
  const providerLabels: Record<OAuthProviderId, string> = {
    "openai-codex": "Codex",
    "google-gemini-cli": "Gemini",
    qwen: "Qwen",
    "github-copilot": "Copilot",
  };

  for (const provider of Object.keys(modelCache) as OAuthProviderId[]) {
    const providerModels = getSelectedProviderModels(
      provider,
      modelCache[provider] || [],
      selectionCache,
    );
    for (const row of providerModels) {
      const id = String(row.id || "").trim();
      const normalized = normalizeModelId(id);
      if (!id || seenModels.has(normalized)) continue;
      seenModels.add(normalized);
      const key = profileKeys[slotIdx % profileKeys.length] || "primary";
      choices.push({
        key,
        model: id,
        provider: providerLabels[provider] || provider,
      });
      slotIdx += 1;
    }
  }

  choices.sort((a, b) => (a.provider || "").localeCompare(b.provider || ""));
  return { profiles, choices };
}

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

export function getSelectedModelInfo(itemId: number | null) {
  const { choices } = getModelChoices();
  if (itemId === null) {
    return {
      selected: "primary" as const,
      choices,
      currentModel: choices[0]?.model || "",
    };
  }

  const cachedSelection = selectedModelCache.get(itemId);
  if (cachedSelection) {
    const isProfileKey = (
      ["primary", "secondary", "tertiary", "quaternary"] as const
    ).includes(cachedSelection as ModelProfileKey);
    if (!isProfileKey) {
      const byModel = choices.find((entry) => entry.model === cachedSelection);
      if (byModel) {
        return {
          selected: byModel.key,
          choices,
          currentModel: byModel.model,
        };
      }
    }
    const byKey = choices.find((entry) => entry.key === cachedSelection);
    if (byKey) {
      return {
        selected: cachedSelection,
        choices,
        currentModel: byKey.model,
      };
    }
  }

  const persistedModel = getPersistedModelName();
  if (persistedModel) {
    const byPersisted = choices.find(
      (entry) => entry.model.toLowerCase() === persistedModel.toLowerCase(),
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

  const bestDefault = pickBestDefaultModel(choices);
  if (bestDefault) {
    selectedModelCache.set(itemId, bestDefault);
    return {
      selected: choices.find((entry) => entry.model === bestDefault)?.key || "primary",
      choices,
      currentModel: bestDefault,
    };
  }

  const first = choices[0];
  return {
    selected: first?.key || "primary",
    choices,
    currentModel: first?.model || "",
  };
}
