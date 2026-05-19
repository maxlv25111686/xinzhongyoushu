import * as pdfjsLib from "./node_modules/pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "./node_modules/pdfjs-dist/build/pdf.worker.mjs";

const PDFJS_ASSET_BASE = "./node_modules/pdfjs-dist/";
const PDF_DOCUMENT_OPTIONS = Object.freeze({
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  useSystemFonts: true,
});

const DEFAULT_AGENT_ID = "web";
const HISTORY_STORAGE_KEY = "openclaw-pdf-console-history-v5";
const WORKSPACE_SPLIT_STORAGE_KEY = "openclaw-pdf-console-workspace-split-v1";
const ENGINE_MODE_STORAGE_KEY = "openclaw-pdf-console-engine-mode-v1";
const DEFAULT_ENGINE_MODE = "ollama";
const OLLAMA_ONLY_MODE = true;
const DIRECT_GATEWAY_CONFIG_URL = "/api/gateway/browser-config";
const DIRECT_GATEWAY_CHAT_TIMEOUT_MS = 180000;
const DIRECT_GATEWAY_REQUEST_TIMEOUT_MS = 12000;
const HISTORY_LIMIT = 12;
const RECOMMEND_CARD_LIMIT = 3;
const RADAR_DURATION_MS = 520;
const WORKSPACE_RESIZER_SIZE = 14;
const DEFAULT_WORKSPACE_SPLIT = Object.freeze({
  chatRatio: 0.22,
  summaryRatio: 0.36,
});
const RADAR_RANGE_KEYS = new Set([
  "supply_voltage_range",
  "input_voltage_range",
  "logic_voltage_range",
  "operating_temp_range",
]);
const RADAR_HIGHER_BETTER_KEYS = new Set([
  "supply_voltage_range",
  "input_voltage_range",
  "logic_voltage_range",
  "operating_temp_range",
  "output_current_max",
  "psrr_typ",
  "resolution_bits",
  "memory_flash_kb",
  "memory_ram_kb",
  "channel_count",
  "pin_count",
]);
const RADAR_LOWER_BETTER_KEYS = new Set([
  "accuracy_max",
  "quiescent_current_typ",
  "output_noise_typ",
]);
const RADAR_CLOSE_MATCH_KEYS = new Set([
  "output_voltage_typ",
  "switching_frequency_typ",
]);
const RADAR_THEME = Object.freeze({
  source: Object.freeze({
    stroke: "rgba(88, 156, 255, 0.96)",
    fill: "rgba(88, 156, 255, 0.16)",
    point: "rgba(88, 156, 255, 0.98)",
    legend: "rgba(88, 156, 255, 0.96)",
  }),
  target: Object.freeze({
    stroke: "rgba(255, 168, 76, 0.96)",
    fill: "rgba(255, 168, 76, 0.18)",
    point: "rgba(255, 168, 76, 0.98)",
    legend: "rgba(255, 168, 76, 0.96)",
  }),
});

const APPLICATION_SCENARIO_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "rf-low-noise-supply",
    tag: "射频低噪声",
    title: "射频模块低噪声供电",
    desc: "面向射频前端、收发链路等对电源纹波敏感的供电场景。",
    inputVoltage: 5,
    outputVoltage: "from_pdf",
    loadCurrentMa: 200,
    temperatureC: 70,
    package: "from_pdf",
    checks: Object.freeze(["noise", "psrr"]),
    focus: Object.freeze(["噪声", "PSRR", "引脚"]),
  }),
  Object.freeze({
    id: "medical-monitor-supply",
    tag: "医疗监护",
    title: "医疗监护模拟前端供电",
    desc: "适合便携监护、采集前端等需要低噪声和稳定输出的场景。",
    inputVoltage: 5,
    outputVoltage: "from_pdf",
    loadCurrentMa: 100,
    temperatureC: 50,
    package: "from_pdf",
    checks: Object.freeze(["noise", "psrr", "quiescent_current"]),
    focus: Object.freeze(["噪声", "静态电流", "输出稳定"]),
  }),
  Object.freeze({
    id: "precision-sensor-supply",
    tag: "精密传感",
    title: "精密传感器参考供电",
    desc: "用于传感器、ADC 参考链路等对纹波和输出偏差敏感的场景。",
    inputVoltage: 5,
    outputVoltage: "from_pdf",
    loadCurrentMa: 50,
    temperatureC: 60,
    package: "from_pdf",
    checks: Object.freeze(["noise", "psrr"]),
    focus: Object.freeze(["低纹波", "PSRR", "小负载"]),
  }),
  Object.freeze({
    id: "industrial-control-supply",
    tag: "工业控制",
    title: "工业控制模块本地稳压",
    desc: "用于 MCU、接口芯片等本地稳压场景，重点看温度、电流裕量和封装。",
    inputVoltage: 5,
    outputVoltage: "from_pdf",
    loadCurrentMa: 200,
    temperatureC: 85,
    package: "from_pdf",
    checks: Object.freeze(["temperature", "current", "package", "pinout"]),
    focus: Object.freeze(["温度裕量", "负载电流", "封装"]),
  }),
]);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const refs = {
  workspace: $("#workspace"),
  chatPane: $("#chatPane"),
  summaryPane: $("#summaryPane"),
  previewPane: $("#previewPane"),
  chatSummaryResizer: $("#chatSummaryResizer"),
  summaryPreviewResizer: $("#summaryPreviewResizer"),
  workspaceResizers: $$(".workspace-resizer"),
  modeLinks: $$(".mode-link"),
  historyDropdown: $("#historyDropdown"),
  toggleHistoryButton: $("#toggleHistoryButton"),
  historyPanel: $("#historyPanel"),
  historyCount: $("#historyCount"),
  historyList: $("#historyList"),
  settingsDropdown: $("#settingsDropdown"),
  toggleSettingsButton: $("#toggleSettingsButton"),
  chatSettings: $("#chatSettings"),
  engineMode: $("#engineMode"),
  agentId: $("#agentId"),
  sessionId: $("#sessionId"),
  checkButton: $("#checkButton"),
  newSessionButton: $("#newSessionButton"),
  chatStatusPill: $("#chatStatusPill"),
  connectionLabel: $("#connectionLabel"),
  chatProgress: $("#chatProgress"),
  chatProgressLabel: $("#chatProgressLabel"),
  sessionDiagnostics: $("#sessionDiagnostics"),
  memoryStatusText: $("#memoryStatusText"),
  stageLogCount: $("#stageLogCount"),
  refreshStageLogsButton: $("#refreshStageLogsButton"),
  sessionMemoryMeta: $("#sessionMemoryMeta"),
  stageLogList: $("#stageLogList"),
  messageStream: $("#messageStream"),
  chatEmpty: $("#chatEmpty"),
  composer: $("#composer"),
  messageInput: $("#messageInput"),
  composerTip: $("#composerTip"),
  sendButton: $("#sendButton"),
  purchaseExportButton: $("#purchaseExportButton"),
  purchaseExportStatus: $("#purchaseExportStatus"),
  messageTemplate: $("#messageTemplate"),
  metaPages: $("#metaPages"),
  metaSize: $("#metaSize"),
  documentName: $("#documentName"),
  documentCaption: $("#documentCaption"),
  pdfProgress: $("#pdfProgress"),
  pdfProgressLabel: $("#pdfProgressLabel"),
  pdfProgressValue: $("#pdfProgressValue"),
  pdfProgressFill: $("#pdfProgressFill"),
  summaryText: $("#summaryText"),
  highlightCount: $("#highlightCount"),
  highlightsList: $("#highlightsList"),
  pdfInput: $("#pdfInput"),
  prevPageButton: $("#prevPageButton"),
  nextPageButton: $("#nextPageButton"),
  pageNumberInput: $("#pageNumberInput"),
  pageCountLabel: $("#pageCountLabel"),
  previewFocus: $("#previewFocus"),
  previewStage: $("#previewStage"),
  previewEmpty: $("#previewEmpty"),
  previewCanvasShell: $("#previewCanvasShell"),
  pdfCanvas: $("#pdfCanvas"),
  pdfHighlightLayer: $("#pdfHighlightLayer"),
  recommendStatusLabel: $("#recommendStatusLabel"),
  recommendCategoryPill: $("#recommendCategoryPill"),
  recommendList: $("#recommendList"),
  recommendDetailTitle: $("#recommendDetailTitle"),
  recommendSourceLabel: $("#recommendSourceLabel"),
  recommendSelectedLabel: $("#recommendSelectedLabel"),
  recommendViewRadar: $("#recommendViewRadar"),
  recommendViewData: $("#recommendViewData"),
  recommendViewVerify: $("#recommendViewVerify"),
  radarShell: $("#radarShell"),
  radarStage: $("#radarStage"),
  recommendRadar: $("#recommendRadar"),
  radarEmpty: $("#radarEmpty"),
  radarLegend: $("#radarLegend"),
  radarSummary: $("#radarSummary"),
  radarScoreGrid: $("#radarScoreGrid"),
  engineeringReview: $("#engineeringReview"),
  scenarioSuggestions: $("#scenarioSuggestions"),
  scenarioSuggestionList: $("#scenarioSuggestionList"),
  scenarioFollowup: $("#scenarioFollowup"),
  scenarioFollowupGrid: $("#scenarioFollowupGrid"),
  scenarioInputVoltage: $("#scenarioInputVoltage"),
  scenarioOutputVoltage: $("#scenarioOutputVoltage"),
  scenarioLoadCurrent: $("#scenarioLoadCurrent"),
  scenarioTemperature: $("#scenarioTemperature"),
  scenarioPackage: $("#scenarioPackage"),
  scenarioCheckGrid: $("#scenarioCheckGrid"),
  pinoutMatrix: $("#pinoutMatrix"),
  engineeringConclusion: $("#engineeringConclusion"),
  engineeringDecisionButton: $("#engineeringDecisionButton"),
  recommendVerifyView: $("#recommendVerifyView"),
  recommendDataView: $("#recommendDataView"),
  recommendCompareStage: $("#recommendCompareStage"),
  recommendCompareList: $("#recommendCompareList"),
  recommendThinkingCount: $("#recommendThinkingCount"),
  recommendThinkingList: $("#recommendThinkingList"),
};

const state = {
  activeView: "review",
  workspaceSplit: loadWorkspaceSplit(),
  workspaceResize: null,
  previewRelayoutFrame: 0,
  historyEntries: [],
  chatMessages: [],
  activeAgentId: DEFAULT_AGENT_ID,
  engineMode: loadEngineMode(),
  activeSessionId: "",
  activeSessionKey: "",
  gatewaySessionId: "",
  serviceReady: false,
  sessionMemory: null,
  sessionStageLogs: [],
  diagnosticsPollHandle: 0,
  diagnosticsLoading: false,
  diagnosticsRefreshToken: 0,
  pdfFile: null,
  pdfBytes: null,
  pdfDoc: null,
  pdfInsights: null,
  currentPageNumber: 1,
  currentRenderTask: null,
  renderToken: 0,
  selectedHighlightId: "",
  recommendStatus: "idle",
  recommendCategory: null,
  recommendItems: [],
  referenceSpecs: [],
  referenceSpecScores: {},
  recommendThinking: [],
  activeRecommendationId: "",
  recommendDetailMode: "radar",
  purchaseExportLoading: false,
  radarFrame: 0,
  radarSourceValues: [],
  radarTargetValues: [],
  scenarioSuggestions: [],
  activeScenarioId: "",
  scenario: {
    inputVoltage: 5,
    outputVoltage: 3.3,
    loadCurrentMa: 200,
    temperatureC: 70,
    package: "SOT-23-5",
  },
  engineeringDecisionAccepted: false,
};

