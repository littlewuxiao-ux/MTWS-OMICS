/** 将本机设为复盘轻客户端：node tools/set-review-client.cjs 192.168.1.50 */
const fs = require("fs");
const path = require("path");

const host = (process.argv[2] || "").trim();
if (!host) {
  console.error("用法: node tools/set-review-client.cjs <服务机IP>");
  process.exit(1);
}

const outPath = path.join(__dirname, "..", "data", "review-service-config.json");
const payload = {
  role: "client",
  host,
  apiPort: 8502,
  searchPort: 8501,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log("已写入", outPath);
console.log(JSON.stringify(payload, null, 2));
console.log("");
console.log("轻客户端配置完成。本机只需 start.bat，无需 Python / 模型。");
