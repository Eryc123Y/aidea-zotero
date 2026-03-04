import { config } from "../../package.json";
import { HTML_NS } from "../utils/domHelpers";
import {
  autoConfigureEnvironment,
  fetchAvailableModels,
  getProviderAccountSummary,
  getProviderLabel,
  providerToMarker,
  removeProviderOAuthCredential,
  runProviderOAuthLogin,
  type OAuthProviderId,
  type ProviderModelOption,
} from "../utils/oauthCli";
import { clearAllChatHistory } from "../utils/chatStore";
import { renderShortcuts } from "./contextPanel/shortcuts";
import { shortcutRenderItemState } from "./contextPanel/state";
import { getPanelI18n } from "./contextPanel/i18n";

type PrefKey =
  | "apiBase"
  | "apiKey"
  | "model"
  | "apiBasePrimary"
  | "apiKeyPrimary"
  | "modelPrimary"
  | "apiBaseSecondary"
  | "apiKeySecondary"
  | "modelSecondary"
  | "apiBaseTertiary"
  | "apiKeyTertiary"
  | "modelTertiary"
  | "apiBaseQuaternary"
  | "apiKeyQuaternary"
  | "modelQuaternary"
  | "systemPrompt"
  | "oauthModelListCache"
  | "oauthSetupLog"
  | "uiLanguage";

type Lang = "zh-CN" | "en-US";
const PROVIDERS: OAuthProviderId[] = ["openai-codex", "google-gemini-cli"];
const PROFILE_KEYS = ["Primary", "Secondary", "Tertiary", "Quaternary"] as const;

const pref = (key: PrefKey) => `${config.prefsPrefix}.${key}`;
const getPref = (key: PrefKey): string => {
  const value = Zotero.Prefs.get(pref(key), true);
  return typeof value === "string" ? value : "";
};
const setPref = (key: PrefKey, value: string) => Zotero.Prefs.set(pref(key), value, true);

function getLang(): Lang {
  const saved = (getPref("uiLanguage") || "").trim();
  if (saved === "en-US") return "en-US";
  if (saved === "zh-CN") return "zh-CN";
  try {
    return /^zh/i.test(String((Zotero as any)?.locale || "")) ? "zh-CN" : "en-US";
  } catch {
    return "zh-CN";
  }
}

