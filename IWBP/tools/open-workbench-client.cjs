/**
 * 席位 2 轻客户端：打开浏览器连主工作台，不在本机启动 8787。
 *   node tools/open-workbench-client.cjs           打开浏览器
 *   node tools/open-workbench-client.cjs --check   检测主台是否可达
 *   node tools/open-workbench-client.cjs --url-only  仅打印 URL
 */
const http = require("http");
const { execSync } = require("child_process");
const {
  loadWorkbenchServiceConfig,
  getWorkbenchIndexUrl,
  getWorkbenchBaseUrl,
  CONFIG_PATH,
} = require("./workbench-service-config.cjs");

function checkHealth(baseUrl, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL("/api/platform/health", baseUrl);
    } catch {
      resolve(false);
      return;
    }
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const cfg = loadWorkbenchServiceConfig();
  if (cfg.role !== "client") {
    console.error("[X] 当前非 client 模式。");
    console.error(`    请在 ${CONFIG_PATH} 中设置 role=client 与 host（主工作台 IP）。`);
    console.error("    可参考 data/workbench-service-config.client.example.json");
    process.exit(1);
  }

  const baseUrl = getWorkbenchBaseUrl(cfg);
  const indexUrl = getWorkbenchIndexUrl(cfg);

  if (process.argv.includes("--url-only")) {
    console.log(indexUrl);
    return;
  }

  if (process.argv.includes("--check")) {
    const ok = await checkHealth(baseUrl);
    if (ok) {
      console.log(`[OK] 主工作台可达：${baseUrl}`);
      process.exit(0);
    }
    console.error(`[X] 无法连接主工作台：${baseUrl}`);
    console.error("    请确认：席位 1 已运行 start-workbench-quiet.bat；");
    console.error("    席位 1 IP 正确；Windows 防火墙已放行 8787（内网）。");
    process.exit(1);
  }

  const ok = await checkHealth(baseUrl);
  if (!ok) {
    console.error(`[X] 主工作台未响应：${baseUrl}`);
    console.error("    请先启动席位 1，或检查 data/workbench-service-config.json 中的 host。");
    process.exit(1);
  }

  if (process.platform === "win32") {
    execSync(`start "" "${indexUrl}"`, { stdio: "ignore", shell: true });
  } else {
    console.log(`请在浏览器打开：${indexUrl}`);
  }
  console.log(`[OK] 已打开：${indexUrl}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
