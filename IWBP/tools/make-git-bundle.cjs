/**
 * 自动提交未保存改动，并打包 Git 历史为 .bundle（经聊天软件传到席位）。
 * 用法：npm run bundle  或双击 生成Git同步包.bat
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
}

function beijingStamp() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}${g("month")}${g("day")}-${g("hour")}${g("minute")}`;
}

function beijingReadable() {
  const p = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

function autoCommitIfNeeded(stamp) {
  const status = run("git status --porcelain");
  if (!status) {
    console.log("无未提交改动，直接打包当前版本。");
    return false;
  }
  run("git add -A");
  const names = run("git diff --cached --name-only")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const preview = names.slice(0, 8).join(", ");
  const more = names.length > 8 ? ` 等 ${names.length} 个文件` : "";
  const title = `Update workbench for seat sync (${stamp}).`;
  const body = `Changed: ${preview}${more}`;
  const msgPath = path.join(ROOT, ".git-commit-msg.tmp");
  fs.writeFileSync(msgPath, `${title}\n\n${body}\n`, "utf8");
  try {
    run(`git commit -F "${msgPath}"`);
  } finally {
    try {
      fs.unlinkSync(msgPath);
    } catch {
      /* ignore */
    }
  }
  console.log(`已自动提交 ${names.length} 个文件。`);
  return true;
}

try {
  run("git rev-parse --is-inside-work-tree");
} catch {
  console.error("错误：当前目录不是 Git 仓库。");
  process.exit(1);
}

const stamp = beijingStamp();
console.log("");
console.log(`=== 席位 Git 同步包 · ${beijingReadable()} ===`);
console.log("");

autoCommitIfNeeded(stamp);

const branch = run("git rev-parse --abbrev-ref HEAD");
const commit = run("git rev-parse --short HEAD");
const subject = run("git log -1 --format=%s").replace(/\s+/g, " ");
const fileName = `weather-v2-${stamp}.bundle`;
const outPath = path.join(ROOT, fileName);

const oldBundles = fs
  .readdirSync(ROOT)
  .filter((f) => /^weather-v2-\d{8}-\d{4}\.bundle$/.test(f))
  .map((f) => ({ f, m: fs.statSync(path.join(ROOT, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);
for (const { f } of oldBundles.slice(2)) {
  try {
    fs.unlinkSync(path.join(ROOT, f));
    console.log(`已删除旧 bundle：${f}`);
  } catch {
    /* ignore */
  }
}

run(`git bundle create "${fileName}" ${branch}`);
const sizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);

console.log("");
console.log("=== 完成：请用聊天软件发送下面这个文件到席位 ===");
console.log("");
console.log(`  ${outPath}`);
console.log(`  （${sizeMb} MB · ${commit} · ${subject}）`);
console.log("");
console.log("【席位】下载后 PowerShell 执行：");
console.log("");
console.log('  cd "D:\\weather agent\\V2"');
console.log(`  git pull "D:\\weather agent\\${fileName}" ${branch}`);
console.log("  git log -1");
console.log("");
