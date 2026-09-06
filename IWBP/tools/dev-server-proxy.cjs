/**
 * 本地静态站 + METAR 同源代理（解决浏览器直连 AWC 的 CORS 限制）
 *
 * 用法（需已安装 Node.js）：
 *   npm start
 *   或：node tools/dev-server-proxy.cjs
 * 浏览器打开：http://localhost:8787/index.html
 *
 * 将 GET /api/data/metar?... 转发至 https://aviationweather.gov/api/data/metar?...
 * GET/POST/DELETE /api/checklist/config 读写 data/checklist-config.json（席位检查单）
 * GET/POST/DELETE /api/warnings/active 读写 data/active-warnings.json（生效机场警报）
 * GET/POST /api/publish/outbox 读写 data/publish-outbox.json（发布存档 / Next 推送待发池）
 * GET /api/platform/health 席位环境汇总（FOC、复盘 API、批复机场等）
 * POST /api/sf-foc/metar/list | /api/sf-foc/taf/list 转发公司 FOC 气象接口（密钥见 json，token 来自扫码/AuthBroker）
 * POST /api/sf-foc/cas/start | GET /api/sf-foc/cas/poll 丰声扫码续登（内存 + AuthBroker，不写 json token）
 * GET /api/typhoon/list | /api/typhoon/:id 转发中央气象台台风网 JSONP 接口
 * GET /api/config/tianditu 读取 data/tianditu-config.local.json（天地图浏览器端 Key）
 * GET /api/review/* 转发至复盘推荐 API（8502；local 模式本机拉起，client 模式连服务机）
 * GET /api/review-service/config 读取 data/review-service-config.json（轻客户端/服务机）
 */
const http = require("http");
const https = require("https");
const dns = require("dns");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8787;
const BIND_HOST = process.env.IWBP_BIND || "0.0.0.0";
const REVIEW_API_PORT = Number(process.env.REVIEW_API_PORT) || 8502;
const REVIEW_SEARCH_DIR = path.join(ROOT, "review-search");
const CHECKLIST_CONFIG_PATH = path.join(ROOT, "data", "checklist-config.json");
const ACTIVE_WARNINGS_PATH = path.join(ROOT, "data", "active-warnings.json");
const PUBLISH_OUTBOX_PATH = path.join(ROOT, "data", "publish-outbox.json");
const ROBOT_PUBLISH_CONFIG_PATH = path.join(ROOT, "data", "robot-publish-config.json");
const ICAO_WHITELIST_PATH = path.join(ROOT, "data", "icao-whitelist.json");
const SF_APPROVED_AIRPORTS_PATH = path.join(ROOT, "data", "sf-approved-airports.json");
const TIANDITU_CONFIG_PATH = path.join(ROOT, "data", "tianditu-config.local.json");
const PUBLISH_OUTBOX_RETENTION_DAYS = 31;
const {
  enrichOutboxEntry,
  normalizePublishTextForDedup,
  periodPublishDedupKey,
} = require("./robot-mention-resolver.cjs");
const { computePublishDeadlineAt, classifyPublishUrgency } = require("./publish-deadline.cjs");
const SF_FOC_CONFIG_PATH = path.join(ROOT, "data", "sf-foc-config.local.json");
const { buildSfFocRequestHeaders, isSfFocReady } = require("./sf-foc-headers.cjs");
const { getSfFocTokenMeta } = require("./sf-foc-token-meta.cjs");
const { startCasSession, pollCasSession, readCasLogTail } = require("./sf-foc-cas-web.cjs");
const {
  resolveAuth,
  setRuntimeAuth,
  pushBrokerAuth,
  proxyAuthBroker,
} = require("./iwbp-auth-runtime.cjs");
const {
  SF_FOC_PROBE_CACHE_MS,
  getSfFocProbeCache,
  setSfFocProbeCache,
} = require("./sf-foc-probe-cache.cjs");
const {
  loadReviewServiceConfig,
  getReviewApiTarget,
  shouldSpawnLocalReviewApi,
  getPublicReviewServiceConfig,
} = require("./review-service-config.cjs");

const reviewServiceCfg = loadReviewServiceConfig();
const reviewApiTarget = getReviewApiTarget(reviewServiceCfg);

const SF_FOC_UPSTREAM = {
  "/api/sf-foc/metar/list": "/met/dispatchMetarMetTel/queryMetarTelList",
  "/api/sf-foc/taf/list": "/met/dispatchTafMetTel/queryTafTelList",
  "/api/sf-foc/met/top": "/met/dispatchMetTelSummary/selectNewestTopMet",
  "/api/sf-foc/flight/schedule": "/flight/flightSchedule/getByFlightDate",
};

function loadSfFocConfig() {
  const cfg = {
    baseUrl: process.env.SF_FOC_BASE_URL || "http://sfa-wgw-inn.uat.sf-airlines.com:1080",
    systemKey: process.env.SF_FOC_SYSTEM_KEY || "",
    accessKey: process.env.SF_FOC_ACCESS_KEY || "",
    token: process.env.SF_FOC_TOKEN || "",
  };
  try {
    if (fs.existsSync(SF_FOC_CONFIG_PATH)) {
      const disk = JSON.parse(fs.readFileSync(SF_FOC_CONFIG_PATH, "utf8"));
      const rest = { ...disk };
      delete rest.token;
      delete rest.tokenObtainedAt;
      delete rest.tokenExpiresAt;
      Object.assign(cfg, rest);
      if (process.env.SF_FOC_TOKEN) cfg.token = process.env.SF_FOC_TOKEN;
      else cfg.token = "";
    }
  } catch (e) {
    console.warn("  SF FOC 配置读取失败:", e.message);
  }
  return cfg;
}

