/**
 * 丰声 CAS 扫码（供工作台 /api/sf-foc/cas/*）
 * 轮询与 validate 走 Python requests（与 renew-cas-token.bat 相同），避免 Node Cookie 与丰声 CAS 不兼容。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "sf-foc-config.local.json");
const CAS_LOG_PATH = path.join(ROOT, "data", "cas-web.log");
const BRIDGE_SCRIPT = path.join(__dirname, "cas_web_bridge.py");
const { clearSfFocProbeCache } = require("./sf-foc-probe-cache.cjs");

function casLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(CAS_LOG_PATH, line, "utf8");
  } catch (_) {}
  console.log(`[CAS] ${message}`);
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function getSfFocTokenMetaSafe(cfg) {
  try {
    const { getSfFocTokenMeta } = require("./sf-foc-token-meta.cjs");
    return getSfFocTokenMeta(cfg);
  } catch (_) {
    return { hasToken: true, status: "unknown" };
  }
}

function resolvePythonLaunchers() {
  return [
    { cmd: "py", args: ["-3"] },
    { cmd: "python", args: [] },
    { cmd: "python3", args: [] },
  ];
}

function runPythonBridge(subcommand, sessionId) {
  const launchers = resolvePythonLaunchers();
  let lastErr = "未找到 Python（需安装 Python 与 requests，与 renew-cas-token.bat 相同）";

  for (const launcher of launchers) {
    const args = [...launcher.args, BRIDGE_SCRIPT, subcommand];
    if (sessionId) args.push(sessionId);
    const result = spawnSync(launcher.cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
    if (result.error && result.error.code === "ENOENT") continue;

    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();
    let payload = null;
    try {
      payload = JSON.parse(stdout);
    } catch (_) {
      lastErr = stderr || stdout || `Python 退出码 ${result.status}`;
      if (result.status === 0) continue;
      throw new Error(lastErr);
    }

    if (result.status !== 0 && payload.success === false) {
      throw new Error(payload.message || payload.errorMessage || lastErr);
    }
    return payload;
  }

  throw new Error(lastErr);
}

async function startCasSession() {
  const data = runPythonBridge("start");
  if (!data.sessionId) throw new Error(data.message || "无法启动扫码");
  casLog(`bridge start ${String(data.sessionId).slice(0, 8)} appKey=${data.appKey || "?"}`);
  return {
    sessionId: data.sessionId,
    qrImageBase64: data.qrImageBase64,
    appKey: data.appKey,
    message: data.message || "请使用丰声 Next 扫描二维码",
  };
}

async function pollCasSession(sessionId) {
  const data = runPythonBridge("poll", sessionId);
  const status = data.status || "error";
  if (status === "done") {
    clearSfFocProbeCache();
    return {
      status: "done",
      userCode: data.userCode || null,
      token: data.token || null,
    };
  }
  if (status === "pending") {
    return { status: "pending", message: data.message || "等待丰声确认扫码…" };
  }
  if (status === "expired") {
    return { status: "expired", message: data.message || "扫码会话已过期，请刷新二维码" };
  }
  return { status: "error", message: data.message || "登录失败" };
}

function readCasLogTail(maxLines = 40) {
  try {
    if (!fs.existsSync(CAS_LOG_PATH)) return [];
    return fs
      .readFileSync(CAS_LOG_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(1, Number(maxLines) || 40));
  } catch (_) {
    return [];
  }
}

module.exports = { startCasSession, pollCasSession, readCasLogTail };
