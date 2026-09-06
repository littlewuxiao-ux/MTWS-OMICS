(function () {
  const STYLE_ID = "forecast-widget-bundle-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.fw-root,.fw-root *{box-sizing:border-box}
.fw-root{color:rgba(236,243,255,.95);font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.fw-panel{display:flex;gap:8px;align-items:center;background:rgba(8,14,32,.72);border:1px solid rgba(157,181,255,.22);border-radius:12px;padding:10px}
.fw-input{width:170px;border-radius:8px;border:1px solid rgba(157,181,255,.3);background:rgba(8,12,24,.9);color:rgba(235,242,255,.95);padding:8px 10px}
.fw-btn{border:1px solid rgba(157,181,255,.28);color:rgba(235,242,255,.95);background:rgba(18,28,58,.84);border-radius:8px;padding:8px 10px;cursor:pointer}
.fw-backdrop{position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(5,10,22,.55)}
.fw-backdrop.is-open{display:flex}
.fw-modal{width:min(1880px,99vw);max-height:min(98vh,1280px);display:flex;flex-direction:column;border-radius:14px;border:1px solid rgba(122,200,190,.32);background:linear-gradient(180deg,rgba(14,24,52,.98),rgba(8,14,30,.98));box-shadow:0 24px 64px rgba(0,0,0,.5);overflow:hidden}
.fw-hd{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(157,181,255,.16)}
.fw-toolbar{padding:10px 14px 8px;display:flex;flex-direction:column;gap:8px}
.fw-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.fw-hint{font-size:12px;color:rgba(210,224,255,.78)}
.fw-seg{display:inline-flex;border-radius:10px;border:1px solid rgba(157,181,255,.18);overflow:hidden}
.fw-seg-btn{border:none;background:rgba(13,18,40,.4);color:rgba(235,242,255,.62);font-size:12px;font-weight:650;padding:6px 12px;cursor:pointer}
.fw-seg-btn.is-active{background:rgba(122,200,190,.2);color:rgba(235,242,255,.96)}
.fw-pill{border-radius:999px;padding:3px 8px;font-size:11px;font-weight:650;color:rgba(176,201,255,.95);border:1px solid rgba(176,201,255,.3);background:rgba(116,146,226,.12)}
.fw-meta{font-size:12px;color:rgba(210,224,255,.78)}
.fw-body{padding:0 14px 14px;min-height:0;overflow:auto}
.fw-chart-wrap{border-radius:12px;border:1px solid rgba(157,181,255,.14);background:rgba(5,8,18,.55);overflow:auto;max-height:min(80vh,900px);position:relative;cursor:grab}
.fw-chart-wrap.is-dragging{cursor:grabbing;user-select:none}
.fw-svg{display:block;width:max(100%,1400px);min-width:420px;min-height:300px;height:auto;shape-rendering:geometricPrecision}
.fw-tip{position:absolute;z-index:8;pointer-events:none;min-width:180px;max-width:280px;padding:10px 12px;border-radius:10px;border:1px solid rgba(157,181,255,.28);background:rgba(8,12,28,.97);box-shadow:0 12px 36px rgba(0,0,0,.45);font-size:12px;line-height:1.45;color:rgba(238,244,255,.95);opacity:0;visibility:hidden}
.fw-tip.is-visible{opacity:1;visibility:visible}
.fw-tip-hd{font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(157,181,255,.16)}
.fw-tip-row{display:flex;justify-content:space-between;gap:14px;margin-top:4px}
@media (min-width: 1900px){
  .fw-root{font-size:16px}
  .fw-input,.fw-btn{font-size:15px}
  .fw-seg-btn{font-size:14px;padding:7px 14px}
  .fw-hint,.fw-meta{font-size:14px}
  .fw-pill{font-size:12px}
  .fw-svg{width:max(100%,1720px)}
}
`;
    document.head.appendChild(style);
  }

  const FORECAST_MAX_HOURS = 120;
  const FORECAST_STEP_HOURS = 2;
  const OPEN_METEO_FORECAST_HOURS = 144;
  const UTC_WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function formatUtcWeekdayTime(ms) {
    const d = new Date(ms);
    const wdz = UTC_WEEKDAY_ZH[d.getUTCDay()];
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `周${wdz} ${y}-${mo}-${day} ${hh}:${mm} UTC`;
  }
  function formatUtcAxis(ms) {
    const d = new Date(ms);
    const wdz = UTC_WEEKDAY_ZH[d.getUTCDay()];
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return { line1: `周${wdz} ${mo}-${day}`, line2: String(d.getUTCHours()) };
  }
  function windColorForSpeed(speed) {
    if (speed >= 20) return "#53f2ff";
    if (speed >= 14) return "#4fd0ff";
    if (speed >= 9) return "#77b9ff";
    if (speed >= 5) return "#9ab0ff";
    return "#b7bfff";
  }
  function smoothPath(points) {
    if (points.length < 2) return "";
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      d += ` Q ${points[i].x} ${points[i].y}, ${mx} ${my}`;
    }
    d += ` Q ${points[points.length - 1].x} ${points[points.length - 1].y}, ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
  }

  async function fetchOpenMeteo(lat, lon, model) {
    const hourly = "temperature_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("hourly", hourly);
    url.searchParams.set("wind_speed_unit", "ms");
    url.searchParams.set("forecast_hours", String(OPEN_METEO_FORECAST_HOURS));
    url.searchParams.set("timezone", "auto");
    if (model === "gfs") url.searchParams.set("models", "gfs_seamless");
    if (model === "ecmwf") url.searchParams.set("models", "ecmwf_ifs04");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const H = data.hourly;
    if (!H?.time?.length) return null;
    const t0 = new Date(H.time[0]).getTime();
    const pts = [];
    const maxH = Math.min(FORECAST_MAX_HOURS, H.time.length - 1);
    for (let h = 0; h <= maxH; h += FORECAST_STEP_HOURS) {
      const i = h;
      const temp = H.temperature_2m[i];
      if (temp == null) continue;
      const wind = Number(H.wind_speed_10m[i] ?? 0);
      const gust = Number(H.wind_gusts_10m[i] ?? wind * 1.15);
      pts.push({
        h,
        temp: Number(temp),
        wind: Math.max(0, wind),
        gust: Math.max(0, gust),
        precip: Math.max(0, Number(H.precipitation[i] ?? 0)),
        cloud: Math.max(0, Math.min(100, Number(H.cloud_cover[i] ?? 0))),
        pressure: Number(H.pressure_msl[i] ?? 1013),
        windDir: ((Number(H.wind_direction_10m[i] ?? 0) % 360) + 360) % 360,
      });
    }
    return pts.length > 1 ? { pts, startUtcMs: t0 } : null;
  }

  function create(opts) {
    const mount = opts?.mount;
    if (!mount) throw new Error("mount is required");
    const names = { ZBAA: "北京首都", ZSPD: "上海浦东", ZGGG: "广州白云", ...(opts?.airportNames || {}) };
    const coords = { ...(opts?.coords || {}) };
    const state = { mode: "simple", model: "auto", zoom: 1, forecast: null, dragging: false, hoverLayout: null, hoverPts: null };

    mount.innerHTML = `
      <div class="fw-root">
        <div class="fw-panel">
          <input class="fw-input" id="fwCode" placeholder="输入 ICAO，例如 ZBAA" />
          <button class="fw-btn" id="fwQuery">查询并打开要素展示</button>
        </div>
        <div class="fw-backdrop" id="fwBackdrop" aria-hidden="true">
          <div class="fw-modal" role="dialog" aria-modal="true">
            <div class="fw-hd"><strong id="fwTitle">要素展示</strong><button class="fw-btn" id="fwClose">关闭</button></div>
            <div class="fw-toolbar">
              <div class="fw-row">
                <span class="fw-hint">展示</span>
                <div class="fw-seg">
                  <button class="fw-seg-btn is-active" data-mode="simple">简单要素</button>
                  <button class="fw-seg-btn" data-mode="full">全部要素</button>
                </div>
                <span class="fw-hint">模式</span>
                <div class="fw-seg">
                  <button class="fw-seg-btn is-active" data-model="auto">auto</button>
                  <button class="fw-seg-btn" data-model="gfs">gfs</button>
                  <button class="fw-seg-btn" data-model="ecmwf">ecmwf</button>
                </div>
                <span class="fw-hint">席位缩放</span>
                <div class="fw-seg">
                  <button class="fw-seg-btn is-active" data-zoom="1">100%</button>
                  <button class="fw-seg-btn" data-zoom="1.25">125%</button>
                  <button class="fw-seg-btn" data-zoom="1.5">150%</button>
                </div>
                <span class="fw-pill" id="fwCoordSource">坐标来源：-</span>
              </div>
              <div class="fw-meta" id="fwMeta"></div>
            </div>
            <div class="fw-body"><div class="fw-chart-wrap" id="fwWrap"><svg class="fw-svg" id="fwSvg" viewBox="0 0 1100 250"></svg><div class="fw-tip" id="fwTip"></div></div></div>
          </div>
        </div>
      </div>`;

    const ui = {
      code: mount.querySelector("#fwCode"),
      query: mount.querySelector("#fwQuery"),
      backdrop: mount.querySelector("#fwBackdrop"),
      close: mount.querySelector("#fwClose"),
      title: mount.querySelector("#fwTitle"),
      meta: mount.querySelector("#fwMeta"),
      coord: mount.querySelector("#fwCoordSource"),
      wrap: mount.querySelector("#fwWrap"),
      svg: mount.querySelector("#fwSvg"),
      tip: mount.querySelector("#fwTip"),
    };

    function syncSeg() {
      mount.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === state.mode));
      mount.querySelectorAll("[data-model]").forEach((b) => b.classList.toggle("is-active", b.dataset.model === state.model));
      mount.querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.zoom) === state.zoom));
    }
    function coordLabel(s) {
      if (s === "local") return "本地坐标";
      if (s === "online") return "在线解析";
      if (s === "cache") return "缓存坐标";
      return "未解析";
    }
    function normalizeOverride(v) {
      if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) return { lat: v[0], lon: v[1] };
      if (v && typeof v === "object" && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return { lat: v.lat, lon: v.lon };
      return null;
    }
    async function loadOverrides() {
      const url = opts?.overridesUrl;
      if (!url) return;
      try {
        const r = await fetch(new URL(url, window.location.href), { cache: "no-store" });
        if (!r.ok) return;
        Object.assign(coords, await r.json());
      } catch {}
    }
    async function resolveLatLon(code) {
      const local = normalizeOverride(coords[code]);
      if (local) return { ...local, source: "local" };
      const geo = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geo.searchParams.set("name", code);
      geo.searchParams.set("count", "10");
      const r = await fetch(geo.toString(), { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      const rs = Array.isArray(j.results) ? j.results : [];
      const p = rs.find((x) => x.feature_code === "AIRP") || rs[0];
      if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
      return { lat: p.latitude, lon: p.longitude, source: "online" };
    }

    function renderChart(code, name, pts, anchorUtcMs, srcTag) {
      const full = state.mode === "full";
      const maxHour = Math.max(pts[pts.length - 1]?.h || 1, 1);
      const baseW = Math.max(1320, Math.round((maxHour / FORECAST_STEP_HOURS + 1) * 24) + 60);
      const wrapRectW = Math.ceil(ui.wrap?.getBoundingClientRect?.().width || 0);
      const wrapW = Math.max(0, (wrapRectW || ui.wrap?.clientWidth || 0) - 4);
      const autoScale = wrapW >= 1900 ? 1.34 : wrapW >= 1600 ? 1.2 : 1.0;
      const uiScale = autoScale * state.zoom;
      const W = Math.max(baseW, wrapW);
      const H = Math.round((full ? 470 : 340) * uiScale);
      const bands = full ? 5 : 3;
      const padL = Math.round(56 * uiScale), padR = 8, padT = Math.round(22 * uiScale), padB = Math.round(40 * uiScale);
      const x0 = padL, x1 = W - padR, plotW = x1 - x0;
      const bandH = (H - padT - padB) / bands;
      const hx = (h) => x0 + (h / maxHour) * plotW;
      const bandTop = (i) => padT + i * bandH;
      const bandBot = (i) => padT + (i + 1) * bandH;
      const yBand = (i, min, max, v) => {
        const top = bandTop(i) + 5 * uiScale, bot = bandBot(i) - 5 * uiScale;
        if (max === min) return (top + bot) / 2;
        return top + (1 - (v - min) / (max - min)) * (bot - top);
      };
      const tMin = Math.min(...pts.map((p) => p.temp)) - 1;
      const tMax = Math.max(...pts.map((p) => p.temp)) + 1;
      const wMax = Math.max(...pts.map((p) => p.wind), ...pts.map((p) => p.gust)) * 1.12;
      const pMax = Math.max(0.5, ...pts.map((p) => p.precip)) * 1.1;
      const prMin = Math.min(...pts.map((p) => p.pressure)) - 0.8;
      const prMax = Math.max(...pts.map((p) => p.pressure)) + 0.8;
      const dTemp = smoothPath(pts.map((p) => ({ x: hx(p.h), y: yBand(0, tMin, tMax, p.temp) })));
      const dWind = smoothPath(pts.map((p) => ({ x: hx(p.h), y: yBand(1, 0, wMax, p.wind) })));
      const dGust = smoothPath(pts.map((p) => ({ x: hx(p.h), y: yBand(1, 0, wMax, p.gust) })));
      const dPr = full ? smoothPath(pts.map((p) => ({ x: hx(p.h), y: yBand(4, prMin, prMax, p.pressure) }))) : "";
      const innerPad = 5 * uiScale;
      let cloudFill = "";
      let defsCloud = "";
      if (full) {
        const yCloudBot = bandBot(3) - innerPad;
        const cloudTopPts = pts.map((p) => ({ x: hx(p.h), y: yBand(3, 0, 100, p.cloud) }));
        const smoothTop = smoothPath(cloudTopPts);
        const xLast = hx(pts[pts.length - 1].h);
        if (smoothTop && cloudTopPts.length >= 2) {
          const m = /^M\s+([-\d.]+)\s+([-\d.]+)\s*/.exec(smoothTop);
          if (m) {
            cloudFill = `M ${x0} ${yCloudBot} L ${m[1]} ${m[2]} ` + smoothTop.slice(m[0].length) + ` L ${xLast} ${yCloudBot} Z`;
          }
        }
        if (!cloudFill) {
          cloudFill = `M ${x0} ${yCloudBot}`;
          pts.forEach((p) => {
            cloudFill += ` L ${hx(p.h)} ${yBand(3, 0, 100, p.cloud)}`;
          });
          cloudFill += ` L ${xLast} ${yCloudBot} Z`;
        }
        const cloudGradY1 = bandTop(3) + innerPad;
        const cloudGradY2 = bandBot(3) - innerPad;
        defsCloud = `<defs><linearGradient id="elemCloudGrad" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${cloudGradY1}" x2="${x0}" y2="${cloudGradY2}"><stop offset="0%" stop-color="rgb(150,175,210)" stop-opacity="0.44"/><stop offset="100%" stop-color="rgb(140,160,190)" stop-opacity="0.14"/></linearGradient></defs>`;
      }
      const grid = [];
      for (let g = 0; g <= maxHour; g += FORECAST_STEP_HOURS) {
        const major = g % 12 === 0;
        grid.push(`<line x1="${hx(g)}" y1="${padT}" x2="${hx(g)}" y2="${H - padB}" stroke="${major ? "rgba(157,181,255,0.16)" : "rgba(157,181,255,0.08)"}" stroke-width="${major ? 1.05 * uiScale : 0.78 * uiScale}"/>`);
      }
      const bars = [];
      const barW = (plotW / (pts.length - 1)) * 0.45;
      pts.forEach((p) => {
        if (p.precip <= 0) return;
        const yTop = yBand(2, 0, pMax, p.precip), yBot = bandBot(2) - 5 * uiScale;
        bars.push(`<rect x="${hx(p.h) - barW / 2}" y="${yTop}" width="${barW}" height="${Math.max(0.5, yBot - yTop)}" rx="${2 * uiScale}" fill="rgba(94,168,255,0.92)"/>`);
      });
      const arrows = [];
      pts.forEach((p, i) => {
        if (i % 3 !== 0) return;
        const scale = Math.max(0.8, Math.min(1.6, 0.75 + p.wind / 12));
        const c = windColorForSpeed(p.wind);
        const aScale = scale * (0.92 + (uiScale - 1) * 0.45);
        const windArrowDeg = ((p.windDir + 180) % 360 + 360) % 360;
        arrows.push(`<g transform="translate(${hx(p.h)},${(bandTop(1) + bandBot(1)) / 2}) rotate(${windArrowDeg}) scale(${aScale})"><line x1="0" y1="7.5" x2="0" y2="-5.8" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><polygon points="0,-11 -4.6,-3.2 4.6,-3.2" fill="${c}"/></g>`);
      });
      const labels = [];
      const bandLabel = full ? [["气温", "℃"], ["风速", "m/s"], ["降水", "mm"], ["云量", "%"], ["气压", "hPa"]] : [["气温", "℃"], ["风速", "m/s"], ["降水", "mm"]];
      for (let i = 0; i < bands; i++) labels.push(`<text x="${10 * uiScale}" y="${bandTop(i) + 12 * uiScale}" fill="rgba(242,247,255,0.96)" font-size="${8.2 * uiScale}">${bandLabel[i][0]} ${bandLabel[i][1]}</text>`);
      const xLabels = [];
      for (let g = 0; g <= maxHour; g += FORECAST_STEP_HOURS) {
        const tms = anchorUtcMs + g * 3600000, cx = hx(g);
        if (g % 12 === 0) {
          const { line1, line2 } = formatUtcAxis(tms);
          xLabels.push(`<text x="${cx}" y="${H - 22 * uiScale}" text-anchor="middle" fill="rgba(235,242,255,0.62)" font-size="${8.2 * uiScale}"><tspan x="${cx}" dy="0">${esc(line1)}</tspan><tspan x="${cx}" dy="${10 * uiScale}">${esc(line2)}</tspan></text>`);
        } else {
          xLabels.push(`<text x="${cx}" y="${H - 10 * uiScale}" text-anchor="middle" fill="rgba(235,242,255,0.54)" font-size="${7.8 * uiScale}">${new Date(tms).getUTCHours()}</text>`);
        }
      }
      const stationTitle = name === code ? code : `${code} · ${name}`;
      ui.svg.style.width = `${Math.max(980, W)}px`;
      ui.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      ui.svg.setAttribute("shape-rendering", "geometricPrecision");
      ui.svg.setAttribute("text-rendering", "geometricPrecision");
      ui.svg.innerHTML = `
        ${full ? defsCloud : ""}
        <text x="${W / 2}" y="${16 * uiScale}" text-anchor="middle" fill="rgba(235,242,255,0.58)" font-size="${11 * uiScale}">${esc(stationTitle)} · 未来${maxHour}h（${esc(srcTag)}）· 时间 UTC · ${state.mode === "full" ? "全部要素" : "简单要素"}</text>
        <line x1="${x0}" y1="${H - padB}" x2="${x1}" y2="${H - padB}" stroke="rgba(190,210,255,0.26)" stroke-width="${1.1 * uiScale}"/>
        ${grid.join("")}
        ${labels.join("")}
        ${full ? `<path d="${cloudFill}" fill="url(#elemCloudGrad)" stroke="none" shape-rendering="geometricPrecision"/>` : ""}
        <path d="${dTemp}" fill="none" stroke="rgba(233,151,125,0.16)" stroke-width="${4.8 * uiScale}" stroke-linecap="round"/>
        <path d="${dTemp}" fill="none" stroke="#e68e7f" stroke-width="${2.15 * uiScale}" stroke-linecap="round"/>
        <path d="${dWind}" fill="none" stroke="rgba(140,205,240,0.95)" stroke-width="${2 * uiScale}" stroke-linecap="round" stroke-dasharray="4 4"/>
        <path d="${dGust}" fill="none" stroke="rgba(145,188,226,0.34)" stroke-width="${1.35 * uiScale}" stroke-linecap="round"/>
        ${bars.join("")}
        ${arrows.join("")}
        ${full ? `<path d="${dPr}" fill="none" stroke="#5ed6a8" stroke-width="${1.8 * uiScale}" stroke-linecap="round"/>` : ""}
        ${xLabels.join("")}
        <line id="fwVLine" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="rgba(200,215,255,0.4)" stroke-width="${1 * uiScale}" stroke-dasharray="5 4" visibility="hidden"/>
        <rect id="fwHit" x="${x0}" y="${padT}" width="${plotW}" height="${H - padT - padB}" fill="transparent"/>
      `;
      state.hoverPts = pts;
      state.hoverLayout = { W, H, x0, plotW, maxHour, padT, padB, full, anchorUtcMs };
      bindHover();
      // 防止模式切换/窗口变化后滚动位置落在空白区
      requestAnimationFrame(() => {
        const maxScroll = Math.max(0, ui.wrap.scrollWidth - ui.wrap.clientWidth);
        if (ui.wrap.scrollLeft > maxScroll) ui.wrap.scrollLeft = maxScroll;
      });
    }

    function bindHover() {
      const hit = ui.svg.querySelector("#fwHit");
      const vline = ui.svg.querySelector("#fwVLine");
      if (!hit || !vline) return;
      hit.onmousemove = (e) => {
        if (state.dragging || !state.hoverLayout) return;
        const L = state.hoverLayout;
        const pts = state.hoverPts || [];
        const rect = ui.svg.getBoundingClientRect();
        const vx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * L.W;
        const mx = Math.max(L.x0, Math.min(L.x0 + L.plotW, vx));
        let bi = 0, bd = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const px = L.x0 + (pts[i].h / L.maxHour) * L.plotW;
          const d = Math.abs(px - mx);
          if (d < bd) { bd = d; bi = i; }
        }
        const p = pts[bi];
        const sx = L.x0 + (p.h / L.maxHour) * L.plotW;
        vline.setAttribute("x1", String(sx));
        vline.setAttribute("x2", String(sx));
        vline.setAttribute("visibility", "visible");
        const windColor = windColorForSpeed(p.wind);
        const precipTxt = p.precip < 0.05 ? "0" : p.precip.toFixed(1);
        ui.tip.innerHTML = `
          <div class="fw-tip-hd">T+${p.h} h · ${formatUtcWeekdayTime(L.anchorUtcMs + p.h * 3600000)}</div>
          <div class="fw-tip-row"><span>气温</span><strong>${p.temp.toFixed(1)} ℃</strong></div>
          <div class="fw-tip-row"><span>风速</span><strong style="color:${windColor}">${p.wind.toFixed(1)} m/s</strong></div>
          <div class="fw-tip-row"><span>风向(来向)</span><strong>${Math.round(p.windDir)}°</strong></div>
          <div class="fw-tip-row"><span>阵风</span><strong style="color:${windColor}">${p.gust.toFixed(1)} m/s</strong></div>
          <div class="fw-tip-row"><span>降水(步长内)</span><strong>${precipTxt} mm</strong></div>
          ${L.full ? `<div class="fw-tip-row"><span>云量</span><strong>${Math.round(p.cloud)} %</strong></div>` : ""}
          ${L.full ? `<div class="fw-tip-row"><span>气压</span><strong>${p.pressure.toFixed(1)} hPa</strong></div>` : ""}
        `;
        ui.tip.style.borderColor = `${windColor}66`;
        ui.tip.classList.add("is-visible");
        const wr = ui.wrap.getBoundingClientRect();
        let left = e.clientX - wr.left + 12, top = e.clientY - wr.top + 12;
        ui.tip.style.left = "0px"; ui.tip.style.top = "0px";
        const tw = ui.tip.offsetWidth || 180, th = ui.tip.offsetHeight || 140;
        if (left + tw > wr.width - 8) left = e.clientX - wr.left - tw - 12;
        if (top + th > wr.height - 8) top = e.clientY - wr.top - th - 12;
        ui.tip.style.left = `${Math.max(8, left)}px`;
        ui.tip.style.top = `${Math.max(8, top)}px`;
      };
      hit.onmouseleave = () => {
        ui.tip.classList.remove("is-visible");
        vline.setAttribute("visibility", "hidden");
      };
    }

    function bindDrag() {
      let startX = 0, startScroll = 0;
      ui.wrap.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        state.dragging = true;
        startX = e.clientX;
        startScroll = ui.wrap.scrollLeft;
        ui.wrap.classList.add("is-dragging");
      });
      window.addEventListener("mousemove", (e) => {
        if (!state.dragging) return;
        ui.wrap.scrollLeft = startScroll - (e.clientX - startX);
      });
      window.addEventListener("mouseup", () => {
        state.dragging = false;
        ui.wrap.classList.remove("is-dragging");
      });
    }

    async function runQuery(openModal) {
      let code = (ui.code.value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 4) return;
      code = code.slice(0, 4);
      ui.code.value = code;
      const name = names[code] || code;
      let coord = null, coordSource = "none";
      try {
        coord = await resolveLatLon(code);
        if (coord) coordSource = coord.source;
      } catch {}
      if (!coord) return;
      let data = await fetchOpenMeteo(coord.lat, coord.lon, state.model);
      if (!data && state.model !== "auto") data = await fetchOpenMeteo(coord.lat, coord.lon, "auto");
      if (!data) return;
      state.forecast = { code, name, pts: data.pts, anchorUtcMs: data.startUtcMs, coordSource };
      ui.title.textContent = `要素展示 · ${name === code ? code : `${code} · ${name}`}`;
      ui.meta.textContent = `步长 ${FORECAST_STEP_HOURS}h · 约 ${FORECAST_MAX_HOURS}h · 共 ${data.pts.length} 点 · ${state.mode === "full" ? "全部要素" : "简单要素"} · Open-Meteo/${state.model.toUpperCase()}`;
      ui.coord.textContent = `坐标来源：${coordLabel(coordSource)}`;
      if (openModal) {
        ui.backdrop.classList.add("is-open");
        ui.backdrop.setAttribute("aria-hidden", "false");
      }
      renderChart(code, name, data.pts, data.startUtcMs, `Open-Meteo/${state.model.toUpperCase()}`);
      requestAnimationFrame(() => {
        renderChart(code, name, data.pts, data.startUtcMs, `Open-Meteo/${state.model.toUpperCase()}`);
      });
    }

    ui.query.addEventListener("click", () => runQuery(true));
    ui.code.addEventListener("keydown", (e) => { if (e.key === "Enter") runQuery(true); });
    ui.close.addEventListener("click", () => {
      ui.backdrop.classList.remove("is-open");
      ui.backdrop.setAttribute("aria-hidden", "true");
    });
    ui.backdrop.addEventListener("click", (e) => {
      const b = e.target.closest(".fw-seg-btn");
      if (b?.dataset.mode) {
        state.mode = b.dataset.mode; syncSeg();
        if (state.forecast) {
          ui.wrap.scrollLeft = 0;
          renderChart(state.forecast.code, state.forecast.name, state.forecast.pts, state.forecast.anchorUtcMs, `Open-Meteo/${state.model.toUpperCase()}`);
        }
        return;
      }
      if (b?.dataset.model) {
        state.model = b.dataset.model; syncSeg();
        if (state.forecast) runQuery(false);
        return;
      }
      if (b?.dataset.zoom) {
        state.zoom = Number(b.dataset.zoom) || 1;
        syncSeg();
        if (state.forecast) {
          renderChart(
            state.forecast.code,
            state.forecast.name,
            state.forecast.pts,
            state.forecast.anchorUtcMs,
            `Open-Meteo/${state.model.toUpperCase()}`
          );
        }
        return;
      }
      if (e.target === ui.backdrop) ui.close.click();
    });

    bindDrag();
    window.addEventListener("resize", () => {
      if (!state.forecast || !ui.backdrop.classList.contains("is-open")) return;
      renderChart(
        state.forecast.code,
        state.forecast.name,
        state.forecast.pts,
        state.forecast.anchorUtcMs,
        `Open-Meteo/${state.model.toUpperCase()}`
      );
    });
    loadOverrides().then(() => {
      ui.code.value = (opts?.defaultCode || "ZBAA").toUpperCase();
    });
  }

  window.ForecastWidget = { create };
})();