async function loadSfFocConfigWithAuth(req) {
  const cfg = loadSfFocConfig();
  const auth = await resolveAuth(req);
  if (auth.token) {
    cfg.token = auth.token;
    if (auth.userCode) cfg.sfUserId = auth.userCode;
  }
  return cfg;
}

function postSfFocJson(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search || ""}`,
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: res.statusCode || 0, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(payload);
    req.end();
  });
}

/** 轻量探测 token 是否仍能拉 METAR（无效 token 时首页扫码续登） */
function tokenHeaderInvalid(token) {
  const s = String(token || "");
  if (!s.trim()) return true;
  return /[\0-\x08\x0A-\x1F\x7F]/.test(s);
}

function probeErrorIsTokenFault(err) {
  const msg = String(err?.message || err || "");
  return /Invalid character in header|token/i.test(msg);
}

async function probeSfFocToken(cfg, dnsOk) {
  const auth = buildSfFocRequestHeaders(cfg);
  if (auth.error) return { ok: false, skipped: true, reason: auth.error };
  if (!dnsOk) return { ok: false, skipped: true, reason: "dns" };

  const tokenMeta = getSfFocTokenMeta(cfg);
  if (tokenMeta.status === "missing") return { ok: false, skipped: true, reason: "missing" };

  if (tokenHeaderInvalid(cfg.token)) {
    return { ok: false, skipped: false, errorMessage: "token 格式无效（含非法字符），请重新扫码" };
  }

  const cacheKey = `${String(cfg.token || "").length}:${String(cfg.token || "").slice(0, 16)}`;
  const now = Date.now();
  const sfFocProbeCache = getSfFocProbeCache();
  if (sfFocProbeCache.key === cacheKey && now - sfFocProbeCache.at < SF_FOC_PROBE_CACHE_MS && sfFocProbeCache.result) {
    return sfFocProbeCache.result;
  }

  const base = String(cfg.baseUrl || "").replace(/\/$/, "");
  if (!base) return { ok: false, skipped: true, reason: "baseUrl" };

  try {
    const met = await postSfFocJson(
      `${base}/met/dispatchMetarMetTel/queryMetarTelList`,
      auth.headers,
      { airport4Codes: ["ZBAA"], observationTime: Date.now() - 2 * 60 * 60 * 1000 },
    );
    const ok = met.status === 200 && met.json?.success === true;
    const authFailed =
      !ok &&
      (met.status === 401 ||
        met.status === 403 ||
        (met.json?.success === false &&
          /token|鉴权|登录|异地|未通过|失效|过期/i.test(String(met.json?.errorMessage || met.text || ""))));
    const result = {
      ok,
      skipped: !ok && !authFailed,
      httpStatus: met.status,
      success: met.json?.success,
      errorMessage: ok ? null : met.json?.errorMessage || (met.status >= 400 ? `HTTP ${met.status}` : null),
    };
    setSfFocProbeCache({ key: cacheKey, at: now, result });
    return result;
  } catch (err) {
    const tokenFault = probeErrorIsTokenFault(err);
    const result = {
      ok: false,
      skipped: !tokenFault,
      errorMessage: tokenFault ? "token 格式无效，请重新扫码" : err.message || String(err),
    };
    setSfFocProbeCache({ key: cacheKey, at: now, result });
    return result;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
};

function proxyNmcTyphoon(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || "";
  let upstreamPath = "";
  const ts = Date.now();
  if (pathname === "/api/typhoon/list") {
    upstreamPath = `/weatherservice/typhoon/jsons/list_default?t=${ts}`;
  } else {
    const m = pathname.match(/^\/api\/typhoon\/(\d+)$/);
    if (m) upstreamPath = `/weatherservice/typhoon/jsons/view_${m[1]}?t=${ts}`;
  }
  if (!upstreamPath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  http
    .get(
      {
        hostname: "typhoon.nmc.cn",
        path: upstreamPath,
        headers: {
          "User-Agent": "weather-workbench/1.0",
          Accept: "application/json,text/javascript,*/*",
        },
      },
      (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          const buf = Buffer.concat(chunks);
          res.writeHead(r.statusCode || 502, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(buf);
        });
      },
    )
    .on("error", (e) => {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Typhoon proxy error: ${e.message}`);
    });
}