const I18N = {
  "zh-CN": {
    envOAuth: "环境与 OAuth",
    autoSetup: "自动配置环境",
    refreshAllModels: "刷新全部模型列表",
    running: "执行中...",
    setupDone: "环境配置完成",
    setupPartialFail: "环境配置部分失败，请查看日志",
    accounts: "授权账号",
    models: "可用模型列表",
    language: "界面语言",
    langZh: "CN",
    langEn: "EN",
    oauthLogin: "OAuth 登录",
    oauthDelete: "删除授权",
    refreshModels: "刷新模型",
    loggingIn: "正在启动 OAuth 登录...",
    refreshingModels: "正在刷新模型列表...",
    noModels: "暂无模型（请先完成 OAuth 登录并刷新模型列表）",
    provider: "提供商",
    account: "账号",
    status: "状态",
    modelId: "模型 ID",
    source: "来源",
    internalNote: "设置页已简化。侧边栏模型下拉会自动使用这里拉取到的模型（最多前 4 个）。",
    systemPrompt: "自定义系统提示词（可选）",
    systemPromptHint: "覆盖默认系统提示词（留空使用默认值）",
    showAddText: "在阅读器选择弹窗显示 Add Text",
    showAddTextHint: "如果不想在 Zotero 文本选择弹出菜单中显示 Add Text 选项，请关闭此开关。",
    showAllModels: "在下拉菜单中显示所有模型",
    showAllModelsHint: "开启后显示所有可用模型。关闭时仅显示每个提供商的精选模型。",
    restoreDefaults: "恢复默认配置",
    restoreDefaultsConfirm: "确定要恢复所有配置到默认值吗？\n\n这将重置所有模型配置、系统提示词等设置。",
    restoreDefaultsDone: "已恢复默认配置",
    clearAllHistory: "清空全部聊天记录",
    clearAllHistoryConfirm: "确定要清空所有聊天记录吗？\n\n此操作不可撤销，所有对话历史将被永久删除。",
    clearAllHistoryDone: "已清空全部聊天记录",
    clearAllHistoryRunning: "正在清空...",
  },
  "en-US": {
    envOAuth: "Environment & OAuth",
    autoSetup: "Auto Configure Environment",
    refreshAllModels: "Refresh All Models",
    running: "Running...",
    setupDone: "Environment setup completed",
    setupPartialFail: "Environment setup partially failed; check logs",
    accounts: "Authorized Accounts",
    models: "Available Models",
    language: "UI Language",
    langZh: "CN",
    langEn: "EN",
    oauthLogin: "OAuth Login",
    oauthDelete: "Remove Auth",
    refreshModels: "Refresh Models",
    loggingIn: "Starting OAuth login...",
    refreshingModels: "Refreshing model list...",
    noModels: "No models yet (complete OAuth login and refresh model list first)",
    provider: "Provider",
    account: "Account",
    status: "Status",
    modelId: "Model ID",
    source: "Source",
    internalNote: "Settings are simplified. The sidebar model dropdown auto-uses fetched models here (up to first 4).",
    systemPrompt: "Custom System Prompt (Optional)",
    systemPromptHint: "Override the default system prompt (leave empty to use default)",
    showAddText: "Show \"Add Text\" in reader selection popup",
    showAddTextHint: "Disable this if you prefer not to show the Add Text option in Zotero's text selection popup menu.",
    showAllModels: "Show all models in dropdown",
    showAllModelsHint: "When enabled, shows all available models. When disabled, only the best models per provider are shown.",
    restoreDefaults: "Restore Default Config",
    restoreDefaultsConfirm: "Are you sure you want to restore all settings to defaults?\n\nThis will reset all model configurations, system prompt, etc.",
    restoreDefaultsDone: "Default configuration restored",
    clearAllHistory: "Clear All Chat History",
    clearAllHistoryConfirm: "Are you sure you want to clear ALL chat history?\n\nThis action cannot be undone. All conversation history will be permanently deleted.",
    clearAllHistoryDone: "All chat history cleared",
    clearAllHistoryRunning: "Clearing...",
  },
} as const;

type Dict = Record<string, string>;
const tt = (l: Lang): Dict => I18N[l] as unknown as Dict;

function createNode<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, style?: string, text?: string) {
  const el = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  if (style) el.setAttribute("style", style);
  if (text !== undefined) el.textContent = text;
  return el;
}

