/**
 * 顺丰航空网关（生产 sfa-wgw-inn / UAT sfa-wgw-inn.uat）：IT 说明外网仅 Token，不带 systemKey/accessKey。
 * 内网 Market API（public-api-market-apis…）：systemKey + accessKey + token。
 */
function isSfaGatewayBaseUrl(baseUrl) {
  const u = String(baseUrl || "").toLowerCase();
  return u.includes("sfa-wgw-inn") || u.includes("sfa-wgw");
}

/** @deprecated 别名，保持旧脚本兼容 */
const isExternalUatBaseUrl = isSfaGatewayBaseUrl;

function buildSfFocRequestHeaders(cfg) {
  const base = String(cfg?.baseUrl || "");
  if (!cfg?.token) {
    return { error: "缺少 token：请在工作台或 MTWS/OMICS 页面丰声扫码" };
  }

  if (isSfaGatewayBaseUrl(base)) {
    const headers = {
      Accept: "application/json",
      Token: cfg.token,
    };
    if (cfg.sfUserId) {
      const uid = String(cfg.sfUserId);
      headers["Sga-Userid"] = uid;
      headers["X-Sf-Userid"] = uid;
    }
    return { headers, mode: "sfa-gateway" };
  }

  if (!cfg.systemKey || !cfg.accessKey) {
    return { error: "内网 Market API 需 systemKey + accessKey + token" };
  }

  return {
    headers: {
      Accept: "application/json",
      systemKey: cfg.systemKey,
      accessKey: cfg.accessKey,
      token: cfg.token,
    },
    mode: "market-api",
  };
}

function isSfFocReady(cfg, dnsOk) {
  if (!dnsOk || !cfg?.token) return false;
  if (isSfaGatewayBaseUrl(cfg.baseUrl)) return true;
  return !!(cfg.systemKey && cfg.accessKey);
}

module.exports = { isSfaGatewayBaseUrl, isExternalUatBaseUrl, buildSfFocRequestHeaders, isSfFocReady };