function proxyMetar(req, res) {
  const parsed = url.parse(req.url);
  const target = `https://aviationweather.gov/api/data/metar${parsed.search || ""}`;
  https
    .get(
      target,
      {
        headers: {
          "User-Agent": "weather-workbench-dev/1.0",
          Accept: "application/json,text/plain,*/*",
        },
      },
      (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          const buf = Buffer.concat(chunks);
          res.writeHead(r.statusCode || 502, {
            "Content-Type": r.headers["content-type"] || "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(buf);
        });
      },
    )
    .on("error", (e) => {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Proxy error: ${e.message}`);
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function handleChecklistConfig(req, res) {
  const pathname = url.parse(req.url).pathname;
  if (pathname !== "/api/checklist/config") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    fs.stat(CHECKLIST_CONFIG_PATH, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        if (req.method === "HEAD") res.end();
        else res.end(JSON.stringify({ error: "no config file" }));
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": st.size,
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      fs.readFile(CHECKLIST_CONFIG_PATH, (readErr, data) => {
        if (readErr) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(readErr.message);
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(data);
      });
    });
    return;
  }

  if (req.method === "DELETE") {
    fs.unlink(CHECKLIST_CONFIG_PATH, (err) => {
      if (err && err.code !== "ENOENT") {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(err.message);
        return;
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === "POST") {
    readBody(req)
      .then((buf) => {
        let data;
        try {
          data = JSON.parse(buf.toString("utf8"));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Invalid JSON: ${e.message}`);
          return;
        }
        if (!data || !data.shifts) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Missing shifts");
          return;
        }
        fs.mkdir(path.dirname(CHECKLIST_CONFIG_PATH), { recursive: true }, () => {
          const out = JSON.stringify(data, null, 2);
          fs.writeFile(CHECKLIST_CONFIG_PATH, out, "utf8", (writeErr) => {
            if (writeErr) {
              res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(writeErr.message);
              return;
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ ok: true, path: "data/checklist-config.json" }));
          });
        });
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(e.message);
      });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}

function normalizeIcaoCodes(input) {
  const out = new Set();
  const push = (s) => {
    const x = String(s || "")
      .trim()
      .toUpperCase();
    if (x.length >= 3 && x.length <= 4) out.add(x);
  };
  if (!input) return [];
  if (Array.isArray(input)) {
    input.forEach((x) => (typeof x === "string" ? push(x) : x && push(x.icao)));
    return [...out];
  }
  return [];
}

function readIcaoWhitelistSync() {
  try {
    if (fs.existsSync(ICAO_WHITELIST_PATH)) {
      return JSON.parse(fs.readFileSync(ICAO_WHITELIST_PATH, "utf8"));
    }
  } catch (e) {
    console.warn("  icao-whitelist 读取失败:", e.message);
  }
  return { version: 1, updated: null, label: "", icao: [], alertPublishMode: "union" };
}

function writeIcaoWhitelistSync(data) {
  fs.mkdirSync(path.dirname(ICAO_WHITELIST_PATH), { recursive: true });
  fs.writeFileSync(ICAO_WHITELIST_PATH, JSON.stringify(data, null, 2), "utf8");
}

function handleTiandituConfig(req, res) {
  const pathname = url.parse(req.url).pathname;
  if (pathname !== "/api/config/tianditu") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }
  let tk = "";
  try {
    if (fs.existsSync(TIANDITU_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(TIANDITU_CONFIG_PATH, "utf8"));
      tk = String(cfg.tk || cfg.key || "").trim();
    }
  } catch (e) {
    console.warn("  天地图配置读取失败:", e.message);
  }
  const body = JSON.stringify({
    ok: true,
    tk,
    configured: Boolean(tk),
    applyUrl: "https://console.tianditu.gov.cn/",
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

function handleAirportConfig(req, res) {
  const pathname = url.parse(req.url).pathname;
  if (pathname !== "/api/config/airports") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const data = readIcaoWhitelistSync();
    const body = JSON.stringify(data);
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
    return;
  }

  if (req.method === "POST") {
    readBody(req)
      .then((buf) => {
        let payload;
        try {
          payload = JSON.parse(buf.toString("utf8"));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Invalid JSON: ${e.message}`);
          return;
        }

        const existing = readIcaoWhitelistSync();
        const incoming = normalizeIcaoCodes(payload?.icao || payload?.airports || payload?.items);
        let icao;
        if (payload?.action === "merge") {
          icao = [...new Set([...normalizeIcaoCodes(existing.icao), ...incoming])].sort();
        } else if (incoming.length) {
          icao = [...new Set(incoming)].sort();
        } else {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Missing icao array (or use action=merge with icao)");
          return;
        }

        const out = {
          version: payload?.version != null ? payload.version : existing.version || 1,
          updated: payload?.updated || new Date().toISOString().slice(0, 10),
          label: payload?.label != null ? String(payload.label) : existing.label || "公司运行机场清单",
          alertPublishMode:
            payload?.alertPublishMode != null
              ? String(payload.alertPublishMode)
              : existing.alertPublishMode || "union",
          icao,
        };
        writeIcaoWhitelistSync(out);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok: true, count: icao.length, path: "data/icao-whitelist.json", ...out }));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(e.message);
      });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}

function handleActiveWarnings(req, res) {
  const pathname = url.parse(req.url).pathname;
  if (pathname !== "/api/warnings/active") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    fs.stat(ACTIVE_WARNINGS_PATH, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        if (req.method === "HEAD") res.end();
        else res.end(JSON.stringify({ error: "no warnings file" }));
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": st.size,
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      fs.readFile(ACTIVE_WARNINGS_PATH, (readErr, data) => {
        if (readErr) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(readErr.message);
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(data);
      });
    });
    return;
  }

  if (req.method === "DELETE") {
    fs.unlink(ACTIVE_WARNINGS_PATH, (err) => {
      if (err && err.code !== "ENOENT") {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(err.message);
        return;
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === "POST") {
    readBody(req)
      .then((buf) => {
        let data;
        try {
          data = JSON.parse(buf.toString("utf8"));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Invalid JSON: ${e.message}`);
          return;
        }
        if (!data || !Array.isArray(data.items)) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Missing items array");
          return;
        }
        fs.mkdir(path.dirname(ACTIVE_WARNINGS_PATH), { recursive: true }, () => {
          const out = JSON.stringify(data, null, 2);
          fs.writeFile(ACTIVE_WARNINGS_PATH, out, "utf8", (writeErr) => {
            if (writeErr) {
              res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(writeErr.message);
              return;
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ ok: true, path: "data/active-warnings.json" }));
          });
        });
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(e.message);
      });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}

