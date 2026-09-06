/**
 * 查 tools 下哪个 .cjs 被误拷成 robot-outbox-send
 *   node tools/diagnose-start.cjs
 */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const BAD = "用法: node tools/robot-outbox-send.cjs";

const CHECKS = [
  ["dev-server-proxy.cjs", ["METAR", "server.listen"]],
  ["robot-mention-resolver.cjs", ["robot-publish-config", "enrichOutboxEntry"]],
  ["publish-deadline.cjs", ["computePublishDeadlineAt"]],
  ["sf-foc-headers.cjs", ["buildSfFocRequestHeaders"]],
  ["review-service-config.cjs", ["loadReviewServiceConfig"]],
  ["robot-outbox-send.cjs", ["webhookUrl", "runOnce"]],
];

let bad = false;
for (const [file, must] of CHECKS) {
  const fp = path.join(DIR, file);
  if (!fs.existsSync(fp)) {
    console.log("[X] 缺少", file);
    bad = true;
    continue;
  }
  const text = fs.readFileSync(fp, "utf8");
  if (file !== "robot-outbox-send.cjs" && text.includes(BAD)) {
    console.log("[X] 拷错了:", file, "← 内容是小助手 robot-outbox-send，必须重拷");
    bad = true;
    continue;
  }
  const miss = must.filter((m) => !text.includes(m));
  if (miss.length) {
    console.log("[X] 内容不对:", file, "缺少", miss.join(", "));
    bad = true;
  } else {
    console.log("[OK]", file);
  }
}

if (bad) {
  console.log("\n修复：从笔记本整夹覆盖 tools\\ 到席位（不要一个个猜）");
  process.exit(1);
}
console.log("\n[OK] tools 文件齐全，可 start.bat");
