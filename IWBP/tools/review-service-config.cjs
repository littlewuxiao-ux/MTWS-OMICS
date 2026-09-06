/** 复盘检索服务：local=本机 Python；client=连远程服务机（轻客户端） */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "review-service-config.json");

function loadReviewServiceConfig() {
  const cfg = {
    role: "local",
    host: "127.0.0.1",
    apiPort: 8502,
    searchPort: 8501,
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
    }
  } catch (e) {
    console.warn("  复盘服务配置读取失败:", e.message);
  }

  if (process.env.REVIEW_SERVICE_ROLE) cfg.role = process.env.REVIEW_SERVICE_ROLE;
  if (process.env.REVIEW_SERVICE_HOST) cfg.host = process.env.REVIEW_SERVICE_HOST;
  if (process.env.REVIEW_API_PORT) cfg.apiPort = Number(process.env.REVIEW_API_PORT);
  if (process.env.REVIEW_SEARCH_PORT) cfg.searchPort = Number(process.env.REVIEW_SEARCH_PORT);

  cfg.role = String(cfg.role || "local").toLowerCase() === "client" ? "client" : "local";
  cfg.host = String(cfg.host || "127.0.0.1").trim() || "127.0.0.1";
  cfg.apiPort = Number(cfg.apiPort) || 8502;
  cfg.searchPort = Number(cfg.searchPort) || 8501;
  return cfg;
}

function getReviewApiTarget(cfg) {
  if (cfg.role === "client") {
    return { hostname: cfg.host, port: cfg.apiPort };
  }
  return { hostname: "127.0.0.1", port: cfg.apiPort };
}

function shouldSpawnLocalReviewApi(cfg) {
  return cfg.role === "local";
}

function getPublicReviewServiceConfig(cfg) {
  const host = cfg.role === "client" ? cfg.host : "127.0.0.1";
  const searchUrl = `http://${host}:${cfg.searchPort}`;
  const apiUrl = `http://${host}:${cfg.apiPort}`;
  return {
    role: cfg.role,
    host: cfg.role === "client" ? cfg.host : "",
    searchUrl,
    apiUrl,
    hint:
      cfg.role === "client"
        ? `轻客户端：今日相关与复盘搜索均连 ${cfg.host}（无需本机 Python/模型）`
        : "本机模式：今日相关随 start.bat 自动启动；复盘页需 start-search.bat 或 start-review-server.bat",
  };
}

module.exports = {
  CONFIG_PATH,
  loadReviewServiceConfig,
  getReviewApiTarget,
  shouldSpawnLocalReviewApi,
  getPublicReviewServiceConfig,
};