function parseModelCache(): Partial<Record<OAuthProviderId, ProviderModelOption[]>> {
  const raw = (getPref("oauthModelListCache") || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<OAuthProviderId, ProviderModelOption[]>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveModelCache(cache: Partial<Record<OAuthProviderId, ProviderModelOption[]>>) {
  setPref("oauthModelListCache", JSON.stringify(cache));
}

function syncSidebarModelPrefsFromCache(cache: Partial<Record<OAuthProviderId, ProviderModelOption[]>>) {
  const flattened: Array<{ provider: OAuthProviderId; model: string }> = [];
  for (const provider of PROVIDERS) {
    for (const row of cache[provider] || []) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      flattened.push({ provider, model: id });
      if (flattened.length >= 4) break;
    }
    if (flattened.length >= 4) break;
  }

  PROFILE_KEYS.forEach((suffix, idx) => {
    const entry = flattened[idx];
    setPref(`apiBase${suffix}` as PrefKey, entry ? providerToMarker(entry.provider) : "");
    setPref(`apiKey${suffix}` as PrefKey, "");
    setPref(`model${suffix}` as PrefKey, entry ? entry.model : "");
  });

  const first = flattened[0];
  setPref("apiBase", first ? providerToMarker(first.provider) : "");
  setPref("apiKey", "");
  setPref("model", first ? first.model : "");
}

/**
 * Re-render shortcut bubbles in every open sidebar panel across all Zotero windows.
 * This allows changes made in the settings page (e.g. Restore Defaults) to take
 * effect immediately without requiring the user to switch tabs.
 */
function refreshAllSidebarShortcuts(log?: (msg: string, color?: string) => void): void {
  try {
    const allDocs = new Set<Document>();

    // Strategy 1: Zotero.getMainWindows()
    try {
      const wins: Window[] = Zotero.getMainWindows?.() || [];
      for (const w of wins) {
        if (w?.document) allDocs.add(w.document);
      }
    } catch { /* ignore */ }

    // Strategy 2: Zotero.getMainWindow()
    try {
      const mainWin: Window | null = Zotero.getMainWindow?.() || null;
      if (mainWin?.document) allDocs.add(mainWin.document);
    } catch { /* ignore */ }

    // Strategy 3: Services.wm
    try {
      const wm = Cc["@mozilla.org/appshell/window-mediator;1"]?.getService(Ci.nsIWindowMediator);
      if (wm) {
        const enumerator = wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
          const w = enumerator.getNext() as Window;
          if (w?.document) allDocs.add(w.document);
        }
      }
    } catch { /* ignore */ }

    log?.(`Panel refresh: found ${allDocs.size} window(s)`, "#374151");

    let panelsFound = 0;
    let refreshed = 0;
    const panelI18n = getPanelI18n();
    for (const doc of allDocs) {
      const panelRoots = doc.querySelectorAll("#llm-main");
      panelsFound += panelRoots.length;
      for (const root of panelRoots) {
        const body = root.parentElement || root;
        const item = shortcutRenderItemState.get(body) ?? null;
        void renderShortcuts(body, item);

        // Update input placeholder
        const input = body.querySelector("#llm-input") as HTMLTextAreaElement | null;
        if (input) {
          const hasItem = body.querySelector(".llm-user-selected-text") || body.getAttribute("data-item-id");
          input.placeholder = hasItem ? panelI18n.placeholderPaper : panelI18n.placeholderGlobal;
        }

        // Update status bar
        const statusBar = body.querySelector("#llm-status") as HTMLElement | null;
        if (statusBar) {
          const text = statusBar.textContent?.trim() || "";
          // Only update recognizable status strings
          if (text === "就绪" || text === "Ready") {
            statusBar.textContent = panelI18n.statusReady;
          }
        }

        // Update send button
        const sendBtn = body.querySelector("#llm-send") as HTMLElement | null;
        if (sendBtn) sendBtn.textContent = panelI18n.send;

        refreshed++;
      }
    }
    log?.(`Panel refresh: ${panelsFound} panel(s) found, ${refreshed} refreshed`, refreshed > 0 ? "#065f46" : "#b45309");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.(`Panel refresh failed: ${msg}`, "#991b1b");
  }
}

