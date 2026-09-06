/**
 * IWBP 运行时登录态：请求头 > 进程内存 > AuthBroker。
 * 不再把 CAS token 写入 sf-foc-config.local.json。
 */
const http = require("http");
const url = require("url");

const AUTH_BROKER_PORT = Number(process.env.AUTH_BROKER_PORT || 19529);
const PLACEHOLDERS = new Set(["", "--", "-", "OFFLINE", "UNKNOWN", "UNDEFINED", "NULL", "NONE"]);

let runtime = { token: "", userCode: "", displayName: "" };

function isUsable(value) {
  const s = String(value || "").trim();
  return Boolean(s) && !PLACEHOLDERS.has(s.toUpperCase());
}

function getRuntimeAuth() {
  return { token: runtime.token, userCode: runtime.userCode, displayName: runtime.displayName };
}

function setRuntimeAuth({ token, userCode, displayName } = {}) {
  if (isUsable(token)) runtime.token = String(token).trim();
  if (isUsable(userCode)) runtime.userCode = String(userCode).trim();
  if (displayName) runtime.displayName = String(displayName);
  return getRuntimeAuth();
}

function extractRequestToken(req) {
  if (!req || !req.headers) return "";
  const auth = String(req.headers.authorization || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer && isUsable(bearer[1])) return bearer[1].trim();
  const headerToken = req.headers.token || req.headers["x-auth-token"];
  return isUsable(headerToken) ? String(headerToken).trim() : "";
}

function extractRequestUserCode(req) {
  if (!req || !req.headers) return "";
  const code = req.headers["x-user-code"] || req.headers["sga-userid"];
  return isUsable(code) ? String(code).trim() : "";
}

function getBrokerAuth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: AUTH_BROKER_PORT,
        path: "/auth/status",
        timeout: 1500,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (data.logged_in && isUsable(data.token) && isUsable(data.userCode)) {
              resolve({
                token: data.token,
                userCode: data.userCode,
                displayName: data.displayName || "",
              });
              return;
            }
          } catch (_) {}
          resolve(null);
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function pushBrokerAuth(token, userCode, displayName) {
  if (!isUsable(token) || !isUsable(userCode)) return;
  const body = JSON.stringify({
    token,
    userCode,
    displayName: displayName || "",
    source: "IWBP",
  });
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: AUTH_BROKER_PORT,
      path: "/auth/update",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 1500,
    },
    () => {},
  );
  req.on("error", () => {});
  req.on("timeout", () => req.destroy());
  req.write(body);
  req.end();
}

async function resolveAuth(req) {
  const headerToken = extractRequestToken(req);
  const headerUser = extractRequestUserCode(req);
  if (isUsable(headerToken)) {
    const auth = {
      token: headerToken,
      userCode: headerUser || runtime.userCode,
      displayName: runtime.displayName,
    };
    setRuntimeAuth(auth);
    return auth;
  }
  if (isUsable(runtime.token)) return getRuntimeAuth();
  const broker = await getBrokerAuth();
  if (broker) {
    setRuntimeAuth(broker);
    return broker;
  }
  return getRuntimeAuth();
}

function proxyAuthBroker(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }
  const parsed = url.parse(req.url);
  const headers = { ...req.headers, host: `127.0.0.1:${AUTH_BROKER_PORT}` };
  delete headers.connection;
  const opts = {
    hostname: "127.0.0.1",
    port: AUTH_BROKER_PORT,
    path: parsed.path,
    method: req.method,
    headers,
    timeout: 3000,
  };
  const up = http.request(opts, (r) => {
    const outHeaders = { ...r.headers, "Access-Control-Allow-Origin": "*" };
    res.writeHead(r.statusCode || 502, outHeaders);
    r.pipe(res);
  });
  up.on("error", () => {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ success: false, logged_in: false }));
  });
  up.on("timeout", () => {
    up.destroy();
  });
  if (req.method === "POST" || req.method === "PUT") req.pipe(up);
  else up.end();
}

module.exports = {
  resolveAuth,
  setRuntimeAuth,
  getRuntimeAuth,
  pushBrokerAuth,
  proxyAuthBroker,
  isUsable,
};