function defaultPublishOutbox() {
  return {
    version: 1,
    source: "工作台·发布存档",
    updatedAt: null,
    items: [],
  };
}

function readPublishOutboxSync() {
  try {
    if (fs.existsSync(PUBLISH_OUTBOX_PATH)) {
      const data = JSON.parse(fs.readFileSync(PUBLISH_OUTBOX_PATH, "utf8"));
      if (data && Array.isArray(data.items)) return data;
    }
  } catch (_) {
    /* fall through */
  }
  return defaultPublishOutbox();
}

function writePublishOutboxSync(data) {
  const out = { ...defaultPublishOutbox(), ...data, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(PUBLISH_OUTBOX_PATH), { recursive: true });
  fs.writeFileSync(PUBLISH_OUTBOX_PATH, JSON.stringify(out, null, 2), "utf8");
}

function prunePublishOutboxItems(items) {
  const cutoff = Date.now() - PUBLISH_OUTBOX_RETENTION_DAYS * 86400000;
  return items.filter((e) => {
    const ms = e?.savedAt ? new Date(e.savedAt).getTime() : 0;
    return ms >= cutoff;
  });
}

/** 待发时段预报：相同 slot + 锚定日 + 正文只保留最新一条 */
function dedupePendingPeriodItems(items) {
  const keepIds = new Set();
  const sorted = [...items].sort(
    (a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime(),
  );
  const seenKeys = new Set();
  for (const item of sorted) {
    const key = periodPublishDedupKey(item);
    if (item.type === "period" && !item.pushedToNext && key) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    }
    keepIds.add(item.id);
  }
  return items.filter((item) => keepIds.has(item.id));
}

function normalizePublishOutboxStoreItems(items) {
  return dedupePendingPeriodItems(
    prunePublishOutboxItems(items.map(normalizeOutboxEntry).filter(Boolean)),
  );
}

function normalizeOutboxEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text || "").trim();
  if (!text) return null;
  const type = String(raw.type || "other").trim();
  const phenomena = Array.isArray(raw.phenomena)
    ? raw.phenomena.map(String).filter(Boolean)
    : String(raw.phenomena || "")
        .split("、")
        .map((s) => s.trim())
        .filter(Boolean);
  const entry = {
    id: String(raw.id || `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    type,
    text,
    savedAt: raw.savedAt || new Date().toISOString(),
    savedBy: String(raw.savedBy || raw.publishedBy || ""),
    station: String(raw.station || "").trim().toUpperCase(),
    phenomena,
    periodSlotId: String(raw.periodSlotId || "").trim(),
    anchorYmd: String(raw.anchorYmd || "").trim().slice(0, 10),
    pushedToNext: Boolean(raw.pushedToNext),
    pushedAt: raw.pushedAt || null,
    pushedBy: String(raw.pushedBy || ""),
    warningId: String(raw.warningId || "").trim(),
    isCancel: Boolean(raw.isCancel),
    recalled: Boolean(raw.recalled),
    recalledAt: raw.recalledAt || null,
    recalledBy: String(raw.recalledBy || ""),
    recallOf: String(raw.recallOf || "").trim(),
  };
  entry.publishDeadlineAt = raw.publishDeadlineAt || computePublishDeadlineAt(entry);
  return entry;
}

function filterPublishOutboxItems(items, query) {
  let rows = items.slice();
  const pending = query.pending === "1" || query.pending === "true";
  const typeFilter = String(query.type || "").trim();
  if (pending) rows = rows.filter((i) => !i.pushedToNext && !i.recalled);
  if (typeFilter === "tc") {
    rows = rows.filter((i) => i.type === "alert" && i.phenomena.includes("热带气旋"));
  } else if (typeFilter && typeFilter !== "all") {
    rows = rows.filter((i) => i.type === typeFilter);
  }
  const slotFilter = String(query.slot || query.periodSlotId || "").trim();
  if (slotFilter) {
    rows = rows.filter((i) => i.periodSlotId === slotFilter);
  }
  const overdueOnly = query.overdue === "1" || query.overdue === "true";
  if (overdueOnly) {
    rows = rows.filter((i) => classifyPublishUrgency(i) === "overdue");
  }
  const since = String(query.since || "").trim();
  if (since) {
    const sinceMs = new Date(since).getTime();
    if (!Number.isNaN(sinceMs)) {
      rows = rows.filter((i) => new Date(i.savedAt).getTime() >= sinceMs);
    }
  }
  return rows.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

function loadRobotPublishConfigSync() {
  try {
    if (fs.existsSync(ROBOT_PUBLISH_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(ROBOT_PUBLISH_CONFIG_PATH, "utf8"));
    }
  } catch (_) {
    /* fall through */
  }
  return { version: 1, roles: {}, contentTypes: {} };
}

function handlePublishRobotConfig(req, res) {
  const pathname = url.parse(req.url).pathname;
  if (pathname !== "/api/publish/robot-config") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  const config = loadRobotPublishConfigSync();
  const body = JSON.stringify(config);
  if (req.method === "HEAD") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function handlePublishOutbox(req, res) {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== "/api/publish/outbox") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const store = readPublishOutboxSync();
    const normalized = normalizePublishOutboxStoreItems(store.items);
    if (normalized.length !== store.items.length) {
      store.items = normalized;
      writePublishOutboxSync(store);
    }
    let items = filterPublishOutboxItems(normalized, parsed.query || {});
    const enrich = parsed.query.enrich === "1" || parsed.query.enrich === "true";
    if (enrich) {
      const robotCfg = loadRobotPublishConfigSync();
      items = items.map((item) => {
        const publishDeadlineAt = item.publishDeadlineAt || computePublishDeadlineAt(item);
        const withDeadline = { ...item, publishDeadlineAt };
        return {
          ...enrichOutboxEntry(withDeadline, robotCfg),
          publishDeadlineAt,
          urgency: classifyPublishUrgency(withDeadline),
        };
      });
    } else {
      items = items.map((item) => {
        const publishDeadlineAt = item.publishDeadlineAt || computePublishDeadlineAt(item);
        const withDeadline = { ...item, publishDeadlineAt };
        return { ...withDeadline, urgency: classifyPublishUrgency(withDeadline) };
      });
    }
    const body = JSON.stringify({ ...store, items, total: normalized.length });
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
    return;
  }

  if (req.method === "POST") {
    readBody(req)
      .then((buf) => {
        let payload;
        try {
          payload = JSON.parse(buf.toString("utf8"));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Invalid JSON: ${e.message}`);
          return;
        }

        const store = readPublishOutboxSync();
        const existing = normalizePublishOutboxStoreItems(store.items);

        if (payload?.action === "mark-pushed") {
          const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
          const now = new Date().toISOString();
          const pushedBy = String(payload.pushedBy || "");
          let marked = 0;
          store.items = existing.map((item) => {
            if (!ids.includes(item.id)) return item;
            if (item.recalled) return item;
            marked += 1;
            return { ...item, pushedToNext: true, pushedAt: now, pushedBy };
          });
          writePublishOutboxSync(store);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ ok: true, marked }));
          return;
        }

        if (payload?.action === "recall-entry") {
          const id = String(payload.id || "").trim();
          const warningId = String(payload.warningId || "").trim();
          const station = String(payload.station || "").trim().toUpperCase();
          const phenomena = Array.isArray(payload.phenomena)
            ? payload.phenomena.map(String).filter(Boolean)
            : [];
          if (!id && !warningId && !station) {
            res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Missing id");
            return;
          }
          const now = new Date().toISOString();
          const recalledBy = String(payload.recalledBy || "");
          let found = false;
          const phenKey = (list) => [...new Set((list || []).map(String))].sort().join("\x1f");
          const targetPhenKey = phenomena.length ? phenKey(phenomena) : "";
          store.items = existing.map((item) => {
            const matchById = id && item.id === id;
            const matchByWarning =
              warningId &&
              String(item.warningId || "") === warningId &&
              !item.pushedToNext &&
              item.type === "alert";
            const matchByStation =
              station &&
              String(item.station || "").toUpperCase() === station &&
              !item.pushedToNext &&
              item.type === "alert" &&
              !item.isCancel &&
              (!targetPhenKey || phenKey(item.phenomena) === targetPhenKey);
            if (!matchById && !matchByWarning && !matchByStation) return item;
            found = true;
            return { ...item, recalled: true, recalledAt: now, recalledBy };
          });
          if (!found) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Entry not found");
            return;
          }
          writePublishOutboxSync(store);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ ok: true, id: id || warningId || station }));
          return;
        }

        const entry = normalizeOutboxEntry(payload?.entry || payload);
        if (!entry) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Missing text");
          return;
        }

        const dedupKey = periodPublishDedupKey(entry);
        let savedEntry = entry;
        let dedupedExisting = false;
        const priorById = savedEntry.id ? existing.find((item) => item.id === savedEntry.id) : null;
        if (priorById?.recalled) {
          savedEntry = {
            ...savedEntry,
            recalled: true,
            recalledAt: priorById.recalledAt || savedEntry.recalledAt,
            recalledBy: priorById.recalledBy || savedEntry.recalledBy,
          };
        }
        if (dedupKey) {
          const hit = existing.find(
            (item) => !item.pushedToNext && !item.recalled && periodPublishDedupKey(item) === dedupKey,
          );
          if (hit) {
            savedEntry = {
              ...hit,
              savedAt: entry.savedAt,
              savedBy: entry.savedBy || hit.savedBy,
              publishDeadlineAt: entry.publishDeadlineAt || hit.publishDeadlineAt,
            };
            dedupedExisting = true;
          }
        }

        const withoutDupPending = (list) => {
          if (!dedupKey) return list;
          return list.filter(
            (item) =>
              item.id === savedEntry.id ||
              item.pushedToNext ||
              periodPublishDedupKey(item) !== dedupKey,
          );
        };

        let nextItems;
        if (dedupedExisting) {
          nextItems = withoutDupPending(
            existing.map((item) => (item.id === savedEntry.id ? savedEntry : item)),
          );
        } else {
          nextItems = withoutDupPending([
            savedEntry,
            ...existing.filter((item) => item.id !== savedEntry.id),
          ]);
        }

        store.items = normalizePublishOutboxStoreItems(nextItems);
        writePublishOutboxSync(store);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(
          JSON.stringify({
            ok: true,
            entry: savedEntry,
            deduped: dedupedExisting,
            path: "data/publish-outbox.json",
          }),
        );
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(e.message);
      });
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}

