/**
 * 启动小助手前检查 tools 下三个脚本是否拷错文件
 *   node tools/verify-duty-files.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = {
  proxy: path.join(__dirname, "dev-server-proxy.cjs"),
  resolver: path.join(__dirname, "robot-mention-resolver.cjs"),
  sender: path.join(__dirname, "robot-outbox-send.cjs"),
};

function head(file) {
  return fs.readFileSync(file, "utf8").slice(0, 400);
}

function check() {
  let ok = true;
  for (const [name, file] of Object.entries(FILES)) {
    if (!fs.existsSync(file)) {
      console.error(`[X] 缺少 ${file}`);
      ok = false;
    }
  }
  if (!ok) return false;

  const h = {
    proxy: head(FILES.proxy),
    resolver: head(FILES.resolver),
    sender: head(FILES.sender),
  };

  if (!h.proxy.includes("METAR") && !h.proxy.includes("静态")) {
    console.error("[X] dev-server-proxy.cjs 内容不对（应含 METAR/静态站）");
    ok = false;
  }
  if (!h.resolver.includes("robot-publish-config")) {
    console.error("[X] robot-mention-resolver.cjs 内容不对（应含 robot-publish-config）");
    ok = false;
  }
  if (h.resolver.includes("本地机器人发群")) {
    console.error("[X] robot-mention-resolver.cjs 被误拷成 robot-outbox-send，请从笔记本重新同步");
    ok = false;
  }
  if (!h.sender.includes("webhookUrl") || !h.sender.includes("本地机器人发群")) {
    console.error("[X] robot-outbox-send.cjs 内容不对");
    ok = false;
  }
  if (h.proxy.includes("本地机器人发群")) {
    console.error("[X] dev-server-proxy.cjs 被误拷成 robot-outbox-send，请从笔记本重新同步");
    ok = false;
  }

  const cfgPath = path.join(ROOT, "data", "robot-publish-config.json");
  if (!fs.existsSync(cfgPath)) {
    console.error("[X] 缺少 data/robot-publish-config.json");
    ok = false;
  } else {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      const url = String(cfg?.targetGroup?.webhookUrl || "").trim();
      if (!url || url.includes("在此填入")) {
        console.error("[X] robot-publish-config.json 里 targetGroup.webhookUrl 未填写");
        ok = false;
      }
    } catch (e) {
      console.error("[X] robot-publish-config.json 不是合法 JSON:", e.message);
      ok = false;
    }
  }

  if (ok) {
    console.log("[OK] 文件检查通过，可以 start-duty.bat");
  }
  return ok;
}

process.exit(check() ? 0 : 1);
