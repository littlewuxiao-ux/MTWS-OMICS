/**
 * CAS / FOC token expiry hints for platform health and UI.
 */
function parseJwtExpMs(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    const payload = JSON.parse(json);
    if (payload.exp && Number.isFinite(Number(payload.exp))) return Number(payload.exp) * 1000;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function parseIsoMs(val) {
  if (!val) return null;
  const ms = new Date(val).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatRemainingZh(remainingMs) {
  if (remainingMs == null) return "";
  if (remainingMs <= 0) return "已过期";
  const totalMin = Math.floor(remainingMs / 60000);
  if (totalMin < 60) return `约 ${totalMin} 分钟后过期`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `约 ${h} 小时 ${m} 分钟后过期` : `约 ${h} 小时后过期`;
}

function formatBeijingShort(ms) {
  if (ms == null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function getSfFocTokenMeta(cfg = {}) {
  const now = Date.now();
  const hasToken = Boolean(String(cfg.token || "").trim() && !String(cfg.token).includes("F12"));

  let expiresAtMs = parseIsoMs(cfg.tokenExpiresAt);
  let source = expiresAtMs ? "config" : "unknown";

  if (!expiresAtMs && hasToken) {
    const jwtExp = parseJwtExpMs(cfg.token);
    if (jwtExp) {
      expiresAtMs = jwtExp;
      source = "jwt";
    }
  }

  if (!expiresAtMs && hasToken && cfg.tokenObtainedAt) {
    const ttlHours = Number(cfg.tokenTtlHours);
    const ttl = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 12;
    const obtainedMs = parseIsoMs(cfg.tokenObtainedAt);
    if (obtainedMs) {
      expiresAtMs = obtainedMs + ttl * 3600000;
      source = "estimated";
    }
  }

  const remainingMs = expiresAtMs != null ? expiresAtMs - now : null;
  let status = "unknown";
  if (!hasToken) status = "missing";
  else if (expiresAtMs == null) status = "unknown";
  else if (remainingMs <= 0) status = "expired";
  else if (remainingMs <= 2 * 3600000) status = "warn";
  else status = "ok";

  const renewHint = "在首页使用丰声扫码续登（或运行 renew-cas-token.bat）";

  return {
    hasToken,
    status,
    source,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    expiresAtBeijing: expiresAtMs ? formatBeijingShort(expiresAtMs) : null,
    remainingMs,
    remainingText: formatRemainingZh(remainingMs),
    renewHint,
    warnWithinMs: 2 * 3600000,
  };
}

module.exports = {
  getSfFocTokenMeta,
  formatRemainingZh,
  formatBeijingShort,
};
