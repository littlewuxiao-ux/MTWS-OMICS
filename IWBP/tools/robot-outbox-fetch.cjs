/**
 * 预览待发池（供领慧定时任务联调 / 人工检查）
 *
 * 用法（需 start.bat 已启动）：
 *   node tools/robot-outbox-fetch.cjs
 *   node tools/robot-outbox-fetch.cjs --type=alert
 *   node tools/robot-outbox-fetch.cjs --type=period --slot=h4
 *   node tools/robot-outbox-fetch.cjs --overdue
 */
const http = require("http");
const url = require("url");

const BASE = process.env.WORKBENCH_BASE || "http://127.0.0.1:8787";

function parseArgs(argv) {
  const opts = { type: "", slot: "", overdue: false, pending: true };
  for (const arg of argv.slice(2)) {
    if (arg === "--overdue") opts.overdue = true;
    else if (arg === "--all") opts.pending = false;
    else if (arg.startsWith("--type=")) opts.type = arg.slice(7);
    else if (arg.startsWith("--slot=")) opts.slot = arg.slice(7);
  }
  return opts;
}

function fetchJson(pathname) {
  return new Promise((resolve, reject) => {
    const target = url.parse(BASE + pathname);
    http
      .get(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.path,
          headers: { Accept: "application/json" },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch (e) {
              reject(new Error(`JSON 解析失败: ${e.message}\n${body.slice(0, 200)}`));
            }
          });
        },
      )
      .on("error", reject);
  });
}

function summarizeItem(item) {
  const mentions = (item.mentions || [])
    .map((m) => m.label + (m.nextUserId ? `(${m.nextUserId})` : "(未填userId)"))
    .join(", ");
  return [
    `id: ${item.id}`,
    `kind: ${item.contentKind || item.type}`,
    `urgency: ${item.urgency || "-"}`,
    `station: ${item.station || "-"}`,
    `slot: ${item.periodSlotId || "-"}`,
    `@: ${mentions || "无"}`,
    `atUserIds: ${(item.atUserIds || []).join(", ") || "无"}`,
    `sendMarkdown: ${String(item.sendMarkdown || item.text || "").slice(0, 120).replace(/\s+/g, " ")}…`,
  ].join("\n    ");
}

async function main() {
  const opts = parseArgs(process.argv);
  const qs = new URLSearchParams();
  if (opts.pending) qs.set("pending", "1");
  qs.set("enrich", "1");
  if (opts.type) qs.set("type", opts.type);
  if (opts.slot) qs.set("slot", opts.slot);
  if (opts.overdue) qs.set("overdue", "1");

  const path = `/api/publish/outbox?${qs.toString()}`;
  console.log(`GET ${BASE}${path}\n`);

  const { status, data } = await fetchJson(path);
  if (status !== 200) {
    console.error(`[X] HTTP ${status}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const items = Array.isArray(data.items) ? data.items : [];
  console.log(`待发 ${items.length} 条（库内共 ${data.total ?? "?"} 条）\n`);
  if (!items.length) {
    console.log("（无待发项）");
    return;
  }
  items.forEach((item, i) => {
    console.log(`--- [${i + 1}] ---`);
    console.log(`    ${summarizeItem(item).replace(/\n    /g, "\n    ")}`);
    console.log("");
  });
}

main().catch((e) => {
  console.error("[X]", e.message);
  console.error("请确认 start.bat 已启动且地址正确:", BASE);
  process.exit(1);
});