export async function registerPrefsScripts(_window: Window | undefined | null) {
  if (!_window) return;
  const win = _window;
  const doc = win.document;
  await new Promise((r) => setTimeout(r, 80));

  let lang = getLang();
  let L = tt(lang);
  let cache = parseModelCache();

  const modelSections = doc.querySelector(`#${config.addonRef}-model-sections`) as HTMLDivElement | null;
  if (!modelSections) return;
  modelSections.innerHTML = "";

  const root = createNode(doc, "div", "display:flex; flex-direction:column; gap:14px;");
  modelSections.appendChild(root);

  const langBox = createNode(doc, "div", "border:1px solid #ddd; border-radius:8px; padding:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;");
  const langLabel = createNode(doc, "label", "font-weight:700; font-size:13px;");
  const langSelect = createNode(doc, "select", "padding:8px 28px 8px 14px; border:1px solid #ccc; border-radius:6px; font-size:13px; font-weight:600; appearance:none; -moz-appearance:none; background:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"6\"><path d=\"M0 0l5 6 5-6z\" fill=\"%23666\"/></svg>') no-repeat right 10px center / 10px 6px; background-color:#fff; cursor:pointer; min-width:70px;") as HTMLSelectElement;
  const optZh = doc.createElementNS(HTML_NS, "option") as HTMLOptionElement;
  optZh.value = "zh-CN";
  const optEn = doc.createElementNS(HTML_NS, "option") as HTMLOptionElement;
  optEn.value = "en-US";
  langSelect.append(optZh, optEn);
  langSelect.value = lang;
  langBox.append(langLabel, langSelect);
  root.appendChild(langBox);

  const envBox = createNode(doc, "div", "border:1px dashed #bbb; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;");
  const envTitle = createNode(doc, "div", "font-weight:700; font-size:14px;");
  const envActionRow = createNode(doc, "div", "display:flex; gap:10px; align-items:center; flex-wrap:wrap;");
  const commonBtnStyle = "padding:10px 16px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; text-align:center; font-weight:600; line-height:1;";
  const setupBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #059669; background:#059669; color:#fff;`) as HTMLButtonElement;
  setupBtn.type = "button";
  const refreshAllBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #666; background:#fff; color:#111;`) as HTMLButtonElement;
  refreshAllBtn.type = "button";
  const progressText = createNode(doc, "span", "font-size:12px; color:#555; white-space:pre-wrap;");
  envActionRow.append(setupBtn, refreshAllBtn, progressText);
  const progressList = createNode(doc, "div", "border:1px solid #e5e7eb; border-radius:8px; padding:8px; max-height:140px; overflow:auto; background:#fafafa; font-size:12px; line-height:1.4;");
  const logsBox = createNode(doc, "textarea", "width:100%; min-height:120px; padding:8px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; font-size:12px;") as HTMLTextAreaElement;
  logsBox.readOnly = true;
  logsBox.value = getPref("oauthSetupLog") || "";

  // Danger zone: restore defaults + clear all history
  const dangerRow = createNode(doc, "div", "display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:4px; padding-top:10px; border-top:1px dashed #e5e7eb;");
  const restoreDefaultsBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #d97706; background:#fff; color:#b45309;`) as HTMLButtonElement;
  restoreDefaultsBtn.type = "button";
  const clearAllHistoryBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #dc2626; background:#fff; color:#b91c1c;`) as HTMLButtonElement;
  clearAllHistoryBtn.type = "button";
  const dangerStatus = createNode(doc, "span", "font-size:12px; color:#555; white-space:pre-wrap;");
  dangerRow.append(restoreDefaultsBtn, clearAllHistoryBtn, dangerStatus);

  envBox.append(envTitle, envActionRow, dangerRow, progressList, logsBox);
  root.appendChild(envBox);

  const authCards = createNode(doc, "div", "display:grid; grid-template-columns:repeat(auto-fit, minmax(320px,1fr)); gap:12px;");
  root.appendChild(authCards);

  const accountsBox = createNode(doc, "div", "border:1px solid #ddd; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;");
  const accountsTitle = createNode(doc, "div", "font-weight:700; font-size:14px;");
  const accountsTable = createNode(doc, "div", "font-size:12px;");
  accountsBox.append(accountsTitle, accountsTable);
  root.appendChild(accountsBox);

  const modelsBox = createNode(doc, "div", "border:1px solid #ddd; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;");
  const modelsTitle = createNode(doc, "div", "font-weight:700; font-size:14px;");
  const modelsTable = createNode(doc, "div", "font-size:12px;");
  const note = createNode(doc, "div", "font-size:12px; color:#555;");
  modelsBox.append(modelsTitle, modelsTable, note);
  root.appendChild(modelsBox);

  const providerCards = new Map<OAuthProviderId, {
    status: HTMLSpanElement;
    loginBtn: HTMLButtonElement;
    refreshBtn: HTMLButtonElement;
    deleteBtn: HTMLButtonElement;
  }>();

  const renderStaticText = () => {
    L = tt(lang);
    // "UI Language" label stays English regardless of selected language
    langLabel.textContent = "UI Language:";
    optZh.textContent = "CN";
    optEn.textContent = "EN";
    envTitle.textContent = L.envOAuth;
    setupBtn.textContent = L.autoSetup;
    refreshAllBtn.textContent = L.refreshAllModels;
    restoreDefaultsBtn.textContent = L.restoreDefaults;
    clearAllHistoryBtn.textContent = L.clearAllHistory;
    accountsTitle.textContent = L.accounts;
    modelsTitle.textContent = L.models;
    note.textContent = L.internalNote;
    for (const provider of PROVIDERS) {
      const refs = providerCards.get(provider);
      if (!refs) continue;
      refs.loginBtn.textContent = L.oauthLogin;
      refs.refreshBtn.textContent = L.refreshModels;
      refs.deleteBtn.textContent = L.oauthDelete;
    }
    // Update XHTML static labels
    const spl = doc.querySelector(`#${config.addonRef}-system-prompt-label`);
    if (spl) spl.textContent = L.systemPrompt;
    const sph = doc.querySelector(`#${config.addonRef}-system-prompt-hint`);
    if (sph) sph.textContent = L.systemPromptHint;
    const atl = doc.querySelector(`#${config.addonRef}-popup-add-text-label`);
    if (atl) atl.textContent = L.showAddText;
    const ath = doc.querySelector(`#${config.addonRef}-popup-add-text-hint`);
    if (ath) ath.textContent = L.showAddTextHint;
    const saml = doc.querySelector(`#${config.addonRef}-show-all-models-label`);
    if (saml) saml.textContent = L.showAllModels;
    const samh = doc.querySelector(`#${config.addonRef}-show-all-models-hint`);
    if (samh) samh.textContent = L.showAllModelsHint;
  };

  const appendProgress = (line: string, color = "#374151") => {
    const row = createNode(doc, "div", `color:${color};`);
    row.textContent = line;
    progressList.appendChild(row);
    progressList.scrollTop = progressList.scrollHeight;
  };

  const flushUi = () => new Promise<void>((resolve) => win.setTimeout(resolve, 0));

  const renderAccounts = async () => {
    accountsTable.innerHTML = "";
    const header = createNode(doc, "div", "display:grid; grid-template-columns:2fr 1fr 2fr; gap:8px; font-weight:700; margin-bottom:6px;");
    header.append(createNode(doc, "div", "", L.provider), createNode(doc, "div", "", L.account), createNode(doc, "div", "", L.status));
    accountsTable.appendChild(header);
    for (const provider of PROVIDERS) {
      const s = await getProviderAccountSummary(provider);
      const row = createNode(doc, "div", "display:grid; grid-template-columns:2fr 1fr 2fr; gap:8px; padding:6px 0; border-top:1px solid #f0f0f0;");
      row.append(createNode(doc, "div", "", s.label), createNode(doc, "div", "", s.account), createNode(doc, "div", "", s.status));
      accountsTable.appendChild(row);
    }
  };

  const renderModels = () => {
    modelsTable.innerHTML = "";
    const header = createNode(doc, "div", "display:grid; grid-template-columns:1.5fr 2.5fr; gap:8px; font-weight:700; margin-bottom:6px;");
    header.append(createNode(doc, "div", "", L.source), createNode(doc, "div", "", L.modelId));
    modelsTable.appendChild(header);
    let count = 0;
    for (const provider of PROVIDERS) {
      for (const m of cache[provider] || []) {
        count += 1;
        const row = createNode(doc, "div", "display:grid; grid-template-columns:1.5fr 2.5fr; gap:8px; padding:6px 0; border-top:1px solid #f0f0f0;");
        row.append(createNode(doc, "div", "", getProviderLabel(provider)), createNode(doc, "div", "", m.id));
        modelsTable.appendChild(row);
      }
    }
    if (!count) {
      modelsTable.appendChild(createNode(doc, "div", "padding:8px 0; color:#6b7280;", L.noModels));
    }
  };

  const refreshOneProvider = async (provider: OAuthProviderId) => {
    progressText.textContent = L.refreshingModels;
    appendProgress(`[${getProviderLabel(provider)}] ${L.refreshingModels}`);
    await flushUi();
    const models = await fetchAvailableModels(provider);
    cache = { ...cache, [provider]: models };
    saveModelCache(cache);
    syncSidebarModelPrefsFromCache(cache);
    renderModels();
    await renderAccounts();
    const refs = providerCards.get(provider);
    if (refs) {
      const s = await getProviderAccountSummary(provider);
      refs.status.textContent = s.status;
      refs.status.style.color = /logged in/i.test(s.status) ? "green" : "#b45309";
    }
    progressText.textContent = "";
  };

  for (const provider of PROVIDERS) {
    const card = createNode(doc, "div", "border:1px solid #ddd; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;");
    const title = createNode(doc, "div", "font-weight:700; font-size:13px;", getProviderLabel(provider));
    const row = createNode(doc, "div", "display:flex; gap:8px; align-items:center; flex-wrap:wrap;");
    const loginBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #2563eb; background:#2563eb; color:#fff;`) as HTMLButtonElement;
    loginBtn.type = "button";
    const refreshBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #666; background:#fff; color:#111;`) as HTMLButtonElement;
    refreshBtn.type = "button";
    const deleteBtn = createNode(doc, "button", `${commonBtnStyle} border:1px solid #dc2626; background:#fff; color:#b91c1c;`) as HTMLButtonElement;
    deleteBtn.type = "button";
    const status = createNode(doc, "span", "font-size:12px; color:#555; white-space:pre-wrap;") as HTMLSpanElement;
    row.append(loginBtn, refreshBtn, deleteBtn, status);
    card.append(title, row);
    authCards.appendChild(card);
    providerCards.set(provider, { status, loginBtn, refreshBtn, deleteBtn });

    loginBtn.addEventListener("click", async () => {
      status.textContent = L.loggingIn;
      status.style.color = "#555";
      appendProgress(`[${getProviderLabel(provider)}] ${L.loggingIn}`);
      await flushUi();
      const result = await runProviderOAuthLogin(provider);
      status.textContent = result.message;
      status.style.color = result.ok ? "green" : "red";
      appendProgress(`[${getProviderLabel(provider)}] ${result.message}`, result.ok ? "#065f46" : "#991b1b");
      if (result.ok) {
        await refreshOneProvider(provider);
      } else {
        await renderAccounts();
      }
    });

    refreshBtn.addEventListener("click", async () => {
      await refreshOneProvider(provider);
    });

    deleteBtn.addEventListener("click", async () => {
      status.textContent = L.running;
      status.style.color = "#555";
      appendProgress(`[${getProviderLabel(provider)}] ${L.oauthDelete}`);
      await flushUi();
      const result = await removeProviderOAuthCredential(provider);
      cache = { ...cache, [provider]: [] };
      saveModelCache(cache);
      syncSidebarModelPrefsFromCache(cache);
      renderModels();
      await renderAccounts();
      status.textContent = result.message;
      status.style.color = result.ok ? "#065f46" : "#991b1b";
      appendProgress(
        `[${getProviderLabel(provider)}] ${result.message}`,
        result.ok ? "#065f46" : "#991b1b",
      );
    });
  }

  setupBtn.addEventListener("click", async () => {
    progressText.textContent = L.running;
    progressText.style.color = "#555";
    progressList.innerHTML = "";
    appendProgress(L.running);
    await flushUi();
    const result = await autoConfigureEnvironment({
      onProgress: (event) => {
        const prefix = event.phase === "start" ? "▶" : event.phase === "done" ? (event.ok ? "✔" : "✖") : "•";
        const output = event.output ? `\n${event.output.slice(0, 220)}` : "";
        appendProgress(`${prefix} ${event.step}${output}`, event.phase === "done" ? (event.ok ? "#065f46" : "#991b1b") : "#374151");
      },
    });
    logsBox.value = result.logs;
    setPref("oauthSetupLog", result.logs);
    progressText.textContent = result.ok ? L.setupDone : L.setupPartialFail;
    progressText.style.color = result.ok ? "green" : "#b91c1c";
    for (const provider of PROVIDERS) {
      await refreshOneProvider(provider);
    }
  });

  refreshAllBtn.addEventListener("click", async () => {
    progressText.textContent = L.refreshingModels;
    progressText.style.color = "#555";
    for (const provider of PROVIDERS) {
      await refreshOneProvider(provider);
    }
    progressText.textContent = "";
  });

  restoreDefaultsBtn.addEventListener("click", () => {
    const confirmed = win.confirm(L.restoreDefaultsConfirm);
    if (!confirmed) return;

    // Reset all model profile prefs to factory defaults
    const defaults: Record<string, string> = {
      apiBase: "oauth://openai-codex",
      apiKey: "",
      model: "",
      apiBasePrimary: "oauth://openai-codex",
      apiKeyPrimary: "",
      modelPrimary: "",
      apiBaseSecondary: "oauth://google-gemini-cli",
      apiKeySecondary: "",
      modelSecondary: "",
      apiBaseTertiary: "oauth://openai-codex",
      apiKeyTertiary: "",
      modelTertiary: "",
      apiBaseQuaternary: "oauth://google-gemini-cli",
      apiKeyQuaternary: "",
      modelQuaternary: "",
      systemPrompt: "",
      oauthModelListCache: "",
      oauthSetupLog: "",
    };
    for (const [key, value] of Object.entries(defaults)) {
      setPref(key as PrefKey, value);
    }
    // Advanced params
    for (const suffix of PROFILE_KEYS) {
      Zotero.Prefs.set(`${config.prefsPrefix}.temperature${suffix}`, "0.3", true);
      Zotero.Prefs.set(`${config.prefsPrefix}.maxTokens${suffix}`, "4096", true);
    }
    Zotero.Prefs.set(`${config.prefsPrefix}.showPopupAddText`, true, true);
    // Clear all shortcut customizations (custom bubbles, overrides, labels, order, deleted IDs)
    const shortcutPrefsToClear = [
      "shortcuts",
      "shortcutLabels",
      "shortcutDeleted",
      "customShortcuts",
      "shortcutOrder",
    ];
    for (const key of shortcutPrefsToClear) {
      Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, "", true);
    }

    // Diagnostic: verify prefs were actually cleared
    const verifyResults: string[] = [];
    for (const key of shortcutPrefsToClear) {
      const readBack = Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true);
      const isEmpty = readBack === "" || readBack === undefined || readBack === null;
      verifyResults.push(`${key}=${isEmpty ? "✓cleared" : `"${String(readBack).slice(0, 40)}"` }`);
    }
    appendProgress(`Pref verify: ${verifyResults.join(", ")}`, "#374151");

    // Update local state
    cache = {};
    logsBox.value = "";
    renderModels();
    void renderAccounts();
    if (systemPromptInput) systemPromptInput.value = "";
    if (popupInput) popupInput.checked = true;
    dangerStatus.textContent = L.restoreDefaultsDone;
    dangerStatus.style.color = "#065f46";
    appendProgress(`✔ ${L.restoreDefaultsDone}`, "#065f46");

    // Refresh all open sidebar panels
    refreshAllSidebarShortcuts(appendProgress);
  });

  clearAllHistoryBtn.addEventListener("click", async () => {
    const confirmed = win.confirm(L.clearAllHistoryConfirm);
    if (!confirmed) return;

    dangerStatus.textContent = L.clearAllHistoryRunning;
    dangerStatus.style.color = "#555";
    appendProgress(`▶ ${L.clearAllHistory}...`);
    try {
      await clearAllChatHistory();
      dangerStatus.textContent = L.clearAllHistoryDone;
      dangerStatus.style.color = "#065f46";
      appendProgress(`✔ ${L.clearAllHistoryDone}`, "#065f46");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dangerStatus.textContent = msg;
      dangerStatus.style.color = "#b91c1c";
      appendProgress(`✖ ${msg}`, "#991b1b");
    }
  });

  langSelect.addEventListener("change", () => {
    lang = (langSelect.value === "en-US" ? "en-US" : "zh-CN") as Lang;
    setPref("uiLanguage", lang);
    renderStaticText();
    renderModels();
    void renderAccounts();
    refreshAllSidebarShortcuts();
  });

  renderStaticText();
  renderModels();
  await renderAccounts();
  syncSidebarModelPrefsFromCache(cache);

  const systemPromptInput = doc.querySelector(`#${config.addonRef}-system-prompt`) as HTMLTextAreaElement | null;
  if (systemPromptInput) {
    systemPromptInput.value = getPref("systemPrompt") || "";
    systemPromptInput.addEventListener("input", () => setPref("systemPrompt", systemPromptInput.value));
  }
  const popupInput = doc.querySelector(`#${config.addonRef}-popup-add-text-enabled`) as HTMLInputElement | null;
  if (popupInput) {
    const prefValue = Zotero.Prefs.get(`${config.prefsPrefix}.showPopupAddText`, true);
    popupInput.checked = prefValue !== false && `${prefValue || ""}`.toLowerCase() !== "false";
    popupInput.addEventListener("change", () => {
      Zotero.Prefs.set(`${config.prefsPrefix}.showPopupAddText`, popupInput.checked, true);
    });
  }
  const showAllModelsInput = doc.querySelector(`#${config.addonRef}-show-all-models`) as HTMLInputElement | null;
  if (showAllModelsInput) {
    const samPref = Zotero.Prefs.get(`${config.prefsPrefix}.showAllModels`, true);
    showAllModelsInput.checked = samPref === true || `${samPref || ""}`.toLowerCase() === "true";
    showAllModelsInput.addEventListener("change", () => {
      Zotero.Prefs.set(`${config.prefsPrefix}.showAllModels`, showAllModelsInput.checked, true);
    });
  }
}
