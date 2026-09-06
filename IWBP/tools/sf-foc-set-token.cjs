/**
 * 将 cas_login.py 扫码得到的 token 写入 data/sf-foc-config.local.json
 *
 * 用法：
 *   node tools/sf-foc-set-token.cjs <token>
 * 或粘贴后回车：
 *   node tools/sf-foc-set-token.cjs
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "sf-foc-config.local.json");
const EXAMPLE_PATH = path.join(ROOT, "data", "sf-foc-config.local.json.example");

function readTokenFromArgv() {
  const arg = process.argv.slice(2).join(" ").trim();
  return arg || "";
}

function promptToken() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("粘贴 CAS token 后回车：", (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function main() {
  let token = readTokenFromArgv();
  if (!token) token = await promptToken();
  if (!token) {
    console.error("未提供 token。用法：node tools/sf-foc-set-token.cjs <token>");
    process.exit(1);
  }

  let cfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } else if (fs.existsSync(EXAMPLE_PATH)) {
    cfg = JSON.parse(fs.readFileSync(EXAMPLE_PATH, "utf8"));
    if (cfg.systemKey === "向 IT 索取后填入") cfg.systemKey = "";
    if (cfg.accessKey === "向 IT 索取后填入") cfg.accessKey = "";
  }

  cfg.token = token;
  cfg.tokenObtainedAt = new Date().toISOString();
  try {
    const parts = String(token).split(".");
    if (parts.length >= 2) {
      const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8"));
      if (payload.exp) cfg.tokenExpiresAt = new Date(Number(payload.exp) * 1000).toISOString();
    }
  } catch (_) {
    delete cfg.tokenExpiresAt;
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  console.log(`已写入 token 到 ${CONFIG_PATH}`);
  console.log("若 npm start 正在运行，无需重启；直接刷新页面再试。");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
