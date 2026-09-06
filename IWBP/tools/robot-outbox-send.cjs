/**
 * 本地机器人发群（不依赖领慧 Webhook 内存绑定）
 *
 * 从 data/robot-publish-config.json 读取 targetGroup.webhookUrl，
 * 轮询待发池 → 自定义机器人 Webhook 发群 → mark-pushed。
 *
 * 用法（需 start.bat 已启动）：
 *   node tools/robot-outbox-send.cjs --once
 *   node tools/robot-outbox-send.cjs --watch
 *
 * 与领慧定时任务二选一，避免重复发群。
 */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const url = require("url");
const { formatPeriodForecastMarkdown } = require("./robot-mention-resolver.cjs");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "robot-publish-config.json");
const LOG_PATH = path.join(ROOT, "data", "robot-outbox-send.log");
const MAX_LOG_BYTES = 512 * 1024;
const BASE = process.env.WORKBENCH_BASE || "http://127.0.0.1:8787";
const DEFAULT_POLL_SEC = 120;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY_MS = 2500;

function parseArgs(argv) {
  return {
    once: argv.includes("--once"),
    watch: argv.includes("--watch"),
    dryRun: argv.includes("--dry-run"),
  };
}

function ts() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
    const st = fs.statSync(LOG_PATH);
    if (st.size > MAX_LOG_BYTES) {
      const raw = fs.readFileSync(LOG_PATH, "utf8");
      fs.writeFileSync(LOG_PATH, raw.slice(-Math.floor(MAX_LOG_BYTES * 0.75)), "utf8");
    }
  } catch {
    /* ignore */
  }
}

function logLine(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  appendLog(line);
}

