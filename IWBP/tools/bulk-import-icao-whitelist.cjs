/**
 * 从文本/CSV 批量导入 ICAO 到 data/icao-whitelist.json（需先 start.bat 或 dev-server 在跑）
 *
 * 用法：
 *   node tools/bulk-import-icao-whitelist.cjs airports.txt
 *   node tools/bulk-import-icao-whitelist.cjs airports.csv --merge
 *   type airports.txt | node tools/bulk-import-icao-whitelist.cjs -
 *
 * 文本每行一个四字码，或 CSV/Excel 导出里含 Z*** 的单元格会自动提取。
 */
const fs = require("fs");
const http = require("http");

const PORT = Number(process.env.PORT) || 8787;
const fileArg = process.argv[2];
const merge = process.argv.includes("--merge");

function extractIcaoFromLine(line) {
  const out = [];
  const re = /\b[A-Z]{4}\b/gi;
  let m;
  while ((m = re.exec(line))) out.push(m[0].toUpperCase());
  return out;
}

function readInput() {
  if (!fileArg || fileArg === "-") {
    return fs.readFileSync(0, "utf8");
  }
  return fs.readFileSync(fileArg, "utf8");
}

const text = readInput();
const icao = [...new Set(text.split(/\r?\n/).flatMap(extractIcaoFromLine))].sort();
if (!icao.length) {
  console.error("未解析到任何四字码，请检查输入文件。");
  process.exit(1);
}

const body = JSON.stringify({
  action: merge ? "merge" : undefined,
  version: 2,
  updated: new Date().toISOString().slice(0, 10),
  label: merge ? undefined : "公司运行机场清单（批量导入）",
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
        console.error(`HTTP ${res.statusCode}: ${buf}`);
        process.exit(1);
      }
      const data = JSON.parse(buf);
      console.log(`${merge ? "合并" : "替换"}完成：${data.count} 站 -> data/icao-whitelist.json`);
    });
  },
);

req.on("error", (e) => {
  console.error(`无法连接 http://127.0.0.1:${PORT} ，请先运行 start.bat`);
  console.error(e.message);
  process.exit(1);
});
req.end(body);
