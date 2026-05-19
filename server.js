import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const ROOT_DIR = process.cwd();
const PDF_PARSE_SCRIPT = path.join(ROOT_DIR, "scripts", "parse_pdf.py");
const SESSION_MEMORY_SCRIPT = path.join(ROOT_DIR, "scripts", "session_memory_store.py");
const SESSION_MEMORY_DB_PATH = path.join(ROOT_DIR, "data", "review_memory.db");
const RECOMMENDATION_DIR = path.join(ROOT_DIR, "data", "recommendation");
const RECOMMENDATION_DB_PATH = path.join(RECOMMENDATION_DIR, "parts_knowledge.db");
const RECOMMENDATION_BUILD_SCRIPT = path.join(ROOT_DIR, "scripts", "build_recommendation_db.py");
const RECOMMENDATION_QUERY_SCRIPT = path.join(ROOT_DIR, "scripts", "recommend_parts.py");
const PDF_PARSE_SKILL_SPEC_PATH = path.join(
  ROOT_DIR,
  "skills",
  "chip-pdf-parse-spec",
  "references",
  "extraction-spec.md"
);
const OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:18789";
const OPENCLAW_STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || path.join(OPENCLAW_STATE_DIR, "openclaw.json");
const OPENCLAW_PACKAGE_ROOT = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "openclaw"
);
const OPENCLAW_LOCAL_PACKAGE_ROOT = path.join(ROOT_DIR, "node_modules", "openclaw");
const TRACE_LOG_LABEL = "[PDF重要参数溯源]";
const OPENCLAW_GATEWAY_ENABLED =
  process.env.ENABLE_OPENCLAW_GATEWAY === "1" && process.env.OLLAMA_ONLY_MODE === "0";
const OLLAMA_ONLY_MODE = !OPENCLAW_GATEWAY_ENABLED;
const PDF_LOCALIZATION_AI_ENABLED = process.env.PDF_LOCALIZATION_AI === "1";
const FAST_OLLAMA_ENABLED = process.env.FAST_OLLAMA_ENABLED !== "0";
const FAST_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const FAST_OLLAMA_MODEL = process.env.FAST_OLLAMA_MODEL || "qwen3:8b";
const MODEL_BACKEND = String(process.env.MODEL_BACKEND || "").trim().toLowerCase();
const CLOUD_AI_ENABLED = MODEL_BACKEND === "cloudbase" || process.env.CLOUD_AI_ENABLED === "1";
const CLOUD_AI_ENV_ID =
  process.env.CB_ENV_ID || process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || "";
const CLOUD_AI_MODEL = process.env.CB_AI_MODEL || "deepseek-v4-flash";
const CLOUD_AI_PROVIDER = process.env.CB_AI_PROVIDER
  || (CLOUD_AI_MODEL.startsWith("hunyuan-") ? "hunyuan-exp" : "cloudbase");
const CLOUD_AI_TIMEOUT_MS = Number.parseInt(process.env.CB_AI_TIMEOUT_MS || "60000", 10);
const FAST_OLLAMA_CHAT_TOKENS = Number.parseInt(process.env.FAST_OLLAMA_CHAT_TOKENS || "384", 10);
const FAST_OLLAMA_PDF_TOKENS = Number.parseInt(process.env.FAST_OLLAMA_PDF_TOKENS || "1800", 10);
const FAST_OLLAMA_CHAT_TIMEOUT_MS = Number.parseInt(process.env.FAST_OLLAMA_CHAT_TIMEOUT_MS || "30000", 10);
const FAST_OLLAMA_PDF_TIMEOUT_MS = Number.parseInt(process.env.FAST_OLLAMA_PDF_TIMEOUT_MS || "35000", 10);
const OLLAMA_TRACE_TIMEOUT_MS = Number.parseInt(process.env.OLLAMA_TRACE_TIMEOUT_MS || "2500", 10);
const OPENCLAW_NO_THINK_ENABLED = process.env.OPENCLAW_NO_THINK !== "0";
const OPENCLAW_CHAT_TIMEOUT_MS = Number.parseInt(process.env.OPENCLAW_CHAT_TIMEOUT_MS || "180000", 10);
const OPENCLAW_PDF_TIMEOUT_MS = Number.parseInt(process.env.OPENCLAW_PDF_TIMEOUT_MS || "180000", 10);
const OPENCLAW_SESSION_POLL_MS = Math.max(
  100,
  Number.parseInt(process.env.OPENCLAW_SESSION_POLL_MS || "250", 10) || 250
);
const OPENCLAW_SESSION_POLL_TIMEOUT_MS = Number.parseInt(
  process.env.OPENCLAW_SESSION_POLL_TIMEOUT_MS || "0",
  10
);
const DEFAULT_PDF_PARSE_SKILL_SPEC = [
  "目标：仅从已切分好的 candidate 中提取可比较、可溯源的 datasheet 核心参数。",
  "必须遵守：不要跨 candidate、跨左右栏、跨图表区域拼接参数；不确定就跳过，不要编造。",
  "优先提取：工作温度、输入/供电/输出电压、输出/静态电流、功耗、噪声、PSRR、压差、基准电压、精度、分辨率、频率、效率、封装、引脚定义、接口。",
  "引脚定义高优先：识别 Pin Configuration、Pin Functions、Pin Description、顶视图/底视图中的 1=IN、2=GND 这类映射。",
  "优先来源：首页摘要、Electrical Characteristics、Recommended Operating Conditions、Pin Functions、Pin Description、Package 信息中的明确参数行。",
  "低优先或忽略：营销描述、目录、修订历史、布局建议、封装尺寸图、法律声明、典型曲线说明、无明确主值的测试条件段落。",
  "值处理：value 尽量只保留参数值本身和单位；text 用中文简述原文重点；label 必须使用简体中文。",
  "去重：同一参数族只保留最清晰、最直接、最适合作为审阅卡片的一条；输入电压和供电电压同值时优先保留更明确的一项。",
  "输出：只返回严格 JSON；sourceId 必须来自候选列表；summary 必须是简体中文；最多返回 10 条关键参数。",
].join("\n");
const FALLBACK_LABELS = {
  working_temperature: "工作温度",
  input_voltage: "输入电压",
  supply_voltage: "供电电压",
  output_voltage: "输出电压",
  current: "静态电流",
  output_current: "输出电流",
  power: "功耗",
  noise: "噪声",
  psrr: "电源抑制比",
  dropout_voltage: "压差",
  reference_voltage: "基准电压",
  accuracy: "精度",
  resolution: "分辨率",
  frequency: "频率",
  efficiency: "效率",
  package: "封装",
  pinout: "引脚定义",
  interface: "接口",
  generic: "参数",
};
const DISPLAY_HIGHLIGHT_LIMIT = 12;
const ENGLISH_LABELS = {
  "working temperature": "工作温度",
  "input voltage": "输入电压",
  "supply voltage": "供电电压",
  "output voltage": "输出电压",
  current: "静态电流",
  "output current": "输出电流",
  power: "功耗",
  noise: "噪声",
  psrr: "电源抑制比",
  "dropout voltage": "压差",
  "reference voltage": "基准电压",
  accuracy: "精度",
  resolution: "分辨率",
  frequency: "频率",
  efficiency: "效率",
  package: "封装",
  pinout: "引脚定义",
  interface: "接口",
  parameter: "参数",
};
const ENGLISH_TRANSLATION_SIGNAL_PATTERN =
  /\b(?:part marking|rohs|operating|temperature|voltage|current|accuracy|resolution|frequency|efficiency|package|interface|statement|additional|information|definition|environmental|category|logo|lot trace|marking|see the|related|there may be)\b/i;
const NON_TRANSLATABLE_TOKEN_PATTERN =
  /^(?:[A-Z]{1,6}\d[\w./-]*|SOT-?\d+|SOIC-?\d+|TSSOP-?\d+|MSOP-?\d+|QFN-?\d+|DFN-?\d+|X2SON-?\d*|TO-?\d+|BGA|QFP|LDO|I2C|SPI|UART|SMBus|PWM|RoHS|TI|VIN|VOUT|VCC|VDD|GND|EN|FB|PG|[0-9.+\-/%掳鈩僔AWmunkMGT]+)$/i;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

let gatewayWsApiPromise = null;
let gatewayBridgeInstance = null;
let cloudBaseModelPromise = null;
let recommendationDbPromise = null;
let sessionMemoryDbPromise = null;
let pdfParseSkillSpecPromise = null;

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function parseLooseJson(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }

  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines.slice(index).join("\n").trim();
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      // keep trying
    }
  }

  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    try {
      return JSON.parse(raw.slice(firstObject, lastObject + 1));
    } catch {
      // fall through
    }
  }

  const firstArray = raw.indexOf("[");
  const lastArray = raw.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    try {
      return JSON.parse(raw.slice(firstArray, lastArray + 1));
    } catch {
      return null;
    }
  }

  return null;
}

async function loadPdfParseSkillSpec() {
  if (!pdfParseSkillSpecPromise) {
    pdfParseSkillSpecPromise = fsp.readFile(PDF_PARSE_SKILL_SPEC_PATH, "utf8")
      .then((raw) => {
        const text = String(raw || "").trim();
        return text || DEFAULT_PDF_PARSE_SKILL_SPEC;
      })
      .catch(() => DEFAULT_PDF_PARSE_SKILL_SPEC);
  }

  return pdfParseSkillSpecPromise;
}

function uniqueList(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function collectTextParts(value, parts = []) {
  if (typeof value === "string") {
    parts.push(value.trim());
    return parts;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextParts(item, parts));
    return parts;
  }

  if (!value || typeof value !== "object") {
    return parts;
  }

  for (const key of ["text", "content", "output", "message", "answer"]) {
    if (typeof value[key] === "string") {
      parts.push(value[key].trim());
    }
  }

  Object.values(value).forEach((item) => collectTextParts(item, parts));
  return parts;
}

function extractAssistantText(parsed, rawText) {
  const payloadTexts = Array.isArray(parsed?.result?.payloads)
    ? parsed.result.payloads
        .map((item) => (item && typeof item.text === "string" ? item.text.trim() : ""))
        .filter(Boolean)
    : [];

  if (payloadTexts.length) {
    return payloadTexts.join("\n\n");
  }

  const richText = uniqueList(collectTextParts(parsed));
  if (richText.length) {
    return richText.join("\n\n");
  }

  return String(rawText || "").trim() || "No output received.";
}

function resolvePythonInvocation(args) {
  if (process.platform === "win32") {
    return {
      file: "py",
      args: ["-3", ...args],
      display: ["py", "-3", ...args],
    };
  }


  return {
    file: "python3",
    args,
    display: ["python3", ...args],
  };
}

function runProcess(invocation, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      reject(new Error("OpenClaw request timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    if (typeof options.stdin === "string" && child.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin?.end();

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            (stderr || stdout || `OpenClaw exited with code ${code}.`).trim()
          )
        );
        return;
      }

      resolve({
        stdout,
        stderr,
        command: invocation.display.join(" "),
      });
    });
  });
}

function runPython(args, timeoutMs = 120000, options = {}) {
  return runProcess(resolvePythonInvocation(args), timeoutMs, options);
}

function runNodeScript(scriptPath, timeoutMs = 120000, options = {}) {
  return runProcess(
    {
      file: process.execPath,
      args: [scriptPath],
      display: [process.execPath, scriptPath],
    },
    timeoutMs,
    options
  );
}

async function ensureRecommendationDatabase() {
  if (!recommendationDbPromise) {
    recommendationDbPromise = (async () => {
      await fsp.mkdir(RECOMMENDATION_DIR, { recursive: true });
      await runPython([RECOMMENDATION_BUILD_SCRIPT, RECOMMENDATION_DB_PATH], 180000);
      return RECOMMENDATION_DB_PATH;
    })().catch((error) => {
      recommendationDbPromise = null;
      throw error;
    });
  }

  return recommendationDbPromise;
}

async function ensureSessionMemoryDatabase() {
  if (!sessionMemoryDbPromise) {
    sessionMemoryDbPromise = (async () => {
      await fsp.mkdir(path.dirname(SESSION_MEMORY_DB_PATH), { recursive: true });
      await runPython([SESSION_MEMORY_SCRIPT, SESSION_MEMORY_DB_PATH, "init"], 30000);
      return SESSION_MEMORY_DB_PATH;
    })().catch((error) => {
      sessionMemoryDbPromise = null;
      throw error;
    });
  }

  return sessionMemoryDbPromise;
}

async function requestSessionMemoryStore(action, payload = {}, timeoutMs = 30000) {
  await ensureSessionMemoryDatabase();
  const result = await runPython(
    [SESSION_MEMORY_SCRIPT, SESSION_MEMORY_DB_PATH, action],
    timeoutMs,
    {
      stdin: JSON.stringify(payload || {}),
    }
  );
  const parsed = parseLooseJson(result.stdout);
  if (!parsed || parsed.ok === false) {
    throw new Error(parsed?.error || `Session memory store action failed: ${action}`);
  }
  return parsed;
}