const gatewayDirectState = {
  configPromise: null,
  client: null,
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function truncateText(value = "", limit = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatClock(input) {
  if (!input) {
    return "";
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFileSize(size = 0) {
  const num = Number(size) || 0;
  if (num >= 1024 * 1024) {
    return `${(num / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  if (num >= 1024) {
    return `${Math.round(num / 1024)} KB`;
  }
  return `${num} B`;
}

function createSessionId() {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEngineMode(value) {
  if (OLLAMA_ONLY_MODE) {
    return "ollama";
  }
  return value === "openclaw" ? "openclaw" : "ollama";
}

function loadEngineMode() {
  if (OLLAMA_ONLY_MODE) {
    return DEFAULT_ENGINE_MODE;
  }
  try {
    return normalizeEngineMode(window.localStorage.getItem(ENGINE_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_ENGINE_MODE;
  }
}

function saveEngineMode(value) {
  const mode = normalizeEngineMode(value);
  state.engineMode = mode;
  if (refs.engineMode) {
    refs.engineMode.value = mode;
    refs.engineMode.disabled = OLLAMA_ONLY_MODE;
  }
  try {
    window.localStorage.setItem(ENGINE_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures.
  }
  return mode;
}

function loadWorkspaceSplit() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_SPLIT_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const chatRatio = Number(parsed?.chatRatio);
    const summaryRatio = Number(parsed?.summaryRatio);
    if (!Number.isFinite(chatRatio) || !Number.isFinite(summaryRatio)) {
      return { ...DEFAULT_WORKSPACE_SPLIT };
    }
    return {
      chatRatio: clamp(chatRatio, 0.12, 0.5),
      summaryRatio: clamp(summaryRatio, 0.18, 0.58),
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_SPLIT };
  }
}

function saveWorkspaceSplit() {
  try {
    window.localStorage.setItem(
      WORKSPACE_SPLIT_STORAGE_KEY,
      JSON.stringify(state.workspaceSplit || DEFAULT_WORKSPACE_SPLIT)
    );
  } catch {
    // Ignore storage failures.
  }
}

function isWorkspaceResizable() {
  return Boolean(refs.workspace) && state.activeView === "review" && window.innerWidth > 1180;
}

function getWorkspaceSplitLimits(availableWidth) {
  const base = {
    chat: 280,
    summary: 420,
    preview: 460,
  };
  const totalBase = base.chat + base.summary + base.preview;
  if (availableWidth >= totalBase) {
    return base;
  }

  const scale = availableWidth / totalBase;
  return {
    chat: Math.max(220, Math.round(base.chat * scale)),
    summary: Math.max(300, Math.round(base.summary * scale)),
    preview: Math.max(320, Math.round(base.preview * scale)),
  };
}

function getWorkspaceAvailableWidth() {
  if (!refs.workspace) {
    return 0;
  }
  return Math.max(0, refs.workspace.clientWidth - WORKSPACE_RESIZER_SIZE * 2);
}

function deriveWorkspaceSplitWidths(split = state.workspaceSplit) {
  const availableWidth = getWorkspaceAvailableWidth();
  if (!availableWidth) {
    return null;
  }

  const limits = getWorkspaceSplitLimits(availableWidth);
  const safeSplit = {
    chatRatio: clamp(Number(split?.chatRatio) || DEFAULT_WORKSPACE_SPLIT.chatRatio, 0.12, 0.5),
    summaryRatio: clamp(Number(split?.summaryRatio) || DEFAULT_WORKSPACE_SPLIT.summaryRatio, 0.18, 0.58),
  };

  let chatWidth = Math.round(availableWidth * safeSplit.chatRatio);
  chatWidth = clamp(chatWidth, limits.chat, Math.max(limits.chat, availableWidth - limits.summary - limits.preview));

  let summaryWidth = Math.round(availableWidth * safeSplit.summaryRatio);
  summaryWidth = clamp(
    summaryWidth,
    limits.summary,
    Math.max(limits.summary, availableWidth - chatWidth - limits.preview)
  );

  let previewWidth = availableWidth - chatWidth - summaryWidth;

  if (previewWidth < limits.preview) {
    const shortage = limits.preview - previewWidth;
    const summarySlack = Math.max(0, summaryWidth - limits.summary);
    const summaryAdjustment = Math.min(shortage, summarySlack);
    summaryWidth -= summaryAdjustment;
    previewWidth += summaryAdjustment;

    if (previewWidth < limits.preview) {
      const remainingShortage = limits.preview - previewWidth;
      const chatSlack = Math.max(0, chatWidth - limits.chat);
      const chatAdjustment = Math.min(remainingShortage, chatSlack);
      chatWidth -= chatAdjustment;
      previewWidth += chatAdjustment;
    }
  }

  return {
    availableWidth,
    limits,
    chatWidth,
    summaryWidth,
    previewWidth: Math.max(0, availableWidth - chatWidth - summaryWidth),
  };
}

function applyWorkspaceSplit() {
  if (!refs.workspace) {
    return;
  }

  if (!isWorkspaceResizable()) {
    refs.workspace.style.removeProperty("--workspace-col-chat");
    refs.workspace.style.removeProperty("--workspace-col-summary");
    refs.workspace.style.removeProperty("--workspace-col-preview");
    refs.workspace.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-workspace");
    return;
  }

  const widths = deriveWorkspaceSplitWidths();
  if (!widths) {
    return;
  }

  refs.workspace.style.setProperty("--workspace-col-chat", `${widths.chatWidth}px`);
  refs.workspace.style.setProperty("--workspace-col-summary", `${widths.summaryWidth}px`);
  refs.workspace.style.setProperty("--workspace-col-preview", "minmax(0, 1fr)");
}

function requestPreviewRelayout() {
  if (state.previewRelayoutFrame) {
    return;
  }

  state.previewRelayoutFrame = requestAnimationFrame(() => {
    state.previewRelayoutFrame = 0;
    renderPdfPage().catch(() => {});
  });
}

function persistWorkspaceSplitFromWidths(chatWidth, summaryWidth, availableWidth) {
  if (!availableWidth) {
    return;
  }

  state.workspaceSplit = {
    chatRatio: clamp(chatWidth / availableWidth, 0.12, 0.5),
    summaryRatio: clamp(summaryWidth / availableWidth, 0.18, 0.58),
  };
  saveWorkspaceSplit();
}

function stopWorkspaceResize() {
  if (!state.workspaceResize) {
    return;
  }

  const { chatWidth, summaryWidth, availableWidth } = state.workspaceResize;
  persistWorkspaceSplitFromWidths(chatWidth, summaryWidth, availableWidth);
  state.workspaceResize = null;
  refs.workspace?.classList.remove("is-resizing");
  document.body.classList.remove("is-resizing-workspace");
  applyWorkspaceSplit();
  requestPreviewRelayout();
}

function updateWorkspaceResize(clientX) {
  if (!state.workspaceResize || !refs.workspace) {
    return;
  }

  const { type, startX, startChatWidth, startSummaryWidth } = state.workspaceResize;
  const widths = deriveWorkspaceSplitWidths();
  if (!widths) {
    return;
  }

  const delta = clientX - startX;
  const { availableWidth, limits } = widths;
  let chatWidth = startChatWidth;
  let summaryWidth = startSummaryWidth;

  if (type === "chat-summary") {
    chatWidth = clamp(
      startChatWidth + delta,
      limits.chat,
      Math.max(limits.chat, availableWidth - startSummaryWidth - limits.preview)
    );
  } else if (type === "summary-preview") {
    summaryWidth = clamp(
      startSummaryWidth + delta,
      limits.summary,
      Math.max(limits.summary, availableWidth - startChatWidth - limits.preview)
    );
  }

  state.workspaceResize.chatWidth = chatWidth;
  state.workspaceResize.summaryWidth = summaryWidth;
  state.workspaceResize.availableWidth = availableWidth;

  refs.workspace.style.setProperty("--workspace-col-chat", `${chatWidth}px`);
  refs.workspace.style.setProperty("--workspace-col-summary", `${summaryWidth}px`);
  refs.workspace.style.setProperty("--workspace-col-preview", "minmax(0, 1fr)");
  requestPreviewRelayout();
}

function startWorkspaceResize(type, clientX) {
  if (!isWorkspaceResizable()) {
    return;
  }

  const widths = deriveWorkspaceSplitWidths();
  if (!widths) {
    return;
  }

  state.workspaceResize = {
    type,
    startX: clientX,
    startChatWidth: widths.chatWidth,
    startSummaryWidth: widths.summaryWidth,
    chatWidth: widths.chatWidth,
    summaryWidth: widths.summaryWidth,
    availableWidth: widths.availableWidth,
  };

  refs.workspace?.classList.add("is-resizing");
  document.body.classList.add("is-resizing-workspace");
}

function normalizeMessage(input = {}) {
  const role = ["user", "assistant", "system"].includes(input.role) ? input.role : "system";
  const content = String(input.content || input.text || "").trim();
  const timestamp = input.timestamp || new Date().toISOString();
  const rawAttachment = input.attachment && typeof input.attachment === "object" ? input.attachment : null;
  const attachment = rawAttachment
    ? {
        name: String(rawAttachment.name || "").trim(),
        url: String(rawAttachment.url || "").trim(),
        size: Number(rawAttachment.size) || 0,
        actionView: String(rawAttachment.actionView || "").trim(),
      }
    : null;
  return {
    role,
    content,
    timestamp,
    attachment: attachment?.url ? attachment : null,
  };
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => ({
        id: String(entry?.id || ""),
        title: String(entry?.title || ""),
        preview: String(entry?.preview || ""),
        agentId: String(entry?.agentId || ""),
        sessionId: String(entry?.sessionId || ""),
        sessionKey: String(entry?.sessionKey || ""),
        gatewaySessionId: String(entry?.gatewaySessionId || ""),
        updatedAt: entry?.updatedAt || new Date().toISOString(),
        messages: Array.isArray(entry?.messages)
          ? entry.messages.map(normalizeMessage).filter((item) => item.content)
          : [],
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(state.historyEntries.slice(0, HISTORY_LIMIT))
    );
  } catch {
    // Ignore storage failures.
  }
}

function buildConversationSnapshot() {
  const meaningful = state.chatMessages.filter(
    (item) => item.role === "user" || item.role === "assistant"
  );
  if (!meaningful.length) {
    return null;
  }
  const firstUser = meaningful.find((item) => item.role === "user");
  const latest = meaningful.at(-1);
  return {
    id: state.activeSessionKey || state.activeSessionId || createSessionId(),
    title: truncateText(firstUser?.content || refs.documentName?.textContent || "新会话", 36),
    preview: truncateText(latest?.content || "", 88),
    agentId: state.activeAgentId,
    sessionId: state.activeSessionId,
    sessionKey: OLLAMA_ONLY_MODE ? "" : state.activeSessionKey,
    gatewaySessionId: OLLAMA_ONLY_MODE ? "" : state.gatewaySessionId,
    updatedAt: new Date().toISOString(),
    messages: meaningful.slice(-40).map((item) => ({
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
    })),
  };
}

function persistConversation() {
  const snapshot = buildConversationSnapshot();
  if (!snapshot) {
    return;
  }
  state.historyEntries = [
    snapshot,
    ...state.historyEntries.filter((item) => item.id !== snapshot.id),
  ].slice(0, HISTORY_LIMIT);
  saveHistory();
  renderHistoryList();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }
  return payload;
}

function parseDownloadFileName(response, fallback = "采购交付包.zip") {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1] || fallback;
    }
  }
  const quotedMatch = disposition.match(/filename="?([^";]+)"?/i);
  return quotedMatch?.[1] || fallback;
}

function buildPurchaseExportPayload() {
  return {
    pdfContext: buildPdfContext(),
    sourceCategory: state.recommendCategory,
    referenceSpecs: getSourceRecommendationSpecs(),
    candidates: state.recommendItems,
    activeRecommendationId: state.activeRecommendationId,
  };
}

function updatePurchaseExportButton() {
  const ready = Boolean(state.pdfInsights);
  if (refs.purchaseExportButton) {
    refs.purchaseExportButton.disabled = !ready || state.purchaseExportLoading;
    refs.purchaseExportButton.textContent = state.purchaseExportLoading ? "生成中" : "生成采购包";
  }
  if (refs.purchaseExportStatus) {
    refs.purchaseExportStatus.textContent = state.purchaseExportLoading
      ? "正在生成压缩包"
      : ready
        ? "已识别 PDF，可生成采购清单和参数对比"
        : "上传并识别 PDF 后可生成";
  }
}

async function parseExportError(response) {
  const text = await response.text();
  if (!text) {
    return `采购包生成失败：${response.status}`;
  }
  try {
    const payload = JSON.parse(text);
    return payload?.error || text;
  } catch {
    return text;
  }
}

async function handlePurchaseExport() {
  if (!state.pdfInsights || state.purchaseExportLoading) {
    return;
  }

  state.purchaseExportLoading = true;
  updatePurchaseExportButton();

  try {
    if (state.recommendStatus !== "ready") {
      await ensureRecommendations({ force: false });
    }

    const response = await fetch("/api/export/purchase-package", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPurchaseExportPayload()),
    });

    if (!response.ok) {
      throw new Error(await parseExportError(response));
    }

    const blob = await response.blob();
    const fileName = parseDownloadFileName(response);
    const url = URL.createObjectURL(blob);
    addMessage(
      "assistant",
      `采购交付包已生成：${fileName}\n包含采购清单、参数对比、交付说明和结构化追溯数据。`,
      {
        name: fileName,
        url,
        size: blob.size,
        actionView: "recommend",
      }
    );
    persistConversation();
  } catch (error) {
    console.error(error);
    addMessage(
      "assistant",
      error instanceof Error ? error.message : "采购交付包生成失败，请稍后重试。"
    );
  } finally {
    state.purchaseExportLoading = false;
    updatePurchaseExportButton();
  }
}

function createGatewayRequestId(prefix = "gateway") {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createGatewayRunId(prefix = "web-direct") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLocalBrowserOrigin() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

async function loadGatewayDirectConfig() {
  if (!isLocalBrowserOrigin()) {
    throw new Error("Direct Gateway mode is only available on localhost.");
  }
  if (!gatewayDirectState.configPromise) {
    gatewayDirectState.configPromise = apiRequest(DIRECT_GATEWAY_CONFIG_URL, {
      method: "GET",
    }).catch((error) => {
      gatewayDirectState.configPromise = null;
      throw error;
    });
  }
  return gatewayDirectState.configPromise;
}

class BrowserGatewayClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.connectPromise = null;
    this.ready = false;
    this.hello = null;
    this.connectSent = false;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }

  isReady() {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  on(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || new Set();
    handlers.add(handler);
    this.eventHandlers.set(eventName, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.eventHandlers.delete(eventName);
      }
    };
  }

  emit(eventName, payload, frame) {
    const handlers = this.eventHandlers.get(eventName);
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => {
      try {
        handler(payload, frame);
      } catch (error) {
        console.warn("Gateway event handler failed:", error);
      }
    });
  }

  connect() {
    if (this.isReady()) {
      return Promise.resolve(this.hello);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      this.connectSent = false;
      this.ready = false;

      const timeout = window.setTimeout(() => {
        reject(new Error("Gateway direct connection timed out."));
        this.stop();
      }, DIRECT_GATEWAY_REQUEST_TIMEOUT_MS);

      const settle = (callback, value) => {
        window.clearTimeout(timeout);
        this.resolveConnect = null;
        this.rejectConnect = null;
        this.connectPromise = null;
        callback(value);
      };

      const ws = new WebSocket(this.config.gatewayUrl);
      this.ws = ws;

      ws.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });
      ws.addEventListener("close", (event) => {
        this.ready = false;
        this.flushPending(new Error(`Gateway closed (${event.code || "n/a"}).`));
        if (this.rejectConnect) {
          settle(this.rejectConnect, new Error("Gateway closed before direct connection was ready."));
        }
      });
      ws.addEventListener("error", () => {
        if (this.rejectConnect) {
          settle(this.rejectConnect, new Error("Gateway direct WebSocket failed."));
        }
      });

      this.resolveConnect = (hello) => {
        this.ready = true;
        this.hello = hello;
        settle(resolve, hello);
      };
      this.rejectConnect = (error) => {
        settle(reject, error instanceof Error ? error : new Error(String(error)));
      };
    });

    return this.connectPromise;
  }

  sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    this.request(
      "connect",
      {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: this.config.clientName || "gateway-client",
          displayName: this.config.clientDisplayName || "PDF Console",
          version: this.config.clientVersion || "1.0.0",
          platform: navigator.platform || "browser",
          mode: this.config.clientMode || "backend",
        },
        auth: {
          token: this.config.token,
        },
        role: this.config.role || "operator",
        scopes: Array.isArray(this.config.scopes) && this.config.scopes.length
          ? this.config.scopes
          : ["operator.admin"],
        userAgent: navigator.userAgent,
      },
      { timeoutMs: DIRECT_GATEWAY_REQUEST_TIMEOUT_MS }
    )
      .then((hello) => {
        if (this.resolveConnect) {
          this.resolveConnect(hello);
        }
      })
      .catch((error) => {
        if (this.rejectConnect) {
          this.rejectConnect(error);
        }
      });
  }

  handleMessage(raw) {
    let frame = null;
    try {
      frame = JSON.parse(String(raw || ""));
    } catch {
      return;
    }

    if (frame?.type === "event") {
      if (frame.event === "connect.challenge") {
        this.sendConnect();
        return;
      }
      this.emit(frame.event, frame.payload, frame);
      return;
    }

    if (frame?.type === "res") {
      const pending = this.pending.get(frame.id);
      if (!pending) {
        return;
      }
      this.pending.delete(frame.id);
      window.clearTimeout(pending.timeout);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error(frame.error?.message || "Gateway request failed."));
      }
    }
  }

  request(method, params = {}, options = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway is not connected.");
    }

    const id = createGatewayRequestId(method);
    const timeoutMs =
      options.timeoutMs === null
        ? null
        : Math.max(1, Number(options.timeoutMs) || DIRECT_GATEWAY_REQUEST_TIMEOUT_MS);

    const promise = new Promise((resolve, reject) => {
      const timeout =
        timeoutMs === null
          ? 0
          : window.setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`Gateway request timed out for ${method}.`));
            }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    return promise;
  }

  flushPending(error) {
    this.pending.forEach((pending) => {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pending.clear();
  }

  stop() {
    this.ready = false;
    this.flushPending(new Error("Gateway direct client stopped."));
    try {
      this.ws?.close();
    } catch {
      // Ignore close failures.
    }
    this.ws = null;
    this.connectPromise = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }
}

async function getGatewayDirectClient() {
  const config = await loadGatewayDirectConfig();
  if (!config?.gatewayUrl || !config?.token) {
    throw new Error("Gateway direct config is incomplete.");
  }

  if (
    gatewayDirectState.client
    && gatewayDirectState.client.config.gatewayUrl === config.gatewayUrl
    && gatewayDirectState.client.isReady()
  ) {
    return gatewayDirectState.client;
  }

  gatewayDirectState.client?.stop();
  gatewayDirectState.client = new BrowserGatewayClient(config);
  await gatewayDirectState.client.connect();
  return gatewayDirectState.client;
}

function buildGatewayDirectSessionKey(agentId, sessionId = "") {
  return `agent:${agentId || "main"}:session:${sessionId || "main"}`;
}

function truncateGatewayText(value, maxChars = 1200) {
  const text = String(value || "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function normalizeGatewayPdfContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }

  const parameters = Array.isArray(rawContext.parameters)
    ? rawContext.parameters
        .map((item) => ({
          label: String(item?.label || "").trim(),
          value: String(item?.value || "").trim(),
          text: String(item?.text || "").trim(),
          pageNumber: Number.isFinite(item?.pageNumber) ? item.pageNumber : null,
        }))
        .filter((item) => item.label || item.value || item.text)
        .slice(0, 12)
    : [];

  const selectedParameter =
    rawContext.selectedParameter && typeof rawContext.selectedParameter === "object"
      ? {
          label: String(rawContext.selectedParameter.label || "").trim(),
          value: String(rawContext.selectedParameter.value || "").trim(),
          text: String(rawContext.selectedParameter.text || "").trim(),
          pageNumber: Number.isFinite(rawContext.selectedParameter.pageNumber)
            ? rawContext.selectedParameter.pageNumber
            : null,
        }
      : null;

  return {
    title: String(rawContext.title || "").trim(),
    fileName: String(rawContext.fileName || "").trim(),
    summary: truncateGatewayText(rawContext.summary, 800),
    pageCount: Number.isFinite(rawContext.pageCount) ? rawContext.pageCount : null,
    scannedPages: Number.isFinite(rawContext.scannedPages) ? rawContext.scannedPages : null,
    extractionComplete: rawContext.extractionComplete === true,
    currentPage: Number.isFinite(rawContext.currentPage) ? rawContext.currentPage : null,
    currentPageText: truncateGatewayText(rawContext.currentPageText, 1800),
    parameters,
    selectedParameter,
  };
}

function normalizeGatewayChatHistory(rawHistory) {
  return (Array.isArray(rawHistory) ? rawHistory : [])
    .map((item) => ({
      role: ["user", "assistant", "system"].includes(item?.role) ? item.role : "user",
      content: String(item?.content || "").trim(),
    }))
    .filter((item) => item.content)
    .slice(-8);
}

const GATEWAY_GENERAL_CHAT_MESSAGE_PATTERN =
  /^(?:你好|您好|hi|hello|hey|在吗|小冰\??|你是谁|你叫什么|介绍一下你自己|收到|ok|好的)[!?？。.\s]*$/i;
const GATEWAY_PDF_CONTEXT_INTENT_PATTERN =
  /(?:pdf|文档|手册|datasheet|参数|规格|溯源|页码|推荐|国产|候选|替代|厂商|厂家|制造商|生产商|品牌|型号|对比|雷达|封装|引脚|输入|输出|电压|电流|温度|噪声|psrr|压差|效率|频率|功耗|静态电流|工作温度)/i;
const GATEWAY_PDF_CONTEXT_REFERENCE_PATTERN =
  /(?:这个|这条|这一项|这一页|这页|当前页|当前参数|上面|这里|它|该参数|该器件|this|that|current|selected)/i;
const GATEWAY_PDF_PAGE_EXCERPT_INTENT_PATTERN =
  /(?:页码|哪一页|这一页|这页|原文|出处|证据|溯源|source|excerpt|page)/i;

function shouldAttachGatewayPdfContext(message, normalizedContext) {
  if (!normalizedContext) {
    return false;
  }
  const text = String(message || "").trim();
  if (!text || GATEWAY_GENERAL_CHAT_MESSAGE_PATTERN.test(text)) {
    return false;
  }
  if (GATEWAY_PDF_CONTEXT_INTENT_PATTERN.test(text)) {
    return true;
  }
  if (normalizedContext.selectedParameter && GATEWAY_PDF_CONTEXT_REFERENCE_PATTERN.test(text)) {
    return true;
  }
  return Boolean(
    normalizedContext.summary
    && /(?:请解释|帮我看|怎么看|什么意思|能不能|是否|合适|匹配|复核)/i.test(text)
  );
}

function buildGatewayDirectMessage(message, pdfContext, chatHistory) {
  const normalizedContext = normalizeGatewayPdfContext(pdfContext);
  const normalizedHistory = normalizeGatewayChatHistory(chatHistory);
  const includePdfContext = shouldAttachGatewayPdfContext(message, normalizedContext);
  const includeCurrentPageExcerpt =
    includePdfContext && GATEWAY_PDF_PAGE_EXCERPT_INTENT_PATTERN.test(String(message || ""));

  if (!normalizedHistory.length && (!normalizedContext || !includePdfContext)) {
    return message;
  }

  const contextLines = [];
  if (normalizedHistory.length) {
    contextLines.push(
      "Recent conversation context:",
      normalizedHistory
        .map((item) => `${item.role === "assistant" ? "Assistant" : item.role === "system" ? "System" : "User"}: ${truncateGatewayText(item.content, 1000)}`)
        .join("\n")
    );
  }

  if (normalizedContext && includePdfContext) {
    contextLines.push(
      "You are answering questions about the PDF currently open in the UI.",
      "Treat the following extracted PDF context as the primary source of truth.",
      "If the extracted context is incomplete, say what is uncertain instead of inventing values."
    );
  }
  if (includePdfContext && (normalizedContext?.title || normalizedContext?.fileName)) {
    contextLines.push(`Document: ${normalizedContext.title || normalizedContext.fileName}`);
  }
  if (includePdfContext && normalizedContext?.pageCount) {
    contextLines.push(
      `Pages: ${normalizedContext.pageCount}; scanned: ${normalizedContext.scannedPages || 0}; extraction complete: ${normalizedContext.extractionComplete ? "yes" : "no"}`
    );
  }
  if (includePdfContext && normalizedContext?.summary) {
    contextLines.push(`Parameter summary: ${normalizedContext.summary}`);
  }
  if (
    includePdfContext
    && normalizedContext?.selectedParameter
    && (normalizedContext.selectedParameter.label || normalizedContext.selectedParameter.value)
  ) {
    contextLines.push(
      `Selected parameter: ${normalizedContext.selectedParameter.label || "parameter"}`
      + `${normalizedContext.selectedParameter.value ? ` = ${normalizedContext.selectedParameter.value}` : ""}`
      + `${normalizedContext.selectedParameter.pageNumber ? ` (page ${normalizedContext.selectedParameter.pageNumber})` : ""}`
    );
  }
  if (includePdfContext && normalizedContext?.parameters.length) {
    contextLines.push(
      "Extracted key parameters:\n"
      + normalizedContext.parameters
        .slice(0, 6)
        .map((item) =>
          `- ${item.label || "parameter"}`
          + `${item.value ? `: ${item.value}` : ""}`
          + `${item.pageNumber ? ` (page ${item.pageNumber})` : ""}`
          + `${item.text ? ` | source: ${truncateGatewayText(item.text, 100)}` : ""}`
        )
        .join("\n")
    );
  }
  if (includeCurrentPageExcerpt && normalizedContext?.currentPage && normalizedContext?.currentPageText) {
    contextLines.push(
      `Current preview page: ${normalizedContext.currentPage}\n`
      + `Current page excerpt:\n${normalizedContext.currentPageText}`
    );
  }

  contextLines.push(`User question:\n${message}`);
  return contextLines.join("\n\n");
}

function collectGatewayTextParts(value, parts = []) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      parts.push(text);
    }
    return parts;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectGatewayTextParts(item, parts));
    return parts;
  }
  if (!value || typeof value !== "object") {
    return parts;
  }
  if (typeof value.text === "string") {
    collectGatewayTextParts(value.text, parts);
  }
  if (value.content !== undefined) {
    collectGatewayTextParts(value.content, parts);
  }
  if (value.message !== undefined) {
    collectGatewayTextParts(value.message, parts);
  }
  return parts;
}

function stripGatewayThinkingText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractGatewayMessageText(message) {
  const parts = collectGatewayTextParts(message, []);
  return stripGatewayThinkingText(parts.join("\n").trim());
}

function isGatewayControlAckText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return false;
  }
  return (
    /^chat-[a-z0-9-]+\s+accepted$/i.test(normalized)
    || /^accepted$/i.test(normalized)
    || /^thinking\s+(?:已关闭|已开启|disabled|enabled|off|on)[。.!]*$/i.test(normalized)
  );
}

async function readLatestAssistantFromGatewayHistory(client, sessionKey) {
  try {
    const history = await client.request(
      "chat.history",
      { sessionKey, limit: 20, maxChars: 200000 },
      { timeoutMs: DIRECT_GATEWAY_REQUEST_TIMEOUT_MS }
    );
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role !== "assistant") {
        continue;
      }
      const text = extractGatewayMessageText(messages[index]);
      if (text && !isGatewayControlAckText(text)) {
        return text;
      }
    }
  } catch (error) {
    console.warn("Gateway history read failed:", error);
  }
  return "";
}

function createGatewayChatWaiter(client, { runId, sessionKey, timeoutMs, onText }) {
  let latestText = "";
  let settled = false;
  let unsubscribe = null;
  let timeout = 0;
  let rejectPromise = null;

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (timeout) {
      window.clearTimeout(timeout);
      timeout = 0;
    }
  };

  const promise = new Promise((resolve, reject) => {
    rejectPromise = reject;
    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    unsubscribe = client.on("chat", async (payload = {}) => {
      if (payload.runId !== runId || payload.sessionKey !== sessionKey) {
        return;
      }

      if (payload.state === "error") {
        finishReject(new Error(payload.errorMessage || "Gateway chat failed."));
        return;
      }

      const text = extractGatewayMessageText(payload.message);
      const meaningfulText = isGatewayControlAckText(text) ? "" : text;
      if (meaningfulText) {
        latestText = meaningfulText;
        onText?.(latestText, payload);
      }

      if (payload.state === "final") {
        const finalText =
          meaningfulText || latestText || (await readLatestAssistantFromGatewayHistory(client, sessionKey));
        if (!finalText) {
          return;
        }
        finishResolve({
          assistantText: finalText,
          runId,
          sessionKey,
        });
      }
    });

    timeout = window.setTimeout(() => {
      finishReject(new Error("OpenClaw direct response timed out."));
    }, Math.max(15000, Number(timeoutMs) || DIRECT_GATEWAY_CHAT_TIMEOUT_MS));
  });

  return {
    promise,
    cancel(error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      rejectPromise?.(error instanceof Error ? error : new Error(String(error)));
    },
  };
}

function markGatewayErrorCanFallback(error, canFallback) {
  if (error && typeof error === "object") {
    error.canFallback = canFallback;
  }
  return error;
}

async function sendOpenClawDirectChat(message) {
  const client = await getGatewayDirectClient().catch((error) => {
    throw markGatewayErrorCanFallback(error, true);
  });
  const agentId = refs.agentId?.value.trim() || state.activeAgentId || DEFAULT_AGENT_ID;
  const sessionId = state.activeSessionId || refs.sessionId?.value.trim() || createSessionId();
  const sessionKey = state.activeSessionKey || buildGatewayDirectSessionKey(agentId, sessionId);
  const runId = createGatewayRunId("chat");
  const finalMessage = buildGatewayDirectMessage(message, buildPdfContext(), []);

  let assistantItem = null;
  const waiter = createGatewayChatWaiter(client, {
    runId,
    sessionKey,
    timeoutMs: DIRECT_GATEWAY_CHAT_TIMEOUT_MS,
    onText: (text) => {
      if (!assistantItem) {
        assistantItem = addMessage("assistant", "OpenClaw is replying...");
      }
      updateMessageContent(assistantItem, text);
    },
  });
  waiter.promise.catch(() => {});

  try {
    await client.request(
      "sessions.messages.subscribe",
      { key: sessionKey },
      { timeoutMs: 5000 }
    ).catch(() => {});

    await client.request(
      "chat.send",
      {
        sessionKey,
        message: finalMessage,
        idempotencyKey: runId,
        timeoutMs: DIRECT_GATEWAY_CHAT_TIMEOUT_MS,
      },
      { timeoutMs: DIRECT_GATEWAY_REQUEST_TIMEOUT_MS }
    );
  } catch (error) {
    waiter.cancel(error);
    throw markGatewayErrorCanFallback(error, true);
  }

  state.activeAgentId = agentId;
  state.activeSessionId = sessionId;
  state.activeSessionKey = sessionKey;
  state.gatewaySessionId = "";
  refs.agentId.value = state.activeAgentId;
  refs.sessionId.value = state.activeSessionId;
  startSessionDiagnosticsPolling();

  assistantItem = assistantItem || addMessage("assistant", "OpenClaw is replying...");

  try {
    const result = await waiter.promise;
    const assistantText = result.assistantText || "OpenClaw finished without returning text.";
    updateMessageContent(assistantItem, assistantText);
    return {
      ok: true,
      transport: "gateway-websocket-direct",
      sessionId,
      sessionKey,
      gatewaySessionId: null,
      agentId,
      engineMode: "openclaw",
      assistantText,
      renderedAssistant: true,
    };
  } catch (error) {
    updateMessageContent(
      assistantItem,
      error instanceof Error ? error.message : "OpenClaw direct request failed."
    );
    throw markGatewayErrorCanFallback(error, false);
  }
}

function normalizeStageLog(entry = {}) {
  return {
    id: Number(entry.id) || 0,
    phase: String(entry.phase || "").trim(),
    status: String(entry.status || "").trim(),
    message: String(entry.message || "").trim(),
    durationMs: Number(entry.durationMs) || 0,
    createdAt: String(entry.createdAt || "").trim(),
    detail:
      entry.detail && typeof entry.detail === "object" && !Array.isArray(entry.detail)
        ? entry.detail
        : null,
  };
}

function formatStagePhaseLabel(phase = "") {
  const lookup = {
    session_reset: "会话初始化",
    pdf_upload_received: "收到文件",
    pdf_parse: "结构解析",
    semantic_extract: "参数抽取",
    memory_upsert: "记忆落库",
    recommend: "国产推荐",
  };
  return lookup[String(phase || "").trim()] || "后台阶段";
}

function formatStageStatusMeta(status = "") {
  switch (String(status || "").trim()) {
    case "completed":
      return { label: "已完成", tone: "done" };
    case "failed":
      return { label: "失败", tone: "error" };
    case "started":
      return { label: "进行中", tone: "running" };
    default:
      return { label: "待处理", tone: "idle" };
  }
}

function formatStageDetail(detail = {}, durationMs = 0) {
  const entries = [];
  const valueOf = (key) => detail && Object.prototype.hasOwnProperty.call(detail, key) ? detail[key] : null;
  const pageCount = Number(valueOf("pageCount"));
  const candidateCount = Number(valueOf("candidateCount"));
  const highlightCount = Number(valueOf("highlightCount"));
  const parameterCount = Number(valueOf("parameterCount"));
  const storedParameters = Number(valueOf("storedParameters"));
  const storedPageSamples = Number(valueOf("storedPageSamples"));
  const candidateTotal = Number(valueOf("candidateCount"));

  if (Number.isFinite(pageCount) && pageCount > 0) {
    entries.push(`${pageCount} 页`);
  }
  if (Number.isFinite(candidateCount) && candidateCount > 0) {
    entries.push(`${candidateCount} 个候选`);
  }
  if (Number.isFinite(highlightCount) && highlightCount > 0) {
    entries.push(`${highlightCount} 个重点参数`);
  }
  if (Number.isFinite(parameterCount) && parameterCount > 0) {
    entries.push(`${parameterCount} 个参数`);
  }
  if (Number.isFinite(storedParameters) && storedParameters > 0) {
    entries.push(`入库 ${storedParameters} 项`);
  }
  if (Number.isFinite(storedPageSamples) && storedPageSamples > 0) {
    entries.push(`页样本 ${storedPageSamples} 条`);
  }
  if (
    !entries.length
    && detail
    && typeof detail === "object"
  ) {
    Object.entries(detail)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .slice(0, 2)
      .forEach(([key, value]) => {
        const label = key === "sourceCategory"
          ? "分类"
          : key === "fileName"
            ? "文档"
            : key === "title"
              ? "标题"
              : key === "sizeBytes"
                ? "大小"
                : key;
        const rendered = key === "sizeBytes"
          ? formatFileSize(Number(value) || 0)
          : String(value);
        entries.push(`${label}: ${rendered}`);
      });
  }
  if (Number.isFinite(candidateTotal) && candidateTotal > 0 && !entries.some((item) => item.includes("候选"))) {
    entries.push(`${candidateTotal} 个候选`);
  }
  if (Number.isFinite(durationMs) && durationMs > 0) {
    entries.push(`${Math.round(durationMs)} ms`);
  }
  return entries.join(" · ");
}

function renderSessionDiagnostics() {
  if (!refs.sessionDiagnostics || !refs.stageLogList || !refs.stageLogCount || !refs.memoryStatusText || !refs.sessionMemoryMeta) {
    return;
  }

  const logs = Array.isArray(state.sessionStageLogs) ? state.sessionStageLogs : [];
  refs.stageLogCount.textContent = `${logs.length} 条`;
  if (refs.refreshStageLogsButton) {
    refs.refreshStageLogsButton.disabled = Boolean(state.diagnosticsLoading);
  }

  const memory = state.sessionMemory;
  if (!state.activeSessionKey) {
    refs.memoryStatusText.textContent = "等待后台会话记忆";
    refs.sessionMemoryMeta.innerHTML = `<span class="meta-text">新建会话后会在这里显示阶段日志和记忆状态</span>`;
    refs.stageLogList.innerHTML = `<p class="meta-text">等待后台阶段日志</p>`;
    return;
  }

  const memoryReady = Boolean(memory?.extractionComplete);
  const parameterCount = Array.isArray(memory?.parameters) ? memory.parameters.length : 0;
  const pageCount = Number(memory?.pageCount) || 0;
  const docLabel = memory?.fileName || memory?.title || getPdfDisplayName({ fallback: "" });
  refs.memoryStatusText.textContent = memoryReady
    ? "会话记忆已同步到后台"
    : state.pdfFile
      ? "等待 PDF 解析完成后写入记忆"
      : "当前会话尚未写入 PDF 记忆";

  const memoryPills = [];
  memoryPills.push(`
    <span class="session-memory-pill ${memoryReady ? "is-ready" : "is-pending"}">
      ${memoryReady ? "记忆已写入" : "待写入记忆"}
    </span>
  `);
  if (docLabel) {
    memoryPills.push(`<span class="session-memory-pill">${escapeHtml(docLabel)}</span>`);
  }
  if (parameterCount > 0) {
    memoryPills.push(`<span class="session-memory-pill">${parameterCount} 个参数</span>`);
  }
  if (pageCount > 0) {
    memoryPills.push(`<span class="session-memory-pill">${pageCount} 页</span>`);
  }
  refs.sessionMemoryMeta.innerHTML = memoryPills.join("") || `<span class="meta-text">等待会话记忆入库</span>`;

  if (!logs.length) {
    refs.stageLogList.innerHTML = `
      <p class="meta-text">
        ${state.diagnosticsLoading ? "正在同步后台阶段日志..." : "当前会话还没有阶段日志，上传 PDF 或生成推荐后会在这里显示。"}
      </p>
    `;
    return;
  }

  refs.stageLogList.innerHTML = logs
    .slice(-8)
    .reverse()
    .map((entry) => {
      const phaseLabel = formatStagePhaseLabel(entry.phase);
      const statusMeta = formatStageStatusMeta(entry.status);
      const detailText = formatStageDetail(entry.detail, entry.durationMs);
      return `
        <article class="stage-log-item stage-log-item-${statusMeta.tone}">
          <div class="stage-log-top">
            <span class="stage-log-phase">${escapeHtml(phaseLabel)}</span>
            <span class="stage-log-status stage-log-status-${statusMeta.tone}">${escapeHtml(statusMeta.label)}</span>
          </div>
          <p class="stage-log-message">${escapeHtml(entry.message || phaseLabel)}</p>
          <div class="stage-log-meta">
            <span>${escapeHtml(formatClock(entry.createdAt) || "--:--:--")}</span>
            ${detailText ? `<span>${escapeHtml(detailText)}</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshSessionDiagnostics(options = {}) {
  const { quiet = false, force = false } = options;
  if (!state.activeSessionKey) {
    state.sessionMemory = null;
    state.sessionStageLogs = [];
    state.diagnosticsLoading = false;
    renderSessionDiagnostics();
    return;
  }
  if (state.diagnosticsLoading && !force) {
    return;
  }

  const token = state.diagnosticsRefreshToken + 1;
  state.diagnosticsRefreshToken = token;
  state.diagnosticsLoading = true;
  renderSessionDiagnostics();

  try {
    const payloadBase = {
      agentId: state.activeAgentId || refs.agentId?.value.trim() || DEFAULT_AGENT_ID,
      sessionId: state.activeSessionId || refs.sessionId?.value.trim() || "",
      sessionKey: state.activeSessionKey || "",
    };
    const [memoryPayload, logsPayload] = await Promise.all([
      apiRequest("/api/session/memory", {
        method: "POST",
        body: JSON.stringify(payloadBase),
      }),
      apiRequest("/api/session/logs", {
        method: "POST",
        body: JSON.stringify({
          ...payloadBase,
          limit: 80,
        }),
      }),
    ]);

    if (token !== state.diagnosticsRefreshToken) {
      return;
    }

    state.sessionMemory =
      memoryPayload?.memory && typeof memoryPayload.memory === "object"
        ? memoryPayload.memory
        : null;
    state.sessionStageLogs = Array.isArray(logsPayload?.logs)
      ? logsPayload.logs.map(normalizeStageLog)
      : [];
  } catch (error) {
    if (!quiet) {
      console.warn("Session diagnostics refresh failed:", error);
    }
  } finally {
    if (token === state.diagnosticsRefreshToken) {
      state.diagnosticsLoading = false;
      renderSessionDiagnostics();
    }
  }
}

function stopSessionDiagnosticsPolling({ clear = false } = {}) {
  if (state.diagnosticsPollHandle) {
    window.clearInterval(state.diagnosticsPollHandle);
    state.diagnosticsPollHandle = 0;
  }
  state.diagnosticsLoading = false;
  if (clear) {
    state.sessionMemory = null;
    state.sessionStageLogs = [];
  }
  renderSessionDiagnostics();
}

function startSessionDiagnosticsPolling() {
  if (!state.activeSessionKey) {
    stopSessionDiagnosticsPolling({ clear: true });
    return;
  }
  if (!state.diagnosticsPollHandle) {
    state.diagnosticsPollHandle = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      refreshSessionDiagnostics({ quiet: true }).catch(() => {});
    }, 1600);
  }
  refreshSessionDiagnostics({ force: true, quiet: true }).catch(() => {});
}

function setChatStatus(kind, label, tip = "") {
  if (refs.chatStatusPill) {
    refs.chatStatusPill.dataset.state = kind;
  }
  if (refs.connectionLabel) {
    refs.connectionLabel.textContent = label;
  }
  if (refs.composerTip) {
    refs.composerTip.textContent = tip;
  }
}

function setChatProgress(label = "", visible = false) {
  if (!refs.chatProgress) {
    return;
  }
  refs.chatProgress.hidden = !visible;
  if (refs.chatProgressLabel) {
    refs.chatProgressLabel.textContent = label || "处理中";
  }
}

function setPdfProgress(label = "", percent = null, visible = false) {
  if (!refs.pdfProgress) {
    return;
  }
  refs.pdfProgress.hidden = !visible;
  if (refs.pdfProgressLabel) {
    refs.pdfProgressLabel.textContent = label || "解析参数";
  }
  if (refs.pdfProgressValue) {
    refs.pdfProgressValue.textContent = Number.isFinite(percent)
      ? `${Math.round(percent)}%`
      : "";
  }
  if (refs.pdfProgressFill) {
    refs.pdfProgressFill.style.width = Number.isFinite(percent)
      ? `${clamp(percent, 0, 100)}%`
      : "0%";
  }
}

function setPreviewEmpty(text = "上传 PDF", visible = true) {
  if (!refs.previewEmpty) {
    return;
  }
  refs.previewEmpty.textContent = text;
  refs.previewEmpty.classList.toggle("is-visible", visible);
  if (visible) {
    refs.previewCanvasShell?.style.setProperty("display", "none");
    refs.previewCanvasShell?.style.setProperty("visibility", "hidden");
    if (refs.pdfCanvas) {
      refs.pdfCanvas.hidden = true;
    }
    if (refs.pdfHighlightLayer) {
      refs.pdfHighlightLayer.style.display = "none";
      refs.pdfHighlightLayer.innerHTML = "";
    }
  }
}

function setPreviewFocus(text = "未选中重点") {
  if (refs.previewFocus) {
    refs.previewFocus.textContent = text;
  }
}

function getUploadedPdfFileName() {
  return String(state.pdfFile?.name || state.pdfInsights?.fileName || state.pdfInsights?.title || "").trim();
}

function getParsedPdfTitle() {
  return String(state.pdfInsights?.parsedTitle || "").trim();
}

function getPdfDisplayName(options = {}) {
  const { stripExtension = false, fallback = "当前 PDF" } = options;
  let name = getUploadedPdfFileName() || getParsedPdfTitle() || fallback;
  if (stripExtension) {
    name = name.replace(/\.pdf$/i, "").trim();
  }
  return name || fallback;
}

function inferSourceManufacturer() {
  if (!state.pdfInsights) {
    return "";
  }
  const sampleText = [
    state.pdfInsights.parsedTitle,
    state.pdfInsights.title,
    state.pdfInsights.fileName,
    state.pdfInsights.summary,
    ...(state.pdfInsights.pages || []).slice(0, 3).map((page) => page?.text || ""),
  ]
    .join("\n")
    .toLowerCase();

  const manufacturerRules = [
    { name: "Texas Instruments", pattern: /texas instruments|\bti\.com\b|\blp5907\b/ },
    { name: "Analog Devices", pattern: /analog devices|\badi\b/ },
    { name: "STMicroelectronics", pattern: /stmicroelectronics|\bstmicro\b/ },
    { name: "Microchip", pattern: /microchip technology/ },
    { name: "NXP", pattern: /\bnxp\b|nxp semiconductors/ },
    { name: "Infineon", pattern: /infineon/ },
    { name: "Renesas", pattern: /renesas/ },
    { name: "ROHM", pattern: /\brohm\b/ },
    { name: "ON Semiconductor", pattern: /on semiconductor|onsemi/ },
    { name: "Toshiba", pattern: /toshiba/ },
    { name: "Fuji Electric", pattern: /fuji electric/ },
  ];

  return manufacturerRules.find((rule) => rule.pattern.test(sampleText))?.name || "";
}

function buildRecommendationChatContext() {
  const candidates = state.recommendItems.slice(0, 5).map((item) => ({
    name: item.name,
    vendor: item.vendor,
    totalScore: item.totalScore,
    desc: item.desc,
    note: item.note,
    chips: item.chips.slice(0, 4),
    specs: item.specs.slice(0, 8),
  }));
  return {
    status: state.recommendStatus,
    category: state.recommendCategory || null,
    activeCandidateId: state.activeRecommendationId || "",
    referenceSpecs: getSourceRecommendationSpecs().slice(0, 8),
    candidates,
  };
}

function syncSendButton() {
  if (refs.sendButton) {
    refs.sendButton.disabled = !refs.messageInput?.value.trim();
  }
}

function handleMessageInputKeydown(event) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing
  ) {
    return;
  }

  event.preventDefault();
  if (!refs.messageInput?.value.trim()) {
    return;
  }
  refs.composer?.requestSubmit();
}

function syncChatEmptyState() {
  if (refs.chatEmpty) {
    refs.chatEmpty.hidden = state.chatMessages.length > 0;
  }
}

function humanRole(role) {
  if (role === "assistant") {
    return "ASSISTANT";
  }
  if (role === "system") {
    return "SYSTEM";
  }
  return "USER";
}

function renderMessages() {
  if (!refs.messageStream || !refs.messageTemplate) {
    return;
  }
  refs.messageStream.querySelectorAll(".message").forEach((node) => node.remove());

  state.chatMessages.forEach((message) => {
    const fragment = refs.messageTemplate.content.cloneNode(true);
    const messageNode = fragment.querySelector(".message");
    const roleNode = fragment.querySelector(".message-role");
    const timeNode = fragment.querySelector(".message-time");
    const bodyNode = fragment.querySelector(".message-body");
    messageNode.dataset.role = message.role;
    roleNode.textContent = humanRole(message.role);
    timeNode.textContent = formatClock(message.timestamp);
    bodyNode.textContent = message.content;
    if (message.attachment?.url) {
      const attachmentNode = document.createElement("div");
      attachmentNode.className = "message-attachment";

      const downloadLink = document.createElement("a");
      downloadLink.className = "message-download-link";
      downloadLink.href = message.attachment.url;
      downloadLink.download = message.attachment.name || "采购交付包.zip";
      downloadLink.textContent = `${message.attachment.name || "下载交付包"}${
        message.attachment.size ? ` · ${formatFileSize(message.attachment.size)}` : ""
      }`;
      attachmentNode.append(downloadLink);

      if (message.attachment.actionView) {
        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "message-view-link";
        viewButton.textContent = "查看推荐页";
        viewButton.addEventListener("click", () => setWorkspaceView(message.attachment.actionView));
        attachmentNode.append(viewButton);
      }

      bodyNode.insertAdjacentElement("afterend", attachmentNode);
    }
    refs.messageStream.append(fragment);
  });

  syncChatEmptyState();
  refs.messageStream.scrollTop = refs.messageStream.scrollHeight;
}

function addMessage(role, content, attachment = null) {
  const item = normalizeMessage({ role, content, attachment });
  if (!item.content && !item.attachment) {
    return null;
  }
  state.chatMessages.push(item);
  renderMessages();
  return item;
}

function updateMessageContent(item, content) {
  if (!item || !state.chatMessages.includes(item)) {
    return;
  }
  const text = String(content || "").trim();
  if (!text) {
    return;
  }
  item.content = text;
  item.timestamp = new Date().toISOString();
  renderMessages();
}

function renderHistoryList() {
  if (!refs.historyList || !refs.historyCount) {
    return;
  }
  refs.historyCount.textContent = `${state.historyEntries.length} 条`;
  if (!state.historyEntries.length) {
    refs.historyList.innerHTML = `<p class="meta-text">暂无历史对话</p>`;
    return;
  }
  refs.historyList.innerHTML = state.historyEntries
    .map(
      (entry) => `
        <button class="history-item" type="button" data-history-id="${escapeHtml(entry.id)}">
          <div class="history-item-top">
            <strong class="history-item-title">${escapeHtml(entry.title || "未命名会话")}</strong>
            <span class="history-item-time">${escapeHtml(formatClock(entry.updatedAt))}</span>
          </div>
          <p class="history-item-preview">${escapeHtml(entry.preview || "点击恢复会话")}</p>
          <div class="history-item-meta">
            <span class="meta-pill">${escapeHtml(entry.agentId || DEFAULT_AGENT_ID)}</span>
            <span class="meta-pill">${escapeHtml((entry.messages || []).length)} 条消息</span>
          </div>
        </button>
      `
    )
    .join("");
}

function toggleDropdown(button, panel, open) {
  if (!button || !panel) {
    return;
  }
  button.setAttribute("aria-expanded", open ? "true" : "false");
  panel.hidden = !open;
}

function setSettingsOpen(open) {
  toggleDropdown(refs.toggleSettingsButton, refs.chatSettings, open);
}

function setHistoryOpen(open) {
  toggleDropdown(refs.toggleHistoryButton, refs.historyPanel, open);
}

function setDetailView(view) {
  state.recommendDetailMode = view === "data" || view === "verify" ? view : "radar";
  refs.recommendViewRadar?.classList.toggle("active", state.recommendDetailMode === "radar");
  refs.recommendViewData?.classList.toggle("active", state.recommendDetailMode === "data");
  refs.recommendViewVerify?.classList.toggle("active", state.recommendDetailMode === "verify");
  if (refs.radarShell) {
    refs.radarShell.hidden = state.recommendDetailMode !== "radar";
  }
  if (refs.recommendVerifyView) {
    refs.recommendVerifyView.hidden = state.recommendDetailMode !== "verify";
  }
  if (refs.recommendDataView) {
    refs.recommendDataView.hidden = state.recommendDetailMode !== "data";
  }
  if (refs.recommendDetailTitle) {
    refs.recommendDetailTitle.textContent = {
      radar: "雷达对比",
      data: "使用场景",
      verify: "工程辨别",
    }[state.recommendDetailMode] || "雷达对比";
  }
  if (state.recommendDetailMode === "radar") {
    requestAnimationFrame(() => renderRadar());
  } else if (state.recommendDetailMode === "verify") {
    renderEngineeringReview();
  } else {
    renderScenarioSuggestions();
    renderScenarioFollowup();
    refs.scenarioSuggestionList?.scrollTo?.({ left: 0, top: 0 });
  }
}

function setWorkspaceView(view) {
  stopWorkspaceResize();
  state.activeView = view;
  if (refs.workspace) {
    refs.workspace.dataset.view = view;
  }
  refs.modeLinks.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "recommend" && state.pdfInsights) {
    ensureRecommendations().catch(() => {});
  }
  applyWorkspaceSplit();
  requestPreviewRelayout();
}

function updateSummaryMeta() {
  const pageCount = state.pdfInsights?.pageCount || state.pdfDoc?.numPages || 0;
  const uploadedFileName = getUploadedPdfFileName();
  const parsedDocumentTitle = getParsedPdfTitle();
  if (refs.metaPages) {
    refs.metaPages.textContent = `${pageCount} 页`;
  }
  if (refs.metaSize) {
    refs.metaSize.textContent = formatFileSize(state.pdfFile?.size || 0);
  }
  if (refs.documentName) {
    refs.documentName.textContent = uploadedFileName || parsedDocumentTitle || "未上传 PDF";
  }
  if (refs.documentCaption) {
    refs.documentCaption.textContent =
      parsedDocumentTitle && parsedDocumentTitle !== uploadedFileName
        ? parsedDocumentTitle
        : "上传后自动提取";
  }
  if (refs.summaryText) {
    refs.summaryText.textContent =
      state.pdfInsights?.summary || (state.pdfFile ? "正在提取参数..." : "等待 PDF");
  }
}

function normalizeHighlight(item = {}, index = 0) {
  const rawRect =
    item.rect && typeof item.rect === "object"
      ? {
          x0:
            Number(item.rect.x0) ||
            Number(item.rect.x) ||
            0,
          y0:
            Number(item.rect.y0) ||
            Number(item.rect.y) ||
            0,
          x1:
            Number(item.rect.x1) ||
            (
              (Number(item.rect.x) || 0) +
              (Number(item.rect.width) || 0)
            ),
          y1:
            Number(item.rect.y1) ||
            (
              (Number(item.rect.y) || 0) +
              (Number(item.rect.height) || 0)
            ),
        }
      : null;

  return {
    id: String(item.id || `highlight-${index + 1}`),
    parameterId: String(item.parameterId || ""),
    label: String(item.label || "参数"),
    value: String(item.value || ""),
    text: String(item.text || ""),
    pageNumber: Number(item.pageNumber) || 0,
    pageWidth: Number(item.pageWidth) || 0,
    pageHeight: Number(item.pageHeight) || 0,
    rect: rawRect,
  };
}

function normalizeHighlightToken(value = "") {
  return String(value || "")
    .replace(/[−–—]/g, "-")
    .replace(/[~～]/g, "-")
    .replace(/(?:至|到|to)/gi, "-")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function getDisplayHighlightFamily(item = {}) {
  const parameterId = normalizeHighlightToken(item.parameterId);
  const label = normalizeHighlightToken(item.label);

  if (parameterId === "input_voltage" || parameterId === "supply_voltage") {
    return "input_supply_voltage";
  }

  if (label === "输入电压" || label === "供电电压") {
    return "input_supply_voltage";
  }

  return parameterId || label;
}

function createDisplayHighlightKey(item = {}) {
  const label = getDisplayHighlightFamily(item);
  const value = normalizeHighlightToken(item.value);
  const text = normalizeHighlightToken(item.text);
  return `${label}::${value || text}`;
}

function pickPreferredHighlight(current, candidate) {
  const currentHasRect = Boolean(current?.rect);
  const candidateHasRect = Boolean(candidate?.rect);
  if (candidateHasRect && !currentHasRect) {
    return candidate;
  }
  if (currentHasRect && !candidateHasRect) {
    return current;
  }

  const currentPage = Number(current?.pageNumber) || Number.POSITIVE_INFINITY;
  const candidatePage = Number(candidate?.pageNumber) || Number.POSITIVE_INFINITY;
  if (candidatePage !== currentPage) {
    return candidatePage < currentPage ? candidate : current;
  }

  const currentTextLength = String(current?.text || "").trim().length;
  const candidateTextLength = String(candidate?.text || "").trim().length;
  if (candidateTextLength !== currentTextLength) {
    return candidateTextLength < currentTextLength ? candidate : current;
  }

  return current;
}

function dedupeDisplayHighlights(items = []) {
  const deduped = [];
  const keyToIndex = new Map();

  items.forEach((item) => {
    const key = createDisplayHighlightKey(item);
    if (!key || key.endsWith("::")) {
      deduped.push(item);
      return;
    }

    const existingIndex = keyToIndex.get(key);
    if (existingIndex == null) {
      keyToIndex.set(key, deduped.length);
      deduped.push(item);
      return;
    }

    deduped[existingIndex] = pickPreferredHighlight(deduped[existingIndex], item);
  });

  return deduped;
}

function getHighlightList() {
  return Array.isArray(state.pdfInsights?.highlights)
    ? dedupeDisplayHighlights(state.pdfInsights.highlights.map(normalizeHighlight))
    : [];
}

function getSelectedHighlight() {
  return getHighlightList().find((item) => item.id === state.selectedHighlightId) || null;
}

function renderHighlights() {
  const highlights = getHighlightList();

  if (refs.highlightCount) {
    refs.highlightCount.textContent = `${highlights.length} 条`;
  }
  if (!refs.highlightsList) {
    return;
  }
  if (!highlights.length) {
    refs.highlightsList.innerHTML = `<p class="meta-text">还没有识别到参数</p>`;
    state.selectedHighlightId = "";
    setPreviewFocus("未选中重点");
    renderHighlightMark();
    return;
  }

  if (!highlights.some((item) => item.id === state.selectedHighlightId)) {
    state.selectedHighlightId = highlights[0].id;
  }

  refs.highlightsList.innerHTML = highlights
    .map(
      (item, index) => {
        const isActive = item.id === state.selectedHighlightId;
        const pageLabel = item.pageNumber ? `第 ${item.pageNumber} 页` : "页码待补";
        const sourceText = truncateText(item.text || "暂无说明", 78);
        return `
        <button class="highlight-item highlight-tone-${index % 3}${isActive ? " active" : ""}" type="button" data-highlight-id="${escapeHtml(item.id)}">
          <div class="highlight-card-shell">
            <span class="highlight-rank">#${String(index + 1).padStart(2, "0")}</span>
            <div class="highlight-copy">
              <div class="highlight-maincopy">
                <span class="highlight-label">${escapeHtml(item.label)}</span>
                <strong class="highlight-value">${escapeHtml(item.value || item.text || "未提取到值")}</strong>
                <span class="highlight-source">${escapeHtml(sourceText)}</span>
              </div>
              <div class="highlight-meta">
                <span class="highlight-badge">${isActive ? "当前定位" : "重点参数"}</span>
                <span class="highlight-page-pill">${escapeHtml(pageLabel)}</span>
              </div>
            </div>
          </div>
        </button>
      `;
      }
    )
    .join("");

  const selected = getSelectedHighlight();
  setPreviewFocus(selected?.label || "未选中重点");
  renderHighlightMark();
}

function updatePageControls() {
  const pageCount = state.pdfDoc?.numPages || state.pdfInsights?.pageCount || 0;
  if (refs.pageNumberInput) {
    refs.pageNumberInput.disabled = !pageCount;
    refs.pageNumberInput.min = "1";
    refs.pageNumberInput.max = String(pageCount || 1);
    refs.pageNumberInput.value = String(pageCount ? state.currentPageNumber : 1);
  }
  if (refs.pageCountLabel) {
    refs.pageCountLabel.textContent = `/ ${pageCount || 0}`;
  }
  if (refs.prevPageButton) {
    refs.prevPageButton.disabled = !pageCount || state.currentPageNumber <= 1;
  }
  if (refs.nextPageButton) {
    refs.nextPageButton.disabled = !pageCount || state.currentPageNumber >= pageCount;
  }
}

function resizePdfCanvas(width, height) {
  const dpr = window.devicePixelRatio || 1;
  const canvas = refs.pdfCanvas;
  const ctx = canvas.getContext("2d");
  if (refs.previewCanvasShell) {
    refs.previewCanvasShell.style.display = "inline-flex";
    refs.previewCanvasShell.style.visibility = "visible";
  }
  canvas.hidden = false;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  refs.previewCanvasShell.style.width = `${width}px`;
  refs.previewCanvasShell.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

async function renderPdfPage() {
  if (!state.pdfDoc || !refs.previewStage || !refs.pdfCanvas) {
    setPreviewEmpty(state.pdfFile ? "PDF 加载中..." : "上传 PDF", !state.pdfFile);
    return;
  }

  const pageNumber = clamp(state.currentPageNumber, 1, state.pdfDoc.numPages);
  state.currentPageNumber = pageNumber;
  updatePageControls();

  const token = ++state.renderToken;
  const page = await state.pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const bounds = refs.previewStage.getBoundingClientRect();
  const availableWidth = Math.max(240, bounds.width - 56);
  const availableHeight = Math.max(240, bounds.height - 56);
  const scale = Math.min(
    availableWidth / baseViewport.width,
    availableHeight / baseViewport.height
  );
  const viewport = page.getViewport({ scale });

  if (token !== state.renderToken) {
    return;
  }

  if (state.currentRenderTask) {
    try {
      state.currentRenderTask.cancel();
    } catch {
      // Ignore cancellation errors.
    }
  }

  const context = resizePdfCanvas(viewport.width, viewport.height);
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, viewport.width, viewport.height);
  setPreviewEmpty("", false);
  state.currentRenderTask = page.render({ canvasContext: context, viewport });
  try {
    await state.currentRenderTask.promise;
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      throw error;
    }
  } finally {
    state.currentRenderTask = null;
  }

  renderHighlightMark();
}

function renderHighlightMark() {
  if (!refs.pdfHighlightLayer) {
    return;
  }
  const highlight = getSelectedHighlight();
  if (!highlight || highlight.pageNumber !== state.currentPageNumber || !highlight.rect) {
    refs.pdfHighlightLayer.style.display = "none";
    refs.pdfHighlightLayer.innerHTML = "";
    return;
  }

  const canvasWidth = refs.pdfCanvas.clientWidth;
  const canvasHeight = refs.pdfCanvas.clientHeight;
  const scaleX = canvasWidth / (highlight.pageWidth || canvasWidth);
  const scaleY = canvasHeight / (highlight.pageHeight || canvasHeight);
  const left = Math.max(0, highlight.rect.x0 * scaleX);
  const top = Math.max(0, highlight.rect.y0 * scaleY);
  const width = Math.max(24, (highlight.rect.x1 - highlight.rect.x0) * scaleX);
  const height = Math.max(18, (highlight.rect.y1 - highlight.rect.y0) * scaleY);

  refs.pdfHighlightLayer.style.display = "block";
  refs.pdfHighlightLayer.innerHTML = `
    <div class="pdf-highlight-mark" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;"></div>
  `;
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function buildPdfContext() {
  if (!state.pdfInsights) {
    return null;
  }
  const highlights = getHighlightList();
  const selectedParameter =
    highlights.find((item) => item.id === state.selectedHighlightId) || null;
  const selectedPageNumber = Number(selectedParameter?.pageNumber) || 0;
  const currentPage = Number(state.currentPageNumber) || selectedPageNumber || 0;
  const currentPageEntry = currentPage
    ? (state.pdfInsights.pages || []).find((item) => Number(item?.pageNumber) === currentPage) || null
    : null;
  return {
    title: getPdfDisplayName({ stripExtension: true, fallback: "" }),
    fileName: getUploadedPdfFileName(),
    sourceManufacturer: inferSourceManufacturer(),
    summary: state.pdfInsights.summary || "",
    pageCount: Number(state.pdfInsights.pageCount) || 0,
    scannedPages: Array.isArray(state.pdfInsights.pages) ? state.pdfInsights.pages.length : 0,
    extractionComplete: Boolean(state.pdfInsights),
    currentPage,
    currentPageText: String(currentPageEntry?.text || currentPageEntry?.summary || "").trim(),
    parameters: highlights.slice(0, 12),
    selectedParameter,
    pageParameters: selectedPageNumber
      ? highlights.filter((item) => item.pageNumber === selectedPageNumber)
      : [],
    pages: (state.pdfInsights.pages || []).slice(0, 6),
    recommendation: buildRecommendationChatContext(),
  };
}

async function logTraceSelectionToGateway() {
  const pdfContext = buildPdfContext();
  if (!pdfContext?.selectedParameter) {
    return;
  }

  const localSessionId = String(state.activeSessionId || refs.sessionId?.value.trim() || "").trim();

  try {
    const payload = await apiRequest("/api/trace/log", {
      method: "POST",
      body: JSON.stringify({
        agentId: refs.agentId?.value.trim() || state.activeAgentId || DEFAULT_AGENT_ID,
        sessionId: localSessionId,
        sessionKey: "",
        engineMode: state.engineMode,
        pdfContext,
      }),
    });

    state.activeAgentId = payload.agentId || state.activeAgentId;
    state.activeSessionId = payload.sessionId || state.activeSessionId;
    state.activeSessionKey = "";
    state.gatewaySessionId = "";
    refs.agentId.value = state.activeAgentId;
    refs.sessionId.value = state.activeSessionId;
  } catch (error) {
    console.warn("Trace log push failed:", error);
  }
}

async function analyzePdf() {
  if (!state.pdfFile) {
    return;
  }

  if (!state.pdfBytes || !state.pdfBytes.length) {
    state.pdfBytes = new Uint8Array(await state.pdfFile.arrayBuffer());
  }

  setPdfProgress("芯中有数正在提取参数", 32, true);
  if (refs.summaryText) {
    refs.summaryText.textContent = "正在提取参数...";
  }
  renderHighlights();

  const fileName = state.pdfFile.name || state.pdfInsights?.fileName || "upload.pdf";
  const dataBase64 = toBase64(state.pdfBytes);
  const agentId = refs.agentId?.value.trim() || DEFAULT_AGENT_ID;
  const sessionId = state.activeSessionId || refs.sessionId?.value.trim() || createSessionId();

  if (!fileName || !dataBase64) {
    throw new Error("PDF 文件读取失败，请重新上传。");
  }

  const payload = await apiRequest("/api/pdf/analyze", {
    method: "POST",
    body: JSON.stringify({
      fileName,
      dataBase64,
      agentId,
      sessionId,
      sessionKey: state.activeSessionKey || "",
      engineMode: state.engineMode,
    }),
  });

  state.activeAgentId = payload.agentId || agentId;
  state.activeSessionId = payload.sessionId || sessionId;
  state.activeSessionKey = OLLAMA_ONLY_MODE ? "" : (payload.sessionKey || state.activeSessionKey);
  state.gatewaySessionId = OLLAMA_ONLY_MODE ? "" : (payload.gatewaySessionId || state.gatewaySessionId);
  refs.agentId.value = state.activeAgentId;
  refs.sessionId.value = state.activeSessionId;
  if (state.activeSessionKey) {
    startSessionDiagnosticsPolling();
  } else {
    stopSessionDiagnosticsPolling({ clear: true });
  }

  state.pdfInsights = {
    title: String(payload.analysis?.fileName || state.pdfFile.name),
    parsedTitle: String(payload.analysis?.title || ""),
    summary: String(payload.analysis?.summary || ""),
    fileName: String(payload.analysis?.fileName || state.pdfFile.name),
    pageCount: Number(payload.analysis?.pageCount) || state.pdfDoc?.numPages || 0,
    pages: Array.isArray(payload.analysis?.pages) ? payload.analysis.pages : [],
    highlights: Array.isArray(payload.analysis?.highlights)
      ? payload.analysis.highlights.map(normalizeHighlight)
      : [],
  };
  updateScenarioSuggestions({ autoApply: true });

  state.selectedHighlightId = state.pdfInsights.highlights[0]?.id || "";
  const selected = getSelectedHighlight();
  if (selected?.pageNumber) {
    state.currentPageNumber = clamp(selected.pageNumber, 1, state.pdfInsights.pageCount || state.pdfDoc?.numPages || selected.pageNumber);
  }
  updateSummaryMeta();
  renderHighlights();
  updatePurchaseExportButton();
  await renderPdfPage();
  await refreshSessionDiagnostics({ force: true, quiet: true });
  setPdfProgress("参数提取完成", 100, true);
  window.setTimeout(() => setPdfProgress("", null, false), 520);
}

async function loadPdf(file) {
  state.pdfFile = file;
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  state.pdfBytes = rawBytes.slice();
  state.pdfInsights = null;
  state.selectedHighlightId = "";
  state.pdfDoc = null;
  state.currentPageNumber = 1;
  state.recommendStatus = "idle";
  state.recommendCategory = null;
  state.referenceSpecs = [];
  state.referenceSpecScores = {};
  state.recommendItems = [];
  state.recommendThinking = [];
  state.activeRecommendationId = "";
  state.radarSourceValues = [];
  state.radarTargetValues = [];
  state.scenarioSuggestions = [];
  state.activeScenarioId = "";
  state.scenario = {
    inputVoltage: 5,
    outputVoltage: 3.3,
    loadCurrentMa: 200,
    temperatureC: 70,
    package: "SOT-23-5",
  };
  state.engineeringDecisionAccepted = false;
  if (refs.scenarioPackage?.dataset) {
    delete refs.scenarioPackage.dataset.userEdited;
  }
  syncScenarioInputsFromState();

  setDetailView("radar");
  setPreviewFocus("未选中重点");
  updateSummaryMeta();
  renderHighlights();
  renderRecommendations();
  updatePurchaseExportButton();
  setPdfProgress("准备解析", 6, true);

  state.pdfDoc = await pdfjsLib.getDocument({
    data: rawBytes.slice(),
    ...PDF_DOCUMENT_OPTIONS,
  }).promise;
  state.currentPageNumber = 1;
  updateSummaryMeta();
  updatePageControls();
  await renderPdfPage();
  await analyzePdf();
  if (state.activeView === "recommend") {
    ensureRecommendations().catch(() => {});
  }
}

function normalizeSpec(spec = {}) {
  return {
    key: String(spec.key || ""),
    label: String(spec.label || spec.key || "参数"),
    value: String(spec.value || "—"),
    condition: String(spec.condition || spec.conditionText || "").trim(),
  };
}

function isInventoryDisplayText(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  return /^(?:库存|现货|可用库存|库存数量)(?:\s|[:：]|$|\d)/i.test(text)
    || /^(?:stock|inventory|in stock)\b/i.test(text);
}

function normalizeCandidate(item = {}, index = 0) {
  return {
    id: String(item.id || `candidate-${index + 1}`),
    rank: Number(item.rank) || index + 1,
    name: String(item.name || `候选 ${index + 1}`),
    vendor: String(item.vendor || "国产厂商"),
    desc: String(item.positioning || item.reason || item.desc || ""),
    chips: Array.isArray(item.chips)
      ? item.chips.map((chip) => String(chip || "").trim()).filter(Boolean)
          .filter((chip) => !isInventoryDisplayText(chip))
      : [],
    note: String(item.note || ""),
    totalScore: Number.isFinite(item.totalScore) ? Math.round(item.totalScore) : null,
    specs: Array.isArray(item.specs)
      ? item.specs.map(normalizeSpec).filter((spec) => !isInventoryDisplayText(spec.label))
      : [],
    specScores:
      item.specScores && typeof item.specScores === "object"
        ? item.specScores
        : {},
    scores: item.scores && typeof item.scores === "object" ? item.scores : {},
  };
}

function getActiveCandidate() {
  return state.recommendItems.find((item) => item.id === state.activeRecommendationId) || null;
}

function getSourceRecommendationSpecs() {
  if (state.referenceSpecs.length) {
    return state.referenceSpecs.filter((spec) => !isInventoryDisplayText(spec.label)).slice(0, 4);
  }
  return getHighlightList()
    .filter((item) => item.label && item.value)
    .map((item) => normalizeSpec({ key: item.id, label: item.label, value: item.value }))
    .filter((spec) => !isInventoryDisplayText(spec.label))
    .slice(0, 4);
}

function renderRecommendSpecItems(specs = []) {
  if (!specs.length) {
    return `<div class="recommend-spec-empty">等待参数提取</div>`;
  }
  return specs.slice(0, 4).map((spec) => `
    <div class="recommend-spec-item">
      <span class="recommend-spec-label">${escapeHtml(spec.label)}</span>
      <strong class="recommend-spec-value">${escapeHtml(spec.value)}</strong>
    </div>
  `).join("");
}

function renderSourceReferenceCard() {
  if (!state.pdfInsights && !state.pdfFile) {
    return "";
  }
  const specs = getSourceRecommendationSpecs();
  const title = getPdfDisplayName();
  const fileName = getUploadedPdfFileName() || "上传文件";
  const pageCount = Number(state.pdfInsights?.pageCount || state.pdfDoc?.numPages) || 0;
  const chips = ["基准参数", pageCount ? `${pageCount} 页` : "", specs.length ? `${specs.length} 项` : ""]
    .filter(Boolean)
    .slice(0, 3);

  return `
    <article class="recommend-card recommend-card-source">
      <div class="recommend-card-top">
        <span class="recommend-rank">原始 PDF</span>
        <span class="recommend-vendor">基准器件</span>
      </div>
      <div class="recommend-name">${escapeHtml(title)}</div>
      <div class="recommend-desc">${escapeHtml(fileName && fileName !== title ? fileName : "上传数据手册")}</div>
      <div class="recommend-spec-grid">
        ${renderRecommendSpecItems(specs)}
      </div>
      <div class="recommend-chip-row">
        ${chips.map((chip) => `<span class="recommend-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
      <div class="recommend-note">上传 PDF 提取的基准参数，用于和下方国产候选进行对比。</div>
    </article>
  `;
}

function renderRecommendationCards() {
  if (!refs.recommendList) {
    return;
  }

  const sourceCard = renderSourceReferenceCard();
  if (!sourceCard && !state.recommendItems.length) {
    refs.recommendList.innerHTML = `<p class="meta-text">上传 PDF 后生成国产候选</p>`;
    return;
  }

  const candidateCards = state.recommendItems
    .slice(0, RECOMMEND_CARD_LIMIT)
    .map(
      (item) => `
        <button class="recommend-card${item.id === state.activeRecommendationId ? " active" : ""}" type="button" data-recommend-id="${escapeHtml(item.id)}">
          <div class="recommend-card-top">
            <span class="recommend-rank">候选 ${String(item.rank).padStart(2, "0")}</span>
            <span class="recommend-vendor">${escapeHtml(item.vendor)}${item.totalScore ? ` · ${item.totalScore}` : ""}</span>
          </div>
          <div class="recommend-name">${escapeHtml(item.name)}</div>
          <div class="recommend-desc">${escapeHtml(item.desc || "参数接近，可继续复核")}</div>
          <div class="recommend-spec-grid">
            ${renderRecommendSpecItems(item.specs)}
          </div>
          <div class="recommend-chip-row">
            ${item.chips.slice(0, 3).map((chip) => `<span class="recommend-chip">${escapeHtml(chip)}</span>`).join("")}
          </div>
          <div class="recommend-note">${escapeHtml(item.note || "仍建议交叉核对 datasheet")}</div>
        </button>
      `
    )
    .join("");
  const emptyText = state.recommendStatus === "loading"
    ? "国产候选生成中..."
    : state.pdfInsights
      ? "切换到推荐页后生成国产候选"
      : "暂无可展示的国产候选";
  refs.recommendList.innerHTML = sourceCard + (candidateCards || `<p class="meta-text">${emptyText}</p>`);
}

function buildCompareRows() {
  const referenceMap = new Map(state.referenceSpecs.map((item) => [item.key, item]));
  const candidateMap = new Map((getActiveCandidate()?.specs || []).map((item) => [item.key, item]));
  const keys = [...new Set([...referenceMap.keys(), ...candidateMap.keys()])];
  return keys.map((key) => ({
    key,
    left: referenceMap.get(key) || {
      key,
      label: candidateMap.get(key)?.label || key,
      value: "—",
      condition: "",
    },
    right: candidateMap.get(key) || {
      key,
      label: referenceMap.get(key)?.label || key,
      value: "—",
      condition: "",
    },
  }));
}

function compareState(key) {
  const score = Number(getActiveCandidate()?.specScores?.[key]);
  if (Number.isFinite(score)) {
    if (score >= 88) {
      return { kind: "match", label: "匹配" };
    }
    if (score >= 66) {
      return { kind: "near", label: "接近" };
    }
  }
  return { kind: "gap", label: "复核" };
}

function normalizeCompareConditionText(value = "") {
  return String(value || "")
    .replace(/[；;]+/g, ";")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compareConditionState(row) {
  const left = String(row?.left?.condition || "").trim();
  const right = String(row?.right?.condition || "").trim();

  if (!left && !right) {
    return {
      kind: "none",
      label: "未见条件",
      note: "",
    };
  }

  if (left && right) {
    if (normalizeCompareConditionText(left) === normalizeCompareConditionText(right)) {
      return {
        kind: "match",
        label: "条件一致",
        note: "参考器件与候选器件的测试条件一致，可以直接结合数值判断。",
      };
    }

    return {
      kind: "gap",
      label: "条件差异",
      note: "数值可比，但测试条件不一致，建议结合原文进一步复核。",
    };
  }

  if (left) {
    return {
      kind: "warn",
      label: "候选待补",
      note: "参考器件含测试条件说明，但候选器件当前未提供对应条件。",
    };
  }

  return {
    kind: "warn",
    label: "参考待补",
    note: "候选器件提供了测试条件，参考器件当前未提取到对应条件。",
  };
}

function renderCompareList() {
  if (!refs.recommendCompareList) {
    return;
  }

  const candidate = getActiveCandidate();
  if (!candidate) {
    refs.recommendCompareList.innerHTML = `<p class="meta-text">先选择一张候选卡片</p>`;
    return;
  }

  refs.recommendCompareList.innerHTML = buildCompareRows()
    .map((row) => {
      const status = compareState(row.key);
      const conditionStatus = compareConditionState(row);
      const showConditions = Boolean(row.left.condition || row.right.condition || conditionStatus.kind !== "none");
      return `
        <article class="recommend-compare-item">
          <div class="recommend-compare-item-top">
            <strong class="recommend-compare-label">${escapeHtml(row.left.label || row.right.label || row.key)}</strong>
            <div class="recommend-compare-status-group">
              <span class="recommend-compare-status recommend-compare-status-${status.kind}">${escapeHtml(status.label)}</span>
              ${conditionStatus.kind !== "none"
                ? `<span class="recommend-compare-condition-status recommend-compare-condition-status-${conditionStatus.kind}">${escapeHtml(conditionStatus.label)}</span>`
                : ""}
            </div>
          </div>
          <div class="recommend-compare-values">
            <div class="recommend-compare-cell">
              <span class="recommend-compare-caption">参考器件</span>
              <strong class="recommend-compare-value">${escapeHtml(row.left.value || "—")}</strong>
            </div>
            <div class="recommend-compare-cell">
              <span class="recommend-compare-caption">候选器件</span>
              <strong class="recommend-compare-value">${escapeHtml(row.right.value || "—")}</strong>
            </div>
          </div>
          ${showConditions
            ? `
              <div class="recommend-compare-conditions">
                <div class="recommend-compare-condition-cell">
                  <span class="recommend-compare-caption">参考条件</span>
                  <strong class="recommend-compare-condition-value${row.left.condition ? "" : " is-muted"}">${escapeHtml(row.left.condition || "未提取到测试条件")}</strong>
                </div>
                <div class="recommend-compare-condition-cell">
                  <span class="recommend-compare-caption">候选条件</span>
                  <strong class="recommend-compare-condition-value${row.right.condition ? "" : " is-muted"}">${escapeHtml(row.right.condition || "参数库暂未提供测试条件")}</strong>
                </div>
              </div>
              ${conditionStatus.note
                ? `<p class="recommend-compare-condition-note recommend-compare-condition-note-${conditionStatus.kind}">${escapeHtml(conditionStatus.note)}</p>`
                : ""}
            `
            : ""}
        </article>
      `;
    })
    .join("");
}

function renderThinkingList() {
  if (!refs.recommendThinkingList || !refs.recommendThinkingCount) {
    return;
  }

  refs.recommendThinkingCount.textContent = `${state.recommendThinking.length} 条`;
  if (!state.recommendThinking.length) {
    refs.recommendThinkingList.innerHTML = `<p class="meta-text">等待推荐分析</p>`;
    return;
  }

  refs.recommendThinkingList.innerHTML = state.recommendThinking
    .map(
      (item, index) => `
        <article class="recommend-thinking-item${index === 1 ? " is-emphasis" : ""}">
          <div class="recommend-thinking-top">
            <span class="recommend-thinking-title">${escapeHtml(item.title || `步骤 ${index + 1}`)}</span>
            <span class="recommend-thinking-index">${String(index + 1).padStart(2, "0")}</span>
          </div>
          <div class="recommend-thinking-body">${escapeHtml(item.content || item.body || "")}</div>
        </article>
      `
    )
    .join("");
}

function extractRadarNumbers(value = "") {
  const matches = String(value || "")
    .replace(/[−–—]/g, "-")
    .match(/-?\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number).filter((item) => Number.isFinite(item)) : [];
}

function getRadarUnitMultiplier(key, text = "") {
  const unitText = String(text || "");
  if (key === "quiescent_current_typ" || key === "output_current_max") {
    if (/nA\b/i.test(unitText)) return 1e-9;
    if (/[uµμ]A\b/i.test(unitText)) return 1e-6;
    if (/mA\b/i.test(unitText)) return 1e-3;
    if (/\bA\b/i.test(unitText)) return 1;
  }
  if (key === "output_noise_typ") {
    if (/nV/i.test(unitText)) return 1e-9;
    if (/[uµμ]V/i.test(unitText)) return 1e-6;
    if (/mV/i.test(unitText)) return 1e-3;
    if (/\bV\b/i.test(unitText)) return 1;
  }
  if (/kHz\b/i.test(unitText)) return 1e3;
  if (/MHz\b/i.test(unitText)) return 1e6;
  if (/GHz\b/i.test(unitText)) return 1e9;
  return 1;
}

function parseRadarMetric(key, value = "") {
  const text = String(value || "").trim();
  if (!text || text === "—") {
    return { kind: "empty", text: "" };
  }
  if (key === "package" || key === "interface_type") {
    return { kind: "text", text };
  }

  const numbers = extractRadarNumbers(text);
  const multiplier = getRadarUnitMultiplier(key, text);
  const scaledNumbers = numbers.map((item) => item * multiplier);
  if (RADAR_RANGE_KEYS.has(key) && numbers.length >= 2) {
    const lower = Math.min(scaledNumbers[0], scaledNumbers[1]);
    const upper = Math.max(scaledNumbers[0], scaledNumbers[1]);
    return {
      kind: "range",
      text,
      lower,
      upper,
      span: Math.max(upper - lower, 0),
      center: (lower + upper) / 2,
    };
  }
  if (numbers.length) {
    return { kind: "number", text, value: scaledNumbers[0] };
  }
  return { kind: "text", text };
}

function getLowerBetterRadarPenalty(key) {
  return key === "output_noise_typ" ? 70 : 38;
}

function scaleRadarPair(sourceValue, targetValue, mode = "higher", key = "") {
  if (!Number.isFinite(sourceValue) && !Number.isFinite(targetValue)) {
    return { source: 36, target: 36 };
  }
  if (!Number.isFinite(sourceValue)) {
    return { source: 36, target: 88 };
  }
  if (!Number.isFinite(targetValue)) {
    return { source: 88, target: 36 };
  }

  if (mode === "lower") {
    if (targetValue > sourceValue) {
      const ratio = targetValue / Math.max(sourceValue, 1e-12);
      const penalty = getLowerBetterRadarPenalty(key);
      return {
        source: 100,
        target: clamp(100 - (ratio - 1) * penalty, 20, 100),
      };
    }
    const floor = Math.max(Math.min(sourceValue, targetValue), 1e-6);
    return {
      source: clamp(28 + 72 * (floor / Math.max(sourceValue, 1e-6)), 20, 100),
      target: clamp(28 + 72 * (floor / Math.max(targetValue, 1e-6)), 20, 100),
    };
  }

  if (mode === "close") {
    const scale = Math.max(Math.abs(sourceValue), Math.abs(targetValue), 1);
    const delta = Math.abs(targetValue - sourceValue);
    return {
      source: 100,
      target: clamp(100 - (delta / scale) * 92, 20, 100),
    };
  }

  const ceiling = Math.max(sourceValue, targetValue, 1e-6);
  return {
    source: clamp(28 + 72 * (sourceValue / ceiling), 20, 100),
    target: clamp(28 + 72 * (targetValue / ceiling), 20, 100),
  };
}

function compareRadarText(sourceText = "", targetText = "") {
  const source = String(sourceText || "").trim();
  const target = String(targetText || "").trim();
  if (!source && !target) {
    return { source: 36, target: 36 };
  }
  if (!source) {
    return { source: 36, target: 78 };
  }
  if (!target) {
    return { source: 88, target: 36 };
  }
  if (source.toUpperCase() === target.toUpperCase()) {
    return { source: 100, target: 100 };
  }

  const splitPattern = /[\s,;/|]+/;
  const sourceTokens = new Set(source.toUpperCase().split(splitPattern).filter(Boolean));
  const targetTokens = new Set(target.toUpperCase().split(splitPattern).filter(Boolean));
  const overlap = [...sourceTokens].filter((item) => targetTokens.has(item)).length;
  const ratio = overlap / Math.max(sourceTokens.size, targetTokens.size, 1);
  return {
    source: 100,
    target: clamp(28 + ratio * 72, 20, 100),
  };
}

function resolveRadarSeriesValue(key, sourceSpec, targetSpec, targetFitScore) {
  const sourceMetric = parseRadarMetric(key, sourceSpec?.value || "");
  const targetMetric = parseRadarMetric(key, targetSpec?.value || "");

  if (sourceMetric.kind === "range" || targetMetric.kind === "range") {
    const spanPair = scaleRadarPair(sourceMetric.span, targetMetric.span, "higher");
    const centerPair = scaleRadarPair(sourceMetric.center, targetMetric.center, "close");
    return {
      source: Math.round(spanPair.source * 0.68 + centerPair.source * 0.32),
      target: Math.round(spanPair.target * 0.68 + centerPair.target * 0.32),
    };
  }

  if (sourceMetric.kind === "number" || targetMetric.kind === "number") {
    let mode = "higher";
    if (RADAR_LOWER_BETTER_KEYS.has(key)) {
      mode = "lower";
    } else if (RADAR_CLOSE_MATCH_KEYS.has(key)) {
      mode = "close";
    } else if (!RADAR_HIGHER_BETTER_KEYS.has(key)) {
      mode = "close";
    }
    const pair = scaleRadarPair(sourceMetric.value, targetMetric.value, mode, key);
    return {
      source: Math.round(pair.source),
      target: Math.round(pair.target),
    };
  }

  const textPair = compareRadarText(sourceMetric.text, targetMetric.text);
  return {
    source: Math.round(textPair.source),
    target: Number.isFinite(targetFitScore)
      ? Math.round(clamp(targetFitScore, 20, 100))
      : Math.round(textPair.target),
  };
}

function getRadarAxes() {
  const candidate = getActiveCandidate();
  if (state.referenceSpecs.length) {
    return state.referenceSpecs.slice(0, 6).map((item) => ({
      key: item.key,
      label: item.label,
    }));
  }
  if (candidate?.specs?.length) {
    return candidate.specs.slice(0, 6).map((item) => ({
      key: item.key,
      label: item.label,
    }));
  }
  return [
    { key: "supply_voltage_range", label: "供电" },
    { key: "operating_temp_range", label: "温度" },
    { key: "accuracy_max", label: "精度" },
    { key: "interface_type", label: "接口" },
    { key: "package", label: "封装" },
  ];
}

function getRadarValues() {
  const axes = getRadarAxes();
  const candidate = getActiveCandidate();
  const referenceMap = new Map(state.referenceSpecs.map((item) => [item.key, item]));
  const candidateMap = new Map((candidate?.specs || []).map((item) => [item.key, item]));

  return {
    axes,
    source: axes.map((axis) => {
      const pair = resolveRadarSeriesValue(
        axis.key,
        referenceMap.get(axis.key),
        candidateMap.get(axis.key),
        Number(candidate?.specScores?.[axis.key])
      );
      return pair.source;
    }),
    target: axes.map((axis) => {
      const pair = resolveRadarSeriesValue(
        axis.key,
        referenceMap.get(axis.key),
        candidateMap.get(axis.key),
        Number(candidate?.specScores?.[axis.key])
      );
      return pair.target;
    }),
  };
}

function splitRadarLabel(label, compactLimit = 5, wordLimit = 10) {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return [""];
  }

  if (!text.includes(" ")) {
    if (text.length <= compactLimit) {
      return [text];
    }
    const secondLine = text.slice(compactLimit);
    return [
      text.slice(0, compactLimit),
      secondLine.length > compactLimit ? `${secondLine.slice(0, compactLimit - 1)}…` : secondLine,
    ];
  }

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || nextLine.length <= wordLimit) {
      currentLine = nextLine;
      return;
    }
    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= 2) {
    return lines;
  }

  const tail = lines.slice(1).join(" ");
  return [lines[0], tail.length > wordLimit ? `${tail.slice(0, wordLimit - 1)}…` : tail];
}

function drawRadarAxisLabel(context, label, x, y, options = {}) {
  const {
    align = "center",
    placeAbove = false,
    fontSize = 13,
    compactLimit = 5,
    wordLimit = 10,
  } = options;
  const lines = splitRadarLabel(label, compactLimit, wordLimit);
  const lineHeight = fontSize + 2;

  context.fillStyle = "rgba(236,239,255,0.84)";
  context.font = `600 ${fontSize}px 'Noto Sans SC', sans-serif`;
  context.textAlign = align;

  if (placeAbove) {
    context.textBaseline = "bottom";
    [...lines].reverse().forEach((line, index) => {
      context.fillText(line, x, y - index * lineHeight);
    });
    return;
  }

  context.textBaseline = "top";
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function resizeRadarCanvas() {
  if (!refs.recommendRadar || !refs.radarStage) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const bounds = refs.radarStage.getBoundingClientRect();
  const availableWidth = Math.max(bounds.width - 36, 0);
  const availableHeight = Math.max(bounds.height - 36, 0);
  const preferredSize = Math.min(720, Math.max(220, Math.min(availableWidth, availableHeight)));
  const size = Math.max(Math.min(preferredSize, availableWidth, availableHeight), 0);

  if (!size) {
    return;
  }

  refs.recommendRadar.width = Math.round(size * dpr);
  refs.recommendRadar.height = Math.round(size * dpr);
  refs.recommendRadar.style.width = `${size}px`;
  refs.recommendRadar.style.height = `${size}px`;
}

function polygonPoints(cx, cy, radius, values) {
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length;
    const r = radius * (clamp(value, 0, 118) / 100);
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  });
}

function drawClosedPath(context, points) {
  if (!points.length) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
}

function renderRadarGrid(context, width, height, axes) {
  const cx = width / 2;
  const cy = height / 2 + 2;
  const labelPaddingX = width < 360 ? 44 : 58;
  const labelPaddingY = height < 360 ? 56 : 68;
  const labelOffset = width < 360 ? 18 : 24;
  const radius = Math.max(
    0,
    Math.min((width - labelPaddingX * 2) / 2, (height - labelPaddingY * 2) / 2)
  );
  const fontSize = width < 360 ? 12 : 13;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;

  for (let step = 1; step <= 5; step += 1) {
    const points = polygonPoints(cx, cy, radius * (step / 5), axes.map(() => 100));
    drawClosedPath(context, points);
    context.stroke();
  }

  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(x, y);
    context.stroke();

    drawRadarAxisLabel(
      context,
      axis.label,
      cx + Math.cos(angle) * (radius + labelOffset),
      cy + Math.sin(angle) * (radius + labelOffset),
      {
        align: x < cx - 8 ? "right" : x > cx + 8 ? "left" : "center",
        placeAbove: y < cy,
        fontSize,
        compactLimit: width < 360 ? 4 : 5,
        wordLimit: width < 360 ? 8 : 10,
      }
    );
  });

  return { cx, cy, radius };
}

function drawRadarSeries(context, geometry, values, theme, lineWidth) {
  const stroke = theme?.stroke || RADAR_THEME.source.stroke;
  const fill = theme?.fill || RADAR_THEME.source.fill;
  const pointColor = theme?.point || stroke;
  const points = polygonPoints(geometry.cx, geometry.cy, geometry.radius, values);
  drawClosedPath(context, points);
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.fill();
  context.stroke();
  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fillStyle = pointColor;
    context.fill();
  });
}

function renderRadarLegend() {
  if (!refs.radarLegend) {
    return;
  }
  const sourceLabel = getPdfDisplayName({ stripExtension: true, fallback: "参考器件" });
  const targetLabel = getActiveCandidate()?.name || "候选器件";
  refs.radarLegend.innerHTML = `
    <span class="radar-legend-item">
      <span class="radar-legend-swatch" style="background: ${RADAR_THEME.source.legend}"></span>
      <span>${escapeHtml(sourceLabel)}</span>
    </span>
    <span class="radar-legend-item">
      <span class="radar-legend-swatch" style="background: ${RADAR_THEME.target.legend}"></span>
      <span>${escapeHtml(targetLabel)}</span>
    </span>
  `;
}

function compareStateForScore(score) {
  if (score >= 88) {
    return { kind: "match", label: "高匹配" };
  }
  if (score >= 66) {
    return { kind: "near", label: "接近" };
  }
  return { kind: "gap", label: "需复核" };
}

function renderRadarSummary(candidate) {
  if (!refs.radarSummary) {
    return;
  }
  if (!candidate) {
    refs.radarSummary.innerHTML = `<p class="meta-text">选择候选器件后，这里会显示当前推荐的综合判断。</p>`;
    return;
  }

  const summaryMetrics = [
    { label: "综合匹配", value: candidate.totalScore ?? candidate.scores?.fit ?? 0 },
    { label: "封装兼容", value: candidate.scores?.package ?? 0 },
    { label: "供货稳定", value: candidate.scores?.supply ?? 0 },
  ].filter((item) => Number.isFinite(Number(item.value)));

  refs.radarSummary.innerHTML = `
    <article class="radar-summary-card">
      <div class="radar-summary-top">
        <span class="radar-summary-kicker">当前候选</span>
        <strong class="radar-summary-name">${escapeHtml(candidate.name)}</strong>
      </div>
      <div class="radar-summary-metrics">
        ${summaryMetrics
          .map(
            (item) => `
              <span class="radar-summary-metric">
                <span class="radar-summary-metric-label">${escapeHtml(item.label)}</span>
                <strong class="radar-summary-metric-value">${Math.round(Number(item.value) || 0)}</strong>
              </span>
            `
          )
          .join("")}
      </div>
      <p class="radar-summary-note">${escapeHtml(candidate.desc || candidate.note || "当前候选的关键参数已同步到下方对比卡。")}</p>
    </article>
  `;
}

function renderRadarScoreGrid(axes, target) {
  if (!refs.radarScoreGrid) {
    return;
  }
  if (!axes.length) {
    refs.radarScoreGrid.innerHTML = `<p class="meta-text">推荐结果生成后，这里会显示当前候选的关键参数对比。</p>`;
    return;
  }

  const referenceMap = new Map(state.referenceSpecs.map((item) => [item.key, item]));
  const candidateMap = new Map((getActiveCandidate()?.specs || []).map((item) => [item.key, item]));

  refs.radarScoreGrid.innerHTML = axes
    .map(
      (axis, index) => {
        const matchScore = Number(getActiveCandidate()?.specScores?.[axis.key]);
        const badgeScore = Number.isFinite(matchScore)
          ? Math.round(clamp(matchScore, 20, 100))
          : Math.round(target[index] || 0);
        const badgeState = compareStateForScore(badgeScore);
        return `
        <article class="radar-score-card">
          <div class="radar-score-top">
            <strong class="radar-score-label">${escapeHtml(axis.label)}</strong>
            <span class="radar-score-badge radar-score-badge-${badgeState.kind}">
              ${badgeScore} · ${badgeState.label}
            </span>
          </div>
          <div class="radar-score-values">
            <div class="radar-score-row">
              <span class="radar-score-caption">参考</span>
              <strong class="radar-score-raw">${escapeHtml(referenceMap.get(axis.key)?.value || "—")}</strong>
            </div>
            <div class="radar-score-row">
              <span class="radar-score-caption">推荐</span>
              <strong class="radar-score-raw radar-score-raw-target">${escapeHtml(candidateMap.get(axis.key)?.value || "—")}</strong>
            </div>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function getSpecByKeys(specs = [], keys = []) {
  const normalizedKeys = keys.map((key) => String(key || "").toLowerCase());
  return specs.find((spec) => normalizedKeys.includes(String(spec?.key || "").toLowerCase())) || null;
}

function getSpecByLabel(specs = [], pattern) {
  return specs.find((spec) => pattern.test(`${spec?.key || ""} ${spec?.label || ""}`)) || null;
}

function formatScenarioNumber(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value || "");
  }
  return String(Number(numeric.toFixed(precision)));
}

function getHighlightScenarioSpecs() {
  return getHighlightList()
    .filter((item) => item.label && item.value)
    .map((item) => normalizeSpec({
      key: item.parameterId || item.id,
      label: item.label,
      value: item.value,
      condition: item.text || "",
    }))
    .filter((spec) => !isInventoryDisplayText(spec.label));
}

function getScenarioSourceSpecs() {
  return state.referenceSpecs.length
    ? state.referenceSpecs
    : getHighlightScenarioSpecs();
}

function getScenarioSpec(keys = [], pattern = null, specs = getScenarioSourceSpecs()) {
  return getSpecByKeys(specs, keys) || (pattern ? getSpecByLabel(specs, pattern) : null);
}

function pickScenarioInputVoltage(templateValue = 5) {
  const fallback = Number(templateValue);
  const targetValue = Number.isFinite(fallback) ? fallback : state.scenario.inputVoltage;
  const spec = getScenarioSpec(
    ["input_voltage_range", "supply_voltage_range"],
    /输入|供电|电源|vin|supply/i
  );
  const metric = parseRadarMetric("input_voltage_range", spec?.value || "");
  if (metric.kind === "range") {
    return clamp(targetValue, metric.lower, metric.upper);
  }
  if (metric.kind === "number" && Number.isFinite(metric.value)) {
    return Math.min(targetValue, metric.value);
  }
  return targetValue;
}

function pickScenarioOutputVoltage(templateValue = "from_pdf") {
  const spec = getScenarioSpec(["output_voltage_typ"], /输出电压|vout|output voltage/i);
  const metric = parseRadarMetric("output_voltage_typ", spec?.value || "");
  if (templateValue === "from_pdf" && metric.kind === "number" && Number.isFinite(metric.value)) {
    return metric.value;
  }
  const fallback = Number(templateValue);
  return Number.isFinite(fallback) ? fallback : state.scenario.outputVoltage;
}

function pickScenarioLoadCurrent(templateValue = 200) {
  const fallback = Number(templateValue);
  const targetMa = Number.isFinite(fallback) ? fallback : state.scenario.loadCurrentMa;
  const spec = getScenarioSpec(["output_current_max"], /输出电流|负载电流|iout|output current/i);
  const metric = parseRadarMetric("output_current_max", spec?.value || "");
  if (metric.kind === "number" && Number.isFinite(metric.value)) {
    const maxMa = metric.value * 1000;
    return Math.max(10, Math.round(Math.min(targetMa, maxMa)));
  }
  return targetMa;
}

function pickScenarioPackage(templateValue = "from_pdf") {
  const sourcePackageSpec = getPackageSpec(getScenarioSourceSpecs());
  if (templateValue === "from_pdf") {
    return sourcePackageSpec?.value
      ? formatPackageDisplay(sourcePackageSpec.value)
      : state.scenario.package;
  }
  return formatPackageDisplay(templateValue || state.scenario.package);
}

function buildScenarioSuggestion(template) {
  const conditions = {
    inputVoltage: pickScenarioInputVoltage(template.inputVoltage),
    outputVoltage: pickScenarioOutputVoltage(template.outputVoltage),
    loadCurrentMa: pickScenarioLoadCurrent(template.loadCurrentMa),
    temperatureC: Number(template.temperatureC) || state.scenario.temperatureC,
    package: pickScenarioPackage(template.package),
  };

  return {
    ...template,
    conditions,
    conditionTags: [
      `${formatScenarioNumber(conditions.inputVoltage)}V 输入`,
      `${formatScenarioNumber(conditions.outputVoltage)}V 输出`,
      `${formatScenarioNumber(conditions.loadCurrentMa, 0)}mA`,
      `${formatScenarioNumber(conditions.temperatureC, 0)}℃`,
      conditions.package,
    ].filter(Boolean),
  };
}

function buildScenarioSuggestions() {
  if (!state.pdfInsights && !state.pdfFile) {
    return [];
  }
  return APPLICATION_SCENARIO_TEMPLATES.map(buildScenarioSuggestion);
}

function syncScenarioInputsFromState() {
  if (refs.scenarioInputVoltage) {
    refs.scenarioInputVoltage.value = formatScenarioNumber(state.scenario.inputVoltage);
  }
  if (refs.scenarioOutputVoltage) {
    refs.scenarioOutputVoltage.value = formatScenarioNumber(state.scenario.outputVoltage);
  }
  if (refs.scenarioLoadCurrent) {
    refs.scenarioLoadCurrent.value = formatScenarioNumber(state.scenario.loadCurrentMa, 0);
  }
  if (refs.scenarioTemperature) {
    refs.scenarioTemperature.value = formatScenarioNumber(state.scenario.temperatureC, 0);
  }
  if (refs.scenarioPackage) {
    refs.scenarioPackage.value = state.scenario.package || "";
  }
}

function getActiveScenarioSuggestion() {
  return state.scenarioSuggestions.find((item) => item.id === state.activeScenarioId) || null;
}

function applyScenarioSuggestion(id, options = {}) {
  const { render = true } = options;
  const suggestion = state.scenarioSuggestions.find((item) => item.id === id);
  if (!suggestion) {
    return;
  }

  state.activeScenarioId = suggestion.id;
  state.scenario = { ...suggestion.conditions };
  state.engineeringDecisionAccepted = false;
  if (refs.scenarioPackage?.dataset) {
    delete refs.scenarioPackage.dataset.userEdited;
  }
  syncScenarioInputsFromState();
  if (render) {
    renderEngineeringReview();
    renderScenarioFollowup();
  }
}

function updateScenarioSuggestions(options = {}) {
  const { autoApply = false } = options;
  const previousId = state.activeScenarioId;
  state.scenarioSuggestions = buildScenarioSuggestions();
  const hasPrevious = state.scenarioSuggestions.some((item) => item.id === previousId);
  state.activeScenarioId = hasPrevious
    ? previousId
    : state.scenarioSuggestions[0]?.id || "";

  if (autoApply && state.activeScenarioId && !hasPrevious) {
    applyScenarioSuggestion(state.activeScenarioId, { render: false });
  }
}

function getScenarioValues() {
  const inputVoltage = Number(refs.scenarioInputVoltage?.value);
  const outputVoltage = Number(refs.scenarioOutputVoltage?.value);
  const loadCurrentMa = Number(refs.scenarioLoadCurrent?.value);
  const temperatureC = Number(refs.scenarioTemperature?.value);
  const packageText = String(refs.scenarioPackage?.value || "").trim();

  state.scenario = {
    inputVoltage: Number.isFinite(inputVoltage) ? inputVoltage : state.scenario.inputVoltage,
    outputVoltage: Number.isFinite(outputVoltage) ? outputVoltage : state.scenario.outputVoltage,
    loadCurrentMa: Number.isFinite(loadCurrentMa) ? loadCurrentMa : state.scenario.loadCurrentMa,
    temperatureC: Number.isFinite(temperatureC) ? temperatureC : state.scenario.temperatureC,
    package: packageText || state.scenario.package,
  };

  return state.scenario;
}

function normalizePackageName(value = "", pinCount = "") {
  const text = String(value || "").toUpperCase().replace(/\s+/g, "");
  const pins = String(pinCount || "").match(/\d+/)?.[0] || "";
  if (!text) {
    return "";
  }
  if (/SOT-?23-?5|DBV/.test(text)) {
    return "SOT23-5";
  }
  if (/SOT-?23-?6/.test(text)) {
    return "SOT23-6";
  }
  if (/SOT-?23/.test(text) && pins === "5") {
    return "SOT23-5";
  }
  if (/SOT-?23/.test(text) && pins === "6") {
    return "SOT23-6";
  }
  return text.replace(/-/g, "");
}

function formatPackageDisplay(value = "") {
  const normalized = normalizePackageName(value);
  if (normalized === "SOT23-5") {
    return "SOT-23-5";
  }
  if (normalized === "SOT23-6") {
    return "SOT-23-6";
  }
  return value || "—";
}

function isRangeCoveringValue(metric, value) {
  if (!Number.isFinite(value)) {
    return false;
  }
  if (metric?.kind === "range") {
    return value >= metric.lower - 1e-9 && value <= metric.upper + 1e-9;
  }
  if (metric?.kind === "number") {
    return value <= metric.value + 1e-9;
  }
  return false;
}

function scoreToReviewKind(score) {
  if (score >= 88) return "pass";
  if (score >= 66) return "warn";
  return "fail";
}

function buildScenarioCheck(id, label, kind, value, note) {
  return { id, label, kind, value, note };
}

function getPackageSpec(specs = []) {
  return getSpecByKeys(specs, ["package"])
    || getSpecByLabel(specs, /封装|package/i);
}

function buildScenarioMetricCheck(options = {}) {
  const {
    id,
    label,
    key,
    keys = [key],
    pattern,
    referenceSpecs = [],
    candidateSpecs = [],
    mode = "lower",
    passRatio = 1.2,
    warnRatio = 1.6,
    passDelta = 3,
    warnDelta = 10,
    passNote = "候选参数满足该场景要求。",
    warnNote = "候选参数接近参考值，建议结合测试条件复核。",
    failNote = "候选参数差距较大，不建议直接替代。",
  } = options;

  const sourceSpec = getSpecByKeys(referenceSpecs, keys)
    || (pattern ? getSpecByLabel(referenceSpecs, pattern) : null);
  const targetSpec = getSpecByKeys(candidateSpecs, keys)
    || (pattern ? getSpecByLabel(candidateSpecs, pattern) : null);
  const value = `参考 ${sourceSpec?.value || "待补"} / 候选 ${targetSpec?.value || "待补"}`;
  const sourceMetric = parseRadarMetric(key, sourceSpec?.value || "");
  const targetMetric = parseRadarMetric(key, targetSpec?.value || "");

  if (sourceMetric.kind !== "number" || targetMetric.kind !== "number") {
    return buildScenarioCheck(
      id,
      label,
      "warn",
      value,
      "当前资料未完整识别该场景参数，建议回到 PDF 原文或候选手册补充。"
    );
  }

  if (mode === "higher") {
    const delta = targetMetric.value - sourceMetric.value;
    const kind = delta >= -passDelta
      ? "pass"
      : delta >= -warnDelta
        ? "warn"
        : "fail";
    return buildScenarioCheck(
      id,
      label,
      kind,
      value,
      kind === "pass" ? passNote : kind === "warn" ? warnNote : failNote
    );
  }

  const ratio = targetMetric.value / Math.max(sourceMetric.value, 1e-12);
  const kind = ratio <= passRatio
    ? "pass"
    : ratio <= warnRatio
      ? "warn"
      : "fail";
  return buildScenarioCheck(
    id,
    label,
    kind,
    value,
    kind === "pass" ? passNote : kind === "warn" ? warnNote : failNote
  );
}

function buildScenarioChecks() {
  const candidate = getActiveCandidate();
  const scenario = getScenarioValues();
  const referenceSpecs = state.referenceSpecs.length ? state.referenceSpecs : getScenarioSourceSpecs();
  const candidateSpecs = candidate?.specs || [];

  if (!candidate) {
    return [];
  }

  const inputSpec = getSpecByKeys(candidateSpecs, ["input_voltage_range", "supply_voltage_range"]);
  const outputSpec = getSpecByKeys(candidateSpecs, ["output_voltage_typ"]);
  const currentSpec = getSpecByKeys(candidateSpecs, ["output_current_max"]);
  const tempSpec = getSpecByKeys(candidateSpecs, ["operating_temp_range", "working_temperature"]);
  const packageSpec = getPackageSpec(candidateSpecs);
  const pinCountSpec = getSpecByKeys(candidateSpecs, ["pin_count"]);

  const checks = [];
  const inputMetric = parseRadarMetric("input_voltage_range", inputSpec?.value || "");
  checks.push(
    buildScenarioCheck(
      "input",
      "输入电压",
      isRangeCoveringValue(inputMetric, scenario.inputVoltage) ? "pass" : inputSpec ? "fail" : "warn",
      `${scenario.inputVoltage}V / ${inputSpec?.value || "候选待补"}`,
      isRangeCoveringValue(inputMetric, scenario.inputVoltage)
        ? "候选输入范围覆盖当前工况。"
        : inputSpec
          ? "当前输入电压不在候选范围内，需要更换型号或复核手册。"
          : "候选器件暂缺输入范围，建议人工补充。"
    )
  );

  const outputMetric = parseRadarMetric("output_voltage_typ", outputSpec?.value || "");
  const outputDelta = outputMetric.kind === "number"
    ? Math.abs(outputMetric.value - scenario.outputVoltage)
    : Number.POSITIVE_INFINITY;
  const outputOk = Number.isFinite(outputDelta) && outputDelta <= Math.max(0.05, scenario.outputVoltage * 0.05);
  checks.push(
    buildScenarioCheck(
      "output",
      "输出电压",
      outputOk ? "pass" : outputSpec ? "warn" : "warn",
      `${scenario.outputVoltage}V / ${outputSpec?.value || "候选待补"}`,
      outputOk
        ? "输出电压与目标工况一致。"
        : outputSpec
          ? "输出电压存在差异，请确认是否选择了对应固定输出版本。"
          : "候选器件暂缺输出电压版本信息。"
    )
  );

  const currentMetric = parseRadarMetric("output_current_max", currentSpec?.value || "");
  const loadCurrentA = scenario.loadCurrentMa / 1000;
  checks.push(
    buildScenarioCheck(
      "current",
      "负载电流",
      currentMetric.kind === "number" && currentMetric.value >= loadCurrentA ? "pass" : currentSpec ? "fail" : "warn",
      `${scenario.loadCurrentMa}mA / ${currentSpec?.value || "候选待补"}`,
      currentMetric.kind === "number" && currentMetric.value >= loadCurrentA
        ? "候选输出能力覆盖峰值负载。"
        : currentSpec
          ? "候选输出电流低于场景负载，需要复核裕量。"
          : "候选器件暂缺输出电流能力。"
    )
  );

  const tempMetric = parseRadarMetric("operating_temp_range", tempSpec?.value || "");
  checks.push(
    buildScenarioCheck(
      "temperature",
      "环境温度",
      isRangeCoveringValue(tempMetric, scenario.temperatureC) ? "pass" : tempSpec ? "fail" : "warn",
      `${scenario.temperatureC}℃ / ${tempSpec?.value || "候选待补"}`,
      isRangeCoveringValue(tempMetric, scenario.temperatureC)
        ? "候选温度范围覆盖当前环境温度。"
        : tempSpec
          ? "当前温度不在候选工作范围内。"
          : "候选器件暂缺工作温度范围。"
    )
  );

  const sourcePackageSpec = getPackageSpec(referenceSpecs);
  if (!refs.scenarioPackage?.dataset.userEdited && sourcePackageSpec?.value) {
    refs.scenarioPackage.value = formatPackageDisplay(sourcePackageSpec.value);
    state.scenario.package = refs.scenarioPackage.value;
    scenario.package = refs.scenarioPackage.value;
  }

  const requiredPackage = normalizePackageName(scenario.package);
  const candidatePackage = normalizePackageName(packageSpec?.value || candidate?.chips?.join(" ") || "", pinCountSpec?.value || "");
  const packageScore = Number(candidate?.scores?.package ?? candidate?.specScores?.package);
  const packageKind = requiredPackage && candidatePackage
    ? requiredPackage === candidatePackage
      ? "pass"
      : scoreToReviewKind(Number.isFinite(packageScore) ? packageScore : 35)
    : "warn";
  checks.push(
    buildScenarioCheck(
      "package",
      "封装要求",
      packageKind,
      `${formatPackageDisplay(scenario.package)} / ${formatPackageDisplay(packageSpec?.value || candidatePackage)}`,
      packageKind === "pass"
        ? "封装系列与引脚数量匹配。"
        : packageKind === "warn"
          ? "封装信息需要结合封装代码继续复核。"
          : "封装不匹配，不能直接替换。"
    )
  );

  const activeScenario = getActiveScenarioSuggestion();
  const scenarioCheckSet = new Set(activeScenario?.checks || []);
  if (scenarioCheckSet.has("noise")) {
    checks.push(buildScenarioMetricCheck({
      id: "noise",
      label: "输出噪声",
      key: "output_noise_typ",
      keys: ["output_noise_typ"],
      pattern: /噪声|noise/i,
      referenceSpecs,
      candidateSpecs,
      mode: "lower",
      passRatio: 1.2,
      warnRatio: 1.6,
      passNote: "候选噪声与参考值接近，适合低噪声供电场景。",
      warnNote: "候选噪声高于参考值，射频或精密场景建议复核纹波裕量。",
      failNote: "候选噪声明显高于参考值，不建议用于该低噪声场景。",
    }));
  }
  if (scenarioCheckSet.has("psrr")) {
    checks.push(buildScenarioMetricCheck({
      id: "psrr",
      label: "PSRR",
      key: "psrr_typ",
      keys: ["psrr_typ"],
      pattern: /psrr|电源抑制|纹波抑制/i,
      referenceSpecs,
      candidateSpecs,
      mode: "higher",
      passDelta: 3,
      warnDelta: 10,
      passNote: "候选 PSRR 与参考器件接近，抑制电源纹波能力可接受。",
      warnNote: "候选 PSRR 低于参考器件，建议确认实际频点和测试条件。",
      failNote: "候选 PSRR 明显低于参考器件，电源纹波敏感场景风险较高。",
    }));
  }
  if (scenarioCheckSet.has("quiescent_current")) {
    checks.push(buildScenarioMetricCheck({
      id: "quiescent-current",
      label: "静态电流",
      key: "quiescent_current_typ",
      keys: ["quiescent_current_typ"],
      pattern: /静态电流|iq|quiescent/i,
      referenceSpecs,
      candidateSpecs,
      mode: "lower",
      passRatio: 1.25,
      warnRatio: 2,
      passNote: "候选静态电流与参考值接近，适合便携或低功耗场景。",
      warnNote: "候选静态电流偏高，需要复核待机功耗预算。",
      failNote: "候选静态电流明显偏高，不适合低功耗场景直接替代。",
    }));
  }

  return checks;
}

function parsePinoutFromText(value = "") {
  const text = String(value || "");
  const pins = [];
  const seen = new Set();
  const pairPattern = /\b(\d{1,2})\s*(?:=|:|：|-|—|–|脚|pin)?\s*(IN|VIN|VOUT|OUT|GND|EN|NC|FB|ADJ|BYP|NR|VCC|VDD)\b/gi;
  let match = pairPattern.exec(text);
  while (match) {
    const pin = match[1];
    const name = normalizePinName(match[2]);
    if (!seen.has(pin)) {
      pins.push({ pin, name, source: "原文" });
      seen.add(pin);
    }
    match = pairPattern.exec(text);
  }
  return pins.sort((left, right) => Number(left.pin) - Number(right.pin));
}

function normalizePinName(value = "") {
  const text = String(value || "").trim().toUpperCase();
  if (text === "VIN") return "IN";
  if (text === "VOUT") return "OUT";
  return text;
}

function inferPinout(entityName = "", specs = [], highlights = []) {
  const pinoutSpec = getSpecByKeys(specs, ["pinout"]) || getSpecByLabel(specs, /引脚|pin/i);
  const pinText = [
    pinoutSpec?.value,
    pinoutSpec?.condition,
    ...highlights
      .filter((item) => /pinout|引脚|pin/i.test(`${item?.parameterId || ""} ${item?.label || ""}`))
      .map((item) => `${item.value || ""} ${item.text || ""}`),
  ].filter(Boolean).join(" ");
  const parsed = parsePinoutFromText(pinText);
  if (parsed.length) {
    return { pins: parsed, basis: "PDF 原文识别" };
  }

  const packageSpec = getPackageSpec(specs);
  const pinCountSpec = getSpecByKeys(specs, ["pin_count"]);
  const normalizedPackage = normalizePackageName(
    `${packageSpec?.value || ""} ${entityName}`,
    pinCountSpec?.value || ""
  );
  if (normalizedPackage === "SOT23-5") {
    return {
      basis: "SOT-23-5 LDO 模板",
      pins: [
        { pin: "1", name: "IN", source: "模板" },
        { pin: "2", name: "GND", source: "模板" },
        { pin: "3", name: "EN", source: "模板" },
        { pin: "4", name: "NC", source: "模板" },
        { pin: "5", name: "OUT", source: "模板" },
      ],
    };
  }

  return { pins: [], basis: "待补充" };
}

function buildPinoutRows() {
  const candidate = getActiveCandidate();
  const sourcePins = inferPinout(
    getPdfDisplayName({ stripExtension: true, fallback: "" }),
    state.referenceSpecs,
    getHighlightList()
  );
  const targetPins = inferPinout(candidate?.name || "", candidate?.specs || []);
  const pinNumbers = [...new Set([
    ...sourcePins.pins.map((item) => item.pin),
    ...targetPins.pins.map((item) => item.pin),
  ])].sort((left, right) => Number(left) - Number(right));

  return {
    sourcePins,
    targetPins,
    rows: pinNumbers.map((pin) => {
      const source = sourcePins.pins.find((item) => item.pin === pin);
      const target = targetPins.pins.find((item) => item.pin === pin);
      const sourceName = normalizePinName(source?.name || "");
      const targetName = normalizePinName(target?.name || "");
      return {
        pin,
        source: sourceName || "—",
        target: targetName || "—",
        kind: sourceName && targetName
          ? sourceName === targetName ? "pass" : "fail"
          : "warn",
      };
    }),
  };
}

function renderScenarioSuggestions() {
  if (!refs.scenarioSuggestionList) {
    return;
  }
  if (!state.scenarioSuggestions.length) {
    refs.scenarioSuggestionList.innerHTML = `<p class="meta-text">等待 PDF 识别后生成场景建议。</p>`;
    return;
  }

  refs.scenarioSuggestionList.innerHTML = state.scenarioSuggestions.map((item) => `
    <button class="scenario-suggestion-card${item.id === state.activeScenarioId ? " active" : ""}" type="button" data-scenario-id="${escapeHtml(item.id)}">
      <span class="scenario-suggestion-tag">${escapeHtml(item.tag)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.desc)}</p>
      <div class="scenario-suggestion-chip-row">
        ${item.conditionTags.slice(0, 5).map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}
      </div>
      <div class="scenario-suggestion-focus">
        ${item.focus.slice(0, 3).map((chip) => `<em>${escapeHtml(chip)}</em>`).join("")}
      </div>
    </button>
  `).join("");
}

function renderScenarioCheckCards(checks = []) {
  return checks.map((check) => `
    <article class="scenario-check-card scenario-check-${check.kind}">
      <div class="scenario-check-top">
        <strong>${escapeHtml(check.label)}</strong>
        <span>${check.kind === "pass" ? "通过" : check.kind === "warn" ? "需复核" : "不满足"}</span>
      </div>
      <div class="scenario-check-value">${escapeHtml(check.value)}</div>
      <p>${escapeHtml(check.note)}</p>
    </article>
  `).join("");
}

function renderScenarioFollowup(checks = buildScenarioChecks()) {
  if (!refs.scenarioFollowup || !refs.scenarioFollowupGrid) {
    return;
  }

  const activeScenario = getActiveScenarioSuggestion();
  if (!activeScenario) {
    refs.scenarioFollowupGrid.innerHTML = `<p class="meta-text">选择使用场景后开始比较。</p>`;
    return;
  }

  if (!getActiveCandidate()) {
    refs.scenarioFollowupGrid.innerHTML = `
      <p class="meta-text">
        已选择「${escapeHtml(activeScenario.title)}」。生成或选择候选器件后，这里会展示场景工况比较。
      </p>
    `;
    return;
  }

  refs.scenarioFollowupGrid.innerHTML = checks.length
    ? renderScenarioCheckCards(checks)
    : `<p class="meta-text">当前场景暂无可比较项目。</p>`;
}

function isScenarioFieldCheck(check = {}) {
  return ["input", "output", "current", "temperature", "package"].includes(check.id);
}

function renderScenarioChecks(checks = []) {
  if (!refs.scenarioCheckGrid) {
    return;
  }
  const manualChecks = checks.filter(isScenarioFieldCheck);
  if (!manualChecks.length) {
    refs.scenarioCheckGrid.innerHTML = `<p class="meta-text">选择候选器件后开始基础工况核验。</p>`;
    return;
  }
  refs.scenarioCheckGrid.innerHTML = renderScenarioCheckCards(manualChecks);
}

function renderPinoutMatrix(pinout) {
  if (!refs.pinoutMatrix) {
    return;
  }
  if (!getActiveCandidate()) {
    refs.pinoutMatrix.innerHTML = `<p class="meta-text">选择候选器件后展示引脚兼容矩阵。</p>`;
    return;
  }
  if (!pinout.rows.length) {
    refs.pinoutMatrix.innerHTML = `
      <div class="pinout-head">
        <strong>引脚兼容矩阵</strong>
        <span>待补充</span>
      </div>
      <p class="meta-text">当前资料未识别到可比对的引脚定义，需要人工复核封装页。</p>
    `;
    return;
  }
  refs.pinoutMatrix.innerHTML = `
    <div class="pinout-head">
      <strong>引脚兼容矩阵</strong>
      <span>参考：${escapeHtml(pinout.sourcePins.basis)} · 候选：${escapeHtml(pinout.targetPins.basis)}</span>
    </div>
    <div class="pinout-table">
      <span>Pin</span>
      <span>原型号</span>
      <span>候选型号</span>
      <span>状态</span>
      ${pinout.rows.map((row) => `
        <strong>${escapeHtml(row.pin)}</strong>
        <span>${escapeHtml(row.source)}</span>
        <span>${escapeHtml(row.target)}</span>
        <em class="pinout-status pinout-status-${row.kind}">${row.kind === "pass" ? "兼容" : row.kind === "warn" ? "待补" : "冲突"}</em>
      `).join("")}
    </div>
  `;
}

function renderEngineeringConclusion(checks = [], pinout = { rows: [] }) {
  if (!refs.engineeringConclusion || !refs.engineeringDecisionButton) {
    return;
  }
  const hasCandidate = Boolean(getActiveCandidate());
  const failCount = checks.filter((item) => item.kind === "fail").length
    + pinout.rows.filter((row) => row.kind === "fail").length;
  const warnCount = checks.filter((item) => item.kind === "warn").length
    + pinout.rows.filter((row) => row.kind === "warn").length;
  const passCount = checks.filter((item) => item.kind === "pass").length
    + pinout.rows.filter((row) => row.kind === "pass").length;

  refs.engineeringDecisionButton.disabled = !hasCandidate || failCount > 0;
  refs.engineeringDecisionButton.textContent = !hasCandidate
    ? "等待候选"
    : failCount > 0
      ? "存在风险"
      : state.engineeringDecisionAccepted
        ? "已判定合格"
        : "判定合格";

  const statusKind = !hasCandidate ? "idle" : failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";
  const statusText = !hasCandidate
    ? "等待推荐结果"
    : failCount > 0
      ? "当前工况不建议直接替代"
      : warnCount > 0
        ? "可替代，但需人工复核"
        : "当前工况具备替代可行性";
  const body = !hasCandidate
    ? "生成候选后，系统会结合工况、封装和引脚信息给出工程复核结论。"
    : failCount > 0
      ? `发现 ${failCount} 项不满足，建议更换候选型号或回到原文复核。`
      : warnCount > 0
        ? `${passCount} 项通过，${warnCount} 项需要复核。可作为工程候选，但不建议跳过人工确认。`
        : `${passCount} 项全部通过。该候选在当前定义工况下可进入下一步样机验证。`;

  refs.engineeringConclusion.className = `engineering-conclusion engineering-conclusion-${statusKind}`;
  refs.engineeringConclusion.innerHTML = `
    <span class="engineering-conclusion-status">${escapeHtml(statusText)}</span>
    <p>${escapeHtml(body)}</p>
  `;
}

function renderEngineeringReview() {
  const checks = buildScenarioChecks();
  const pinout = buildPinoutRows();
  renderScenarioSuggestions();
  renderScenarioFollowup(checks);
  renderScenarioChecks(checks);
  renderPinoutMatrix(pinout);
  renderEngineeringConclusion(checks, pinout);
}

function animateRadar(sourceValues, targetValues) {
  if (!refs.recommendRadar) {
    return;
  }

  resizeRadarCanvas();
  const dpr = window.devicePixelRatio || 1;
  const context = refs.recommendRadar.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = refs.recommendRadar.clientWidth;
  const height = refs.recommendRadar.clientHeight;
  if (!width || !height) {
    return;
  }
  const previousSource = state.radarSourceValues.length
    ? state.radarSourceValues
    : sourceValues.map(() => 0);
  const previousTarget = state.radarTargetValues.length
    ? state.radarTargetValues
    : targetValues.map(() => 0);
  const axes = getRadarAxes();
  const start = performance.now();

  if (state.radarFrame) {
    cancelAnimationFrame(state.radarFrame);
  }

  const drawFrame = (now) => {
    const progress = clamp((now - start) / RADAR_DURATION_MS, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentSource = sourceValues.map(
      (value, index) => previousSource[index] + (value - previousSource[index]) * eased
    );
    const currentTarget = targetValues.map(
      (value, index) => previousTarget[index] + (value - previousTarget[index]) * eased
    );
    const geometry = renderRadarGrid(context, width, height, axes);
    drawRadarSeries(
      context,
      geometry,
      currentSource,
      RADAR_THEME.source,
      2.8
    );
    drawRadarSeries(
      context,
      geometry,
      currentTarget,
      RADAR_THEME.target,
      2.4
    );

    if (progress < 1) {
      state.radarFrame = requestAnimationFrame(drawFrame);
    } else {
      state.radarSourceValues = sourceValues;
      state.radarTargetValues = targetValues;
      state.radarFrame = 0;
    }
  };

  state.radarFrame = requestAnimationFrame(drawFrame);
}

function renderRadarMeta() {
  const candidate = getActiveCandidate();
  if (!candidate) {
    renderRadarLegend();
    renderRadarSummary(null);
    renderRadarScoreGrid([], []);
    return null;
  }

  const radarValues = getRadarValues();
  renderRadarLegend();
  renderRadarSummary(candidate);
  renderRadarScoreGrid(radarValues.axes, radarValues.target);
  return radarValues;
}

function renderRadar() {
  if (!refs.recommendRadar) {
    return;
  }
  const radarValues = renderRadarMeta();
  if (!radarValues) {
    refs.radarEmpty?.classList.remove("is-hidden");
    refs.recommendRadar.getContext("2d")?.clearRect(0, 0, refs.recommendRadar.width, refs.recommendRadar.height);
    return;
  }

  refs.radarEmpty?.classList.add("is-hidden");
  animateRadar(radarValues.source, radarValues.target);
}

function renderRecommendations() {
  renderRecommendationCards();
  renderCompareList();
  renderThinkingList();
  renderRadarMeta();
  renderEngineeringReview();
  const active = getActiveCandidate();
  if (refs.recommendSelectedLabel) {
    refs.recommendSelectedLabel.textContent = `候选器件 · ${active?.name || "待选择"}`;
  }
  if (refs.recommendStatusLabel) {
    refs.recommendStatusLabel.textContent =
      state.recommendStatus === "ready"
        ? "已生成"
        : state.recommendStatus === "loading"
          ? "生成中"
          : state.pdfInsights
            ? "待生成"
            : "等待 PDF";
  }
  if (refs.recommendCategoryPill) {
    refs.recommendCategoryPill.textContent = state.recommendCategory?.label || "未分类";
  }
  if (refs.recommendSourceLabel) {
    refs.recommendSourceLabel.textContent = `参考器件 · ${getPdfDisplayName({ stripExtension: true, fallback: "当前 PDF" })}`;
  }
  if (state.recommendDetailMode === "radar") {
    renderRadar();
  }
}

async function ensureRecommendations({ force = false } = {}) {
  if (!state.pdfInsights || state.recommendStatus === "loading") {
    return;
  }
  if (!force && state.recommendStatus === "ready") {
    return;
  }

  state.recommendStatus = "loading";
  renderRecommendations();

  try {
    const payload = await apiRequest("/api/recommend/domestic", {
      method: "POST",
      body: JSON.stringify({
        agentId: state.activeAgentId || refs.agentId?.value.trim() || DEFAULT_AGENT_ID,
        sessionId: state.activeSessionId || refs.sessionId?.value.trim() || createSessionId(),
        sessionKey: state.activeSessionKey || "",
        title: getPdfDisplayName({ stripExtension: true, fallback: "" }),
        fileName: getUploadedPdfFileName(),
        summary: state.pdfInsights.summary || "",
        pageSnippets: (state.pdfInsights.pages || []).slice(0, 6),
        highlights: getHighlightList().slice(0, 12),
      }),
    });

    state.recommendStatus = "ready";
    state.recommendCategory = payload.sourceCategory || null;
    state.referenceSpecs = Array.isArray(payload.referenceSpecs)
      ? payload.referenceSpecs.map(normalizeSpec)
      : [];
    state.referenceSpecScores =
      payload.referenceSpecScores && typeof payload.referenceSpecScores === "object"
        ? payload.referenceSpecScores
        : {};
    state.recommendThinking = Array.isArray(payload.thinking) ? payload.thinking : [];
    state.recommendItems = Array.isArray(payload.candidates)
      ? payload.candidates.slice(0, RECOMMEND_CARD_LIMIT).map(normalizeCandidate)
      : [];
    state.activeRecommendationId = state.recommendItems[0]?.id || "";
    state.engineeringDecisionAccepted = false;
    updateScenarioSuggestions({ autoApply: !state.activeScenarioId });
    await refreshSessionDiagnostics({ force: true, quiet: true });
    renderRecommendations();
  } catch (error) {
    console.error(error);
    state.recommendStatus = "idle";
    state.recommendCategory = null;
    state.referenceSpecs = [];
    state.referenceSpecScores = {};
    state.recommendThinking = [];
    state.recommendItems = [];
    state.activeRecommendationId = "";
    state.engineeringDecisionAccepted = false;
    renderRecommendations();
  } finally {
    refreshSessionDiagnostics({ quiet: true }).catch(() => {});
  }
}

async function resetSession(options = {}) {
  const { freshLoad = false } = options;
  if (!freshLoad) {
    persistConversation();
  }

  const agentId = refs.agentId?.value.trim() || DEFAULT_AGENT_ID;
  const sessionId = createSessionId();

  try {
    const payload = await apiRequest("/api/session/reset", {
      method: "POST",
      body: JSON.stringify({
        agentId,
        sessionId,
      }),
    });
    state.activeAgentId = payload.agentId || agentId;
    state.activeSessionId = payload.sessionId || sessionId;
    state.activeSessionKey = payload.sessionKey || "";
    state.gatewaySessionId = payload.gatewaySessionId || "";
  } catch {
    state.activeAgentId = agentId;
    state.activeSessionId = sessionId;
    state.activeSessionKey = "";
    state.gatewaySessionId = "";
  }

  refs.agentId.value = state.activeAgentId;
  refs.sessionId.value = state.activeSessionId;
  state.chatMessages = [];
  state.sessionMemory = null;
  state.sessionStageLogs = [];
  renderMessages();
  if (state.activeSessionKey) {
    startSessionDiagnosticsPolling();
  } else {
    stopSessionDiagnosticsPolling({ clear: true });
  }
}

async function checkService() {
  setChatProgress("检查连接中", true);
  try {
    const payload = await apiRequest("/api/status");
    state.serviceReady = Boolean(payload.ok);
    if (payload.defaultAgentId && !refs.agentId.value.trim()) {
      refs.agentId.value = payload.defaultAgentId;
    }
    const readyLabel = payload.transport === "ollama-local" ? "Ollama 已就绪" : "已就绪";
    const readyTip = payload.transport === "ollama-local" ? `本地模型 ${payload.model || "Ollama"}` : "可以直接提问";
    setChatStatus(
      payload.ok ? "connected" : "error",
      payload.ok ? readyLabel : "不可用",
      payload.ok ? readyTip : "检查失败"
    );
  } catch (error) {
    state.serviceReady = false;
    setChatStatus(
      "error",
      "不可用",
      error instanceof Error ? error.message : "检查失败"
    );
  } finally {
    setChatProgress("", false);
  }
}

function buildChatHistoryPayload() {
  return state.chatMessages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8);
}

async function sendMessage(event) {
  event.preventDefault();
  const message = refs.messageInput?.value.trim();
  if (!message) {
    return;
  }

  addMessage("user", message);
  refs.messageInput.value = "";
  syncSendButton();
  setChatProgress("芯中有数正在回复", true);

  let assistantRendered = false;

  try {
    let payload = null;

    if (!OLLAMA_ONLY_MODE && state.engineMode === "openclaw") {
      try {
        payload = await sendOpenClawDirectChat(message);
        assistantRendered = payload.renderedAssistant === true;
      } catch (directError) {
        if (directError?.canFallback === false) {
          assistantRendered = true;
          throw directError;
        }
        console.warn("Direct Gateway chat failed; falling back to server bridge:", directError);
        setChatProgress("OpenClaw direct failed; using server bridge", true);
      }
    }

    if (!payload) {
      payload = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          agentId: refs.agentId?.value.trim() || DEFAULT_AGENT_ID,
          sessionId: state.activeSessionId || refs.sessionId?.value.trim() || createSessionId(),
          sessionKey: state.activeSessionKey || "",
          engineMode: state.engineMode,
          pdfContext: buildPdfContext(),
          chatHistory: buildChatHistoryPayload(),
          timeoutSeconds: 180,
        }),
      });
    }

    state.activeAgentId = payload.agentId || state.activeAgentId;
    state.activeSessionId = payload.sessionId || state.activeSessionId;
    state.activeSessionKey = OLLAMA_ONLY_MODE ? "" : (payload.sessionKey || state.activeSessionKey);
    state.gatewaySessionId = OLLAMA_ONLY_MODE ? "" : (payload.gatewaySessionId || state.gatewaySessionId);
    refs.agentId.value = state.activeAgentId;
    refs.sessionId.value = state.activeSessionId;
    if (!assistantRendered) {
      addMessage("assistant", payload.assistantText || "收到，但没有返回内容。");
    }
    persistConversation();
  } catch (error) {
    if (!assistantRendered) {
      addMessage(
        "assistant",
        error instanceof Error ? error.message : "发送失败，请稍后再试。"
      );
    }
  } finally {
    setChatProgress("", false);
  }
}

async function restoreHistoryEntry(id) {
  const entry = state.historyEntries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  state.activeAgentId = entry.agentId || DEFAULT_AGENT_ID;
  state.activeSessionId = entry.sessionId || createSessionId();
  state.activeSessionKey = "";
  state.gatewaySessionId = "";
  refs.agentId.value = state.activeAgentId;
  refs.sessionId.value = state.activeSessionId;
  state.chatMessages = Array.isArray(entry.messages)
    ? entry.messages.map(normalizeMessage).filter((item) => item.content)
    : [];
  renderMessages();
  setHistoryOpen(false);
  stopSessionDiagnosticsPolling({ clear: true });

  if (OLLAMA_ONLY_MODE || !entry.sessionKey) {
    return;
  }

  try {
    const payload = await apiRequest("/api/session/history", {
      method: "POST",
      body: JSON.stringify({
        agentId: state.activeAgentId,
        sessionId: state.activeSessionId,
        sessionKey: state.activeSessionKey,
        limit: 80,
      }),
    });
    if (Array.isArray(payload.messages) && payload.messages.length) {
      state.chatMessages = payload.messages
        .map(normalizeMessage)
        .filter((item) => item.content);
      renderMessages();
      persistConversation();
    }
    await refreshSessionDiagnostics({ force: true, quiet: true });
  } catch {
    // Keep local snapshot if live history fails.
  }
}

function handleGlobalClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (!refs.settingsDropdown?.contains(target)) {
    setSettingsOpen(false);
  }
  if (!refs.historyDropdown?.contains(target)) {
    setHistoryOpen(false);
  }

  const historyButton = target.closest("[data-history-id]");
  if (historyButton) {
    restoreHistoryEntry(historyButton.getAttribute("data-history-id") || "");
    return;
  }

  const highlightButton = target.closest("[data-highlight-id]");
  if (highlightButton) {
    state.selectedHighlightId = highlightButton.getAttribute("data-highlight-id") || "";
    const selected = getSelectedHighlight();
    if (selected?.pageNumber) {
      state.currentPageNumber = clamp(
        selected.pageNumber,
        1,
        state.pdfDoc?.numPages || selected.pageNumber
      );
    }
    renderHighlights();
    renderPdfPage().catch(() => {});
    logTraceSelectionToGateway().catch(() => {});
    return;
  }

  const scenarioButton = target.closest("[data-scenario-id]");
  if (scenarioButton) {
    applyScenarioSuggestion(scenarioButton.getAttribute("data-scenario-id") || "");
    refs.scenarioFollowup?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return;
  }

  const recommendButton = target.closest("[data-recommend-id]");
  if (recommendButton) {
    const nextId = recommendButton.getAttribute("data-recommend-id") || "";
    if (!nextId) {
      return;
    }

    const isSameRecommendation = nextId === state.activeRecommendationId;
    state.activeRecommendationId = nextId;
    state.radarSourceValues = [];
    state.radarTargetValues = [];
    state.engineeringDecisionAccepted = false;

    if (isSameRecommendation && state.recommendDetailMode === "radar") {
      renderRadar();
      refs.radarShell?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      return;
    }

    renderRecommendations();
    if (state.recommendDetailMode === "verify") {
      setDetailView("verify");
      refs.recommendVerifyView?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    } else if (state.recommendDetailMode !== "radar") {
      setDetailView("radar");
    } else {
      refs.radarShell?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
    return;
  }
}

function bindEvents() {
  refs.toggleSettingsButton?.addEventListener("click", () => {
    setSettingsOpen(refs.chatSettings?.hidden);
  });
  refs.toggleHistoryButton?.addEventListener("click", () => {
    setHistoryOpen(refs.historyPanel?.hidden);
  });
  refs.checkButton?.addEventListener("click", () => {
    checkService().catch(() => {});
  });
  refs.newSessionButton?.addEventListener("click", () => {
    resetSession().catch(() => {});
  });
  refs.engineMode?.addEventListener("change", () => {
    saveEngineMode(refs.engineMode.value);
  });
  refs.refreshStageLogsButton?.addEventListener("click", () => {
    refreshSessionDiagnostics({ force: true }).catch(() => {});
  });
  refs.messageInput?.addEventListener("input", syncSendButton);
  refs.messageInput?.addEventListener("keydown", handleMessageInputKeydown);
  refs.composer?.addEventListener("submit", sendMessage);
  refs.purchaseExportButton?.addEventListener("click", () => {
    handlePurchaseExport().catch(() => {});
  });
  refs.pdfInput?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await loadPdf(file);
    } catch (error) {
      if (refs.summaryText) {
        refs.summaryText.textContent =
          error instanceof Error ? error.message : "PDF 读取失败";
      }
      refs.highlightsList.innerHTML =
        `<p class="meta-text">PDF 读取失败，请重新上传。</p>`;
      setPreviewEmpty("PDF 读取失败", true);
      setPdfProgress("", null, false);
    } finally {
      refs.pdfInput.value = "";
    }
  });
  refs.prevPageButton?.addEventListener("click", () => {
    state.currentPageNumber -= 1;
    renderPdfPage().catch(() => {});
  });
  refs.nextPageButton?.addEventListener("click", () => {
    state.currentPageNumber += 1;
    renderPdfPage().catch(() => {});
  });
  refs.pageNumberInput?.addEventListener("change", () => {
    state.currentPageNumber = clamp(
      Number(refs.pageNumberInput.value) || 1,
      1,
      state.pdfDoc?.numPages || 1
    );
    renderPdfPage().catch(() => {});
  });
  refs.recommendViewRadar?.addEventListener("click", () => setDetailView("radar"));
  refs.recommendViewData?.addEventListener("click", () => setDetailView("data"));
  refs.recommendViewVerify?.addEventListener("click", () => setDetailView("verify"));
  [
    refs.scenarioInputVoltage,
    refs.scenarioOutputVoltage,
    refs.scenarioLoadCurrent,
    refs.scenarioTemperature,
  ].forEach((input) => {
    input?.addEventListener("input", () => {
      state.engineeringDecisionAccepted = false;
      renderEngineeringReview();
    });
  });
  refs.scenarioPackage?.addEventListener("input", () => {
    refs.scenarioPackage.dataset.userEdited = "1";
    state.engineeringDecisionAccepted = false;
    renderEngineeringReview();
  });
  refs.engineeringDecisionButton?.addEventListener("click", () => {
    if (refs.engineeringDecisionButton.disabled) {
      return;
    }
    state.engineeringDecisionAccepted = true;
    renderEngineeringReview();
  });
  refs.modeLinks.forEach((button) => {
    button.addEventListener("click", () => setWorkspaceView(button.dataset.view || "review"));
  });
  refs.workspaceResizers.forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      startWorkspaceResize(resizer.dataset.resizer || "", event.clientX);
    });
  });
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("pointermove", (event) => {
    updateWorkspaceResize(event.clientX);
  });
  document.addEventListener("pointerup", () => {
    stopWorkspaceResize();
  });
  document.addEventListener("pointercancel", () => {
    stopWorkspaceResize();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSettingsOpen(false);
      setHistoryOpen(false);
      stopWorkspaceResize();
    }
  });
  window.addEventListener("resize", () => {
    applyWorkspaceSplit();
    requestPreviewRelayout();
    renderRadar();
  });
  window.addEventListener("pagehide", () => {
    stopWorkspaceResize();
    stopSessionDiagnosticsPolling();
    persistConversation();
  });
}

async function bootstrap() {
  saveEngineMode(state.engineMode);
  state.historyEntries = loadHistory();
  renderHistoryList();
  renderMessages();
  renderSessionDiagnostics();
  syncSendButton();
  syncChatEmptyState();
  updatePurchaseExportButton();
  updateSummaryMeta();
  applyWorkspaceSplit();
  updatePageControls();
  setPreviewEmpty("上传 PDF", true);
  setPreviewFocus("未选中重点");
  setDetailView("radar");
  renderRecommendations();
  bindEvents();
  await resetSession({ freshLoad: true });
  await checkService();
}

bootstrap();
