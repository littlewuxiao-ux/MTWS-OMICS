/**
 * 检查 data/sf-foc-config.local.json 是否存在且 token 已写入
 *   node tools/sf-foc-config-check.cjs
 */
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "data", "sf-foc-config.local.json");

function main() {
  console.log("\n=== sf-foc-config 检查 ===\n");
  console.log("路径:", CONFIG_PATH);

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("\n✗ 文件不存在。请复制 sf-foc-config.local.json.example 并编辑，或运行 renew-cas-token.bat");
    process.exit(1);
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error("\n✗ JSON 解析失败:", e.message);
    console.error("  请用记事本检查是否多了逗号、注释或乱码");
    process.exit(1);
  }

  const token = String(cfg.token || "").trim();
  console.log("baseUrl:", cfg.baseUrl || "(未填)");
  console.log("casAppKey:", cfg.casAppKey || "(未填)");

  if (!token || token.length < 8) {
    console.error("\n✗ token 为空或未写入");
    console.error("  请运行 renew-cas-token.bat 丰声扫码，或 node tools/sf-foc-set-token.cjs <token>");
    process.exit(1);
  }

  console.log("token:", `${token.slice(0, 16)}… (长度 ${token.length})`);
  console.log("tokenObtainedAt:", cfg.tokenObtainedAt || "(未记录)");
  console.log("\n✓ config 正常\n");
}

main();
