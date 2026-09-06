/**
 * Merge warning-map mode onto index0702最新版.html (stable base before map work).
 * Map CSS/JS/HTML extracted from index.html.reconstructed + truncated.bak.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const BASE = path.join(ROOT, "index0702最新版.html");
const RECON = path.join(ROOT, "index.html.reconstructed");
const TRUNC = path.join(ROOT, "index.html.truncated.bak");
const OUT = path.join(ROOT, "index.html");

function extractBetween(text, start, end, label) {
  const si = text.indexOf(start);
  const ei = text.indexOf(end, si + start.length);
  if (si < 0 || ei < 0) throw new Error(`Cannot extract ${label}`);
  return text.slice(si, ei);
}

function mustReplace(content, oldStr, newStr, label) {
  if (!content.includes(oldStr)) throw new Error(`Patch failed: ${label}`);
  return content.replace(oldStr, newStr);
}

const base = fs.readFileSync(BASE, "utf8");
const recon = fs.readFileSync(RECON, "utf8");
const trunc = fs.readFileSync(TRUNC, "utf8");

const mapCss = extractBetween(
  trunc,
  "      body.warning-map-embed .app {",
  "      .refined-modal-drag-handle {",
  "map CSS",
);

const mapEmbedHtml = extractBetween(
  recon,
  '    <div id="warningMapEmbedRoot" class="warning-map-embed-root" hidden>',
  '    <div class="warning-modal-backdrop" id="msgDetailBackdrop"',
  "map embed HTML",
);

const mapJs = extractBetween(
  recon,
  "        let warningMapChart = null;",
  "        function upsertWarningRecord(record) {",
  "map JS",
);

const headBootScript = `    <script>
      (function () {
        try {
          var q = new URLSearchParams(window.location.search);
          if ((q.get("embed") || "").trim().toLowerCase() === "warning-map") {
            document.documentElement.classList.add("warning-map-embed-boot");
          }
        } catch (_) {}
      })();
    </script>
`;

const echartsTag =
  '    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>\n';

let html = base;

html = mustReplace(
  html,
  "      .refined-modal-drag-handle {",
  mapCss + "      .refined-modal-drag-handle {",
  "insert map CSS",
);

html = mustReplace(html, "    </style>\n  </head>", `    </style>\n${headBootScript}  </head>`, "head boot script");

html = mustReplace(
  html,
  '                    <button class="btn secondary" type="button" id="warningPanelRefreshBtn" title="重新加载预警发布数据">刷新</button>',
  '                    <button class="btn secondary" type="button" id="openWarningMapBtn" title="全屏地图展示生效预警机场">地图模式</button>\n                    <button class="btn secondary" type="button" id="warningPanelRefreshBtn" title="重新加载预警发布数据">刷新</button>',
  "map mode button",
);

html = mustReplace(
  html,
  '    <div class="warning-modal-backdrop" id="msgDetailBackdrop" aria-hidden="true">',
  mapEmbedHtml + '    <div class="warning-modal-backdrop" id="msgDetailBackdrop" aria-hidden="true">',
  "map embed HTML",
);

html = mustReplace(html, "    <script>\n      (function () {", echartsTag + "    <script>\n      (function () {", "echarts CDN");

html = mustReplace(
  html,
  "        const warningPanelRefreshBtn = $(\"#warningPanelRefreshBtn\");",
  `        const warningPanelRefreshBtn = $("#warningPanelRefreshBtn");
        const openWarningMapBtn = $("#openWarningMapBtn");
        const warningMapEmbedRoot = $("#warningMapEmbedRoot");
        const warningMapChartEl = $("#warningMapChart");`,
  "map DOM refs",
);

html = mustReplace(
  html,
  `          } catch (e) {
            return { ok: false, mode: "local", err: String(e.message || e) };
          }
        }

        function warningItemDedupeKey(w) {`,
  `          } catch (e) {
            return { ok: false, mode: "local", err: String(e.message || e) };
          } finally {
            notifyWarningMapClients();
          }
        }

        function warningItemDedupeKey(w) {`,
  "persistWarningPool notify",
);

html = mustReplace(
  html,
  `        function startWarningPanelAutoRefresh() {
          if (warningPanelAutoRefreshTimer) clearInterval(warningPanelAutoRefreshTimer);
          warningPanelAutoRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            refreshWarningPanelFromSource(false);
          }, 5 * 60 * 1000);
        }

        function upsertWarningRecord(record) {`,
  `        function startWarningPanelAutoRefresh() {
          if (warningPanelAutoRefreshTimer) clearInterval(warningPanelAutoRefreshTimer);
          warningPanelAutoRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            refreshWarningPanelFromSource(false);
          }, 5 * 60 * 1000);
        }

${mapJs}
        function upsertWarningRecord(record) {`,
  "insert map JS",
);

html = mustReplace(
  html,
  `          if (!n) {
            warningMarqueeTrack.innerHTML = \`<div class="hint" style="padding:12px;text-align:center">暂无生效预警</div>\`;
            warningMarqueeTrack.classList.add("marquee-static");
            warningMarqueeTrack.style.animation = "none";
            return;
          }
          warningMarqueeTrack.innerHTML = blocks;
          syncWarningMarqueeMotion();
        }`,
  `          if (!n) {
            warningMarqueeTrack.innerHTML = \`<div class="hint" style="padding:12px;text-align:center">暂无生效预警</div>\`;
            warningMarqueeTrack.classList.add("marquee-static");
            warningMarqueeTrack.style.animation = "none";
            if (warningMapChart || isWarningMapEmbed()) renderWarningMap().catch(() => {});
            return;
          }
          warningMarqueeTrack.innerHTML = blocks;
          syncWarningMarqueeMotion();
          if (warningMapChart || isWarningMapEmbed()) renderWarningMap().catch(() => {});
        }`,
  "renderWarningPanel map hook",
);

html = mustReplace(html, "        setViewFromUrl();\n        syncShellMetrics();", "        setViewFromUrl();\n        prepareWarningMapEmbedShell();\n        syncShellMetrics();", "prepare embed shell");

html = mustReplace(
  html,
  "        warningPanelRefreshBtn?.addEventListener(\"click\", () => refreshWarningPanelFromSource(true));\n        toggleWarningAllBtn?.addEventListener(\"click\", () => openWarningModal());",
  `        warningPanelRefreshBtn?.addEventListener("click", () => refreshWarningPanelFromSource(true));
        openWarningMapBtn?.addEventListener("click", () => openWarningMapPopupWindow());
        toggleWarningAllBtn?.addEventListener("click", () => openWarningModal());`,
  "openWarningMapBtn listener",
);

html = mustReplace(
  html,
  `        loadAirportWhitelist()
          .catch(() => {})
          .finally(async () => {
            await loadSfApprovedAirports();
            await loadFlightMonitorConfig();
            await loadFlightMonitorAirports();
            updatePlatformHealthClientHints();
            scheduleFlightMonitorRefresh();
            populateWarnFormOptions();
            await loadWeatherStandards();
            if (msgStatus) msgStatus.textContent = "拉取 METAR/TAF…";
            await Promise.all([loadMessages({ silent: true }), loadTafMessages({ silent: true })]).catch(() => {});
            refreshPlatformHealth();
            initPopupFromUrl().catch(() => {});
          });`,
  `        loadAirportWhitelist()
          .catch(() => {})
          .finally(async () => {
            if (isWarningMapEmbed()) {
              await bootstrapWarningMapEmbedData();
              return;
            }
            await loadSfApprovedAirports();
            await loadFlightMonitorConfig();
            await loadFlightMonitorAirports();
            updatePlatformHealthClientHints();
            scheduleFlightMonitorRefresh();
            populateWarnFormOptions();
            await loadWeatherStandards();
            if (msgStatus) msgStatus.textContent = "拉取 METAR/TAF…";
            await Promise.all([loadMessages({ silent: true }), loadTafMessages({ silent: true })]).catch(() => {});
            refreshPlatformHealth();
            initPopupFromUrl().catch(() => {});
            bindWarningMapBroadcast();
          });`,
  "loadAirportWhitelist embed branch",
);

fs.writeFileSync(OUT, html);

const marker = '<script>\n      (function () {\n        const $ =';
const jsStart = html.indexOf(marker) + 8;
const js = html.slice(jsStart, html.lastIndexOf("</script>"));
try {
  new vm.Script(js);
  console.log("OK: merged index.html", html.split("\n").length, "lines,", html.length, "bytes");
} catch (e) {
  console.error("SYNTAX ERROR:", e.message);
  process.exit(1);
}

const checks = [
  "openWarningMapBtn",
  "renderWarningMap",
  "buildAlertRippleSeries",
  "buildNestedMapMarkerSeries",
  "messageMapLevelsOrdered",
  "syncWarningMapTyphoonSources",
  "launchMonitorBtn?.addEventListener",
  "getReviewApiBase",
];
for (const c of checks) {
  console.log(c, html.includes(c) ? "✓" : "✗");
}
