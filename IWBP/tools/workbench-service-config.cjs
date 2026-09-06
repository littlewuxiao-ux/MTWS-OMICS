/** 工作台服务：local=本机 8787；client=连远程主工作台（席位 2 轻客户端） */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "workbench-service-config.json");

function loadWorkbenchServiceConfig() {
  const cfg = {
    role: "local",
    host: "127.0.0.1",
    port: 8787,
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
    }
  } catch (e) {
    console.warn("  工作台服务配置读取失败:", e.message);
  }

  if (process.env.WORKBENCH_SERVICE_ROLE) cfg.role = process.env.WORKBENCH_SERVICE_ROLE;
  if (process.env.WORKBENCH_SERVICE_HOST) cfg.host = process.env.WORKBENCH_SERVICE_HOST;
  if (process.env.WORKBENCH_SERVICE_PORT) cfg.port = Number(process.env.WORKBENCH_SERVICE_PORT);

  cfg.role = String(cfg.role || "local").toLowerCase() === "client" ? "client" : "local";
  cfg.host = String(cfg.host || "127.0.0.1").trim() || "127.0.0.1";
  cfg.port = Number(cfg.port) || 8787;
  return cfg;
}

function getWorkbenchBaseUrl(cfg = loadWorkbenchServiceConfig()) {
  const host = cfg.role === "client" ? cfg.host : "127.0.0.1";
  return `http://${host}:${cfg.port}`;
}

function getWorkbenchIndexUrl(cfg = loadWorkbenchServiceConfig()) {
  return `${getWorkbenchBaseUrl(cfg)}/index.html`;
}

module.exports = {
  CONFIG_PATH,
  loadWorkbenchServiceConfig,
  getWorkbenchBaseUrl,
  getWorkbenchIndexUrl,
};
