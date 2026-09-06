/**
 * 公司 FOC 接口连通性自检（在项目根目录运行）
 *   node tools/sf-foc-ping.cjs
 */
const dns = require("dns");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildSfFocRequestHeaders, isExternalUatBaseUrl } = require("./sf-foc-headers.cjs");

const CONFIG_PATH = path.join(__dirname, "..", "data", "sf-foc-config.local.json");

function loadCfg() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("缺少 data/sf-foc-config.local.json");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function lookup(host) {
  return new Promise((resolve) => {
    dns.lookup(host, (err, address) => resolve({ err, address }));
  });
}

function postJson(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + (u.search || ""),
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
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
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const cfg = loadCfg();
  const base = String(cfg.baseUrl || "").replace(/\/$/, "");
  const host = new URL(base + "/").hostname;
  const external = isExternalUatBaseUrl(base);
  const gatewayLabel = base.includes("uat.") ? "UAT 外网网关" : "生产外网网关";

  console.log("\n=== 公司 FOC 连通性自检 ===\n");
  console.log("baseUrl:", base);
  console.log("鉴权模式:", external ? `${gatewayLabel}（仅 Token + 可选 sfUserId）` : "内网 Market API（systemKey+accessKey+token）");
  console.log("token:", cfg.token ? `${String(cfg.token).slice(0, 12)}…` : "缺失");
  if (external) {
    console.log("sfUserId:", cfg.sfUserId || "未填（可选，F12 里 Sga-Userid）");
  } else {
    console.log("systemKey:", cfg.systemKey ? "已配置" : "缺失");
    console.log("accessKey:", cfg.accessKey ? "已配置" : "缺失");
  }

  const auth = buildSfFocRequestHeaders(cfg);
  if (auth.error) {
    console.log("\n配置:", auth.error);
    process.exit(1);
  }

  const { err, address } = await lookup(host);
  if (err) {
    console.log("\nDNS:", "失败 —", err.message);
    process.exit(2);
  }

  console.log("\nDNS:", "成功 —", address);

  const body = { airport4Codes: ["ZBAA"], observationTime: Date.now() - 2 * 60 * 60 * 1000 };
  const paths = ["/met/dispatchMetarMetTel/queryMetarTelList"];

  try {
    for (const p of paths) {
      const met = await postJson(`${base}${p}`, auth.headers, body);
      console.log(`\n试路径 ${p}`);
      console.log("  HTTP", met.status, "success=", met.json?.success);
      if (met.json?.success) {
        if (Array.isArray(met.json.obj) && met.json.obj[0]) {
          console.log("  样例:", String(met.json.obj[0].content || "").slice(0, 80));
        }
        console.log("\n✓ 联调通过。请 npm start 后打开 http://localhost:8787/index.html 测试告警屏。\n");
        return;
      }
      if (met.json?.errorMessage) console.log("  错误:", met.json.errorMessage);
      else if (met.status >= 400) console.log("  响应:", met.text.slice(0, 120));
    }
    if (external) {
      console.log(
        "\n说明：401 异地登录 / token 失效 → 在席位1运行 renew-cas-token.bat 重新丰声扫码。" +
          "403 本地鉴权 → 检查路径是否多了 api/ 前缀；外网网关勿填 systemKey/accessKey。\n",
      );
    }
  } catch (e) {
    console.log("\nMETAR 试请求失败:", e.message);
  }

  console.log("\n若以上均 OK，请 npm start 后打开 http://localhost:8787/index.html 测试告警屏。\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