function proxySfFocPost(upstreamPath, queryString, bodyBuf, res, req) {
  loadSfFocConfigWithAuth(req).then((cfg) => {
    const auth = buildSfFocRequestHeaders(cfg);
  if (auth.error) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ success: false, errorMessage: auth.error }));
    return;
  }
  const base = String(cfg.baseUrl || "").replace(/\/$/, "");
  const targetPath = upstreamPath + (queryString || "");
  const parsed = url.parse(base + targetPath);
  const transport = parsed.protocol === "https:" ? https : http;
  const reqOpts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
    path: parsed.path,
    method: "POST",
    headers: {
      ...auth.headers,
      "Content-Type": "application/json",
      "Content-Length": bodyBuf.length,
    },
  };
  const upstream = transport.request(reqOpts, (r) => {
    const chunks = [];
    r.on("data", (c) => chunks.push(c));
    r.on("end", () => {
      const buf = Buffer.concat(chunks);
      res.writeHead(r.statusCode || 502, {
        "Content-Type": r.headers["content-type"] || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  });
  upstream.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ success: false, errorMessage: `Proxy error: ${e.message}` }));
  });
      upstream.write(bodyBuf);
      upstream.end();
    })
    .catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: false, errorMessage: e.message || String(e) }));
    });
}

function handleSfFocStatus(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  loadSfFocConfigWithAuth(req).then((cfg) => {
  const parsed = url.parse(String(cfg.baseUrl || ""));
  const host = parsed.hostname || "";
  const finish = (dnsErr, address) => {
    const dnsOk = !dnsErr;
    const auth = buildSfFocRequestHeaders(cfg);
    const tokenMeta = getSfFocTokenMeta(cfg);
    const finishWithProbe = (apiProbe) => {
      const payload = {
        configured: !auth.error,
        authMode: auth.mode || null,
        hasToken: !!cfg.token,
        hasMarketKeys: !!(cfg.systemKey && cfg.accessKey),
        baseUrl: cfg.baseUrl,
        host,
        dns: dnsErr ? dnsErr.message : address,
        apiProbe,
        ready:
          isSfFocReady(cfg, dnsOk) &&
          tokenMeta.status !== "expired" &&
          tokenMeta.status !== "missing" &&
          apiProbe?.ok === true,
        tokenMeta,
      };
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      if (req.method === "HEAD") res.end();
      else res.end(JSON.stringify(payload, null, 2));
    };
    probeSfFocToken(cfg, dnsOk).then(finishWithProbe).catch(() => finishWithProbe({ ok: false, skipped: true }));
  };
  if (!host) {
    finish(new Error("baseUrl 无效"));
    return;
  }
  dns.lookup(host, finish);
  }).catch((e) => {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, errorMessage: e.message || String(e) }));
  });
}

function probeReviewHealth() {
  return new Promise((resolve) => {
    const target = reviewApiTarget;
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: "/api/health",
        method: "GET",
        timeout: 4000,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(buf);
          } catch (_) {}
          resolve({
            ok: res.statusCode === 200,
            status: res.statusCode,
            semantic_enabled: parsed?.semantic_enabled,
          });
        });
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

function readApprovedAirportsMetaSync() {
  try {
    if (fs.existsSync(SF_APPROVED_AIRPORTS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SF_APPROVED_AIRPORTS_PATH, "utf8"));
      return {
        count: Number(data.count) || (Array.isArray(data.items) ? data.items.length : 0),
        sourceFile: data.sourceFile || null,
        updated: data.updated || null,
      };
    }
  } catch (_) {}
  return { count: 0, sourceFile: null, updated: null };
}

function handlePlatformHealth(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  loadSfFocConfigWithAuth(req).then((cfg) => {
  const parsedUrl = url.parse(String(cfg.baseUrl || ""));
  const host = parsedUrl.hostname || "";

  const finish = async (dnsErr, address) => {
    const dnsOk = !dnsErr;
    const auth = buildSfFocRequestHeaders(cfg);
    const tokenMeta = getSfFocTokenMeta(cfg);
    const apiProbe = await probeSfFocToken(cfg, dnsOk);
    const review = await probeReviewHealth();
    const approved = readApprovedAirportsMetaSync();
    let whitelistCount = 0;
    try {
      const wl = readIcaoWhitelistSync();
      whitelistCount = Array.isArray(wl.icao) ? wl.icao.length : 0;
    } catch (_) {}

    const focReady =
      isSfFocReady(cfg, dnsOk) &&
      tokenMeta.status !== "expired" &&
      tokenMeta.status !== "missing" &&
      apiProbe?.ok === true;
    const needsCasRenew =
      tokenMeta.status === "expired" ||
      tokenMeta.status === "missing" ||
      (Boolean(cfg.token) && !auth.error && dnsOk && !focReady);

    const payload = {
      ok: true,
      time: new Date().toISOString(),
      foc: {
        configured: !auth.error,
        authMode: auth.mode || null,
        hasToken: !!cfg.token,
        hasMarketKeys: !!(cfg.systemKey && cfg.accessKey),
        baseUrl: cfg.baseUrl,
        host,
        dns: dnsErr ? dnsErr.message : address,
        apiProbe,
        ready: focReady,
        needsCasRenew,
        tokenMeta,
      },
      review: {
        ...review,
        role: reviewServiceCfg.role || "local",
        host: reviewServiceCfg.host || null,
      },
      approvedAirports: approved,
      whitelistCount,
      publishOutbox: {
        version: 2,
        recallEntry: true,
        recalledField: true,
      },
    };

    const body = JSON.stringify(payload, null, 2);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end();
    else res.end(body);
  };

  if (!host) {
    finish(new Error("baseUrl 无效"));
    return;
  }
  dns.lookup(host, finish);
  }).catch((e) => {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, errorMessage: e.message || String(e) }));
  });
}

