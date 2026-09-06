/**
 * 工作台启动就绪检测（轻量：仅看 8787 是否可连，不走 /api/platform/health 的 DNS 探测）
 *
 *   node tools/launcher-wait-ready.cjs --check
 *   node tools/launcher-wait-ready.cjs --wait [maxMs] [intervalMs]
 */
const net = require("net");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8787;
const CHECK_ONLY = process.argv.includes("--check");
const WAIT = process.argv.includes("--wait");
const nums = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
const maxMs = nums[0] || 20000;
const intervalMs = nums[1] || 300;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  if (await portReady()) process.exit(0);
  if (CHECK_ONLY || !WAIT) process.exit(1);

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (await portReady()) process.exit(0);
  }
  process.exit(1);
})();
