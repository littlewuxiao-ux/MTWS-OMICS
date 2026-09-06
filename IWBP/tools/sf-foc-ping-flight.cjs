/**
 * 公司 FOC 航班计划接口自检（在项目根目录运行）
 *   node tools/sf-foc-ping-flight.cjs
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildSfFocRequestHeaders, isExternalUatBaseUrl } = require("./sf-foc-headers.cjs");

const CONFIG_PATH = path.join(__dirname, "..", "data", "sf-foc-config.local.json");
const FLIGHT_CFG_PATH = path.join(__dirname, "..", "data", "flight-monitor-config.json");

function loadCfg() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("缺少 data/sf-foc-config.local.json");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function loadFlightCfg() {
  const defaults = { carriers: ["O3"], hoursBack: 24, hoursAhead: 48 };
  try {
    if (fs.existsSync(FLIGHT_CFG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(FLIGHT_CFG_PATH, "utf8")) };
    }
  } catch (_) {}
  return defaults;
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

function airportsFromFlights(flights, carriers) {
  const carrierSet =
    Array.isArray(carriers) && carriers.length
      ? new Set(carriers.map((c) => String(c).trim().toUpperCase()))
      : null;
  const out = new Set();
  for (const f of flights) {
    if (!f) continue;
    if (carrierSet && !carrierSet.has(String(f.carrier || "").trim().toUpperCase())) continue;
    for (const key of ["departureAirport", "arrivalAirport"]) {
      const code = String(f[key] || "")
        .trim()
        .toUpperCase();
      if (code.length === 4) out.add(code);
    }
  }
  return [...out].sort();
}

async function main() {
  const cfg = loadCfg();
  const flightCfg = loadFlightCfg();
  const base = String(cfg.baseUrl || "").replace(/\/$/, "");
  const pathFlight = "/flight/flightSchedule/getByFlightDate";

  console.log("\n=== 公司 FOC 航班计划自检 ===\n");
  console.log("baseUrl:", base);
  console.log(
    "鉴权:",
    isExternalUatBaseUrl(base) ? "UAT 外网（Token）" : "内网 Market API（systemKey+accessKey+token）",
  );
  console.log("承运人过滤:", (flightCfg.carriers || []).join(", ") || "不过滤");
  console.log("时间窗: -", flightCfg.hoursBack, "h / +", flightCfg.hoursAhead, "h");

  const auth = buildSfFocRequestHeaders(cfg);
  if (auth.error) {
    console.log("\n配置:", auth.error);
    process.exit(1);
  }

  const now = Date.now();
  const body = {
    startTime: now - flightCfg.hoursBack * 60 * 60 * 1000,
    endTime: now + flightCfg.hoursAhead * 60 * 60 * 1000,
    excludeCancel: true,
    excludeHaveAta: true,
  };

  try {
    const r = await postJson(`${base}${pathFlight}`, auth.headers, body);
    console.log("\nHTTP", r.status, "success=", r.json?.success);
    if (!r.json?.success) {
      if (r.json?.errorMessage) console.log("错误:", r.json.errorMessage);
      else console.log("响应:", (r.text || "").slice(0, 200));
      process.exit(1);
    }
    const flights = Array.isArray(r.json.obj) ? r.json.obj : [];
    const airports = airportsFromFlights(flights, flightCfg.carriers);
    console.log("航班数:", flights.length);
    console.log("机场池:", airports.length, "站");
    if (airports.length) console.log("样例:", airports.slice(0, 12).join(", "), airports.length > 12 ? "…" : "");
    if (flights[0]) {
      const s = flights[0];
      console.log(
        "首条航班:",
        `${s.carrier || ""}${s.flightNo || ""}`,
        s.departureAirport,
        "→",
        s.arrivalAirport,
      );
    }
    console.log("\n✓ 航班接口可用。启动 start.bat 后告警屏报文监控将优先使用航班机场池。\n");
  } catch (e) {
    console.log("\n请求失败:", e.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