function handleSfFocCas(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || "";

  if (pathname === "/api/sf-foc/cas/start") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }
    startCasSession()
      .then((data) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ success: true, ...data }));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ success: false, errorMessage: err.message || String(err) }));
      });
    return;
  }

  if (pathname === "/api/sf-foc/cas/log") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }
    const body = JSON.stringify({ ok: true, lines: readCasLogTail(50) }, null, 2);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }

  if (pathname === "/api/sf-foc/cas/poll") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }
    const sessionId = String(parsed.query?.sessionId || "").trim();
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: false, errorMessage: "缺少 sessionId" }));
      return;
    }
    pollCasSession(sessionId)
      .then((data) => {
        if (data.status === "done" && data.token) {
          setRuntimeAuth({ token: data.token, userCode: data.userCode });
          pushBrokerAuth(data.token, data.userCode);
        }
        const out = { success: true, ...data };
        if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify(out));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ success: false, errorMessage: err.message || String(err) }));
      });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function handleSfFocProxy(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  const parsed = url.parse(req.url);
  const upstreamPath = SF_FOC_UPSTREAM[parsed.pathname || ""];
  if (!upstreamPath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  readBody(req)
    .then((bodyBuf) => proxySfFocPost(upstreamPath, parsed.search || "", bodyBuf, res, req))
    .catch((e) => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(e.message);
    });
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.code === "ENOENT" ? "Not found" : String(err.message));
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

let reviewApiProcess = null;
let resolvedPython = null;

function resolvePythonLauncher() {
  if (resolvedPython) return resolvedPython;
  if (process.env.PYTHON) {
    resolvedPython = { cmd: process.env.PYTHON, prefix: [] };
    return resolvedPython;
  }
  const candidates = [
    { cmd: "py", prefix: ["-3"] },
    { cmd: "python", prefix: [] },
    { cmd: "python3", prefix: [] },
  ];
  for (const spec of candidates) {
    const r = spawnSync(spec.cmd, [...spec.prefix, "-c", "import sys; sys.exit(0)"], {
      cwd: REVIEW_SEARCH_DIR,
      windowsHide: true,
      stdio: "ignore",
    });
    if (r.status === 0) {
      resolvedPython = spec;
      console.log(`  今日相关 API 使用 Python: ${spec.cmd}${spec.prefix.length ? " " + spec.prefix.join(" ") : ""}`);
      return spec;
    }
  }
  resolvedPython = { cmd: "python", prefix: [] };
  return resolvedPython;
}

function startReviewApiServer() {
  if (reviewApiProcess) return;
  const py = resolvePythonLauncher();
  reviewApiProcess = spawn(
    py.cmd,
    [...py.prefix, "-m", "uvicorn", "api.server:app", "--host", "127.0.0.1", "--port", String(REVIEW_API_PORT)],
    {
      cwd: REVIEW_SEARCH_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  reviewApiProcess.stdout.on("data", (d) => process.stdout.write(`[review-api] ${d}`));
  reviewApiProcess.stderr.on("data", (d) => process.stderr.write(`[review-api] ${d}`));
  reviewApiProcess.on("exit", (code) => {
    reviewApiProcess = null;
    if (code != null && code !== 0) {
      console.warn(`  今日相关 API 已退出 (code=${code})，请确认已安装 review-search 依赖`);
    }
  });
}

function proxyReviewApi(req, res, retried = false) {
  const parsed = url.parse(req.url);
  const targetPath = parsed.pathname.replace(/^\/api\/review/, "/api") + (parsed.search || "");
  const target = getReviewApiTarget(reviewServiceCfg);
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: targetPath,
      method: req.method,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
      },
    },
    (proxyRes) => {
      const headers = { ...proxyRes.headers, "Cache-Control": "no-store" };
      res.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (e) => {
    const refused = /ECONNREFUSED/i.test(String(e.message || e));
    if (refused && !retried && shouldSpawnLocalReviewApi(reviewServiceCfg)) {
      console.warn("  今日相关 API 未响应，正在重新拉起…");
      startReviewApiServer();
      setTimeout(() => proxyReviewApi(req, res, true), 2000);
      return;
    }
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  });
  proxyReq.end();
}

function shutdownReviewApi() {
  if (!reviewApiProcess) return;
  try {
    reviewApiProcess.kill();
  } catch (_) {}
  reviewApiProcess = null;
}

