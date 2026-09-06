/**
 * 从 IT 提供的「SF运行批复机场名单」导入到公司数据文件。
 *
 * 用法：
 *   node tools/import-sf-approved-airports.cjs "C:\Users\...\SF运行运行批复机场名单.txt"
 *   node tools/import-sf-approved-airports.cjs   （默认读桌面同名文件）
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_SRC = path.join(process.env.USERPROFILE || "", "Desktop", "SF运行运行批复机场名单.txt");
const OUT_PATH = path.join(ROOT, "data", "sf-approved-airports.json");
const PORT = Number(process.env.PORT) || 8787;

function parseAviationGeo(s) {
  const m = String(s || "")
    .trim()
    .match(/^([NSEW])(\d+)$/i);
  if (!m) return null;
  const hemi = m[1].toUpperCase();
  const digits = m[2];
  let deg;
  let min;
  let sec;
  if (hemi === "N" || hemi === "S") {
    deg = Number(digits.slice(0, 2));
    min = Number(digits.slice(2, 4));
    sec = Number(`${digits.slice(4, 6)}.${digits.slice(6) || "0"}`);
  } else {
    deg = Number(digits.slice(0, 3));
    min = Number(digits.slice(3, 5));
    sec = Number(`${digits.slice(5, 7)}.${digits.slice(7) || "0"}`);
  }
  let dec = deg + min / 60 + sec / 3600;
  if (hemi === "S" || hemi === "W") dec = -dec;
  return Number(dec.toFixed(6));
}

function normalizeRow(row) {
  const icao = String(row.airport4Code || row.id || "")
    .trim()
    .toUpperCase();
  if (icao.length !== 4) return null;
  const lat = parseAviationGeo(row.geoLat);
  const lon = parseAviationGeo(row.geoLong);
  return {
    icao,
    iata: String(row.airport3Code || "").trim().toUpperCase() || null,
    name: String(row.airportChn || row.text || icao).trim(),
    nameEng: String(row.airportEng || "").trim() || null,
    city: String(row.cityChn || "").trim() || null,
    fir: String(row.firCode || "").trim().toUpperCase() || null,
    lat,
    lon,
  };
}

function postIcaoWhitelist(icao) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      version: 2,
      updated: new Date().toISOString().slice(0, 10),
      label: "公司运行批复机场（自 IT 名单导入）",
      alertPublishMode: "union",
      icao,
    });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/config/airports",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`whitelist HTTP ${res.statusCode}: ${buf}`));
            return;
          }
          resolve(JSON.parse(buf));
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function writeIcaoWhitelistDirect(icao) {
  const p = path.join(ROOT, "data", "icao-whitelist.json");
  const out = {
    version: 2,
    updated: new Date().toISOString().slice(0, 10),
    label: "公司运行批复机场（自 IT 名单导入）",
    alertPublishMode: "union",
    icao,
  };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2), "utf8");
  return out;
}

async function main() {
  const src = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SRC;
  if (!fs.existsSync(src)) {
    console.error(`找不到文件: ${src}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(src, "utf8"));
  if (!Array.isArray(raw)) {
    console.error("文件格式应为 JSON 数组");
    process.exit(1);
  }

  const byIcao = new Map();
  for (const row of raw) {
    const item = normalizeRow(row);
    if (!item) continue;
    byIcao.set(item.icao, item);
  }

  const items = [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
  const withCoords = items.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)).length;

  const outDoc = {
    version: 1,
    updated: new Date().toISOString().slice(0, 10),
    sourceFile: path.basename(src),
    count: items.length,
    withCoords,
    items,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(outDoc, null, 2), "utf8");
  console.log(`已写入 ${OUT_PATH}`);
  console.log(`  机场 ${items.length} 个，含坐标 ${withCoords} 个`);

  const icao = items.map((x) => x.icao);
  try {
    const wl = await postIcaoWhitelist(icao);
    console.log(`已更新 data/icao-whitelist.json（${wl.count} 站，经 API）`);
  } catch (e) {
    const wl = writeIcaoWhitelistDirect(icao);
    console.log(`已直接写入 data/icao-whitelist.json（${wl.icao.length} 站，dev-server 未运行）`);
  }

  console.log("");
  console.log("示例：");
  for (const code of ["ZGGG", "ZUCK", "ZBHH"]) {
    const x = byIcao.get(code);
    if (x) console.log(`  ${x.icao} ${x.name}  ${x.lat}, ${x.lon}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