function logError(msg) {
  const line = `[${ts()}] [X] ${msg}`;
  console.error(line);
  appendLog(line);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`缺少配置文件: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function httpJson(method, pathname, bodyObj) {
  return new Promise((resolve, reject) => {
    const target = url.parse(BASE + pathname);
    const body = bodyObj ? JSON.stringify(bodyObj) : "";
    const opts = {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => {
        raw += c;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : {} });
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function postWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const target = url.parse(webhookUrl);
    const transport = target.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = transport.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function webhookSafeAlertText(text) {
  return String(text || "")
    .trim()
    .replace(/([\u4e00-\u9fff])\/([\u4e00-\u9fff])/g, "$1／$2")
    .replace(/机场/g, "机\u200c场");
}

function buildWebhookAlertContent(item) {
  return webhookSafeAlertText(item.text);
}

function buildWebhookPayload(item) {
  const kind = item.contentKind || item.type;
  const atUserIds = Array.isArray(item.atUserIds) ? item.atUserIds.filter(Boolean) : [];

  if (kind === "period") {
    const text = String(item.sendMarkdown || formatPeriodForecastMarkdown(item.text || "")).trim();
    return {
      msgtype: "markdown",
      markdown: { title: item.contentLabel || "时段预报", text },
      at: { isAtAll: false },
    };
  }

  const content =
    kind === "alert" || kind === "tc" ? buildWebhookAlertContent(item) : webhookSafeAlertText(item.text);
  const at = { isAtAll: false };
  if (atUserIds.length) at.atUserIds = atUserIds;
  return {
    msgtype: "text",
    text: { content },
    at,
  };
}

function webhookOk(res) {
  if (res.status !== 200) return false;
  const code = res.data?.errcode ?? res.data?.code;
  if (code === 0 || code === "0") return true;
  if (code == null && res.data?.ok === true) return true;
  return false;
}

function webhookErrorText(data) {
  if (!data) return "未知错误";
  if (typeof data === "string") return data;
  return String(data.errmsg || data.message || data.msg || JSON.stringify(data));
}

function isRetryableWebhookError(data, err) {
  const text = `${webhookErrorText(data)} ${err?.message || ""}`.toLowerCase();
  if (/内存|memory|quota|限流|频繁|timeout|timed out|econnreset|enotfound|socket hang up|503|502|504/.test(text)) {
    return true;
  }
  const code = data?.errcode ?? data?.code;
  if (code === -1 || code === "-1") return true;
  return false;
}

function formatWebhookFailure(data) {
  const raw = webhookErrorText(data);
  if (/内存|memory|quota/i.test(raw)) {
    return `${raw} → 丰声/平台侧暂时受限；待发仍在池里，下轮会继续重试。席位 Chrome 标签开太多时可关几个释放内存。`;
  }
  if (/限流|频繁|rate/i.test(raw)) {
    return `${raw} → 发送太频繁，稍后会自动重试。`;
  }
  return raw;
}

async function postWebhookWithRetry(webhookUrl, payload, cfg) {
  const retries = Math.max(1, Number(cfg?.sendMethod?.retryCount) || DEFAULT_RETRY_COUNT);
  const delayMs = Math.max(500, Number(cfg?.sendMethod?.retryDelayMs) || DEFAULT_RETRY_DELAY_MS);
  let last = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      last = await postWebhook(webhookUrl, payload);
      if (webhookOk(last)) return last;
      if (attempt < retries && isRetryableWebhookError(last.data)) {
        logError(`发群失败（第 ${attempt}/${retries} 次，将重试）: ${formatWebhookFailure(last.data)}`);
        await sleep(delayMs * attempt);
        continue;
      }
      return last;
    } catch (err) {
      if (attempt < retries && isRetryableWebhookError(null, err)) {
        logError(`发群网络异常（第 ${attempt}/${retries} 次，将重试）: ${err.message}`);
        await sleep(delayMs * attempt);
        continue;
      }
      throw err;
    }
  }
  return last;
}

async function fetchPending() {
  const qs = new URLSearchParams({ pending: "1", enrich: "1" });
  const { status, data } = await httpJson("GET", `/api/publish/outbox?${qs.toString()}`);
  if (status !== 200) throw new Error(`拉待发池失败 HTTP ${status}`);
  return Array.isArray(data.items) ? data.items : [];
}

async function markPushed(id) {
  const { status, data } = await httpJson("POST", "/api/publish/outbox", {
    action: "mark-pushed",
    ids: [id],
    pushedBy: "本地机器人",
  });
  if (status !== 200 || !data?.ok) throw new Error(`mark-pushed 失败: ${id}`);
}

async function runOnce(opts) {
  const cfg = loadConfig();
  const webhookUrl = String(cfg?.targetGroup?.webhookUrl || "").trim();
  if (!webhookUrl) {
    throw new Error(`请在 ${CONFIG_PATH} 配置 targetGroup.webhookUrl（自定义机器人 Webhook）`);
  }

  const items = await fetchPending();
  if (!items.length) {
    logLine("无待发，跳过");
    return 0;
  }

  let sent = 0;
  for (const item of items) {
    if (item.recalled) {
      logLine(`跳过已撤回 ${item.id}`);
      continue;
    }
    const payload = buildWebhookPayload(item);
    const preview = payload.msgtype === "markdown" ? payload.markdown.text : payload.text.content;
    logLine(
      `待发 ${item.id} · ${item.contentKind || item.type} · ${String(preview).slice(0, 60).replace(/\s+/g, " ")}…`,
    );
    if (opts.dryRun) continue;

    const stillPending = (await fetchPending()).some((i) => i.id === item.id);
    if (!stillPending) {
      logLine(`跳过 ${item.id}（已撤回或已推送，不再发群）`);
      continue;
    }

    const res = await postWebhookWithRetry(webhookUrl, payload, cfg);
    if (!webhookOk(res)) {
      logError(`发群失败 ${item.id}: ${formatWebhookFailure(res.data)}（下轮轮询仍会重试）`);
      continue;
    }
    await markPushed(item.id);
    sent += 1;
    logLine(`已发群并 mark-pushed: ${item.id}`);
  }
  return sent;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.once && !opts.watch) {
    console.log("用法: node tools/robot-outbox-send.cjs --once | --watch [--dry-run]");
    process.exit(1);
  }

  if (opts.once) {
    const n = await runOnce(opts);
    logLine(`完成，本次发送 ${n} 条`);
    return;
  }

  const cfg = loadConfig();
  const sec = Number(cfg?.sendMethod?.pollIntervalSeconds) || DEFAULT_POLL_SEC;
  logLine(`本地机器人发群已启动，每 ${sec} 秒轮询（Webhook 来自配置文件，重启不丢）`);
  logLine(`配置文件: ${CONFIG_PATH}`);
  logLine(`运行日志: ${LOG_PATH}`);
  logLine("与领慧定时发群请勿同时启用，避免重复发送。");

  for (;;) {
    try {
      await runOnce(opts);
    } catch (e) {
      logError(e.message || String(e));
    }
    await sleep(sec * 1000);
  }
}

if (require.main === module) {
  main().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
  });
}