process.on("SIGINT", () => {
  shutdownReviewApi();
  process.exit(0);
});
process.on("SIGTERM", shutdownReviewApi);

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, token, X-User-Code",
    });
    res.end();
    return;
  }

  if ((req.url || "").startsWith("/auth/")) {
    proxyAuthBroker(req, res);
    return;
  }

  if (req.url.startsWith("/api/typhoon/")) {
    proxyNmcTyphoon(req, res);
    return;
  }

  if (req.url.startsWith("/api/data/metar")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    proxyMetar(req, res);
    return;
  }

  if (req.url.startsWith("/api/checklist/config")) {
    handleChecklistConfig(req, res);
    return;
  }

  if (req.url.startsWith("/api/config/airports")) {
    handleAirportConfig(req, res);
    return;
  }

  if (req.url.startsWith("/api/config/tianditu")) {
    handleTiandituConfig(req, res);
    return;
  }

  if (req.url.startsWith("/api/warnings/active")) {
    handleActiveWarnings(req, res);
    return;
  }

  if (req.url.startsWith("/api/publish/robot-config")) {
    handlePublishRobotConfig(req, res);
    return;
  }

  if (req.url.startsWith("/api/publish/trigger-robot-once")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }
    try {
      const sender = path.join(__dirname, "robot-outbox-send.cjs");
      const result = spawnSync(process.execPath, [sender, "--once"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 90000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const ok = result.status === 0;
      res.writeHead(ok ? 200 : 500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(
        JSON.stringify({
          ok,
          exitCode: result.status,
          output: String(result.stdout || result.stderr || "").trim().slice(-500),
        }),
      );
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(e.message || e));
    }
    return;
  }

  if (req.url.startsWith("/api/publish/outbox")) {
    handlePublishOutbox(req, res);
    return;
  }

  if (req.url.startsWith("/api/platform/health")) {
    handlePlatformHealth(req, res);
    return;
  }

  if (req.url.startsWith("/api/sf-foc/status")) {
    handleSfFocStatus(req, res);
    return;
  }

  const sfFocCasPath = url.parse(req.url).pathname || "";
  if (sfFocCasPath.startsWith("/api/sf-foc/cas/")) {
    handleSfFocCas(req, res);
    return;
  }

  if (req.url.startsWith("/api/sf-foc/")) {
    handleSfFocProxy(req, res);
    return;
  }

  if (req.url.startsWith("/api/review-service/config")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const body = JSON.stringify(getPublicReviewServiceConfig(reviewServiceCfg));
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }

  if (req.url.startsWith("/api/review/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    proxyReviewApi(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  let pathname = url.parse(req.url).pathname || "/";
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (req.method === "HEAD") {
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(err && err.code === "ENOENT" ? 404 : 500);
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": st.size });
      res.end();
    });
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, BIND_HOST, () => {
  resolveAuth().catch(() => {});
  const cfg = loadSfFocConfig();
  if (shouldSpawnLocalReviewApi(reviewServiceCfg)) {
    startReviewApiServer();
  }
  console.log("");
  const bindHint = BIND_HOST === "0.0.0.0" ? `http://localhost:${PORT}/index.html` : `http://${BIND_HOST}:${PORT}/index.html`;
  console.log(`  气象工作台  ${bindHint}`);
  if (reviewServiceCfg.role === "client") {
    console.log(
      `  今日相关     GET /api/review/* -> ${reviewApiTarget.hostname}:${reviewApiTarget.port}（轻客户端，无本机 Python）`,
    );
    console.log(`  复盘搜索     http://${reviewServiceCfg.host}:${reviewServiceCfg.searchPort}`);
  } else {
    console.log(`  今日相关     GET /api/review/* -> 127.0.0.1:${REVIEW_API_PORT}（本机自动启动）`);
    console.log(`  复盘手动检索  review-search/start-search.bat 或 start-review-server.bat -> :8501`);
  }
  console.log(`  METAR 代理   GET /api/data/metar -> aviationweather.gov`);
  console.log(`  台风路径     GET /api/typhoon/list | /api/typhoon/:id -> typhoon.nmc.cn（中央气象台）`);
  console.log(`  检查单配置   GET/POST/DELETE /api/checklist/config -> data/checklist-config.json`);
  console.log(`  运行机场清单 GET/POST /api/config/airports -> data/icao-whitelist.json（整表/merge）`);
  console.log(`  天地图密钥   GET /api/config/tianditu -> data/tianditu-config.local.json`);
  console.log(`  席位环境     GET /api/platform/health（FOC·复盘·批复机场汇总）`);
  console.log(`  生效机场警报 GET/POST/DELETE /api/warnings/active -> data/active-warnings.json`);
  console.log(`  发布存档     GET/POST /api/publish/outbox -> data/publish-outbox.json（含 Next 推送标记）`);
  console.log(`  机器人规则   GET /api/publish/robot-config -> data/robot-publish-config.json`);
  if (cfg.token) {
    console.log(`  公司气象     POST /api/sf-foc/* -> ${cfg.baseUrl}（运行时 token / AuthBroker）`);
  } else {
    console.log(`  公司气象     请在工作台或 MTWS/OMICS 扫码；密钥见 data/sf-foc-config.local.json`);
  }
  console.log("");
});