function normalizeOptionalGatewayString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGatewayWebSocketUrl(value = "") {
  const raw = normalizeOptionalGatewayString(value);
  if (!raw) {
    return OPENCLAW_GATEWAY_URL;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

async function loadGatewayWebSocketApi() {
  if (!gatewayWsApiPromise) {
    gatewayWsApiPromise = (async () => {
      const packageRoots = [...new Set([
        OPENCLAW_LOCAL_PACKAGE_ROOT,
        OPENCLAW_PACKAGE_ROOT,
      ])].filter(Boolean);
      const lookupErrors = [];

      for (const packageRoot of packageRoots) {
        const distDir = path.join(packageRoot, "dist");

        try {
          const entries = await fsp.readdir(distDir);
          const candidateFiles = entries
            .filter((fileName) => /\.m?js$/i.test(fileName))
            .filter((fileName) => /^method-scopes-.*\.m?js$/i.test(fileName))
            .sort((left, right) => left.localeCompare(right));

          for (const fileName of candidateFiles) {
            const modulePath = pathToFileURL(path.join(distDir, fileName)).href;
            const module = await import(modulePath);
            const GatewayClient = module.GatewayClient || module.f;
            const resolveLeastPrivilegeOperatorScopesForMethod =
              module.resolveLeastPrivilegeOperatorScopesForMethod || module.a;

            if (typeof GatewayClient === "function") {
              console.log(`OpenClaw Gateway websocket API loaded from ${path.join(distDir, fileName)}`);
              return {
                GatewayClient,
                resolveLeastPrivilegeOperatorScopesForMethod:
                  typeof resolveLeastPrivilegeOperatorScopesForMethod === "function"
                    ? resolveLeastPrivilegeOperatorScopesForMethod
                    : null,
              };
            }
          }

          lookupErrors.push(`${distDir}: no GatewayClient export in ${candidateFiles.length} candidate files`);
        } catch (error) {
          lookupErrors.push(`${distDir}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      throw new Error(`OpenClaw Gateway websocket API was not found. ${lookupErrors.join(" | ")}`);
    })();
  }

  return gatewayWsApiPromise;
}

async function loadOpenClawGatewayRuntimeConfig() {
  const fallback = {
    url: OPENCLAW_GATEWAY_URL,
    token: "",
    password: "",
    source: "local-loopback",
  };

  try {
    const raw = await fsp.readFile(OPENCLAW_CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    const isRemoteMode = config?.gateway?.mode === "remote";
    const localAuth = config?.gateway?.auth || {};
    const remoteAuth = config?.gateway?.remote || {};
    const configuredUrl = isRemoteMode
      ? normalizeOptionalGatewayString(remoteAuth.url)
      : OPENCLAW_GATEWAY_URL;
    const token = isRemoteMode
      ? normalizeOptionalGatewayString(remoteAuth.token)
      : normalizeOptionalGatewayString(localAuth.token);
    const password = isRemoteMode
      ? normalizeOptionalGatewayString(remoteAuth.password)
      : normalizeOptionalGatewayString(localAuth.password);

    return {
      url: normalizeGatewayWebSocketUrl(configuredUrl || OPENCLAW_GATEWAY_URL),
      token,
      password,
      source: isRemoteMode ? "config-remote" : "local-loopback",
    };
  } catch {
    return fallback;
  }
}

function normalizeRequestHost(value = "") {
  const raw = normalizeOptionalGatewayString(value);
  if (raw.startsWith("[")) {
    const endIndex = raw.indexOf("]");
    return endIndex > 0 ? raw.slice(1, endIndex).toLowerCase() : raw.toLowerCase();
  }
  return raw.split(":")[0].toLowerCase();
}

function isLoopbackHostName(value = "") {
  const host = normalizeRequestHost(value);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLoopbackRemoteAddress(value = "") {
  const address = normalizeOptionalGatewayString(value).toLowerCase();
  return (
    address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1"
  );
}

function isLocalBrowserGatewayConfigRequest(request) {
  return (
    isLoopbackRemoteAddress(request.socket?.remoteAddress || "")
    && isLoopbackHostName(request.headers?.host || "")
  );
}

async function handleGatewayBrowserConfig(request, response) {
  if (!isLocalBrowserGatewayConfigRequest(request)) {
    sendJson(response, 403, {
      ok: false,
      error: "Direct Gateway browser config is only available from localhost.",
    });
    return;
  }

  const runtimeConfig = await loadOpenClawGatewayRuntimeConfig();
  if (!runtimeConfig.token) {
    sendJson(response, 500, {
      ok: false,
      error: "OpenClaw Gateway token auth is required for browser direct mode.",
    });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    gatewayUrl: runtimeConfig.url || OPENCLAW_GATEWAY_URL,
    token: runtimeConfig.token,
    source: runtimeConfig.source || "local-loopback",
    clientName: "gateway-client",
    clientDisplayName: "芯中有数 Web",
    clientVersion: "1.0.0",
    clientMode: "backend",
    role: "operator",
    scopes: ["operator.admin"],
  });
}

function formatGatewayBridgeCloseError(code, reason, runtimeConfig) {
  const codeLabel = Number.isFinite(Number(code)) ? Number(code) : "n/a";
  const reasonLabel = normalizeOptionalGatewayString(reason) || "n/a";
  return [
    `gateway closed (${codeLabel})`,
    `Gateway target: ${runtimeConfig?.url || OPENCLAW_GATEWAY_URL}`,
    `Source: ${runtimeConfig?.source || "local-loopback"}`,
    `Config: ${OPENCLAW_CONFIG_PATH}`,
    `Reason: ${reasonLabel}`,
  ].join("\n");
}

function formatGatewayBridgeTimeoutError(timeoutMs, runtimeConfig) {
  return [
    `gateway timeout after ${timeoutMs}ms`,
    `Gateway target: ${runtimeConfig?.url || OPENCLAW_GATEWAY_URL}`,
    `Source: ${runtimeConfig?.source || "local-loopback"}`,
    `Config: ${OPENCLAW_CONFIG_PATH}`,
  ].join("\n");
}

class OpenClawGatewayBridge {
  constructor() {
    this.lastHello = null;
    this.client = null;
    this.connectPromise = null;
    this.connectionReady = false;
    this.runtimeConfig = null;
  }

  async ensureConnected(connectTimeoutMs = 20000) {
    if (this.client && this.connectionReady) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const gatewayWsApi = await loadGatewayWebSocketApi();
      const runtimeConfig = await loadOpenClawGatewayRuntimeConfig();
      const scopes = ["operator.admin"];
      const effectiveTimeoutMs = Math.max(1000, Number(connectTimeoutMs) || 20000);

      return new Promise((resolve, reject) => {
        let settled = false;
        let helloPayload = null;

        const client = new gatewayWsApi.GatewayClient({
          url: runtimeConfig.url,
          token: runtimeConfig.token || undefined,
          password: runtimeConfig.password || undefined,
          clientName: "gateway-client",
          clientDisplayName: "芯中有数",
          clientVersion: "1.0.0",
          mode: "backend",
          role: "operator",
          scopes,
          minProtocol: 3,
          maxProtocol: 3,
          onHelloOk: async (hello) => {
            helloPayload = hello;
            this.client = client;
            this.runtimeConfig = runtimeConfig;
            this.connectionReady = true;
            this.lastHello = {
              ok: true,
              transport: "gateway-websocket",
              checkedAt: new Date().toISOString(),
              hello,
              url: runtimeConfig.url,
            };

            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timer);
            resolve(client);
          },
          onConnectError: (error) => {
            if (this.client === client) {
              this.client = null;
            }
            this.connectionReady = false;
            this.connectPromise = null;

            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
          onClose: (code, reason) => {
            if (this.client === client) {
              this.client = null;
            }
            this.connectionReady = false;
            this.connectPromise = null;
            this.lastHello = helloPayload
              ? {
                  ok: false,
                  transport: "gateway-websocket",
                  checkedAt: new Date().toISOString(),
                  hello: helloPayload,
                  url: runtimeConfig.url,
                }
              : this.lastHello;

            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timer);
            reject(new Error(formatGatewayBridgeCloseError(code, reason, runtimeConfig)));
          },
        });

        const timer = setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          this.connectionReady = false;
          this.connectPromise = null;
          try {
            client.stop();
          } catch {
            // Ignore stop errors.
          }
          reject(new Error(formatGatewayBridgeTimeoutError(effectiveTimeoutMs, runtimeConfig)));
        }, effectiveTimeoutMs);

        client.start();
      });
    })();

    try {
      return await this.connectPromise;
    } catch (error) {
      this.connectPromise = null;
      throw error;
    }
  }

  resetClient(client = this.client) {
    if (!client) {
      return;
    }
    try {
      client.stop();
    } catch {
      // Ignore stop errors.
    }
    if (this.client === client) {
      this.client = null;
    }
    this.connectionReady = false;
    this.connectPromise = null;
  }

  async request(method, params = {}, { connectTimeoutMs = 20000, requestOptions } = {}) {
    const timeoutMs = requestOptions?.timeoutMs
      || connectTimeoutMs
      || (requestOptions?.expectFinal ? 120000 : 20000);

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const client = await this.ensureConnected(connectTimeoutMs);

      try {
        const result = await client.request(method, params, {
          expectFinal: requestOptions?.expectFinal === true,
          timeoutMs,
        });

        this.lastHello = {
          ...(this.lastHello || {}),
          ok: true,
          transport: "gateway-websocket",
          checkedAt: new Date().toISOString(),
          url: this.runtimeConfig?.url || OPENCLAW_GATEWAY_URL,
        };

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const retryable = /gateway not connected|closed|timeout/i.test(lastError.message);
        this.resetClient(client);

        if (!retryable || attempt > 0) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Gateway request failed.");
  }
}

function getGatewayBridge() {
  if (!gatewayBridgeInstance) {
    gatewayBridgeInstance = new OpenClawGatewayBridge();
  }

  return gatewayBridgeInstance;
}

function stripThinkingText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function normalizeEngineMode(value) {
  if (OLLAMA_ONLY_MODE) {
    return "ollama";
  }
  return value === "openclaw" ? "openclaw" : "ollama";
}

function shouldUseFastOllama(engineMode) {
  return (CLOUD_AI_ENABLED || FAST_OLLAMA_ENABLED)
    && (OLLAMA_ONLY_MODE || normalizeEngineMode(engineMode) !== "openclaw");
}

function withOpenClawNoThinkDirective(message) {
  const text = String(message || "").trim();
  if (!OPENCLAW_NO_THINK_ENABLED || !text || /^\/no_think\b/i.test(text)) {
    return text;
  }
  return `/no_think\n\n${text}`;
}

async function loadCloudBaseModel() {
  if (!cloudBaseModelPromise) {
    cloudBaseModelPromise = (async () => {
      const cloudbaseModule = await import("@cloudbase/node-sdk");
      const cloudbase = cloudbaseModule.default || cloudbaseModule;
      const initOptions = {};

      if (CLOUD_AI_ENV_ID) {
        initOptions.env = CLOUD_AI_ENV_ID;
      }

      if (Number.isFinite(CLOUD_AI_TIMEOUT_MS) && CLOUD_AI_TIMEOUT_MS > 0) {
        initOptions.timeout = CLOUD_AI_TIMEOUT_MS;
      }

      if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
        initOptions.secretId = process.env.TENCENTCLOUD_SECRETID;
        initOptions.secretKey = process.env.TENCENTCLOUD_SECRETKEY;
      }

      const app = cloudbase.init(initOptions);
      const ai = app.ai();

      if (!ai || typeof ai.createModel !== "function") {
        throw new Error("CloudBase AI createModel API is unavailable.");
      }

      return ai.createModel(CLOUD_AI_PROVIDER);
    })();
  }

  return cloudBaseModelPromise;
}

function extractCloudBaseAssistantText(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  const candidates = [
    payload?.text,
    payload?.content,
    payload?.outputText,
    payload?.output_text,
    payload?.message?.content,
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.text,
    payload?.data?.text,
    payload?.data?.content,
    payload?.data?.choices?.[0]?.message?.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

async function generateWithCloudBaseAI(prompt, options = {}) {
  const timeoutMs = Math.max(
    1000,
    Number(options.timeoutMs) || CLOUD_AI_TIMEOUT_MS || FAST_OLLAMA_CHAT_TIMEOUT_MS
  );
  const model = await loadCloudBaseModel();
  const requestPayload = {
    model: options.model || CLOUD_AI_MODEL,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0,
  };

  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`CloudBase AI request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    const result = await Promise.race([
      model.generateText(requestPayload),
      timeoutPromise,
    ]);
    return stripThinkingText(extractCloudBaseAssistantText(result));
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function generateWithFastOllama(prompt, options = {}) {
  if (CLOUD_AI_ENABLED) {
    return generateWithCloudBaseAI(prompt, options);
  }

  if (!FAST_OLLAMA_ENABLED) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1000, Number(options.timeoutMs) || FAST_OLLAMA_CHAT_TIMEOUT_MS)
  );

  try {
    const body = {
      model: options.model || FAST_OLLAMA_MODEL,
      prompt,
      stream: false,
      think: false,
      options: {
        temperature: Number.isFinite(options.temperature) ? options.temperature : 0,
        num_predict: Number.isFinite(options.numPredict) ? options.numPredict : FAST_OLLAMA_CHAT_TOKENS,
      },
    };

    if (options.format) {
      body.format = options.format;
    }

    const result = await fetch(`${FAST_OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!result.ok) {
      throw new Error(`Ollama returned HTTP ${result.status}`);
    }

    const payload = await result.json();
    return stripThinkingText(payload?.response || "");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkOllamaStatus(timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 3000));

  try {
    const result = await fetch(`${FAST_OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!result.ok) {
      throw new Error(`Ollama returned HTTP ${result.status}`);
    }

    const payload = await result.json();
    const models = Array.isArray(payload?.models)
      ? payload.models
          .map((model) => (typeof model?.name === "string" ? model.name : ""))
          .filter(Boolean)
      : [];

    return {
      ok: true,
      models,
      hasConfiguredModel: models.length ? models.includes(FAST_OLLAMA_MODEL) : null,
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      hasConfiguredModel: false,
      error: error instanceof Error ? error.message : "Failed to reach Ollama.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getLocalAccessUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal) {
        return;
      }

      const family = typeof entry.family === "string" ? entry.family : String(entry.family);
      if (family !== "IPv4") {
        return;
      }

      urls.push(`http://${entry.address}:${port}`);
    });
  });

  return [...new Set(urls)];
}

function createSessionId() {
  return `pdf-console-${Date.now().toString(36)}`;
}

function createIdempotencyKey(prefix = "run") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildGatewaySessionKey(agentId, sessionId = "") {
  return `agent:${agentId || "main"}:session:${sessionId || "main"}`;
}

function normalizeRequestedSessionId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLocalConsoleSessionId(sessionId = "") {
  return sessionId.startsWith("pdf-console-");
}

function resolveSessionReference(payload, agentId) {
  const requestedSessionId = normalizeRequestedSessionId(payload?.sessionId);
  const requestedSessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";

  if (requestedSessionKey) {
    return {
      sessionId: requestedSessionId || createSessionId(),
      sessionKey: requestedSessionKey,
      useLegacySessionId: false,
    };
  }

  if (requestedSessionId && !isLocalConsoleSessionId(requestedSessionId)) {
    return {
      sessionId: requestedSessionId,
      sessionKey: "",
      useLegacySessionId: true,
    };
  }

  const sessionId = requestedSessionId || createSessionId();
  return {
    sessionId,
    sessionKey: buildGatewaySessionKey(agentId, sessionId),
    useLegacySessionId: false,
  };
}

function createDerivedSessionRef(agentId, baseSessionRef, suffix) {
  const baseSessionId = normalizeRequestedSessionId(baseSessionRef?.sessionId) || createSessionId();
  const derivedSessionId = `${baseSessionId}-${suffix}`;
  return {
    sessionId: derivedSessionId,
    sessionKey: buildGatewaySessionKey(agentId, derivedSessionId),
    useLegacySessionId: false,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOpenClawPollTimeout(timeoutMs) {
  if (Number.isFinite(OPENCLAW_SESSION_POLL_TIMEOUT_MS) && OPENCLAW_SESSION_POLL_TIMEOUT_MS > 0) {
    return OPENCLAW_SESSION_POLL_TIMEOUT_MS;
  }
  return Math.max(1000, Number(timeoutMs) || 1000);
}

function getOpenClawSessionsDir(agentId = "main") {
  return path.join(OPENCLAW_STATE_DIR, "agents", agentId || "main", "sessions");
}

async function loadOpenClawConfigSummary() {
  try {
    const raw = await fsp.readFile(OPENCLAW_CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    const defaults = config?.agents?.defaults || {};
    const defaultPrimaryModel = typeof defaults?.model?.primary === "string"
      ? defaults.model.primary.trim()
      : "";
    const defaultFallbackModels = Array.isArray(defaults?.model?.fallbacks)
      ? defaults.model.fallbacks.filter((item) => typeof item === "string" && item.trim())
      : [];
    const defaultHeartbeatModel = typeof defaults?.heartbeat?.model === "string"
      ? defaults.heartbeat.model.trim()
      : "";
    const agents = {};

    for (const entry of Array.isArray(config?.agents?.list) ? config.agents.list : []) {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      if (!id) {
        continue;
      }
      agents[id] = {
        primaryModel:
          typeof entry?.model?.primary === "string" && entry.model.primary.trim()
            ? entry.model.primary.trim()
            : defaultPrimaryModel,
        fallbackModels: Array.isArray(entry?.model?.fallbacks)
          ? entry.model.fallbacks.filter((item) => typeof item === "string" && item.trim())
          : defaultFallbackModels,
        heartbeatModel:
          typeof entry?.heartbeat?.model === "string" && entry.heartbeat.model.trim()
            ? entry.heartbeat.model.trim()
            : defaultHeartbeatModel,
      };
    }

    if (!agents.main) {
      agents.main = {
        primaryModel: defaultPrimaryModel,
        fallbackModels: defaultFallbackModels,
        heartbeatModel: defaultHeartbeatModel,
      };
    }

    return {
      defaultPrimaryModel,
      defaultFallbackModels,
      defaultHeartbeatModel,
      agents,
    };
  } catch {
    return null;
  }
}

async function loadOpenClawSessionStore(agentId = "main") {
  const sessionsPath = path.join(getOpenClawSessionsDir(agentId), "sessions.json");
  const raw = await fsp.readFile(sessionsPath, "utf8");
  return JSON.parse(raw);
}

async function resolveOpenClawSessionRuntime(agentId, sessionRef) {
  const sessionsDir = getOpenClawSessionsDir(agentId);
  const requestedSessionKey = typeof sessionRef?.sessionKey === "string"
    ? sessionRef.sessionKey.trim()
    : "";
  const requestedSessionId = normalizeRequestedSessionId(sessionRef?.sessionId);
  let sessionStore = null;
  let sessionKey = requestedSessionKey;
  let entry = null;

  try {
    sessionStore = await loadOpenClawSessionStore(agentId);
  } catch {
    sessionStore = null;
  }

  if (sessionStore && requestedSessionKey && sessionStore[requestedSessionKey]) {
    entry = sessionStore[requestedSessionKey];
  } else if (sessionStore && requestedSessionId) {
    const matched = Object.entries(sessionStore).find(([, value]) => {
      return String(value?.sessionId || "").trim() === requestedSessionId;
    });
    if (matched) {
      [sessionKey, entry] = matched;
    }
  }

  const sessionId = String(entry?.sessionId || requestedSessionId || "").trim();
  let sessionFile = typeof entry?.sessionFile === "string" ? entry.sessionFile.trim() : "";
  if (sessionFile && !path.isAbsolute(sessionFile)) {
    sessionFile = path.join(sessionsDir, sessionFile);
  }
  if (!sessionFile && sessionId) {
    sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);
  }

  return {
    sessionStore,
    sessionKey,
    sessionId,
    sessionFile,
    entry,
  };
}

async function loadOpenClawSessionMessages(sessionFile) {
  if (!sessionFile) {
    return [];
  }
  const raw = await fsp.readFile(sessionFile, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getOpenClawMessageTimestamp(entry) {
  const numericTimestamp = Number(entry?.message?.timestamp);
  const parsedTimestamp = Date.parse(entry?.timestamp || "");
  const safeMessageTimestamp = Number.isFinite(numericTimestamp) && numericTimestamp > 0
    ? numericTimestamp
    : 0;
  const safeEntryTimestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  return Math.max(safeMessageTimestamp, safeEntryTimestamp);
}

function extractOpenClawSessionText(message) {
  const contentParts = Array.isArray(message?.content)
    ? message.content
        .filter((item) => item && item.type === "text" && typeof item.text === "string")
        .map((item) => item.text.trim())
        .filter(Boolean)
    : [];

  if (contentParts.length) {
    return stripThinkingText(contentParts.join("\n\n"));
  }

  if (typeof message?.text === "string" && message.text.trim()) {
    return stripThinkingText(message.text.trim());
  }

  return "";
}

function buildOpenClawMessageSignature(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(-240);
}

async function findOpenClawSessionRuntimeByRecentUserMessage(
  agentId,
  expectedUserText,
  minimumTimestampMs = 0
) {
  const signature = buildOpenClawMessageSignature(expectedUserText);
  if (!signature) {
    return null;
  }

  const sessionsDir = getOpenClawSessionsDir(agentId);
  let files = [];
  try {
    const names = await fsp.readdir(sessionsDir);
    const candidates = await Promise.all(
      names
        .filter((name) => name.toLowerCase().endsWith(".jsonl"))
        .map(async (name) => {
          const fullPath = path.join(sessionsDir, name);
          try {
            const stat = await fsp.stat(fullPath);
            return { fullPath, name, mtimeMs: stat.mtimeMs };
          } catch {
            return null;
          }
        })
    );
    files = candidates
      .filter(Boolean)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, 4);
  } catch {
    return null;
  }

  for (const file of files) {
    if (minimumTimestampMs > 0 && file.mtimeMs < minimumTimestampMs - 120000) {
      continue;
    }

    let raw = "";
    try {
      raw = await fsp.readFile(file.fullPath, "utf8");
    } catch {
      continue;
    }
    if (!raw.includes(signature)) {
      continue;
    }
    const messages = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (entry?.type !== "message" || entry?.message?.role !== "user") {
        continue;
      }
      const timestampMs = getOpenClawMessageTimestamp(entry);
      if (minimumTimestampMs > 0 && timestampMs > 0 && timestampMs < minimumTimestampMs - 30000) {
        continue;
      }
      const userText = buildOpenClawMessageSignature(extractOpenClawSessionText(entry.message));
      if (userText && userText.includes(signature)) {
        const sessionHeader = messages.find((item) => item?.type === "session");
        return {
          sessionStore: null,
          sessionKey: "",
          sessionId: typeof sessionHeader?.id === "string"
            ? sessionHeader.id.trim()
            : path.basename(file.name, ".jsonl"),
          sessionFile: file.fullPath,
          entry: null,
        };
      }
    }
  }

  return null;
}

function extractOpenClawSessionAssistantSnapshot(entry) {
  if (entry?.type !== "message" || entry?.message?.role !== "assistant") {
    return null;
  }
  const assistantText = extractOpenClawSessionText(entry.message);
  if (!assistantText || isOpenClawAckText(assistantText) || isTraceAssistantMessageText(assistantText)) {
    return null;
  }
  return {
    id: String(entry?.id || entry?.message?.responseId || "").trim(),
    timestampMs: getOpenClawMessageTimestamp(entry),
    text: assistantText,
    provider: typeof entry?.message?.provider === "string" ? entry.message.provider : "",
    model: typeof entry?.message?.model === "string" ? entry.message.model : "",
    responseId: typeof entry?.message?.responseId === "string" ? entry.message.responseId : "",
  };
}

function isNewerOpenClawSnapshot(candidate, baseline, minimumTimestampMs = 0) {
  if (!candidate) {
    return false;
  }
  if (Number.isFinite(minimumTimestampMs) && minimumTimestampMs > 0) {
    if (candidate.timestampMs < minimumTimestampMs) {
      return false;
    }
    if (!baseline) {
      return true;
    }
  }
  if (!baseline) {
    return true;
  }
  if (candidate.timestampMs > baseline.timestampMs) {
    return true;
  }
  if (candidate.timestampMs < baseline.timestampMs) {
    return false;
  }
  if (candidate.id && baseline.id) {
    return candidate.id !== baseline.id;
  }
  return candidate.text !== baseline.text;
}

function isOpenClawAckText(text) {
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

async function getLatestOpenClawAssistantSnapshot(
  agentId,
  sessionRef,
  expectedUserText = "",
  minimumTimestampMs = 0
) {
  let runtime = await resolveOpenClawSessionRuntime(agentId, sessionRef);
  if (!runtime.sessionFile) {
    runtime = await findOpenClawSessionRuntimeByRecentUserMessage(
      agentId,
      expectedUserText,
      minimumTimestampMs
    ) || runtime;
  }
  if (!runtime.sessionFile) {
    return null;
  }
  let messages = [];
  try {
    messages = await loadOpenClawSessionMessages(runtime.sessionFile);
  } catch (error) {
    if (expectedUserText) {
      const fallbackRuntime = await findOpenClawSessionRuntimeByRecentUserMessage(
        agentId,
        expectedUserText,
        minimumTimestampMs
      );
      if (fallbackRuntime?.sessionFile && fallbackRuntime.sessionFile !== runtime.sessionFile) {
        runtime = fallbackRuntime;
        messages = await loadOpenClawSessionMessages(runtime.sessionFile);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const snapshot = extractOpenClawSessionAssistantSnapshot(messages[index]);
    if (snapshot) {
      return {
        ...snapshot,
        sessionId: runtime.sessionId || sessionRef?.sessionId || "",
        sessionKey: runtime.sessionKey || sessionRef?.sessionKey || "",
        sessionFile: runtime.sessionFile,
      };
    }
  }
  return null;
}

async function waitForOpenClawAssistantSnapshot(
  agentId,
  sessionRef,
  baseline,
  timeoutMs,
  minimumTimestampMs = 0,
  expectedUserText = ""
) {
  const effectiveTimeoutMs = resolveOpenClawPollTimeout(timeoutMs);
  const deadline = Date.now() + effectiveTimeoutMs;
  let lastErrorMessage = "";

  while (Date.now() <= deadline) {
    try {
      const snapshot = await getLatestOpenClawAssistantSnapshot(
        agentId,
        sessionRef,
        expectedUserText,
        minimumTimestampMs
      );
      if (isNewerOpenClawSnapshot(snapshot, baseline, minimumTimestampMs)) {
        return snapshot;
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
    }
    await sleep(OPENCLAW_SESSION_POLL_MS);
  }

  throw new Error(
    lastErrorMessage
      ? `OpenClaw session polling timed out: ${lastErrorMessage}`
      : `OpenClaw session polling timed out after ${effectiveTimeoutMs}ms.`
  );
}

async function requestOpenClawAgentText({
  agentId,
  sessionRef,
  message,
  timeoutMs,
  idempotencyKeyPrefix,
}) {
  const resolvedAgentId = agentId || "main";
  const requestMessage = withOpenClawNoThinkDirective(message);

  if (sessionRef?.sessionKey) {
    const gateway = getGatewayBridge();
    let baselineSnapshot = null;
    try {
      baselineSnapshot = await getLatestOpenClawAssistantSnapshot(
        resolvedAgentId,
        sessionRef
      );
    } catch {
      baselineSnapshot = null;
    }

    const requestStartedAtMs = Date.now();

    await gateway.request(
      "chat.send",
      {
        sessionKey: sessionRef.sessionKey,
        message: requestMessage,
        idempotencyKey: createIdempotencyKey(idempotencyKeyPrefix),
      },
      {
        connectTimeoutMs: 5000,
        requestOptions: { timeoutMs: 5000 },
      }
    );

    const snapshot = await waitForOpenClawAssistantSnapshot(
      resolvedAgentId,
      sessionRef,
      baselineSnapshot,
      timeoutMs,
      requestStartedAtMs - 1500,
      requestMessage
    );

    return {
      assistantText: snapshot.text,
      gatewaySessionId: snapshot.sessionId || "",
      provider: snapshot.provider || "",
      model: snapshot.model || "",
      sessionKey: snapshot.sessionKey || sessionRef.sessionKey || "",
    };
  }

  const gateway = getGatewayBridge();
  let baseline = null;
  try {
    baseline = await getLatestOpenClawAssistantSnapshot(resolvedAgentId, sessionRef);
  } catch {
    baseline = null;
  }
  const requestStartedAtMs = Date.now();
  const requestPayload = {
    agentId: resolvedAgentId,
    message: requestMessage,
    idempotencyKey: createIdempotencyKey(idempotencyKeyPrefix),
  };

  if (sessionRef?.useLegacySessionId) {
    requestPayload.sessionId = sessionRef.sessionId;
  } else if (sessionRef?.sessionKey) {
    requestPayload.sessionKey = sessionRef.sessionKey;
  }

  await gateway.request(
    "agent",
    requestPayload,
    {
      connectTimeoutMs: 5000,
      requestOptions: { timeoutMs: 5000 },
    }
  );

  const snapshot = await waitForOpenClawAssistantSnapshot(
    resolvedAgentId,
    sessionRef,
    baseline,
    timeoutMs,
    requestStartedAtMs - 1500,
    requestPayload.message
  );

  return {
    assistantText: snapshot.text,
    gatewaySessionId: snapshot.sessionId || "",
    provider: snapshot.provider || "",
    model: snapshot.model || "",
    sessionKey: snapshot.sessionKey || sessionRef?.sessionKey || "",
  };
}

function normalizePdfContextParameters(parameters = []) {
  const seen = new Set();
  return (Array.isArray(parameters) ? parameters : [])
    .map((item) => ({
      label: typeof item?.label === "string" ? item.label.trim() : "",
      value: typeof item?.value === "string" ? item.value.trim() : "",
      text: typeof item?.text === "string"
        ? item.text.trim()
        : typeof item?.sourceText === "string"
          ? item.sourceText.trim()
          : "",
      pageNumber: Number.isFinite(item?.pageNumber) ? item.pageNumber : null,
      parameterId: typeof item?.parameterId === "string"
        ? item.parameterId.trim()
        : typeof item?.parameterKey === "string"
          ? item.parameterKey.trim()
          : "",
      rect: item?.rect && typeof item.rect === "object" ? item.rect : null,
      score: Number.isFinite(item?.score)
        ? item.score
        : Number.isFinite(item?.confidence)
          ? item.confidence
          : 0,
      importance: Number.isFinite(item?.importance) ? item.importance : 0,
    }))
    .filter((item) => item.label || item.value || item.text)
    .filter((item) => {
      const dedupeKey = [
        item.parameterId || item.label.toLowerCase(),
        item.value.toLowerCase(),
        item.text.toLowerCase(),
        item.pageNumber || 0,
      ].join("::");
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, 12);
}

function buildStoredSessionMemoryPayload(rawMemory) {
  if (!rawMemory || typeof rawMemory !== "object") {
    return null;
  }

  return {
    title: typeof rawMemory.title === "string" ? rawMemory.title.trim() : "",
    fileName: typeof rawMemory.fileName === "string" ? rawMemory.fileName.trim() : "",
    summary: typeof rawMemory.summary === "string" ? rawMemory.summary.trim() : "",
    pageCount: Number.isFinite(rawMemory.pageCount) ? rawMemory.pageCount : null,
    scannedPages: Number.isFinite(rawMemory.scannedPages) ? rawMemory.scannedPages : null,
    extractionComplete: rawMemory.extractionComplete === true,
    currentPage: null,
    currentPageText: "",
    parameters: normalizePdfContextParameters(rawMemory.parameters),
    selectedParameter: null,
  };
}

function mergePdfContexts(primaryContext, fallbackContext) {
  const primary = normalizePdfContext(primaryContext);
  const fallback = buildStoredSessionMemoryPayload(fallbackContext);

  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }

  const primarySelected =
    primary.selectedParameter && (
      primary.selectedParameter.label
      || primary.selectedParameter.value
      || primary.selectedParameter.text
    )
      ? primary.selectedParameter
      : null;
  const fallbackSelected =
    fallback.selectedParameter && (
      fallback.selectedParameter.label
      || fallback.selectedParameter.value
      || fallback.selectedParameter.text
    )
      ? fallback.selectedParameter
      : null;
  const mergedParameters = normalizePdfContextParameters([
    ...(primary.parameters || []),
    ...(fallback.parameters || []),
  ]);

  return {
    title: primary.title || fallback.title,
    fileName: primary.fileName || fallback.fileName,
    sourceManufacturer: primary.sourceManufacturer || fallback.sourceManufacturer || "",
    summary: primary.summary || fallback.summary,
    pageCount: primary.pageCount || fallback.pageCount,
    scannedPages: primary.scannedPages || fallback.scannedPages,
    extractionComplete: primary.extractionComplete || fallback.extractionComplete,
    currentPage: primary.currentPage || fallback.currentPage,
    currentPageText: primary.currentPageText || fallback.currentPageText,
    parameters: mergedParameters.length ? mergedParameters : primary.parameters || fallback.parameters || [],
    selectedParameter: primarySelected || fallbackSelected,
    recommendation: primary.recommendation || fallback.recommendation || null,
  };
}

function buildSessionMemoryAnalysisPayload(structured, analysis) {
  const pageSamples = (structured?.pages || [])
    .slice(0, 6)
    .map((page) => ({
      pageNumber: Number(page?.pageNumber) || 0,
      text: truncateText(page?.text || "", 1800),
    }))
    .filter((page) => page.pageNumber && page.text);
  const parameters = normalizePdfContextParameters(
    (analysis?.highlights || []).map((item) => ({
      parameterId: item?.parameterId || "",
      label: item?.label || "",
      value: item?.value || "",
      text: item?.text || "",
      pageNumber: item?.pageNumber,
      rect: item?.rect || null,
      score: Number(item?.score) || 0,
      importance: Number(item?.importance) || 0,
    }))
  );

  return {
    title: typeof analysis?.title === "string" && analysis.title.trim()
      ? analysis.title.trim()
      : structured?.title || "",
    fileName: structured?.fileName || "",
    summary: typeof analysis?.summary === "string" ? analysis.summary.trim() : "",
    pageCount: Number.isFinite(structured?.pageCount) ? structured.pageCount : 0,
    usedOpenClaw: analysis?.usedOpenClaw === true,
    pageSamples,
    parameters,
  };
}

function formatStageDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return "";
  }

  return Object.entries(detail)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const rendered = typeof value === "object"
        ? truncateText(JSON.stringify(value), 120)
        : truncateText(String(value), 120);
      return `${key}=${rendered}`;
    })
    .join(" ");
}

function printStageLog(entry) {
  const prefix = "[PDF_STAGE]";
  const sessionLabel = entry.sessionKey || entry.sessionId || "session:unknown";
  const durationLabel = Number.isFinite(entry.durationMs) && entry.durationMs > 0
    ? ` ${entry.durationMs}ms`
    : "";
  const messageLabel = entry.message ? ` ${entry.message}` : "";
  const detailLabel = formatStageDetail(entry.detail);
  const line = `${prefix} [${sessionLabel}] [${entry.phase}] ${entry.status}${durationLabel}${messageLabel}${detailLabel ? ` | ${detailLabel}` : ""}`;

  if (entry.status === "failed") {
    console.error(line);
    return;
  }

  console.log(line);
}

async function appendStageLog(entry) {
  printStageLog(entry);

  if (!entry?.sessionKey) {
    return null;
  }

  try {
    return await requestSessionMemoryStore("log_stage", {
      sessionKey: entry.sessionKey,
      sessionId: entry.sessionId || "",
      agentId: entry.agentId || "",
      title: entry.title || "",
      fileName: entry.fileName || "",
      summary: entry.summary || "",
      phase: entry.phase || "",
      status: entry.status || "",
      message: entry.message || "",
      detail: entry.detail && typeof entry.detail === "object" ? entry.detail : null,
      durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : null,
    });
  } catch (error) {
    console.warn(`Stage log persistence failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function runSessionStage(options) {
  const {
    sessionRef,
    agentId,
    phase,
    startedMessage,
    completedMessage,
    startDetail,
    completeDetail,
    sessionMeta,
    run,
  } = options;

  const startedAt = Date.now();
  await appendStageLog({
    sessionKey: sessionRef?.sessionKey || "",
    sessionId: sessionRef?.sessionId || "",
    agentId,
    phase,
    status: "started",
    message: startedMessage,
    detail: typeof startDetail === "function" ? startDetail() : startDetail,
    ...(sessionMeta || {}),
  });

  try {
    const result = await run();
    await appendStageLog({
      sessionKey: sessionRef?.sessionKey || "",
      sessionId: sessionRef?.sessionId || "",
      agentId,
      phase,
      status: "completed",
      message: completedMessage || startedMessage,
      detail: typeof completeDetail === "function" ? completeDetail(result) : completeDetail,
      durationMs: Date.now() - startedAt,
      ...(sessionMeta || {}),
    });
    return result;
  } catch (error) {
    await appendStageLog({
      sessionKey: sessionRef?.sessionKey || "",
      sessionId: sessionRef?.sessionId || "",
      agentId,
      phase,
      status: "failed",
      message: error instanceof Error ? error.message : "Stage failed.",
      detail: {
        ...(typeof startDetail === "object" && startDetail ? startDetail : {}),
        error: error instanceof Error ? error.message : String(error),
      },
      durationMs: Date.now() - startedAt,
      ...(sessionMeta || {}),
    });
    throw error;
  }
}

async function ensureSessionMemorySession(sessionRef, agentId, metadata = {}) {
  if (!sessionRef?.sessionKey) {
    return null;
  }

  try {
    return await requestSessionMemoryStore("ensure_session", {
      sessionKey: sessionRef.sessionKey,
      sessionId: sessionRef.sessionId || "",
      agentId: agentId || "",
      title: metadata.title || "",
      fileName: metadata.fileName || "",
      memorySummary: metadata.summary || "",
    });
  } catch (error) {
    console.warn(`Session memory session upsert failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function loadSessionMemoryContext(sessionRef) {
  if (!sessionRef?.sessionKey) {
    return null;
  }

  try {
    const result = await requestSessionMemoryStore("get_session_context", {
      sessionKey: sessionRef.sessionKey,
    });
    return result?.memory || null;
  } catch (error) {
    console.warn(`Session memory load failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function loadSessionStageLogs(sessionRef, limit = 80) {
  if (!sessionRef?.sessionKey) {
    return [];
  }

  try {
    const result = await requestSessionMemoryStore("get_stage_logs", {
      sessionKey: sessionRef.sessionKey,
      limit,
    });
    return Array.isArray(result?.logs) ? result.logs : [];
  } catch (error) {
    console.warn(`Session stage log load failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function truncateText(value, maxChars = 1200) {
  const text = String(value || "").trim();

  if (!text || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}...`;
}

function containsCjkText(value = "") {
  return /[\u3400-\u9fff]/.test(String(value));
}

function countEnglishLetters(value = "") {
  return (String(value).match(/[A-Za-z]/g) || []).length;
}

function shouldTranslatePdfText(value = "") {
  const text = String(value || "").trim();

  if (!text || containsCjkText(text)) {
    return false;
  }

  if (NON_TRANSLATABLE_TOKEN_PATTERN.test(text.replace(/\s+/g, ""))) {
    return false;
  }

  const letterCount = countEnglishLetters(text);
  const hasSentenceSignals = /[\s:;,.()]/.test(text);

  return (
    letterCount >= 6
    && (hasSentenceSignals || ENGLISH_TRANSLATION_SIGNAL_PATTERN.test(text))
  );
}

function translateEnglishTextLocally(value = "") {
  let text = String(value || "").trim();

  if (!shouldTranslatePdfText(text)) {
    return text;
  }

  const replacements = [
    [/^\((\d+)\)\s*part marking\s*[:：]?\s*/i, "($1)器件丝印："],
    [/^part marking\s*[:：]?\s*/i, "器件丝印："],
    [/^\((\d+)\)\s*rohs values\s*[:：]?\s*/i, "($1)RoHS 取值："],
    [/^rohs values\s*[:：]?\s*/i, "RoHS 取值："],
    [/\bsee the ti rohs statement for additional information and value definition\.?/gi, "更多信息和取值定义请参考 TI RoHS 声明。"],
    [/\bthere may be an additional marking, which relates to the logo, the lot trace code information, or the environmental category of the part\.?/gi, "可能存在附加标记，对应器件标识、批次追溯编码信息或环保类别。"],
    [/\badditional marking\b/gi, "附加标记"],
    [/\blot trace code information\b/gi, "批次追溯编码信息"],
    [/\benvironmental category\b/gi, "环保类别"],
    [/\blogo\b/gi, "标识"],
    [/\brelated to\b/gi, "对应"],
    [/\bfor additional information and value definition\b/gi, "查看更多信息和取值定义"],
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text.replace(/\s+/g, " ").trim();
}

function localizePdfAnalysisFallback(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return analysis;
  }

  return {
    ...analysis,
    summary: translateEnglishTextLocally(analysis.summary),
    highlights: Array.isArray(analysis.highlights)
      ? analysis.highlights.map((item) => ({
          ...item,
          label: translateEnglishTextLocally(item?.label),
          value: translateEnglishTextLocally(item?.value),
          text: translateEnglishTextLocally(item?.text),
        }))
      : [],
  };
}

function needsPdfAnalysisLocalization(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return false;
  }

  if (shouldTranslatePdfText(analysis.summary)) {
    return true;
  }

  return Array.isArray(analysis.highlights)
    && analysis.highlights.some((item) =>
      [item?.label, item?.value, item?.text].some((value) => shouldTranslatePdfText(value))
    );
}

function buildPdfLocalizationPrompt(analysis) {
  return [
    "请把下面 PDF 参数提取结果里仍然是英文的自然语言内容翻译成简体中文。",
    "必须只返回严格 JSON，不要 markdown，不要解释。",
    "返回格式：",
    '{"summary":"中文摘要","items":[{"id":"cand-1","label":"中文标签","value":"中文值","text":"中文说明"}]}',
    "要求：",
    "- 只翻译自然语言英文；数值、单位、封装名、协议名、型号名保持原样。",
    "- label 要简洁，适合参数审阅面板显示。",
    "- value 如果本身已经是纯规格值，可以保持原样。",
    "- text 用简体中文转述，不要照搬英文原句。",
    "- items 必须按输入 id 返回；如果某项无需修改，也可以保留原值。",
    `summary: ${truncateText(analysis.summary, 220)}`,
    "items:",
    ...(analysis.highlights || []).slice(0, 12).map((item) =>
      `${item.id} | label=${item.label || ""} | value=${item.value || ""} | text=${truncateText(item.text || "", 220)}`
    ),
  ].join("\n\n");
}

function applyLocalizedPdfAnalysis(analysis, translationPayload) {
  const fallbackAnalysis = localizePdfAnalysisFallback(analysis);
  if (!translationPayload || typeof translationPayload !== "object") {
    return fallbackAnalysis;
  }

  const translatedItems = new Map(
    (Array.isArray(translationPayload.items) ? translationPayload.items : [])
      .filter((item) => item && typeof item.id === "string" && item.id.trim())
      .map((item) => [item.id.trim(), item])
  );

  return {
    ...fallbackAnalysis,
    summary: pickLocalizedText(fallbackAnalysis.summary, translationPayload.summary),
    highlights: (fallbackAnalysis.highlights || []).map((item) => {
      const translated = translatedItems.get(item.id);

      if (!translated) {
        return item;
      }

      return {
        ...item,
        label: pickLocalizedText(item.label, translated.label),
        value: pickLocalizedText(item.value, translated.value),
        text: pickLocalizedText(item.text, translated.text),
      };
    }),
  };
}

function normalizePdfContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }

  const parameters = Array.isArray(rawContext.parameters)
    ? rawContext.parameters
        .map((item) => ({
          label: typeof item?.label === "string" ? item.label.trim() : "",
          value: typeof item?.value === "string" ? item.value.trim() : "",
          text: typeof item?.text === "string" ? item.text.trim() : "",
          pageNumber: Number.isFinite(item?.pageNumber) ? item.pageNumber : null,
        }))
        .filter((item) => item.label || item.value || item.text)
        .slice(0, 12)
    : [];

  const selectedParameter = rawContext.selectedParameter && typeof rawContext.selectedParameter === "object"
    ? {
        label: typeof rawContext.selectedParameter.label === "string"
          ? rawContext.selectedParameter.label.trim()
          : "",
        value: typeof rawContext.selectedParameter.value === "string"
          ? rawContext.selectedParameter.value.trim()
          : "",
        text: typeof rawContext.selectedParameter.text === "string"
          ? rawContext.selectedParameter.text.trim()
          : "",
        pageNumber: Number.isFinite(rawContext.selectedParameter.pageNumber)
          ? rawContext.selectedParameter.pageNumber
          : null,
      }
    : null;

  const referenceSpecs = Array.isArray(rawContext.recommendation?.referenceSpecs)
    ? rawContext.recommendation.referenceSpecs
        .map((item) => ({
          label: typeof item?.label === "string" ? item.label.trim() : "",
          value: typeof item?.value === "string" ? item.value.trim() : "",
          key: typeof item?.key === "string" ? item.key.trim() : "",
        }))
        .filter((item) => item.label || item.value || item.key)
        .slice(0, 8)
    : [];
  const recommendationCandidates = Array.isArray(rawContext.recommendation?.candidates)
    ? rawContext.recommendation.candidates
        .map((item) => ({
          name: typeof item?.name === "string" ? item.name.trim() : "",
          vendor: typeof item?.vendor === "string" ? item.vendor.trim() : "",
          totalScore: Number.isFinite(item?.totalScore) ? item.totalScore : null,
          desc: typeof item?.desc === "string" ? item.desc.trim() : "",
          note: typeof item?.note === "string" ? item.note.trim() : "",
          chips: Array.isArray(item?.chips)
            ? item.chips.map((chip) => String(chip || "").trim()).filter(Boolean).slice(0, 4)
            : [],
          specs: Array.isArray(item?.specs)
            ? item.specs
                .map((spec) => ({
                  label: typeof spec?.label === "string" ? spec.label.trim() : "",
                  value: typeof spec?.value === "string" ? spec.value.trim() : "",
                  key: typeof spec?.key === "string" ? spec.key.trim() : "",
                }))
                .filter((spec) => spec.label || spec.value || spec.key)
                .slice(0, 8)
            : [],
        }))
        .filter((item) => item.name || item.vendor)
        .slice(0, 5)
    : [];

  return {
    title: typeof rawContext.title === "string" ? rawContext.title.trim() : "",
    fileName: typeof rawContext.fileName === "string" ? rawContext.fileName.trim() : "",
    sourceManufacturer: typeof rawContext.sourceManufacturer === "string"
      ? rawContext.sourceManufacturer.trim()
      : "",
    summary: truncateText(rawContext.summary, 800),
    pageCount: Number.isFinite(rawContext.pageCount) ? rawContext.pageCount : null,
    scannedPages: Number.isFinite(rawContext.scannedPages) ? rawContext.scannedPages : null,
    extractionComplete: rawContext.extractionComplete === true,
    currentPage: Number.isFinite(rawContext.currentPage) ? rawContext.currentPage : null,
    currentPageText: truncateText(rawContext.currentPageText, 1800),
    parameters,
    selectedParameter,
    recommendation: {
      status: typeof rawContext.recommendation?.status === "string"
        ? rawContext.recommendation.status.trim()
        : "",
      category: rawContext.recommendation?.category && typeof rawContext.recommendation.category === "object"
        ? {
            id: typeof rawContext.recommendation.category.id === "string"
              ? rawContext.recommendation.category.id.trim()
              : "",
            label: typeof rawContext.recommendation.category.label === "string"
              ? rawContext.recommendation.category.label.trim()
              : "",
          }
        : null,
      referenceSpecs,
      candidates: recommendationCandidates,
    },
  };
}

function extractTracePageLogPayload(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }

  const sourceParameters = Array.isArray(rawContext.pageParameters)
    ? rawContext.pageParameters
    : Array.isArray(rawContext.parameters)
      ? rawContext.parameters
      : [];

  const pageParameters = sourceParameters
    .map((item) => ({
      label: typeof item?.label === "string" ? item.label.trim() : "",
      value: typeof item?.value === "string" ? item.value.trim() : "",
      text: typeof item?.text === "string" ? item.text.trim() : "",
      pageNumber: Number.isFinite(item?.pageNumber) ? item.pageNumber : null,
    }))
    .filter((item) => item.label || item.value || item.text);

  const selectedParameter =
    rawContext?.selectedParameter && typeof rawContext.selectedParameter === "object"
      ? {
          label: typeof rawContext.selectedParameter.label === "string"
            ? rawContext.selectedParameter.label.trim()
            : "",
          value: typeof rawContext.selectedParameter.value === "string"
            ? rawContext.selectedParameter.value.trim()
            : "",
          text: typeof rawContext.selectedParameter.text === "string"
            ? rawContext.selectedParameter.text.trim()
            : "",
          pageNumber: Number.isFinite(rawContext.selectedParameter.pageNumber)
            ? rawContext.selectedParameter.pageNumber
            : null,
        }
      : null;

  const pageNumber = Number.isFinite(selectedParameter?.pageNumber)
    ? selectedParameter.pageNumber
    : pageParameters.find((item) => Number.isFinite(item.pageNumber))?.pageNumber ?? null;

  if (!pageNumber && !pageParameters.length) {
    return null;
  }

  return {
    traceType: "pdf_parameter_trace",
    trigger: "highlight_click",
    timestamp: new Date().toISOString(),
    title: typeof rawContext?.title === "string" ? rawContext.title.trim() : "",
    fileName: typeof rawContext?.fileName === "string" ? rawContext.fileName.trim() : "",
    pageNumber,
    selectedParameter: selectedParameter
      ? {
          ...selectedParameter,
          pageNumber: Number.isFinite(selectedParameter.pageNumber)
            ? selectedParameter.pageNumber
            : pageNumber,
        }
      : null,
    selectedParameterLabel: selectedParameter?.label || "",
    selectedParameterValue: selectedParameter?.value || selectedParameter?.text || "",
    pageParameterCount: pageNumber
      ? pageParameters.filter((item) => item.pageNumber === pageNumber).length
      : pageParameters.length,
    pageParameters: pageNumber
      ? pageParameters.filter((item) => item.pageNumber === pageNumber)
      : pageParameters,
  };
}

function formatTraceParameter(item, fallbackLabel = "参数") {
  if (!item || typeof item !== "object") {
    return `${fallbackLabel} = 未提取`;
  }

  const label = typeof item.label === "string" && item.label.trim()
    ? item.label.trim()
    : fallbackLabel;
  const value = typeof item.value === "string" && item.value.trim()
    ? item.value.trim()
    : typeof item.text === "string" && item.text.trim()
      ? item.text.trim()
      : "未提取";

  return `${label} = ${value}`;
}

function buildTraceDisplayBlock(tracePayload) {
  const normalizedPayload = tracePayload && typeof tracePayload === "object"
    ? tracePayload
    : null;

  if (!normalizedPayload) {
    return "";
  }

  const pageLabel = Number.isFinite(normalizedPayload.pageNumber)
    ? `P.${normalizedPayload.pageNumber}`
    : "未知";
  const selectedParameterLine = formatTraceParameter(
    normalizedPayload.selectedParameter,
    "点击数据"
  );

  return `${TRACE_LOG_LABEL} 识别页码: ${pageLabel} | ${selectedParameterLine}`;
}

function buildTraceGatewayMessage(tracePayload) {
  const normalizedPayload = tracePayload && typeof tracePayload === "object"
    ? tracePayload
    : null;

  if (!normalizedPayload) {
    return "";
  }

  const displayBlock = buildTraceDisplayBlock(normalizedPayload);

  return [
    "你正在向终端输出一段比赛演示用的 PDF 溯源展示内容。",
    "请只回复下面这一行文本，原样输出。",
    "不要分析，不要改写，不要总结，不要添加 Markdown 代码块，也不要增删任何字符。",
    "",
    displayBlock,
  ].join("\n");
}

async function buildOllamaTraceDisplay(tracePayload) {
  const fallback = buildTraceDisplayBlock(tracePayload);
  if (!fallback || (!FAST_OLLAMA_ENABLED && !CLOUD_AI_ENABLED)) {
    return fallback;
  }

  try {
    const assistantText = await generateWithFastOllama(
      [
        "/no_think",
        CLOUD_AI_ENABLED
          ? "你是芯中有数的云端模型溯源输出器。"
          : "你是芯中有数的本地 Ollama 溯源输出器。",
        "请只回复指定的一行文本，原样输出，不要解释、不要补充、不要 Markdown。",
        "",
        fallback,
      ].join("\n"),
      {
        numPredict: 128,
        timeoutMs: OLLAMA_TRACE_TIMEOUT_MS,
        temperature: 0,
      }
    );
    return assistantText.trim() || fallback;
  } catch {
    return fallback;
  }
}

function normalizeChatHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .map((item) => ({
      role:
        typeof item?.role === "string" && ["user", "assistant", "system"].includes(item.role)
          ? item.role
          : "user",
      content: typeof item?.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content)
    .slice(-8);
}

const GENERAL_CHAT_MESSAGE_PATTERN =
  /^(?:你好|您好|hi|hello|hey|在吗|小冰\??|你是谁|你叫什么|介绍一下你自己|收到|ok|好的)[!?？。.\s]*$/i;
const PDF_CONTEXT_INTENT_PATTERN =
  /(?:pdf|文档|手册|datasheet|参数|规格|溯源|页码|推荐|国产|候选|替代|厂商|厂家|制造商|生产商|品牌|型号|对比|雷达|封装|引脚|输入|输出|电压|电流|温度|噪声|psrr|压差|效率|频率|功耗|静态电流|工作温度)/i;
const PDF_CONTEXT_REFERENCE_PATTERN =
  /(?:这个|这条|这一项|这一页|这页|当前页|当前参数|上面|这里|它|该参数|该器件|this|that|current|selected)/i;
const PDF_PAGE_EXCERPT_INTENT_PATTERN =
  /(?:页码|哪一页|这一页|这页|原文|出处|证据|溯源|source|excerpt|page)/i;

function isGeneralChatMessage(message = "") {
  return GENERAL_CHAT_MESSAGE_PATTERN.test(String(message || "").trim());
}

function shouldAttachPdfContext(message, normalizedContext) {
  if (!normalizedContext) {
    return false;
  }

  const text = String(message || "").trim();
  if (!text) {
    return false;
  }

  if (isGeneralChatMessage(text)) {
    return false;
  }

  if (PDF_CONTEXT_INTENT_PATTERN.test(text)) {
    return true;
  }

  if (
    normalizedContext?.selectedParameter
    && PDF_CONTEXT_REFERENCE_PATTERN.test(text)
  ) {
    return true;
  }

  if (
    normalizedContext?.summary
    && /(?:请解释|帮我看|怎么看|什么意思|能不能|是否|合适|匹配|复核)/i.test(text)
  ) {
    return true;
  }

  return false;
}

function shouldAttachCurrentPageExcerpt(message = "") {
  return PDF_PAGE_EXCERPT_INTENT_PATTERN.test(String(message || "").trim());
}

function printTerminalAssistantReply(assistantText, meta = {}) {
  const text = truncateText(stripThinkingText(assistantText || "").trim(), 4000);

  if (!text) {
    return;
  }

  const rawSessionLabel = meta.sessionKey || meta.sessionId || "";
  let sessionLabel = rawSessionLabel;
  if (rawSessionLabel.startsWith("agent:") && rawSessionLabel.includes(":session:")) {
    sessionLabel = rawSessionLabel.split(":session:").pop() || rawSessionLabel;
  }
  sessionLabel = truncateText(sessionLabel, 48);

  const parts = [
    "[CHAT_REPLY]",
    meta.engineMode ? `engine=${meta.engineMode}` : "",
    meta.transport ? `transport=${meta.transport}` : "",
    meta.agentId ? `agent=${meta.agentId}` : "",
    sessionLabel ? `session=${sessionLabel}` : "",
    meta.provider ? `provider=${meta.provider}` : "",
    meta.model ? `model=${meta.model}` : "",
  ].filter(Boolean);

  console.log(`${parts.join(" ")}\n${text}`);
}

function buildPdfAwareMessage(message, pdfContext, chatHistory) {
  const normalizedContext = normalizePdfContext(pdfContext);
  const normalizedHistory = normalizeChatHistory(chatHistory);
  const includePdfContext = shouldAttachPdfContext(message, normalizedContext);
  const includeCurrentPageExcerpt =
    includePdfContext && shouldAttachCurrentPageExcerpt(message);

  if (!normalizedHistory.length && (!normalizedContext || !includePdfContext)) {
    return message;
  }

  const contextLines = [];

  if (normalizedHistory.length) {
    contextLines.push(
      "Recent conversation context:",
      normalizedHistory
        .map((item) => `${item.role === "assistant" ? "Assistant" : item.role === "system" ? "System" : "User"}: ${truncateText(item.content, 1000)}`)
        .join("\n")
    );
  }

  if (normalizedContext && includePdfContext) {
    contextLines.push(
      "You are answering questions about the PDF currently open in the UI.",
      "Treat the following extracted PDF context as the primary source of truth.",
      "If the extracted context is incomplete, say what is uncertain instead of inventing values.",
    );
  }

  if (includePdfContext && (normalizedContext?.title || normalizedContext?.fileName)) {
    contextLines.push(
      `Document: ${normalizedContext.title || normalizedContext.fileName}`
    );
  }

  if (includePdfContext && normalizedContext?.sourceManufacturer) {
    contextLines.push(`Source manufacturer: ${normalizedContext.sourceManufacturer}`);
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
          + `${item.text ? ` | source: ${truncateText(item.text, 100)}` : ""}`
        )
        .join("\n")
    );
  }

  if (includePdfContext && normalizedContext?.recommendation?.candidates?.length) {
    const recommendation = normalizedContext.recommendation;
    const categoryLabel = recommendation.category?.label || recommendation.category?.id || "";
    const referenceSpecs = recommendation.referenceSpecs?.length
      ? "\nReference specs:\n" + recommendation.referenceSpecs
          .map((item) => `- ${item.label || item.key || "parameter"}: ${item.value || "unknown"}`)
          .join("\n")
      : "";
    contextLines.push(
      "Domestic replacement recommendation context:",
      [
        categoryLabel ? `Category: ${categoryLabel}` : "",
        referenceSpecs,
        "Candidates:",
        ...recommendation.candidates.map((item, index) => {
          const specs = item.specs?.length
            ? ` | specs: ${item.specs
                .slice(0, 5)
                .map((spec) => `${spec.label || spec.key}=${spec.value || "unknown"}`)
                .join("; ")}`
            : "";
          const score = Number.isFinite(item.totalScore) ? ` | score=${item.totalScore}` : "";
          const vendor = item.vendor ? ` | vendor=${item.vendor}` : "";
          const desc = item.desc ? ` | desc=${truncateText(item.desc, 80)}` : "";
          return `- #${index + 1} ${item.name || "candidate"}${vendor}${score}${desc}${specs}`;
        }),
        "When the user asks for domestic alternatives, answer from these candidates first. If candidates are absent, say recommendation has not been generated yet.",
      ].filter(Boolean).join("\n")
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

function safeFileName(fileName) {
  return path
    .basename(fileName || "document.pdf")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

function normalizeExportText(value = "", fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function xmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelColumnName(index) {
  let value = Number(index) + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function createXlsxSheetXml(rows) {
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cell, columnIndex) => {
      const ref = `${excelColumnName(columnIndex)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const dimension = `A1:${excelColumnName(columnCount - 1)}${Math.max(rows.length, 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function createXlsxWorkbook(rows, sheetName = "Sheet1") {
  const safeSheetName = normalizeExportText(sheetName, "Sheet1").slice(0, 31);
  return createZipArchive([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: createXlsxSheetXml(rows.length ? rows : [["暂无数据"]]),
    },
  ]);
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateToZipParts(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const zipDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const zipTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { zipDate, zipTime };
}

function createZipArchive(entries) {
  const fileParts = [];
  const centralParts = [];
  let offset = 0;
  const { zipDate, zipTime } = dateToZipParts();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const dataBuffer = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data || ""), "utf8");
    const compressed = deflateRawSync(dataBuffer);
    const crc = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(zipTime, 10);
    localHeader.writeUInt16LE(zipDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(zipTime, 12);
    centralHeader.writeUInt16LE(zipDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader = Buffer.alloc(22);
  endHeader.writeUInt32LE(0x06054b50, 0);
  endHeader.writeUInt16LE(0, 4);
  endHeader.writeUInt16LE(0, 6);
  endHeader.writeUInt16LE(entries.length, 8);
  endHeader.writeUInt16LE(entries.length, 10);
  endHeader.writeUInt32LE(centralSize, 12);
  endHeader.writeUInt32LE(centralOffset, 16);
  endHeader.writeUInt16LE(0, 20);

  return Buffer.concat([...fileParts, ...centralParts, endHeader]);
}

function findSpecValue(specs = [], patterns = []) {
  const spec = specs.find((item) => {
    const text = `${item?.key || ""} ${item?.label || ""}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(text));
  });
  return normalizeExportText(spec?.value);
}

function summarizeSpecs(specs = [], limit = 6) {
  return specs
    .slice(0, limit)
    .map((item) => `${normalizeExportText(item?.label, "参数")}: ${normalizeExportText(item?.value, "待确认")}`)
    .join("; ");
}

function scoreToRiskLevel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) {
    return "待评估";
  }
  if (value >= 88) {
    return "低";
  }
  if (value >= 66) {
    return "中";
  }
  return "高";
}

function sourcePagesFromParameters(parameters = []) {
  return [...new Set(parameters
    .map((item) => Number(item?.pageNumber))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .map((pageNumber) => `P.${pageNumber}`))]
    .join(", ");
}

function buildPurchasePackageData(payload = {}) {
  const pdfContext = payload.pdfContext && typeof payload.pdfContext === "object" ? payload.pdfContext : {};
  const sourceName = normalizeExportText(pdfContext.title || pdfContext.fileName, "当前 PDF");
  const sourceFile = normalizeExportText(pdfContext.fileName, "上传文件");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const referenceSpecs = Array.isArray(payload.referenceSpecs) ? payload.referenceSpecs : [];
  const parameters = Array.isArray(pdfContext.parameters) ? pdfContext.parameters : [];
  const sourcePages = sourcePagesFromParameters(parameters);

  const purchaseRows = [[
    "原器件/文档",
    "原始 PDF",
    "推荐国产型号",
    "国产厂商",
    "封装",
    "关键参数",
    "匹配度",
    "风险等级",
    "建议采购数量",
    "目标单价",
    "供应商/渠道",
    "采购状态",
    "PDF 溯源页码",
    "备注",
  ]];

  if (!candidates.length) {
    purchaseRows.push([
      sourceName,
      sourceFile,
      "待推荐",
      "待确认",
      "待确认",
      summarizeSpecs(referenceSpecs.length ? referenceSpecs : parameters, 6) || "待确认",
      "待评估",
      "待评估",
      "待填写",
      "待询价",
      "待确认",
      "待询价",
      sourcePages || "待确认",
      "PDF 已识别，尚未生成国产替代候选。",
    ]);
  } else {
    candidates.forEach((candidate) => {
      const specs = Array.isArray(candidate?.specs) ? candidate.specs : [];
      const score = Number(candidate?.totalScore);
      purchaseRows.push([
        sourceName,
        sourceFile,
        normalizeExportText(candidate?.name, "待确认"),
        normalizeExportText(candidate?.vendor, "国产厂商"),
        findSpecValue(specs, [/package|封装/]) || "待确认",
        summarizeSpecs(specs, 6) || "待确认",
        Number.isFinite(score) ? `${Math.round(score)}` : "待评估",
        scoreToRiskLevel(score),
        "待填写",
        "待询价",
        normalizeExportText(candidate?.vendor, "待确认"),
        "待询价",
        sourcePages || "待确认",
        normalizeExportText(candidate?.note || candidate?.desc, "需结合样品和原理图继续确认。"),
      ]);
    });
  }

  const compareRows = [[
    "参数项",
    "原器件值",
    "候选器件",
    "候选值",
    "匹配评分",
    "来源页码",
    "备注",
  ]];
  const sourceSpecs = referenceSpecs.length
    ? referenceSpecs
    : parameters.map((item) => ({
        key: item?.id || item?.label,
        label: item?.label,
        value: item?.value || item?.text,
        pageNumber: item?.pageNumber,
      }));
  const targetCandidates = candidates.length ? candidates : [{ name: "待推荐", specs: [] }];
  targetCandidates.forEach((candidate) => {
    const candidateSpecs = Array.isArray(candidate?.specs) ? candidate.specs : [];
    sourceSpecs.slice(0, 24).forEach((sourceSpec) => {
      const sourceKey = String(sourceSpec?.key || sourceSpec?.label || "");
      const candidateSpec = candidateSpecs.find((item) =>
        String(item?.key || item?.label || "") === sourceKey
        || normalizeExportText(item?.label).toLowerCase() === normalizeExportText(sourceSpec?.label).toLowerCase()
      );
      const score = Number(candidate?.specScores?.[sourceKey]);
      compareRows.push([
        normalizeExportText(sourceSpec?.label || sourceSpec?.key, "参数"),
        normalizeExportText(sourceSpec?.value || sourceSpec?.text, "待确认"),
        normalizeExportText(candidate?.name, "待推荐"),
        normalizeExportText(candidateSpec?.value, "待确认"),
        Number.isFinite(score) ? `${Math.round(score)}` : "待评估",
        Number.isFinite(sourceSpec?.pageNumber) ? `P.${sourceSpec.pageNumber}` : (sourcePages || "待确认"),
        candidateSpec ? "候选参数来自推荐结果" : "候选侧缺少同名参数，需要人工确认",
      ]);
    });
  });

  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const summary = [
    "# 采购交付包",
    "",
    `生成时间：${generatedAt}`,
    `原始文档：${sourceName}`,
    `文件名：${sourceFile}`,
    `PDF 页数：${Number(pdfContext.pageCount) || "待确认"}`,
    `识别参数：${parameters.length || referenceSpecs.length || 0} 项`,
    `国产候选：${candidates.length} 项`,
    "",
    "## 使用说明",
    "",
    "- `采购清单.xlsx`：用于询价、采购跟进和样品申请。",
    "- `参数对比.xlsx`：用于工程评审和替代风险确认。",
    "- `source-context.json`：保留本次导出的结构化数据，便于后续追溯。",
    "",
    "采购数量、目标单价、供应商渠道默认留作待填写，避免模型或解析结果编造采购信息。",
  ].join("\n");

  return {
    sourceName,
    purchaseRows,
    compareRows,
    summary,
    sourceJson: JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceName,
      sourceFile,
      pdfContext,
      sourceCategory: payload.sourceCategory || null,
      referenceSpecs,
      candidates,
    }, null, 2),
  };
}

async function handlePurchasePackageExport(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const data = buildPurchasePackageData(payload);
    const baseName = safeFileName(data.sourceName || "采购交付包").replace(/\.[^.]+$/, "");
    const packageName = `${baseName || "采购交付包"}-采购交付包.zip`;
    const zip = createZipArchive([
      {
        name: "采购清单.xlsx",
        data: createXlsxWorkbook(data.purchaseRows, "采购清单"),
      },
      {
        name: "参数对比.xlsx",
        data: createXlsxWorkbook(data.compareRows, "参数对比"),
      },
      {
        name: "交付说明.md",
        data: data.summary,
      },
      {
        name: "source-context.json",
        data: data.sourceJson,
      },
    ]);

    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": zip.length,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packageName)}`,
      "Cache-Control": "no-store",
    });
    response.end(zip);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to export purchase package.",
    });
  }
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") {
    return null;
  }

  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);

  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }

  return {
    x,
    y,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };
}

function normalizePdfStructure(raw, fileName) {
  const pages = Array.isArray(raw?.pages)
    ? raw.pages
        .map((page) => ({
          pageNumber: Number.isFinite(page?.pageNumber) ? page.pageNumber : null,
          width: Number.isFinite(page?.width) ? page.width : null,
          height: Number.isFinite(page?.height) ? page.height : null,
          text: typeof page?.text === "string" ? page.text.trim() : "",
        }))
        .filter((page) => page.pageNumber && page.text)
    : [];

  const candidates = Array.isArray(raw?.candidates)
    ? raw.candidates
        .map((candidate, index) => ({
          id:
            typeof candidate?.id === "string" && candidate.id.trim()
              ? candidate.id.trim()
              : `cand-${index + 1}`,
          parameterId:
            typeof candidate?.parameterId === "string" && candidate.parameterId.trim()
              ? candidate.parameterId.trim()
              : "generic",
          labelHint:
            typeof candidate?.labelHint === "string" && candidate.labelHint.trim()
              ? candidate.labelHint.trim()
              : "Parameter",
          valueHint:
            typeof candidate?.valueHint === "string" && candidate.valueHint.trim()
              ? candidate.valueHint.trim()
              : "",
          text: typeof candidate?.text === "string" ? candidate.text.trim() : "",
          pageNumber: Number.isFinite(candidate?.pageNumber) ? candidate.pageNumber : null,
          pageWidth: Number.isFinite(candidate?.pageWidth) ? candidate.pageWidth : null,
          pageHeight: Number.isFinite(candidate?.pageHeight) ? candidate.pageHeight : null,
          rect: normalizeRect(candidate?.rect),
          sourceIds: Array.isArray(candidate?.sourceIds)
            ? candidate.sourceIds.filter((value) => typeof value === "string" && value.trim())
            : [],
          score: Number.isFinite(candidate?.score) ? candidate.score : 0,
          blockId:
            typeof candidate?.blockId === "string" && candidate.blockId.trim()
              ? candidate.blockId.trim()
              : "",
          columnId: Number.isFinite(candidate?.columnId) ? candidate.columnId : null,
        }))
        .filter(
          (candidate) =>
            candidate.text &&
            candidate.pageNumber &&
            candidate.rect &&
            candidate.pageHeight &&
            candidate.pageWidth
        )
    : [];

  return {
    title:
      typeof raw?.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : safeFileName(fileName).replace(/\.pdf$/i, ""),
    fileName: safeFileName(fileName),
    pageCount:
      Number.isFinite(raw?.pageCount) && raw.pageCount > 0
        ? raw.pageCount
        : pages.length,
    pages,
    candidates,
  };
}

async function parsePdfStructure(buffer, fileName) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-pdf-"));
  const pdfPath = path.join(tempDir, safeFileName(fileName));

  try {
    await fsp.writeFile(pdfPath, buffer);
    const result = await runPython([PDF_PARSE_SCRIPT, pdfPath], 180000);
    const parsed = parseLooseJson(result.stdout);

    if (!parsed) {
      throw new Error("Failed to parse PDF structure.");
    }

    return normalizePdfStructure(parsed, fileName);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors.
    });
  }
}

function translateLabel(label, parameterId) {
  const raw = String(label || "").trim();

  if (raw) {
    const lower = raw.toLowerCase();
    if (ENGLISH_LABELS[lower]) {
      return ENGLISH_LABELS[lower];
    }
    if (!/^parameter$/i.test(raw)) {
      return raw;
    }
  }

  return FALLBACK_LABELS[parameterId] || "鍙傛暟";
}

function buildFallbackPdfAnalysis(structured) {
  const highlights = selectStructuredHighlights(structured, DISPLAY_HIGHLIGHT_LIMIT);

  const summary = highlights.length
    ? highlights
        .slice(0, 4)
        .map((item) => `${item.label}${item.value ? `: ${item.value}` : ""}`)
        .join("；")
    : truncateText(structured.pages[0]?.text || "未检测到可提取的文本，可能是扫描件。", 200);

  return {
    usedOpenClaw: false,
    title: structured.title,
    summary,
    highlights,
  };
}

function selectPromptCandidates(structured, limit = 120) {
  const byPage = new Map();

  structured.candidates.forEach((candidate) => {
    const pageNumber = Number.isFinite(candidate.pageNumber) ? candidate.pageNumber : 0;
    if (!pageNumber) {
      return;
    }

    if (!byPage.has(pageNumber)) {
      byPage.set(pageNumber, []);
    }

    byPage.get(pageNumber).push(candidate);
  });

  const pageNumbers = [...byPage.keys()].sort((left, right) => left - right);
  pageNumbers.forEach((pageNumber) => {
    byPage.get(pageNumber).sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    });
  });

  const selected = [];
  const seen = new Set();
  let madeProgress = true;
  let depth = 0;

  while (selected.length < limit && madeProgress) {
    madeProgress = false;

    for (const pageNumber of pageNumbers) {
      const candidates = byPage.get(pageNumber) || [];
      const candidate = candidates[depth];

      if (!candidate) {
        continue;
      }

      const dedupeKey = `${candidate.pageNumber}:${candidate.labelHint}:${candidate.valueHint}:${candidate.text}`.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }

      selected.push(candidate);
      seen.add(dedupeKey);
      madeProgress = true;

      if (selected.length >= limit) {
        break;
      }
    }

    depth += 1;
  }

  return selected;
}

function candidateToHighlight(candidate, overrides = {}) {
  return {
    id: candidate.id,
    parameterId: candidate.parameterId,
    kind: "parameter",
    label: translateLabel(candidate.labelHint, candidate.parameterId),
    value: candidate.valueHint || "",
    text: candidate.text,
    pageNumber: candidate.pageNumber,
    pageWidth: candidate.pageWidth,
    pageHeight: candidate.pageHeight,
    rect: candidate.rect,
    score: candidate.score,
    importance: 0,
    ...overrides,
  };
}

function selectStructuredHighlights(structured, limit = DISPLAY_HIGHLIGHT_LIMIT, prioritizedSourceIds = []) {
  const highlightedIds = new Set((prioritizedSourceIds || []).filter(Boolean));
  const preferredParameterOrder = [
    "working_temperature",
    "input_voltage",
    "supply_voltage",
    "output_voltage",
    "output_current",
    "current",
    "accuracy",
    "resolution",
    "frequency",
    "efficiency",
    "power",
    "interface",
    "package",
    "pinout",
  ];
  const preferredParameterRank = new Map(
    preferredParameterOrder.map((parameterId, index) => [parameterId, index])
  );

  const ranked = (structured?.candidates || [])
    .filter((candidate) => candidate && candidate.parameterId && candidate.parameterId !== "generic")
    .filter((candidate) => {
      const text = String(candidate.text || "").toLowerCase();
      if (!String(candidate.valueHint || "").trim() && !["package", "interface", "pinout"].includes(candidate.parameterId)) {
        return false;
      }
      if (candidate.parameterId === "working_temperature" && /unless otherwise|typical values? represent|guard band/.test(text)) {
        return false;
      }
      if (["input_voltage", "supply_voltage", "output_voltage"].includes(candidate.parameterId) && /dropout|abs max|absolute maximum|lessor of|lesser of|below the nominal/.test(text)) {
        return false;
      }
      if (candidate.parameterId === "frequency" && /cut-?off frequency|psrr|noise/.test(text)) {
        return false;
      }
      if (candidate.parameterId === "package" && /thermal pad|connect to gnd|leave floating|bottom view|top view|pin functions?|max height|package size|dbv|dqn|5-pin|4-pin|vout<|iout=/.test(text)) {
        return false;
      }
      return true;
    })
    .map((candidate) => ({
      ...candidateToHighlight(candidate),
      rankScore:
        (preferredParameterRank.has(candidate.parameterId) ? 200 - preferredParameterRank.get(candidate.parameterId) * 10 : 0)
        + (Number(candidate.score) || 0) * 4
        + (highlightedIds.has(candidate.id) ? 12 : 0),
      parameterRank: preferredParameterRank.has(candidate.parameterId)
        ? preferredParameterRank.get(candidate.parameterId)
        : preferredParameterOrder.length + 1,
    }))
    .sort((left, right) => {
      if (left.parameterRank !== right.parameterRank) {
        return left.parameterRank - right.parameterRank;
      }
      if (right.rankScore !== left.rankScore) {
        return right.rankScore - left.rankScore;
      }
      if ((right.score || 0) !== (left.score || 0)) {
        return (right.score || 0) - (left.score || 0);
      }
      return (left.pageNumber || 0) - (right.pageNumber || 0);
    });

  const selected = [];
  const seenKeys = new Set();
  const parameterSeen = new Map();

  for (const item of ranked) {
    const dedupeKey = createHighlightDedupeKey(item);
    if (selected.length >= limit) {
      break;
    }
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    const parameterCount = parameterSeen.get(item.parameterId) || 0;
    const maxPerParameter = 1;
    if (parameterCount >= maxPerParameter) {
      continue;
    }
    selected.push(item);
    seenKeys.add(dedupeKey);
    parameterSeen.set(item.parameterId, parameterCount + 1);
  }

  return selected.map(({ rankScore, parameterRank, ...item }) => item);
}

function buildSummaryFromHighlights(highlights, fallbackText = "") {
  if (!highlights.length) {
    return fallbackText;
  }

  return highlights
    .slice(0, 4)
    .map((item) => `${item.label}${item.value ? `: ${item.value}` : ""}`)
    .join("；");
}

function selectPromptPages(structured, limit = 6) {
  const pageLookup = new Map(
    (structured.pages || []).map((page) => [Number(page?.pageNumber) || 0, page])
  );
  const metricsByPage = new Map();

  (structured.candidates || []).forEach((candidate) => {
    const pageNumber = Number(candidate?.pageNumber) || 0;
    if (!pageNumber) {
      return;
    }

    const metric = metricsByPage.get(pageNumber) || { count: 0, totalScore: 0, topScore: 0 };
    metric.count += 1;
    metric.totalScore += Number(candidate?.score) || 0;
    metric.topScore = Math.max(metric.topScore, Number(candidate?.score) || 0);
    metricsByPage.set(pageNumber, metric);
  });

  const rankedPages = [...pageLookup.entries()]
    .map(([pageNumber, page]) => {
      const metric = metricsByPage.get(pageNumber) || { count: 0, totalScore: 0, topScore: 0 };
      return {
        pageNumber,
        page,
        count: metric.count,
        totalScore: metric.totalScore,
        topScore: metric.topScore,
      };
    })
    .filter((entry) => entry.page?.text)
    .sort((left, right) => {
      if (right.topScore !== left.topScore) {
        return right.topScore - left.topScore;
      }
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return left.pageNumber - right.pageNumber;
    });

  const selected = [];
  const seen = new Set();
  const firstPage = structured.pages?.[0];
  if (firstPage?.text) {
    selected.push(firstPage);
    seen.add(Number(firstPage.pageNumber) || 1);
  }

  for (const entry of rankedPages) {
    if (selected.length >= limit) {
      break;
    }
    if (seen.has(entry.pageNumber)) {
      continue;
    }
    selected.push(entry.page);
    seen.add(entry.pageNumber);
  }

  return selected.sort((left, right) => (left.pageNumber || 0) - (right.pageNumber || 0));
}

function createHighlightDedupeKey(item) {
  const parameterKey = getHighlightParameterFamily(item);
  const label = normalizeHighlightCompareToken(item?.label || "");
  const value = normalizeHighlightCompareToken(item?.value || "");
  const text = normalizeHighlightCompareToken(item?.text || "");

  return `${parameterKey || label || "parameter"}::${value || text}`;
}

function normalizeHighlightCompareToken(value = "") {
  return String(value || "")
    .replace(/[−–—]/g, "-")
    .replace(/[~～]/g, "-")
    .replace(/(?:至|到|to)/gi, "-")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function getHighlightParameterFamily(item) {
  const parameterId = normalizeHighlightCompareToken(item?.parameterId || "");
  const label = normalizeHighlightCompareToken(item?.label || "");

  if (parameterId === "input_voltage" || parameterId === "supply_voltage") {
    return "input_supply_voltage";
  }

  if (label === "输入电压" || label === "供电电压") {
    return "input_supply_voltage";
  }

  return parameterId || label;
}

const HIGHLIGHT_NOISE_LABEL_PATTERN =
  /^(?:rohs(?:合规|取值)?|器件丝印|零件标记|part marking|rohs values?|notes?|parameter|文本|d)$/i;
const HIGHLIGHT_NOISE_TEXT_PATTERN =
  /\b(?:rohs|part marking|lot trace|environmental category|additional marking|package outline|land pattern|solder mask|stencil design|board layout|important notice|disclaimer|product folder links|submit document feedback)\b/i;
const HIGHLIGHT_NON_SPEC_PAGE_PATTERN =
  /\b(?:table of contents|typical characteristics|revision history|mechanical, packaging, and orderable information|package outline|example board layout|example stencil design|important notice|disclaimer|application and implementation|power supply recommendations|layout|documentation support|support resources|trademarks|glossary)\b/i;
const HIGHLIGHT_CORE_PARAMETER_IDS = new Set([
  "working_temperature",
  "input_voltage",
  "supply_voltage",
  "output_voltage",
  "current",
  "output_current",
  "power",
  "noise",
  "psrr",
  "dropout_voltage",
  "reference_voltage",
  "accuracy",
  "resolution",
  "frequency",
  "efficiency",
]);
const HIGHLIGHT_SUPPORT_PARAMETER_IDS = new Set(["package", "pinout", "interface"]);
const HIGHLIGHT_CORE_LABEL_PATTERN =
  /^(?:工作温度|输入电压|供电电压|输出电压|静态电流|输出电流|功耗|噪声|电源抑制比|压差|基准电压|精度|分辨率|频率|效率|封装|引脚定义|引脚配置|引脚功能|接口)$/i;
const HIGHLIGHT_ALLOW_EMPTY_VALUE_PATTERN = /^(?:封装|引脚定义|引脚配置|引脚功能|接口)$/i;
const HIGHLIGHT_TEST_CONDITION_PATTERN =
  /\b(?:ta|tj)\s*=\s*25\s*掳?c\b|unless otherwise noted|test conditions|vin\s*=|vout\s*=|iout\s*=|cin\s*=|cout\s*=/i;

function getStructuredPageText(structured, pageNumber) {
  return (
    structured?.pages?.find((page) => Number(page?.pageNumber) === Number(pageNumber))?.text
    || ""
  );
}

function isNoiseHighlight(item, structured) {
  const label = String(item?.label || "").trim();
  const value = String(item?.value || "").trim();
  const text = String(item?.text || "").trim();
  const haystack = `${label} ${value} ${text}`.trim();
  const pageText = getStructuredPageText(structured, item?.pageNumber);
  const parameterId = String(item?.parameterId || "").trim();

  if (!haystack) {
    return true;
  }

  if (parameterId === "generic") {
    return true;
  }

  if (label.length === 1 && /^[A-Za-z]$/.test(label)) {
    return true;
  }

  if (HIGHLIGHT_NOISE_LABEL_PATTERN.test(label) || HIGHLIGHT_NOISE_TEXT_PATTERN.test(haystack)) {
    return true;
  }

  if (HIGHLIGHT_NON_SPEC_PAGE_PATTERN.test(pageText)) {
    return true;
  }

  if (!value && !HIGHLIGHT_ALLOW_EMPTY_VALUE_PATTERN.test(label)) {
    return true;
  }

  if (
    /^(?:工作温度|频率|功耗|输出电压)$/i.test(label)
    && HIGHLIGHT_TEST_CONDITION_PATTERN.test(text)
    && !/(?:[-~]|to|至|±|\b(?:mV|V|nA|uA|mA|A|nW|uW|mW|W|Hz|kHz|MHz|GHz|%|ppm|LSB|bit|bits|°C|C)\b)/i.test(value)
  ) {
    return true;
  }

  return false;
}

function getHighlightPriorityScore(item, structured) {
  const label = String(item?.label || "").trim();
  const value = String(item?.value || "").trim();
  const text = String(item?.text || "").trim();
  const pageText = getStructuredPageText(structured, item?.pageNumber);
  const parameterId = String(item?.parameterId || "").trim();
  let score = (Number(item?.importance) || 0) * 12 + (Number(item?.score) || 0) * 3;

  if (value) {
    score += 20;
  }

  if (HIGHLIGHT_CORE_PARAMETER_IDS.has(parameterId)) {
    score += 36;
  } else if (HIGHLIGHT_SUPPORT_PARAMETER_IDS.has(parameterId)) {
    score += 18;
  } else if (parameterId) {
    score -= 16;
  }

  if (/\b(?:features|specifications|electrical characteristics|recommended operating conditions|absolute maximum ratings|thermal information|package information|pin functions)\b/i.test(pageText)) {
    score += 14;
  }

  if (parameterId === "pinout") {
    if (/\b(?:pin\s*(?:configuration|functions?|description|assignment)|terminal functions?)\b|引脚配置|引脚功能|管脚配置|管脚功能/i.test(pageText)) {
      score += 40;
    }
    if (/\b(?:functional block|block diagram)\b|方框图|内部方框图/i.test(pageText)) {
      score -= 34;
    }
  }

  if (/\b(?:absolute maximum ratings)\b/i.test(pageText) && ["input_voltage", "supply_voltage", "output_voltage"].includes(parameterId)) {
    score -= 12;
  }

  if (/\b(?:detailed description|application|typical characteristics)\b/i.test(pageText)) {
    score -= 12;
  }

  if (HIGHLIGHT_TEST_CONDITION_PATTERN.test(text)) {
    score -= 18;
  }

  if (text.length > 140) {
    score -= 6;
  }

  return score;
}

function selectFinalHighlights(modelHighlights, structured, limit = DISPLAY_HIGHLIGHT_LIMIT) {
  const primary = [...(modelHighlights || [])];
  const fallback = (structured?.candidates || []).map((candidate) =>
    candidateToHighlight(candidate)
  );
  const combined = [...primary, ...fallback]
    .filter((item) => !isNoiseHighlight(item, structured))
    .sort((left, right) => {
      const priorityDiff = getHighlightPriorityScore(right, structured) - getHighlightPriorityScore(left, structured);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      if ((Number(right?.importance) || 0) !== (Number(left?.importance) || 0)) {
        return (Number(right?.importance) || 0) - (Number(left?.importance) || 0);
      }
      if ((Number(right?.score) || 0) !== (Number(left?.score) || 0)) {
        return (Number(right?.score) || 0) - (Number(left?.score) || 0);
      }
      return (Number(left?.pageNumber) || 0) - (Number(right?.pageNumber) || 0);
    });
  const selected = [];
  const seen = new Set();
  const pageCounts = new Map();
  const labelCounts = new Map();

  const passes = [
    { uniquePage: true, maxPerPage: 1, maxPerLabel: 1 },
    { uniquePage: false, maxPerPage: 2, maxPerLabel: 1 },
    { uniquePage: false, maxPerPage: 2, maxPerLabel: 2 },
    { uniquePage: false, maxPerPage: 3, maxPerLabel: 3 },
    { uniquePage: false, maxPerPage: 4, maxPerLabel: 3 },
    { uniquePage: false, maxPerPage: Number.POSITIVE_INFINITY, maxPerLabel: Number.POSITIVE_INFINITY },
  ];

  for (const pass of passes) {
    for (const item of combined) {
      if (selected.length >= limit) {
        return selected.slice(0, limit);
      }

      const dedupeKey = createHighlightDedupeKey(item);
      if (seen.has(dedupeKey)) {
        continue;
      }

      const pageNumber = Number(item?.pageNumber) || 0;
      const labelKey = String(item?.label || item?.parameterId || "").trim().toLowerCase() || "parameter";
      const pageCount = pageCounts.get(pageNumber) || 0;
      const labelCount = labelCounts.get(labelKey) || 0;

      if (pass.uniquePage && pageCounts.has(pageNumber)) {
        continue;
      }
      if (pageCount >= pass.maxPerPage) {
        continue;
      }
      if (labelCount >= pass.maxPerLabel) {
        continue;
      }

      selected.push(item);
      seen.add(dedupeKey);
      pageCounts.set(pageNumber, pageCount + 1);
      labelCounts.set(labelKey, labelCount + 1);
    }
  }

  return selected.slice(0, limit);
}

async function buildPdfExtractionPrompt(structured) {
  const parseSpec = await loadPdfParseSkillSpec();
  const candidates = selectPromptCandidates(structured, 96);
  const promptPages = selectPromptPages(structured, 5);
  const pageExcerpts = promptPages
    .map((page) =>
      page?.text
        ? `第 ${page.pageNumber} 页节选：\n${truncateText(page.text, 720)}`
        : ""
    )
    .filter(Boolean);
  const promptPageNumbers = new Set(promptPages.map((page) => page.pageNumber));
  const groupedCandidates = [];

  promptPages.forEach((page) => {
    const pageCandidates = candidates.filter((candidate) => candidate.pageNumber === page.pageNumber).slice(0, 10);
    if (!pageCandidates.length) {
      return;
    }

    groupedCandidates.push(
      `第 ${page.pageNumber} 页候选参数：\n${pageCandidates
        .map((candidate) => {
          const hint =
            candidate.labelHint && candidate.labelHint !== "Parameter"
              ? ` | hint=${candidate.labelHint}${candidate.valueHint ? ` | valueHint=${candidate.valueHint}` : ""}`
              : candidate.valueHint
                ? ` | valueHint=${candidate.valueHint}`
                : "";
          return `${candidate.id} | parameterId=${candidate.parameterId} | page=${candidate.pageNumber} | score=${candidate.score}${hint} | text=${truncateText(candidate.text, 220)}`;
        })
        .join("\n")}`
    );
  });

  const remainingCandidates = candidates
    .filter((candidate) => !promptPageNumbers.has(candidate.pageNumber))
    .slice(0, 16);
  if (remainingCandidates.length) {
    groupedCandidates.push(
      `其他页面候选参数：\n${remainingCandidates
        .map((candidate) => {
          const hint =
            candidate.labelHint && candidate.labelHint !== "Parameter"
              ? ` | hint=${candidate.labelHint}${candidate.valueHint ? ` | valueHint=${candidate.valueHint}` : ""}`
              : candidate.valueHint
                ? ` | valueHint=${candidate.valueHint}`
                : "";
          return `${candidate.id} | parameterId=${candidate.parameterId} | page=${candidate.pageNumber} | score=${candidate.score}${hint} | text=${truncateText(candidate.text, 220)}`;
        })
        .join("\n")}`
    );
  }

  return [
    "你在做 PDF datasheet 参数提取。",
    "下面的 candidate 已经由后端按 page/block/column 拆好。",
    "请严格遵循下面这份 chip-pdf-parse-spec 规范：",
    parseSpec,
    "必须只返回严格 JSON，不要 markdown，不要解释，不要代码块。",
    "返回格式：",
    '{"title":"文档标题","summary":"一句话参数摘要","parameters":[{"label":"参数名","value":"参数值","sourceId":"cand-1","text":"参数说明","importance":5}]}',
    "要求：",
    "- sourceId 必须从候选列表里选择。",
    "- label 必须使用简体中文。",
    "- summary 必须使用简体中文。",
    "- value 尽量只保留参数值本身，保留单位。",
    "- text 用简体中文概括原文重点，不要直接返回英文整句。",
    "- 最多返回 10 条最关键参数。",
    `文档标题候选：${structured.title}`,
    pageExcerpts.join("\n\n"),
    "候选列表：",
    groupedCandidates.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeModelPdfAnalysis(modelResponse, structured) {
  const sourceLookup = new Map(structured.candidates.map((candidate) => [candidate.id, candidate]));
  const rawParameters = Array.isArray(modelResponse?.parameters)
    ? modelResponse.parameters
    : Array.isArray(modelResponse?.highlights)
      ? modelResponse.highlights
      : [];

  const highlights = [];
  const seen = new Set();

  rawParameters.forEach((item, index) => {
    const sourceId = typeof item?.sourceId === "string" ? item.sourceId.trim() : "";
    const candidate = sourceLookup.get(sourceId);

    if (!candidate) {
      return;
    }

    const importance = Number.isFinite(item?.importance) ? item.importance : 0;
    const label = translateLabel(candidate.labelHint, candidate.parameterId);
    const value = candidate.valueHint || "";
    const text = candidate.text;
    const dedupeKey = `${candidate.id}::${label}::${value || text}`.toLowerCase();

    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    highlights.push({
      ...candidateToHighlight(candidate),
      importance,
      sortIndex: index,
    });
  });

  highlights.sort((left, right) => {
    if (right.importance !== left.importance) {
      return right.importance - left.importance;
    }
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    return left.sortIndex - right.sortIndex;
  });

  const finalHighlights = selectStructuredHighlights(
    structured,
    12,
    highlights.map((item) => item.id)
  );
  const modelSummary =
    typeof modelResponse?.summary === "string" && modelResponse.summary.trim()
      ? modelResponse.summary.trim()
      : "";
  const originalPageCount = new Set(highlights.map((item) => item.pageNumber)).size;
  const finalPageCount = new Set(finalHighlights.map((item) => item.pageNumber)).size;
  const summary = truncateText(
    modelSummary && finalPageCount <= Math.max(originalPageCount, 1)
      ? modelSummary
      : buildSummaryFromHighlights(
          finalHighlights,
          truncateText(structured.pages[0]?.text || "未检测到可提取的文本，可能是扫描件。", 200)
        ),
    240
  );
  const normalizedSummary = truncateText(
    buildSummaryFromHighlights(
      finalHighlights,
      truncateText(structured.pages[0]?.text || "未检测到可提取的文本，可能是扫描件。", 200)
    ),
    240
  );

  return {
    usedOpenClaw: true,
    title:
      typeof modelResponse?.title === "string" && modelResponse.title.trim()
        ? modelResponse.title.trim()
        : structured.title,
    summary: normalizedSummary,
    highlights: finalHighlights.map(({ sortIndex, ...item }) => item),
  };
}

async function analyzeStructuredPdfWithOpenClaw(structured, agentId = "", engineMode = "ollama", sessionRef = null) {
  if (!structured.candidates.length) {
    return buildFallbackPdfAnalysis(structured);
  }

  const extractionPrompt = await buildPdfExtractionPrompt(structured);

  if (shouldUseFastOllama(engineMode)) {
    try {
      const assistantText = await generateWithFastOllama(
        [
          "/no_think",
          extractionPrompt,
          "只返回一个 JSON 对象，不要输出解释、思考过程或 Markdown 代码块。",
        ].join("\n\n"),
        {
          format: "json",
          numPredict: FAST_OLLAMA_PDF_TOKENS,
          timeoutMs: FAST_OLLAMA_PDF_TIMEOUT_MS,
        }
      );
      const parsed = parseLooseJson(assistantText);
      if (parsed) {
        const normalized = normalizeModelPdfAnalysis(parsed, structured);
        if (normalized.highlights.length) {
          return {
            ...normalized,
            usedOpenClaw: false,
          };
        }
      }
    } catch (error) {
      console.warn(
        `${CLOUD_AI_ENABLED ? "CloudBase AI" : "Fast Ollama"} PDF analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (OLLAMA_ONLY_MODE) {
    return buildFallbackPdfAnalysis(structured);
  }

  const requestAgentId = agentId || "web";
  const analysisSessionRef = createDerivedSessionRef(requestAgentId, sessionRef, "pdf-analyze");

  try {
    const { assistantText } = await requestOpenClawAgentText({
      agentId: requestAgentId,
      sessionRef: analysisSessionRef,
      message: [
        extractionPrompt,
        "只返回一个 JSON 对象，不要输出解释、思考过程或 Markdown 代码块。",
      ].join("\n\n"),
      timeoutMs: OPENCLAW_PDF_TIMEOUT_MS,
      idempotencyKeyPrefix: "pdf-analyze",
    });
    const parsed = parseLooseJson(assistantText);

    if (!parsed) {
      return buildFallbackPdfAnalysis(structured);
    }

    const normalized = normalizeModelPdfAnalysis(parsed, structured);
    if (!normalized.highlights.length) {
      return buildFallbackPdfAnalysis(structured);
    }

    return normalized;
  } catch {
    return buildFallbackPdfAnalysis(structured);
  }
}

async function localizePdfAnalysis(analysis, agentId = "", sessionRef = null) {
  if (!needsPdfAnalysisLocalization(analysis)) {
    return analysis;
  }

  const fallbackAnalysis = localizePdfAnalysisFallback(analysis);
  if (!PDF_LOCALIZATION_AI_ENABLED) {
    return fallbackAnalysis;
  }

  if (OLLAMA_ONLY_MODE) {
    try {
      const assistantText = await generateWithFastOllama(buildPdfLocalizationPrompt(analysis), {
        format: "json",
        numPredict: 1200,
        timeoutMs: Math.min(30000, FAST_OLLAMA_PDF_TIMEOUT_MS),
      });
      const parsed = parseLooseJson(assistantText);
      return applyLocalizedPdfAnalysis(fallbackAnalysis, parsed);
    } catch {
      return fallbackAnalysis;
    }
  }

  const requestAgentId = agentId || "web";
  const localizationSessionRef = createDerivedSessionRef(requestAgentId, sessionRef, "pdf-localize");

  try {
    const { assistantText } = await requestOpenClawAgentText({
      agentId: requestAgentId,
      sessionRef: localizationSessionRef,
      message: buildPdfLocalizationPrompt(analysis),
      timeoutMs: 30000,
      idempotencyKeyPrefix: "pdf-localize",
    });
    const parsed = parseLooseJson(assistantText);

    return applyLocalizedPdfAnalysis(fallbackAnalysis, parsed);
  } catch {
    return fallbackAnalysis;
  }
}

async function parseJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function handleStatus(_request, response) {
  try {
    if (OLLAMA_ONLY_MODE) {
      if (CLOUD_AI_ENABLED) {
        sendJson(response, 200, {
          ok: true,
          transport: "cloudbase-ai",
          engineMode: "cloudbase",
          gatewayUrl: null,
          handshakeComplete: false,
          hello: null,
          defaultAgentId: "cloudbase",
          model: CLOUD_AI_MODEL,
          primaryModel: `${CLOUD_AI_PROVIDER}/${CLOUD_AI_MODEL}`,
          heartbeatModel: null,
          fallbackModels: [],
          cloudBaseEnvId: CLOUD_AI_ENV_ID || null,
          agents: [
            {
              agentId: "cloudbase",
              name: "CloudBase AI",
              isDefault: true,
              model: CLOUD_AI_MODEL,
              primaryModel: `${CLOUD_AI_PROVIDER}/${CLOUD_AI_MODEL}`,
              heartbeatModel: null,
              fallbackModels: [],
            },
          ],
        });
        return;
      }

      const ollama = await checkOllamaStatus();
      sendJson(response, ollama.ok ? 200 : 500, {
        ok: ollama.ok,
        transport: "ollama-local",
        engineMode: "ollama",
        gatewayUrl: null,
        handshakeComplete: false,
        hello: null,
        defaultAgentId: "local",
        model: FAST_OLLAMA_MODEL,
        primaryModel: `ollama/${FAST_OLLAMA_MODEL}`,
        heartbeatModel: null,
        fallbackModels: [],
        ollamaBaseUrl: FAST_OLLAMA_BASE_URL,
        ollamaModels: ollama.models,
        hasConfiguredModel: ollama.hasConfiguredModel,
        agents: [
          {
            agentId: "local",
            name: "Ollama Local",
            isDefault: true,
            model: FAST_OLLAMA_MODEL,
            primaryModel: `ollama/${FAST_OLLAMA_MODEL}`,
            heartbeatModel: null,
            fallbackModels: [],
          },
        ],
        ...(ollama.error ? { error: ollama.error } : {}),
      });
      return;
    }

    const gateway = getGatewayBridge();
    const health = await gateway.request("health", {}, { connectTimeoutMs: 40000 });
    const configSummary = await loadOpenClawConfigSummary();
    const agents = Array.isArray(health?.agents)
      ? health.agents.map((agent) => ({
          agentId: agent?.agentId || "",
          name: agent?.name || agent?.agentId || "",
          isDefault: Boolean(agent?.isDefault),
          model:
            configSummary?.agents?.[agent?.agentId || ""]?.primaryModel
            || configSummary?.defaultPrimaryModel
            || agent?.heartbeat?.model
            || null,
          primaryModel:
            configSummary?.agents?.[agent?.agentId || ""]?.primaryModel
            || configSummary?.defaultPrimaryModel
            || null,
          heartbeatModel:
            configSummary?.agents?.[agent?.agentId || ""]?.heartbeatModel
            || configSummary?.defaultHeartbeatModel
            || agent?.heartbeat?.model
            || null,
          fallbackModels:
            configSummary?.agents?.[agent?.agentId || ""]?.fallbackModels
            || configSummary?.defaultFallbackModels
            || [],
        }))
      : [];

    sendJson(response, 200, {
      ok: Boolean(health?.ok),
      transport: "gateway-websocket",
      gatewayUrl: OPENCLAW_GATEWAY_URL,
      handshakeComplete: Boolean(gateway.lastHello),
      hello: gateway.lastHello || null,
      defaultAgentId: health?.defaultAgentId || "main",
      primaryModel: configSummary?.defaultPrimaryModel || null,
      heartbeatModel: configSummary?.defaultHeartbeatModel || null,
      fallbackModels: configSummary?.defaultFallbackModels || [],
      agents,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to check model service.",
    });
  }
}

async function handleChat(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
    const engineMode = normalizeEngineMode(payload.engineMode);
    const resolvedAgentId = agentId || "main";
    const timeoutSeconds = Number.isFinite(payload.timeoutSeconds)
      ? Math.max(15, Math.min(600, Math.floor(payload.timeoutSeconds)))
      : 180;

    if (!message) {
      sendJson(response, 400, {
        ok: false,
        error: "Message is required.",
      });
      return;
    }

    const sessionRef = resolveSessionReference(payload, resolvedAgentId);
    await ensureSessionMemorySession(sessionRef, resolvedAgentId, {
      title: payload?.pdfContext?.title || "",
      fileName: payload?.pdfContext?.fileName || "",
      summary: payload?.pdfContext?.summary || "",
    });
    const storedPdfContext = await loadSessionMemoryContext(sessionRef);
    const mergedPdfContext = mergePdfContexts(payload.pdfContext, storedPdfContext);
    const finalMessage = buildPdfAwareMessage(
      message,
      mergedPdfContext,
      sessionRef.sessionKey || sessionRef.useLegacySessionId ? [] : payload.chatHistory
    );

    if (shouldUseFastOllama(engineMode)) {
      try {
        const assistantText = await generateWithFastOllama(
          [
            "/no_think",
            "请用中文简洁回答。不要输出思考过程；如果问题涉及 PDF 参数，优先依据下方上下文回答。",
            finalMessage,
          ].join("\n\n"),
          {
            numPredict: FAST_OLLAMA_CHAT_TOKENS,
            timeoutMs: Math.min(timeoutSeconds * 1000, FAST_OLLAMA_CHAT_TIMEOUT_MS),
          }
        );
        if (assistantText) {
          printTerminalAssistantReply(assistantText, {
            engineMode,
            transport: CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-fast",
            agentId: resolvedAgentId,
            sessionId: sessionRef.sessionId,
            sessionKey: sessionRef.sessionKey || "",
            provider: CLOUD_AI_ENABLED ? CLOUD_AI_PROVIDER : "ollama",
            model: CLOUD_AI_ENABLED ? CLOUD_AI_MODEL : FAST_OLLAMA_MODEL,
          });
          sendJson(response, 200, {
            ok: true,
            transport: CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-fast",
            sessionId: sessionRef.sessionId,
            sessionKey: sessionRef.sessionKey || null,
            gatewaySessionId: null,
            agentId: resolvedAgentId,
            engineMode,
            assistantText,
          });
          return;
        }
      } catch (error) {
        console.warn(
          `${CLOUD_AI_ENABLED ? "CloudBase AI" : "Fast Ollama"} chat failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (OLLAMA_ONLY_MODE) {
      sendJson(response, 502, {
        ok: false,
        transport: CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-local",
        engineMode,
        sessionId: sessionRef.sessionId,
        sessionKey: null,
        gatewaySessionId: null,
        agentId: resolvedAgentId,
        error: CLOUD_AI_ENABLED
          ? `CloudBase AI did not return a usable reply. Please check model "${CLOUD_AI_MODEL}" and CloudBase runtime credentials.`
          : `Ollama local model did not return a usable reply. Please check that Ollama is running and model "${FAST_OLLAMA_MODEL}" is available.`,
      });
      return;
    }

    const { assistantText, gatewaySessionId, provider, model } = await requestOpenClawAgentText({
      agentId: resolvedAgentId,
      sessionRef,
      message: finalMessage,
      timeoutMs: Math.min(timeoutSeconds * 1000, OPENCLAW_CHAT_TIMEOUT_MS),
      idempotencyKeyPrefix: "chat",
    });

    printTerminalAssistantReply(assistantText, {
      engineMode,
            transport: "gateway-websocket",
      agentId: resolvedAgentId,
      sessionId: sessionRef.sessionId,
      sessionKey: sessionRef.sessionKey || "",
      provider,
      model,
    });

    sendJson(response, 200, {
      ok: true,
      transport: "gateway-websocket",
      sessionId: sessionRef.sessionId,
      sessionKey: sessionRef.sessionKey || null,
      gatewaySessionId: gatewaySessionId || null,
      agentId: resolvedAgentId,
      engineMode,
      assistantText,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "OpenClaw request failed.",
    });
  }
}

async function handleTraceLog(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
    const resolvedAgentId = agentId || "main";
    const tracePageLogPayload = extractTracePageLogPayload(payload.pdfContext);

    if (!tracePageLogPayload) {
      sendJson(response, 400, {
        ok: false,
        error: "No trace payload could be derived from the current PDF context.",
      });
      return;
    }

    const traceText = await buildOllamaTraceDisplay(tracePageLogPayload);
    console.log(traceText);

    const sessionRef = resolveSessionReference(payload, resolvedAgentId);

    sendJson(response, 200, {
      ok: true,
      transport: CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-local",
      sessionId: sessionRef.sessionId,
      sessionKey: null,
      gatewaySessionId: null,
      agentId: resolvedAgentId,
      tracePayload: tracePageLogPayload,
      traceText,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create trace log.",
    });
  }
}

async function handleSessionReset(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : "main";
    const sessionId = normalizeRequestedSessionId(payload.sessionId) || createSessionId();
    const sessionKey = buildGatewaySessionKey(agentId, sessionId);

    if (OLLAMA_ONLY_MODE) {
      await ensureSessionMemorySession(
        { sessionId, sessionKey: "", useLegacySessionId: true },
        agentId
      );
      await appendStageLog({
        sessionKey: "",
        sessionId,
        agentId,
        phase: "session_reset",
        status: "completed",
        message: CLOUD_AI_ENABLED ? "CloudBase AI 会话已初始化" : "本地 Ollama 会话已初始化",
      });

      sendJson(response, 200, {
        ok: true,
        transport: CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-local",
        key: null,
        sessionId,
        sessionKey: null,
        gatewaySessionId: null,
        agentId,
      });
      return;
    }

    const gateway = getGatewayBridge();
    const result = await gateway.request(
      "sessions.reset",
      {
        key: sessionKey,
      },
      { connectTimeoutMs: 30000 }
    );
    await ensureSessionMemorySession(
      { sessionId, sessionKey, useLegacySessionId: false },
      agentId
    );
    await appendStageLog({
      sessionKey,
      sessionId,
      agentId,
      phase: "session_reset",
      status: "completed",
      message: "会话已初始化",
    });

    sendJson(response, 200, {
      ok: true,
      transport: "gateway-websocket",
      key: result?.key || sessionKey,
      sessionId,
      sessionKey,
      gatewaySessionId: result?.entry?.sessionId || null,
      agentId,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reset session.",
    });
  }
}

function normalizeHistoryRole(value = "") {
  if (["user", "assistant", "system"].includes(value)) {
    return value;
  }

  if (value === "model") {
    return "assistant";
  }

  return "";
}

function isTraceAssistantMessageText(value = "") {
  return /^\[PDF重要参数溯源\]/.test(String(value || "").trim());
}

function getHistoryTimestampMs(message) {
  const rawValue =
    typeof message?.timestamp === "string" ? message.timestamp
    : typeof message?.createdAt === "string" ? message.createdAt
    : "";
  const timestampMs = Date.parse(rawValue);
  return Number.isFinite(timestampMs) ? timestampMs : 0;
}

function collectVisibleHistoryText(value, parts = []) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      parts.push(text);
    }
    return parts;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectVisibleHistoryText(item, parts));
    return parts;
  }

  if (!value || typeof value !== "object") {
    return parts;
  }

  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : "";
  if (type === "thinking") {
    return parts;
  }

  if (typeof value.text === "string") {
    const text = value.text.trim();
    if (text) {
      parts.push(text);
    }
    return parts;
  }

  if (typeof value.content === "string") {
    const text = value.content.trim();
    if (text) {
      parts.push(text);
    }
    return parts;
  }

  if (Array.isArray(value.content)) {
    value.content.forEach((item) => collectVisibleHistoryText(item, parts));
    return parts;
  }

  if (value.message && typeof value.message === "object") {
    collectVisibleHistoryText(value.message, parts);
  }

  return parts;
}

function extractHistoryMessageText(message) {
  const text = uniqueList(collectVisibleHistoryText(message))
    .join("\n\n")
    .replace(/<\/?final>/gi, "")
    .trim();
  return truncateText(text, 6000);
}

function normalizeGatewayHistoryMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages
    .map((item) => {
      const role = normalizeHistoryRole(typeof item?.role === "string" ? item.role : "");
      const content = extractHistoryMessageText(item);

      if (!role || !content) {
        return null;
      }

      if (role === "assistant" && isTraceAssistantMessageText(content)) {
        return null;
      }

      return {
        role,
        content,
        timestamp:
          typeof item?.timestamp === "string" ? item.timestamp
          : typeof item?.createdAt === "string" ? item.createdAt
          : new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function getLatestHistoryAssistantSnapshot(rawMessages, baselineTimestampMs = 0) {
  const normalizedMessages = normalizeGatewayHistoryMessages(rawMessages);
  let selected = null;

  normalizedMessages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }

    const text = stripThinkingText(message.content || "").trim();
    const timestampMs = getHistoryTimestampMs(message);
    if (!text || isOpenClawAckText(text) || isTraceAssistantMessageText(text)) {
      return;
    }
    if (timestampMs < baselineTimestampMs) {
      return;
    }
    if (!selected || timestampMs >= selected.timestampMs) {
      selected = {
        text,
        timestampMs,
      };
    }
  });

  return selected;
}

async function waitForOpenClawHistoryAssistantSnapshot(sessionKey, baselineTimestampMs, timeoutMs) {
  const gateway = getGatewayBridge();
  const startedAtMs = Date.now();
  const effectiveTimeoutMs = Math.max(5000, Number(timeoutMs) || OPENCLAW_CHAT_TIMEOUT_MS);
  let lastError = null;

  while (Date.now() - startedAtMs < effectiveTimeoutMs) {
    try {
      const result = await gateway.request(
        "chat.history",
        {
          sessionKey,
          limit: 40,
        },
        {
          connectTimeoutMs: 5000,
          requestOptions: { timeoutMs: 5000 },
        }
      );
      const snapshot = getLatestHistoryAssistantSnapshot(
        result?.messages,
        baselineTimestampMs
      );
      if (snapshot?.text) {
        return {
          assistantText: snapshot.text,
          gatewaySessionId: typeof result?.sessionId === "string" ? result.sessionId : "",
          sessionKey,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await sleep(OPENCLAW_SESSION_POLL_MS);
  }

  if (lastError) {
    throw new Error(`OpenClaw history polling timed out: ${lastError.message}`);
  }

  throw new Error(`OpenClaw history polling timed out after ${effectiveTimeoutMs}ms.`);
}

async function handleSessionHistory(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : "main";
    const resolved = resolveSessionReference(payload, agentId);

    if (!resolved.sessionKey) {
      sendJson(response, 400, {
        ok: false,
        error: "This history entry cannot be mapped to a live OpenClaw session.",
      });
      return;
    }

    const limit = Number.isFinite(payload.limit)
      ? Math.max(1, Math.min(200, Math.floor(payload.limit)))
      : 120;
    const gateway = getGatewayBridge();
    const result = await gateway.request(
      "chat.history",
      {
        sessionKey: resolved.sessionKey,
        limit,
      },
      { connectTimeoutMs: 30000 }
    );

    sendJson(response, 200, {
      ok: true,
      transport: "gateway-websocket",
      sessionId: resolved.sessionId,
      sessionKey: resolved.sessionKey,
      gatewaySessionId: typeof result?.sessionId === "string" ? result.sessionId : null,
      messages: normalizeGatewayHistoryMessages(result?.messages),
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load session history.",
    });
  }
}

async function handleSessionMemory(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : "main";
    const resolved = resolveSessionReference(payload, agentId);

    if (!resolved.sessionKey) {
      sendJson(response, 400, {
        ok: false,
        error: "This session cannot be mapped to a stored memory record.",
      });
      return;
    }

    const memory = await loadSessionMemoryContext(resolved);
    sendJson(response, 200, {
      ok: true,
      sessionId: resolved.sessionId,
      sessionKey: resolved.sessionKey,
      memory,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load session memory.",
    });
  }
}

async function handleSessionStageLogs(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : "main";
    const resolved = resolveSessionReference(payload, agentId);

    if (!resolved.sessionKey) {
      sendJson(response, 400, {
        ok: false,
        error: "This session cannot be mapped to stored stage logs.",
      });
      return;
    }

    const limit = Number.isFinite(payload.limit)
      ? Math.max(1, Math.min(200, Math.floor(payload.limit)))
      : 80;
    const logs = await loadSessionStageLogs(resolved, limit);
    sendJson(response, 200, {
      ok: true,
      sessionId: resolved.sessionId,
      sessionKey: resolved.sessionKey,
      logs,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load session stage logs.",
    });
  }
}

async function handlePdfAnalyze(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const dataBase64 = typeof payload.dataBase64 === "string" ? payload.dataBase64.trim() : "";
    const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
    const engineMode = normalizeEngineMode(payload.engineMode);
    const resolvedAgentId = agentId || "web";

    if (!fileName || !dataBase64) {
      sendJson(response, 400, {
        ok: false,
        error: "fileName and dataBase64 are required.",
      });
      return;
    }

    const sessionRef = resolveSessionReference(payload, resolvedAgentId);
    await ensureSessionMemorySession(sessionRef, resolvedAgentId, {
      fileName,
      title: safeFileName(fileName).replace(/\.pdf$/i, ""),
    });
    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length) {
      sendJson(response, 400, {
        ok: false,
        error: "Invalid PDF payload.",
      });
      return;
    }

    await appendStageLog({
      sessionKey: sessionRef.sessionKey || "",
      sessionId: sessionRef.sessionId || "",
      agentId: resolvedAgentId,
      phase: "pdf_upload_received",
      status: "completed",
      message: "收到 PDF 解析请求",
      detail: {
        fileName: safeFileName(fileName),
        sizeBytes: buffer.length,
      },
      fileName: safeFileName(fileName),
    });

    const structured = await runSessionStage({
      sessionRef,
      agentId: resolvedAgentId,
      phase: "pdf_parse",
      startedMessage: "开始 PDF 结构解析",
      completedMessage: "PDF 结构解析完成",
      startDetail: {
        fileName: safeFileName(fileName),
        sizeBytes: buffer.length,
      },
      completeDetail: (result) => ({
        pageCount: Number(result?.pageCount) || 0,
        candidateCount: Array.isArray(result?.candidates) ? result.candidates.length : 0,
      }),
      sessionMeta: {
        fileName: safeFileName(fileName),
      },
      run: () => parsePdfStructure(buffer, fileName),
    });
    const analysis = await runSessionStage({
      sessionRef,
      agentId: resolvedAgentId,
      phase: "semantic_extract",
      startedMessage: "开始关键参数抽取",
      completedMessage: "关键参数抽取完成",
      startDetail: {
        fileName: structured.fileName,
        pageCount: structured.pageCount,
        candidateCount: Array.isArray(structured.candidates) ? structured.candidates.length : 0,
      },
      completeDetail: (result) => ({
        highlightCount: Array.isArray(result?.highlights) ? result.highlights.length : 0,
        usedOpenClaw: result?.usedOpenClaw === true,
        engine: OLLAMA_ONLY_MODE ? (CLOUD_AI_ENABLED ? "cloudbase" : "ollama") : engineMode,
      }),
      sessionMeta: {
        title: structured.title,
        fileName: structured.fileName,
      },
      run: async () => localizePdfAnalysis(
        await analyzeStructuredPdfWithOpenClaw(structured, resolvedAgentId, engineMode, sessionRef),
        resolvedAgentId,
        sessionRef
      ),
    });
    const memoryPayload = buildSessionMemoryAnalysisPayload(structured, analysis);
    let memoryPersisted = false;
    try {
      await runSessionStage({
        sessionRef,
        agentId: resolvedAgentId,
        phase: "memory_upsert",
        startedMessage: "开始会话记忆落库",
        completedMessage: "会话记忆落库完成",
        startDetail: {
          fileName: memoryPayload.fileName,
          parameterCount: memoryPayload.parameters.length,
          pageCount: memoryPayload.pageCount,
        },
        completeDetail: (result) => ({
          storedParameters: Number(result?.storedParameters) || memoryPayload.parameters.length,
          storedPageSamples: Number(result?.storedPageSamples) || memoryPayload.pageSamples.length,
        }),
        sessionMeta: {
          title: memoryPayload.title,
          fileName: memoryPayload.fileName,
          summary: memoryPayload.summary,
        },
        run: async () => {
          const result = await requestSessionMemoryStore("upsert_analysis", {
            sessionKey: sessionRef.sessionKey,
            sessionId: sessionRef.sessionId,
            agentId: resolvedAgentId,
            ...memoryPayload,
          });
          memoryPersisted = true;
          return result;
        },
      });
    } catch (error) {
      memoryPersisted = false;
      console.warn(`Session memory upsert skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    sendJson(response, 200, {
      ok: true,
      transport: OLLAMA_ONLY_MODE
        ? (CLOUD_AI_ENABLED ? "cloudbase-ai" : "ollama-local")
        : "gateway-websocket",
      sessionId: sessionRef.sessionId,
      sessionKey: OLLAMA_ONLY_MODE ? null : (sessionRef.sessionKey || null),
      gatewaySessionId: null,
      agentId: resolvedAgentId,
      engineMode,
      usedOpenClaw: analysis.usedOpenClaw,
      memoryPersisted,
      analysis: {
        title: analysis.title,
        summary: analysis.summary,
        fileName: structured.fileName,
        pageCount: structured.pageCount,
        pages: structured.pages,
        highlights: analysis.highlights,
      },
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "PDF analysis failed.",
    });
  }
}

async function handleDomesticRecommend(request, response) {
  try {
    const payload = await parseJsonBody(request);
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : "main";
    const sessionRef = resolveSessionReference(payload, agentId);
    await ensureSessionMemorySession(sessionRef, agentId, {
      title: payload.title || "",
      fileName: payload.fileName || "",
      summary: payload.summary || "",
    });
    const parsed = await runSessionStage({
      sessionRef,
      agentId,
      phase: "recommend",
      startedMessage: "开始国产替代推荐",
      completedMessage: "国产替代推荐完成",
      startDetail: {
        title: truncateText(payload.title || payload.fileName || "", 120),
        highlightCount: Array.isArray(payload.highlights) ? payload.highlights.length : 0,
      },
      completeDetail: (result) => ({
        sourceCategory: result?.sourceCategory || "",
        candidateCount: Array.isArray(result?.candidates) ? result.candidates.length : 0,
      }),
      sessionMeta: {
        title: payload.title || "",
        fileName: payload.fileName || "",
        summary: payload.summary || "",
      },
      run: async () => {
        await ensureRecommendationDatabase();
        const result = await runPython(
          [RECOMMENDATION_QUERY_SCRIPT, RECOMMENDATION_DB_PATH],
          180000,
          {
            stdin: JSON.stringify(payload || {}),
          }
        );
        const parsedResult = parseLooseJson(result.stdout);
        if (!parsedResult) {
          throw new Error("Failed to parse recommendation response.");
        }
        return parsedResult;
      },
    });

    sendJson(response, 200, {
      ok: true,
      sessionId: sessionRef.sessionId,
      sessionKey: sessionRef.sessionKey || null,
      agentId,
      sourceCategory: parsed.sourceCategory || null,
      normalizedParams: Array.isArray(parsed.normalizedParams) ? parsed.normalizedParams : [],
      referenceSpecs: Array.isArray(parsed.referenceSpecs) ? parsed.referenceSpecs : [],
      referenceSpecScores: parsed.referenceSpecScores && typeof parsed.referenceSpecScores === "object"
        ? parsed.referenceSpecScores
        : {},
      baselineScores: parsed.baselineScores || null,
      thinking: Array.isArray(parsed.thinking) ? parsed.thinking : [],
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Domestic recommendation failed.",
    });
  }
}

function resolveStaticPath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const absolutePath = path.resolve(ROOT_DIR, `.${pathname}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return absolutePath;
}

async function serveStatic(request, response) {
  const absolutePath = resolveStaticPath(request.url || "/");

  if (!absolutePath) {
    sendJson(response, 403, { ok: false, error: "Forbidden." });
    return;
  }

  try {
    const stat = await fsp.stat(absolutePath);

    if (stat.isDirectory()) {
      const indexPath = path.join(absolutePath, "index.html");
      const buffer = await fsp.readFile(indexPath);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[".html"],
        "Content-Length": buffer.length,
        "Cache-Control": "no-store",
      });
      response.end(buffer);
      return;
    }

    const buffer = await fsp.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "Content-Length": buffer.length,
      "Cache-Control": "no-store",
    });
    response.end(buffer);
  } catch {
    sendJson(response, 404, { ok: false, error: "Not found." });
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { ok: false, error: "Missing URL." });
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/status")) {
    await handleStatus(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/gateway/browser-config")) {
    if (OLLAMA_ONLY_MODE) {
      sendJson(response, 410, {
        ok: false,
        error: "OpenClaw Gateway is disabled; this project is running in Ollama-only mode.",
      });
      return;
    }
    await handleGatewayBrowserConfig(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/chat")) {
    await handleChat(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/trace/log")) {
    await handleTraceLog(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/session/reset")) {
    await handleSessionReset(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/session/history")) {
    await handleSessionHistory(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/session/memory")) {
    await handleSessionMemory(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/session/logs")) {
    await handleSessionStageLogs(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/pdf/analyze")) {
    await handlePdfAnalyze(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/recommend/domestic")) {
    await handleDomesticRecommend(request, response);
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/export/purchase-package")) {
    await handlePurchasePackageExport(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { ok: false, error: "Method not allowed." });
});

server.listen(PORT, HOST, () => {
  console.log(`芯中有数运行于 http://${HOST}:${PORT}`);
  getLocalAccessUrls(PORT).forEach((url) => {
    console.log(`LAN access: ${url}`);
  });
  console.log(`Serving from ${ROOT_DIR}`);
  ensureRecommendationDatabase()
    .then(() => {
      console.log(`Recommendation DB ready at ${RECOMMENDATION_DB_PATH}`);
    })
    .catch((error) => {
      console.error(`Recommendation DB init failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  ensureSessionMemoryDatabase()
    .then(() => {
      console.log(`Review memory DB ready at ${SESSION_MEMORY_DB_PATH}`);
    })
    .catch((error) => {
      console.error(`Review memory DB init failed: ${error instanceof Error ? error.message : String(error)}`);
    });
});




