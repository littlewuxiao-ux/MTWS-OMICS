/**
 * 复盘搜索：8501 端口 + 首页 HTML 就绪（避免浏览器打开后长时间白屏/转圈）
 *   node tools/launcher-wait-review-ready.cjs --check
 *   node tools/launcher-wait-review-ready.cjs --wait [maxMs] [intervalMs]
 *   node tools/launcher-wait-review-ready.cjs --wait-app [maxMs] [intervalMs]
 */
const net = require("net");
const httpMod = require("http");

const HOST = "127.0.0.1";
const PORT = Number(process.env.REVIEW_SEARCH_PORT) || 8501;
const CHECK_ONLY = process.argv.includes("--check");
const WAIT = process.argv.includes("--wait");
const WAIT_APP = process.argv.includes("--wait-app");
const nums = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
const maxMs = nums[0] || (WAIT_APP ? 120000 : 45000);
const intervalMs = nums[1] || 500;
const READY_MARKERS = ["搜索内容", "复盘智能搜索说明", "航空气象复盘智能搜索系统"];

function portReady() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT, timeout: 800 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function appReady() {
  return new Promise((resolve) => {
    const req = httpMod.get(
      { hostname: HOST, port: PORT, path: "/", timeout: 4000, headers: { Accept: "text/html" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 120000) req.destroy();
        });
        res.on("end", () => {
          const ok =
            (res.statusCode === 200 || res.statusCode === 304) &&
            READY_MARKERS.some((m) => body.includes(m));
          resolve(ok);
        });
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  if (WAIT_APP) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (await appReady()) process.exit(0);
      await sleep(intervalMs);
    }
    process.exit(1);
  }

  if (await portReady()) process.exit(0);
  if (CHECK_ONLY || !WAIT) process.exit(1);

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (await portReady()) process.exit(0);
  }
  process.exit(1);
})();
