(function () {
        const $ = (sel, root = document) => root.querySelector(sel);
        const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

        const accountSelect = $("#accountSelect");
        const roleSelect = $("#roleSelect");
        const roleField = $("#roleField");
        const roleHint = $("#roleHint");
        const openHomeViewBtn = $("#openHomeViewBtn");
        const openMonitorViewBtn = $("#openMonitorViewBtn");
        const openActionViewBtn = $("#openActionViewBtn");
        const openAnalysisViewBtn = $("#openAnalysisViewBtn");
        const launchMonitorBtn = $("#launchMonitorBtn");
        const launchActionBtn = $("#launchActionBtn");
        const launchAnalysisBtn = $("#launchAnalysisBtn");
        const logoutBtn = $("#logoutBtn");
        const toast = $("#toast");
        const toastTitle = $("#toastTitle");
        const toastDesc = $("#toastDesc");

        const wxNavHub = $("#wxNavHub");
        const wxNavSearch = $("#wxNavSearch");
        const wxNavCats = $("#wxNavCats");
        const wxNavGrid = $("#wxNavGrid");
        const wxNavCount = $("#wxNavCount");
        const wxNavAddBtn = $("#wxNavAddBtn");
        const wxNavAddForm = $("#wxNavAddForm");
        const favName = $("#favName");
        const favUrl = $("#favUrl");
        const cancelFavBtn = $("#cancelFavBtn");
        const saveFavBtn = $("#saveFavBtn");
        const resetFavBtn = $("#resetFavBtn");

        let wxNavActiveCat = "pinned";

        function getAuthUser() {
          try {
            const raw = localStorage.getItem("wx_auth_user");
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        }

        function ensureLogin() {
          const path = window.location.pathname.toLowerCase();
          const onLoginPage = path.endsWith("/login.html") || path.endsWith("\\login.html");
          if (onLoginPage) return;
          /* 本地直接打开 HTML（file://）时不强制跳转登录，便于离线演示时序图 */
          if (window.location.protocol === "file:") return;
          if (getAuthUser()) return;

          const back = `${window.location.pathname}${window.location.search}`;
          window.location.href = `./login.html?redirect=${encodeURIComponent(back)}`;
        }

        function applyView(view) {
          document.body.setAttribute("data-view", view);
          setRoleOptionsForView();
          updateViewNavState();
          if (view === "monitor") {
            loadWindyForecast(false);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => syncWarningMarqueeMotion());
            });
          }
          if (view === "action") syncChecklistOverdueQueueForActionView();
          requestAnimationFrame(syncShellMetrics);
        }

        function normalizeViewName(raw) {
          const v = String(raw || "home").trim().toLowerCase();
          return v === "monitor" || v === "action" || v === "analysis" ? v : "home";
        }

        function readViewFromLocation() {
          const params = new URLSearchParams(window.location.search);
          const fromQuery = params.get("view");
          if (fromQuery) return normalizeViewName(fromQuery);
          const hash = String(window.location.hash || "").replace(/^#/, "").trim();
          if (hash.startsWith("view=")) return normalizeViewName(hash.slice(5));
          return "home";
        }

        function writeViewToLocation(view) {
          const url = new URL(window.location.href);
          if (view === "home") url.searchParams.delete("view");
          else url.searchParams.set("view", view);
          url.hash = view === "home" ? "" : `view=${view}`;
          try {
            history.pushState({ view }, "", url);
            return true;
          } catch (_) {
            /* 慧应用 / iframe 嵌入时 pushState 可能不可用，降级为 hash */
            try {
              window.location.hash = view === "home" ? "" : `view=${view}`;
            } catch (_) {}
            return false;
          }
        }

        function setViewFromUrl() {
          applyView(readViewFromLocation());
        }

        function updateViewNavState() {
          const v = getView();
          const map = [
            [openMonitorViewBtn, "monitor"],
            [openActionViewBtn, "action"],
            [openAnalysisViewBtn, "analysis"],
          ];
          map.forEach(([btn, view]) => {
            if (!btn) return;
            const active = v === view;
            btn.classList.toggle("is-active", active);
            btn.disabled = active;
            btn.setAttribute("aria-current", active ? "page" : "false");
          });
        }

        function navigateToView(view) {
          const allowed = ["home", "monitor", "action", "analysis"];
          if (!allowed.includes(view)) return;
          if (view !== "home" && getView() === view) return;
          applyView(view);
          writeViewToLocation(view);
        }

        function navigateToScreen(view) {
          if (getView() === view) return;
          navigateToView(view);
        }

        /** 供首页早期兜底脚本调用；慧应用 iframe 内优先同页切换 */
        window.__wbNavigateToView = navigateToView;

        /** 其它业务屏：席位多屏可用新标签；慧应用 iframe 内改为同页切换 */
        function openScreenInNewTab(view) {
          if (getView() === view) return;
          const inFrame = (() => {
            try {
              return window.self !== window.top;
            } catch (_) {
              return true;
            }
          })();
          if (inFrame) {
            navigateToView(view);
            return;
          }
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("view", view);
            const w = window.open(url.toString(), "_blank", "noopener,noreferrer");
            if (!w) navigateToView(view);
          } catch (_) {
            navigateToView(view);
          }
        }

        function setThemeFromUrl() {
          const params = new URLSearchParams(window.location.search);
          const theme = (params.get("theme") || "").trim().toLowerCase();
          if (theme === "enterprise") {
            document.body.setAttribute("data-theme", "enterprise");
          } else {
            document.body.removeAttribute("data-theme");
          }
        }

        /** 按实际顶栏高度同步布局变量，避免不同 DPI/字号下 calc 留白 */
        function syncShellMetrics() {
          const topbar = document.querySelector(".topbar");
          const content = document.querySelector(".content");
          if (!topbar) return;
          const topH = Math.ceil(topbar.getBoundingClientRect().height);
          document.documentElement.style.setProperty("--shell-top", `${topH}px`);
          if (content) {
            const cs = getComputedStyle(content);
            const padB = parseFloat(cs.paddingBottom) || 20;
            document.documentElement.style.setProperty("--shell-pad-b", `${padB}px`);
          }
        }

        function getView() {
          return document.body.getAttribute("data-view") || "main";
        }

        function showToast(title, desc, ms = 2200) {
          if (!toast || !toastTitle || !toastDesc) return;
          toastTitle.textContent = title;
          toastDesc.textContent = desc;
          toast.classList.add("show");
          window.clearTimeout(showToast._t);
          showToast._t = window.setTimeout(() => toast.classList.remove("show"), ms);
        }

        function setRoleOptionsForView() {
          const v = getView();
          const allowLeader = v === "action";
          if (roleField) roleField.style.display = allowLeader ? "" : "none";
          if (!roleSelect) return;
          const keep = roleSelect.value;
          roleSelect.innerHTML = allowLeader
            ? `<option value="operator">值班员</option><option value="leader">带班</option>`
            : `<option value="operator">值班员</option>`;
          roleSelect.value = allowLeader && (keep === "leader" || keep === "operator") ? keep : "operator";
        }

        function getAccount() {
          return accountSelect?.value || "u1";
        }

        function getAccountDisplayName() {
          if (!accountSelect) return getAccount();
          const opt = accountSelect.options[accountSelect.selectedIndex];
          return opt && opt.textContent ? opt.textContent.trim() : getAccount();
        }

        function storageKey(account) {
          return `wx_workbench_favs_${account}`;
        }

        function loadFavs() {
          try {
            const raw = localStorage.getItem(storageKey(getAccount()));
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
          } catch {
            return [];
          }
        }

        function saveFavs(list) {
          localStorage.setItem(storageKey(getAccount()), JSON.stringify(list));
        }

        function renderFavButtons() {
          renderWeatherNav();
        }

        /* ========== 天气分析 · 分类站点导航 ========== */
        const WX_NAV_CATEGORIES = [
          { id: "pinned", label: "常用", icon: "★" },
          { id: "favorites", label: "我的收藏", icon: "♥" },
          { id: "cn_official", label: "国家/省市官方", icon: "🇨🇳" },
          { id: "intl_official", label: "国际官方", icon: "🌐" },
          { id: "numerical", label: "数值预报", icon: "📈" },
          { id: "radar", label: "雷达", icon: "📡" },
          { id: "satellite", label: "卫星", icon: "🛰" },
          { id: "lightning", label: "闪电", icon: "⚡" },
          { id: "air", label: "空气污染", icon: "💨" },
          { id: "volcano", label: "火山灰", icon: "🌋" },
          { id: "commercial", label: "商业气象", icon: "💼" },
          { id: "internal", label: "公司内部", icon: "🏢" },
          { id: "tools", label: "工具", icon: "🔧" },
          { id: "domestic", label: "国内综合", icon: "🗺" },
          { id: "international", label: "国际综合", icon: "✈" },
        ];

        const WX_NAV_CAT_ICON = Object.fromEntries(WX_NAV_CATEGORIES.map((c) => [c.id, c.icon]));

        /** @type {{ id: string, name: string, url: string, cat: string, desc?: string, pinned?: boolean }[]} */
        const WX_NAV_SITES = [
          { id: "nmc", name: "中央气象台", url: "https://www.nmc.cn/", cat: "cn_official", pinned: true, desc: "国家级预报预警、天气图与灾害天气" },
          { id: "windy", name: "Windy", url: "https://www.windy.com/", cat: "numerical", pinned: true, desc: "全球多层场、多模式可视化" },
          { id: "cma-gov", name: "中国气象局", url: "https://www.cma.gov.cn/", cat: "cn_official", pinned: true, desc: "国家级气象门户与政策信息" },
          { id: "gridgis", name: "气象实况展示", url: "https://data.cma.cn/dataGis/static/gridgis/#/pcindex", cat: "domestic", pinned: true, desc: "CMA 网格化实况与填图产品" },
          { id: "tt", name: "Tropical Tidbits", url: "https://www.tropicaltidbits.com/", cat: "numerical", pinned: true, desc: "模式对比、热带与 mid-lat 分析" },
          { id: "nmc-forecast", name: "NMC 天气预报", url: "https://www.nmc.cn/publish/forecast/index.html", cat: "cn_official", desc: "国内城镇、海区与专项预报" },
          { id: "nmc-radar", name: "NMC 雷达拼图", url: "https://www.nmc.cn/publish/observations/radar.html", cat: "radar", desc: "全国雷达拼图与单站产品" },
          { id: "nmc-sat", name: "NMC 卫星云图", url: "https://www.nmc.cn/publish/satellite/index.html", cat: "satellite", desc: "FY 系列卫星红外、可见光云图" },
          { id: "nmc-numeric", name: "NMC 数值预报", url: "https://www.nmc.cn/publish/numerical/index.html", cat: "numerical", desc: "国内数值模式产品入口" },
          { id: "nmic", name: "国家雷电监测", url: "http://www.nmic.cn/", cat: "lightning", desc: "全国地闪监测与产品" },
          { id: "air-cnemc", name: "全国空气质量", url: "https://air.cnemc.cn:18007/", cat: "air", desc: "环境监测总站 AQI 与预报" },
          { id: "sat-fy", name: "风云卫星实时", url: "http://satellite.nsmc.org.cn/", cat: "satellite", desc: "NSMC 风云卫星遥感产品" },
          { id: "rainviewer", name: "RainViewer", url: "https://www.rainviewer.com/", cat: "radar", desc: "全球雷达回波拼图（开源聚合）" },
          { id: "wmo", name: "WMO", url: "https://public.wmo.int/", cat: "intl_official", desc: "世界气象组织公开信息" },
          { id: "noaa", name: "NOAA Weather", url: "https://www.weather.gov/", cat: "intl_official", desc: "美国 NWS 官方预报与预警" },
          { id: "ecmwf", name: "ECMWF", url: "https://www.ecmwf.int/", cat: "intl_official", desc: "欧洲中期预报中心" },
          { id: "jma", name: "日本气象厅", url: "https://www.jma.go.jp/jma/indexe.html", cat: "intl_official", desc: "JMA 官方预报与灾害信息" },
          { id: "aviation", name: "Aviation Weather", url: "https://aviationweather.gov/", cat: "tools", desc: "FAA AWC：SIGMET、AIRMET、雷达" },
          { id: "ogimet", name: "OGIMET", url: "https://www.ogimet.com/", cat: "tools", desc: "METAR/TAF/SYNOP 检索与存档" },
          { id: "meteoblue", name: "Meteoblue", url: "https://www.meteoblue.com/", cat: "commercial", desc: "商业预报与可视化" },
          { id: "weather-com", name: "Weather.com", url: "https://weather.com/", cat: "commercial", desc: "The Weather Company 门户" },
          { id: "vaac", name: "Washington VAAC", url: "https://aviationweather.gov/vaac/", cat: "volcano", desc: "火山灰咨询（华盛顿 VAAC）" },
          { id: "tokyo-vaac", name: "Tokyo VAAC", url: "https://ds.data.jma.go.jp/aviation/vaac/", cat: "volcano", desc: "东京 VAAC 火山灰产品" },
          { id: "himawari", name: "Himawari Real-time", url: "https://himawari8.nict.go.jp/", cat: "satellite", desc: "葵花 8 号实时云图（NICT）" },
          { id: "eumetsat", name: "EUMETSAT", url: "https://www.eumetsat.int/", cat: "international", desc: "欧洲气象卫星组织" },
          { id: "internal-ops", name: "顺丰航空运行网", url: "https://cwps.sf-airlines.com/", cat: "internal", pinned: true, desc: "CWPS 运行门户" },
          { id: "internal-brief", name: "天气分析材料库（示例）", url: "", cat: "internal", desc: "席位简报与材料归档 · 待配置" },
          { id: "internal-im", name: "丰声 / 协作群（示例）", url: "", cat: "internal", desc: "内部 IM 入口 · 待配置" },
        ];

        function wxNavHost(url) {
          if (!url) return "待配置";
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return url.slice(0, 32);
          }
        }

        function isFavSaved(url) {
          return loadFavs().some((f) => f.url === url);
        }

        function getWxNavItems() {
          const favs = loadFavs().map((f, i) => ({
            id: `fav-${i}`,
            name: f.name,
            url: f.url,
            cat: "favorites",
            desc: "我的收藏",
          }));
          const catalog = WX_NAV_SITES.filter((s) => s.url || s.cat === "internal");
          return { catalog, favs };
        }

        function matchWxNavSearch(item, q) {
          if (!q) return true;
          const hay = `${item.name} ${item.desc || ""} ${item.url} ${wxNavHost(item.url)}`.toLowerCase();
          return hay.includes(q);
        }

        function filterWxNavItems() {
          const q = (wxNavSearch?.value || "").trim().toLowerCase();
          const { catalog, favs } = getWxNavItems();
          let items = [];
          if (wxNavActiveCat === "favorites") {
            items = favs;
          } else if (wxNavActiveCat === "pinned") {
            items = catalog.filter((s) => s.pinned);
          } else if (wxNavActiveCat === "all") {
            const seen = new Set();
            items = [...catalog, ...favs].filter((item) => {
              const key = item.url || item.id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          } else {
            items = catalog.filter((s) => s.cat === wxNavActiveCat);
          }
          if (q) items = items.filter((item) => matchWxNavSearch(item, q));
          return items;
        }

        function renderWxNavCategories() {
          if (!wxNavCats) return;
          const chips = [{ id: "all", label: "全部", icon: "▦" }, ...WX_NAV_CATEGORIES];
          wxNavCats.innerHTML = chips
            .map(
              (c) =>
                `<button type="button" class="wx-nav-cat${c.id === wxNavActiveCat ? " is-active" : ""}" data-wx-cat="${c.id}" role="tab" aria-selected="${c.id === wxNavActiveCat}">${c.icon ? `${c.icon} ` : ""}${c.label}</button>`
            )
            .join("");
        }

        function renderWeatherNav() {
          renderWxNavCategories();
          const items = filterWxNavItems();
          if (wxNavCount) wxNavCount.textContent = `${items.length} 个站点`;
          if (!wxNavGrid) return;
          if (items.length === 0) {
            wxNavGrid.innerHTML = `<div class="wx-nav-empty">${wxNavActiveCat === "favorites" ? "暂无收藏。点击「添加收藏」或卡片右上角 ☆ 加入。" : "没有匹配的站点，试试其他分类或搜索词。"}</div>`;
            return;
          }
          wxNavGrid.innerHTML = items
            .map((item) => {
              const icon = WX_NAV_CAT_ICON[item.cat] || "🔗";
              const saved = item.url && isFavSaved(item.url);
              const star = item.url
                ? `<button type="button" class="wx-nav-card-star${saved ? " is-saved" : ""}" data-wx-star="${escapeHtml(item.url)}" title="${saved ? "已在收藏" : "加入收藏"}">${saved ? "★" : "☆"}</button>`
                : "";
              return `
              <div class="wx-nav-card cat-${item.cat}" role="link" tabindex="0" data-wx-open="${escapeHtml(item.url)}" data-wx-name="${escapeHtml(item.name)}">
                <span class="wx-nav-card-icon" aria-hidden="true">${icon}</span>
                <div class="wx-nav-card-body">
                  <span class="wx-nav-card-title">${escapeHtml(item.name)}</span>
                  <span class="wx-nav-card-host">${escapeHtml(wxNavHost(item.url))}</span>
                  <span class="wx-nav-card-desc">${escapeHtml(item.desc || "")}</span>
                </div>
                ${star}
              </div>`;
            })
            .join("");
        }

        function openWxNavSite(url, name) {
          if (!url) {
            showToast("待配置", `${name || "该站点"}尚未配置 URL，请在代码或后续配置层替换。`);
            return;
          }
          openSiteNewTab(url);
        }

        function addWxNavFavorite(url, name) {
          if (!url) return;
          const list = loadFavs();
          if (list.some((f) => f.url === url)) {
            showToast("已在收藏", name || url);
            renderWeatherNav();
            return;
          }
          list.unshift({ name: name || wxNavHost(url), url });
          saveFavs(list);
          renderWeatherNav();
          showToast("已加入收藏", name || wxNavHost(url));
        }

        const submitForReviewBtn = $("#submitForReviewBtn");
        const warnText = $("#warnText");
        const warnStation = $("#warnStation");
        const warnIsRevision = $("#warnIsRevision");
        const warnIsCancel = $("#warnIsCancel");
        const warnCancelPreview = $("#warnCancelPreview");
        const warnCancelPanel = $("#warnCancelPanel");
        const warnCancelSelectList = $("#warnCancelSelectList");
        const warnCancelSelectHint = $("#warnCancelSelectHint");
        const warnFormatHint = $("#warnFormatHint");
        const warnPhenomenonGroup = $("#warnPhenomenonGroup");
        const warningMarqueeTrack = $("#warningMarqueeTrack");
        const warningModalBackdrop = $("#warningModalBackdrop");
        const warningModalBody = $("#warningModalBody");
        const warningModalClose = $("#warningModalClose");
        const warningModalTitle = $("#warningModalTitle");
        const warningAirportBackdrop = $("#warningAirportBackdrop");
        const warningAirportModalBody = $("#warningAirportModalBody");
        const warningAirportModalClose = $("#warningAirportModalClose");
        const warningAirportModalTitle = $("#warningAirportModalTitle");
        const toggleWarningAllBtn = $("#toggleWarningAllBtn");
        const warningPanelRefreshBtn = $("#warningPanelRefreshBtn");
        const warningPanelClearBtn = $("#warningPanelClearBtn");
        const openWarningMapBtn = $("#openWarningMapBtn");
        const warningMapEmbedRoot = $("#warningMapEmbedRoot");
        const warningMapChartEl = $("#warningMapChart");
        const warningTickerZone = document.querySelector(".warning-ticker-zone");
        const warningMarqueeViewport = document.querySelector(".warning-marquee-viewport");
        let warningMarqueePausedByModal = false;
        let warningMarqueePausedByHover = false;

        const chatLog = $("#chatLog");
        const chatInput = $("#chatInput");
        const sendBtn = $("#sendBtn");

        const reviewSearchOpenBtn = $("#reviewSearchOpenBtn");
        const reviewSearchHint = $("#reviewSearchHint");
        const reviewRecommendOpenBtn = $("#reviewRecommendOpenBtn");
        const reviewRecommendBackdrop = $("#reviewRecommendBackdrop");
        const reviewRecommendModalClose = $("#reviewRecommendModalClose");
        const reviewRecommendRefreshBtn = $("#reviewRecommendRefreshBtn");
        const reviewRecommendList = $("#reviewRecommendList");
        const reviewSearchContext = $("#reviewSearchContext");

        const stationQueryBtn = $("#stationQueryBtn");
        const stationInput = $("#stationInput");
        const elemModalStationInput = $("#elemModalStationInput");
        const elemModalStationQueryBtn = $("#elemModalStationQueryBtn");
        const elemVizBody = $("#elemVizBody");
        const windyDataSource = $("#windyDataSource");
        const elemForecastBackdrop = $("#elemForecastBackdrop");
        const elemForecastClose = $("#elemForecastClose");
        const elemForecastModalTitle = $("#elemForecastModalTitle");
        const elemForecastMetaLine = $("#elemForecastMetaLine");
        const elemCoordSourceTag = $("#elemCoordSourceTag");
        const warningAirportList = $("#warningAirportList");
        const refreshMsgBtn = $("#refreshMsgBtn");
        const refreshTafBtn = $("#refreshTafBtn");
        const messageList = $("#messageList");
        const openMetarRefinedBtn = $("#openMetarRefinedBtn");
        const metarRefinedBackdrop = $("#metarRefinedBackdrop");
        const metarRefinedModalClose = $("#metarRefinedModalClose");
        const metarRefinedRefreshBtn = $("#metarRefinedRefreshBtn");
        const metarRefinedPopoutBtn = $("#metarRefinedPopoutBtn");
        const tafRefinedPopoutBtn = $("#tafRefinedPopoutBtn");
        const refinedPopupWindows = { metar: null, taf: null };
        const metarRefinedWrap = $("#metarRefinedWrap");
        const metarRefinedToolbar = $("#metarRefinedToolbar");
        const metarRefinedCountTag = $("#metarRefinedCountTag");
        const openTafRefinedBtn = $("#openTafRefinedBtn");
        const tafRefinedBackdrop = $("#tafRefinedBackdrop");
        const tafRefinedModalClose = $("#tafRefinedModalClose");
        const tafRefinedRefreshBtn = $("#tafRefinedRefreshBtn");
        const tafRefinedWrap = $("#tafRefinedWrap");
        const tafRefinedToolbar = $("#tafRefinedToolbar");
        const tafRefinedCountTag = $("#tafRefinedCountTag");
        const tafMessageList = $("#tafMessageList");
        const msgStatus = $("#msgStatus");
        const expandMetarMsgBtn = $("#expandMetarMsgBtn");
        const expandTafMsgBtn = $("#expandTafMsgBtn");
        const msgListExpandBackdrop = $("#msgListExpandBackdrop");
        const msgListExpandTitle = $("#msgListExpandTitle");
        const msgListExpandBody = $("#msgListExpandBody");
        const msgListExpandClose = $("#msgListExpandClose");
        const msgDetailBackdrop = $("#msgDetailBackdrop");
        const msgDetailTitle = $("#msgDetailTitle");
        const msgDetailMeta = $("#msgDetailMeta");
        const msgDetailAlerts = $("#msgDetailAlerts");
        const msgDetailAnalysis = $("#msgDetailAnalysis");
        const msgDetailRaw = $("#msgDetailRaw");
        const msgDetailCopyBtn = $("#msgDetailCopyBtn");
        const msgDetailClose = $("#msgDetailClose");
        const msgWhitelistOnly = $("#msgWhitelistOnly");
        const msgFilterAnomalyOnly = $("#msgFilterAnomalyOnly");
        const msgWhitelistTag = $("#msgWhitelistTag");
        const subMsgCard = $("#subMsg");

        /** 后台配置接口（与静态 JSON 结构一致，便于日后切换） */
        const AIRPORT_WHITELIST_API = "/api/config/airports";
        /** 相对当前页路径；本地需用 http 服务打开以便 fetch */
        const AIRPORT_WHITELIST_STATIC = "data/icao-whitelist.json";
        /** IT 提供的公司运行批复机场（含中文名与坐标） */
        const SF_APPROVED_AIRPORTS_STATIC = "data/sf-approved-airports.json";
        /** API/静态均失败时使用 */
        const DEFAULT_ICAO_WHITELIST = [
          "ZBAA",
          "ZBTJ",
          "ZBSJ",
          "ZBHH",
          "ZBYN",
          "ZBPE",
          "ZLXY",
          "ZUUU",
          "ZSPD",
          "ZGGG",
          "ZGSZ",
          "ZSHC",
          "ZHEC",
        ];

        /** @type {Set<string>} */
        let airportWhitelistIcao = new Set();
        /** @type {Map<string, { name: string, lat?: number, lon?: number, iata?: string|null, city?: string|null, fir?: string|null }>} */
        let sfApprovedAirportsMap = new Map();
        /** union=静态+客观预报+航班计划+批复名单合并；staticOnly=仅静态清单；allowAllValidIcao=仅校验四字码格式 */
        let alertPublishMode = "union";
        /** @type {{ source: "api"|"static"|"fallback"|"none", version: string|null, updated: string|null, count: number }} */
        let airportWhitelistMeta = { source: "none", version: null, updated: null, count: 0 };
        /** 航班计划驱动的监控机场池（优先于静态白名单） */
        /** @type {Set<string>} */
        let flightMonitorIcao = new Set();
        /** @type {{ source: "flight"|"none", count: number, flightCount: number, updated: string|null, error: string }} */
        let flightMonitorMeta = { source: "none", count: 0, flightCount: 0, updated: null, error: "" };
        const FLIGHT_MONITOR_CONFIG_STATIC = "data/flight-monitor-config.json";
        /** @type {{ carriers: string[], hoursBack: number, hoursAhead: number, refreshMinutes: number }} */
        let flightMonitorConfig = { carriers: ["O3"], hoursBack: 24, hoursAhead: 48, refreshMinutes: 10 };
        let flightMonitorTimer = null;

        /** @type {Array<Record<string, any>>} */
        let lastMessages = [];
        let lastTafMessages = [];
        let metarSourceLive = false;
        let tafSourceLive = false;
        /** @type {"sf-foc"|"awc"|"demo"|""} */
        let metarDataSource = "";
        /** @type {"sf-foc"|"awc"|"demo"|""} */
        let tafDataSource = "";
        /** 报文范围：all | domestic | intl — 国内：ICAO 首字母 Z（大陆）；港澳台及境外为国际/地区 */
        let msgRegionMode = "all";
        /** 精细化表格区域筛选 */
        let metarRefinedRegionFilter = "all";
        /** 精细化表格告警色筛选：all | R | Y | G | none */
        let metarRefinedColorFilter = "all";
        let tafRefinedRegionFilter = "all";
        let tafRefinedColorFilter = "all";
        /** 报文列表告警色筛选：all | R | Y | G */
        let msgMetarColorFilter = "all";
        let msgTafColorFilter = "all";
        /** 从精细化弹窗打开报文详情后，关闭详情时回到哪个精细化弹窗 */
        /** @type {null | "metar" | "taf"} */
        let msgDetailReopenRefinedKind = null;
        /** @type {Record<string, any> | null} */
        let currentMsgDetail = null;
        /** 当前「展开全部」弹窗是 METAR 还是 TAF（关闭详情后用于恢复该弹窗） */
        let msgExpandModalKind = "metar";
        /** @type {null | "metar" | "taf"} */
        let msgDetailReopenExpandKind = null;

        /** 已弃用单独 bbox 拉数；保留供说明。实况改为 METAR_MAJOR_ICAO + ids 分块请求（全球主要枢纽） */
        const AWC_METAR_BBOX = "0,65,52,155";
        /**
         * AWC `ids` 请求用：全球主要枢纽/门户（中港台日韩东南亚南亚中东澳美加欧）。
         * 可按需增删；同站多条由 dedupeMetarLatest 保留最新观测。
         */
        const METAR_MAJOR_ICAO = [
          "ZBAA",
          "ZBAD",
          "ZSPD",
          "ZGGG",
          "ZGSZ",
          "ZSHC",
          "ZUUU",
          "ZLXY",
          "ZGHA",
          "ZSAM",
          "ZGKL",
          "ZHHH",
          "ZSNJ",
          "ZSQD",
          "ZBTJ",
          "ZBSJ",
          "ZBHH",
          "ZBYN",
          "ZGNN",
          "ZJHK",
          "ZHCC",
          "ZGSD",
          "ZYTX",
          "ZYHB",
          "ZYTL",
          "ZHYC",
          "ZWKM",
          "ZLLL",
          "ZUCK",
          "ZHEC",
          "VHHH",
          "VMMC",
          "RCTP",
          "RCKH",
          "RJTT",
          "RJAA",
          "RJBB",
          "RJGG",
          "RJFF",
          "ROAH",
          "RKSI",
          "RKPK",
          "WSSS",
          "WMKK",
          "VTBS",
          "VIDP",
          "VABB",
          "OMDB",
          "OERK",
          "OTHH",
          "YSSY",
          "YMML",
          "KJFK",
          "KLAX",
          "KSFO",
          "KORD",
          "KATL",
          "KDFW",
          "KSEA",
          "KMIA",
          "KBOS",
          "KIAD",
          "KPHX",
          "KLGA",
          "KDEN",
          "KSAN",
          "KPDX",
          "KLAS",
          "KMCO",
          "KBWI",
          "KSTL",
          "KPHL",
          "KSLC",
          "KDTW",
          "CYVR",
          "CYYZ",
          "EGLL",
          "EGKK",
          "LFPG",
          "EDDF",
          "EDDM",
          "EHAM",
          "LEMD",
          "LIRF",
          "LSZH",
          "LOWW",
          "EKCH",
          "ESSA",
          "ENGM",
          "UUEE",
          "EIDW",
          "LPPT",
        ];
        /** 公司枢纽：首都 · 萧山 · 宝安 · 花湖（预留，如与席位/地图联动） */
        const METAR_HUB_ICAO_ORDER = ["ZBAA", "ZSHC", "ZGSZ", "ZHEC"];

        /** @type {{ role: string, host: string, searchUrl: string, apiUrl: string, hint: string, loaded: boolean }} */
        let reviewServiceState = {
          role: "local",
          host: "",
          searchUrl: "http://localhost:8501",
          apiUrl: "http://localhost:8502",
          hint: "",
          loaded: false,
        };

        function getReviewSearchUrl() {
          return reviewServiceState.searchUrl || "http://localhost:8501";
        }

        /** 工作台 dev 服务同源代理 /api/review；轻客户端 file 协议直连服务机 */
        function getReviewApiBase() {
          if (location.protocol === "file:") {
            if (reviewServiceState.role === "client") {
              return reviewServiceState.apiUrl || "http://localhost:8502";
            }
            return "http://localhost:8502";
          }
          return "/api/review";
        }

        function applyReviewServiceUi() {
          const btn = document.getElementById("reviewSearchOpenBtn");
          if (btn) btn.href = getReviewSearchUrl();
          const hint = document.getElementById("reviewSearchHint");
          if (hint && reviewServiceState.hint) hint.textContent = reviewServiceState.hint;
        }

        async function initReviewServiceConfig() {
          if (location.protocol === "file:") {
            reviewServiceState.loaded = true;
            return;
          }
          try {
            const res = await fetch("/api/review-service/config", { cache: "no-store" });
            if (res.ok) {
              const cfg = await res.json();
              reviewServiceState = { ...reviewServiceState, ...cfg, loaded: true };
            }
          } catch (_) {
            /* 保持 local 默认 */
          }
          reviewServiceState.loaded = true;
          applyReviewServiceUi();
        }
        let reviewRecommendLoading = false;
        let reviewRecommendLastFetch = 0;
        /** @type {{ rows: Array<{icao:string,region:string,wx:string,hasAlert:boolean}>, ctx: object|null, payload: object|null, regionFilter: 'all'|'domestic'|'intl' }} */
        let reviewDutyTableState = { rows: [], ctx: null, payload: null, regionFilter: "all" };

        /** 报文监控「恶劣天气」：公司标准「是否恶劣天气=Y」或全局要素达黄/红档 */
        function isSevereMonitorMessage(m) {
          return Boolean(m?.badWeather);
        }

        function collectReviewRecommendContext() {
          const airports = new Set();
          const weatherCodes = new Set();
          const alertPhenomena = new Set();
          const sources = {
            warningStations: [],
            metarStations: [],
            tafStations: [],
            warningPhenomena: [],
            metarReasons: [],
            tafReasons: [],
          };

          // A. 生效机场警报：告警屏「天气预警」← 处置屏发布的机场 + AIRPORT_ALERT_PHENOMENA 现象
          for (const w of warningPool) {
            const st = String(w.station || "").trim().toUpperCase();
            if (st) {
              airports.add(st);
              if (!sources.warningStations.includes(st)) sources.warningStations.push(st);
            }
            warningPhenomenaList(w).forEach((p) => {
              const label = String(p || "").trim();
              if (!label) return;
              alertPhenomena.add(label);
              if (!sources.warningPhenomena.includes(label)) sources.warningPhenomena.push(label);
            });
          }

          // B. 报文监控恶劣天气：与告警屏列表同源筛选（公司标准 badWeather）
          for (const m of getFilteredMessages().filter(isSevereMonitorMessage)) {
            const st = String(m.station || "").trim().toUpperCase();
            if (st) {
              airports.add(st);
              if (!sources.metarStations.includes(st)) sources.metarStations.push(st);
            }
            extractBadWeatherCodesFromRaw(m.raw).forEach((c) => weatherCodes.add(c));
            (Array.isArray(m.alertReasons) ? m.alertReasons : []).forEach((r) => {
              const reason = String(r || "").trim();
              if (reason && !sources.metarReasons.includes(reason)) sources.metarReasons.push(reason);
            });
          }
          for (const m of getFilteredTafMessages().filter(isSevereMonitorMessage)) {
            const st = String(m.station || "").trim().toUpperCase();
            if (st) {
              airports.add(st);
              if (!sources.tafStations.includes(st)) sources.tafStations.push(st);
            }
            extractBadWeatherCodesFromRaw(m.raw).forEach((c) => weatherCodes.add(c));
            (Array.isArray(m.alertReasons) ? m.alertReasons : []).forEach((r) => {
              const reason = String(r || "").trim();
              if (reason && !sources.tafReasons.includes(reason)) sources.tafReasons.push(reason);
            });
          }

          return {
            airports: [...airports].filter(Boolean),
            weather: [...weatherCodes],
            phenomena: [...alertPhenomena],
            sources,
            metarSource: metarDataSource || "—",
            tafSource: tafDataSource || "—",
            whitelistCount: getMessageMonitorIcaoList().length,
            msgRegionMode,
          };
        }

        function renderReviewRecommendEmpty(message) {
          if (!reviewRecommendList) return;
          reviewRecommendList.innerHTML = `<div class="review-search-empty">${escapeHtml(message)}</div>`;
        }

        function buildReviewDetailUrl(item) {
          if (item.detail_query) {
            return `${getReviewSearchUrl()}/?q=${encodeURIComponent(item.detail_query)}&auto=1`;
          }
          const parts = [];
          if (Array.isArray(item.airport_labels) && item.airport_labels.length) {
            parts.push(...item.airport_labels.slice(0, 2));
          } else if (Array.isArray(item.airports) && item.airports.length) {
            parts.push(...item.airports.slice(0, 2));
          }
          if (Array.isArray(item.weather_types) && item.weather_types.length) {
            parts.push(...item.weather_types.slice(0, 3));
          }
          const q = parts.length ? parts.join(" ") : item.title || item.filename || "航空气象复盘";
          return `${getReviewSearchUrl()}/?q=${encodeURIComponent(q)}&auto=1`;
        }

        function renderReviewRecommendItems(items) {
          if (!reviewRecommendList) return;
          if (!items.length) {
            renderReviewRecommendEmpty("暂无匹配复盘，可点击「打开复盘搜索」手动检索。");
            return;
          }
          reviewRecommendList.innerHTML = items
            .map((item) => {
              const title = item.title || item.filename || "未命名复盘";
              const meta = [
                item.event_date ? String(item.event_date) : "",
                Array.isArray(item.airports) && item.airports.length ? item.airports.join("、") : "",
                Array.isArray(item.weather_types) && item.weather_types.length ? item.weather_types.join("、") : "",
              ]
                .filter(Boolean)
                .join(" · ");
              const detailUrl = buildReviewDetailUrl(item);
              const pct = item.relevance_pct != null ? `${item.relevance_pct}%` : "";
              return `
                <div class="review-search-item">
                  <div class="review-search-item-main">
                    <div class="review-search-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    <div class="review-search-item-meta">${escapeHtml(meta || "历史复盘")}${pct ? ` · 相关度 ${escapeHtml(pct)}` : ""}</div>
                    <div class="review-search-item-snippet">${escapeHtml(item.snippet || "")}</div>
                  </div>
                  <a class="btn secondary" href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener noreferrer">查看详情</a>
                </div>
              `;
            })
            .join("");
        }

        function formatReviewDataSourceLabel(source) {
          const s = String(source || "").toLowerCase();
          if (s === "sf-foc") return "公司 FOC";
          if (s === "awc") return "AWC";
          if (s === "demo") return "演示数据";
          return source || "—";
        }

        function lookupAirportDisplayName(icao) {
          const code = String(icao || "").trim().toUpperCase();
          if (!code) return "";
          const fromDefault =
            typeof OBJ_DEFAULT_AIRPORTS !== "undefined"
              ? OBJ_DEFAULT_AIRPORTS.find((a) => a.icao === code)
              : null;
          if (fromDefault?.name) return fromDefault.name;
          for (const m of [...(lastMessages || []), ...(lastTafMessages || [])]) {
            if (String(m.station || "").toUpperCase() === code && m.name) return String(m.name);
          }
          return code;
        }

        /** 表格用短站名：优先中文库，英文长名截城市或回退四字码 */
        function lookupAirportShortName(icao) {
          const code = String(icao || "").trim().toUpperCase();
          const fromDefault =
            typeof OBJ_DEFAULT_AIRPORTS !== "undefined"
              ? OBJ_DEFAULT_AIRPORTS.find((a) => a.icao === code)
              : null;
          if (fromDefault?.name) return fromDefault.name;
          let name = "";
          for (const m of [...(lastMessages || []), ...(lastTafMessages || [])]) {
            if (String(m.station || "").toUpperCase() === code && m.name) {
              name = String(m.name).trim();
              break;
            }
          }
          if (!name) return code;
          if (/^Z[A-Z]{3}$/.test(code) && (/[,/]|Arpt|Intl|Airport/i.test(name) || name.length > 10)) {
            if (name.includes("/")) {
              const city = name.split("/")[0].trim();
              if (city.length >= 2 && city.length <= 8) return city;
            }
            return code;
          }
          if (name.length > 14) return code;
          return name;
        }

        function simplifyAlertReason(raw) {
          const s = String(raw || "").trim();
          if (!s) return "";
          const phen = s.match(/天气现象\s+\S+（([^·）]+)/);
          if (phen) return phen[1].trim();
          if (/LIFR|IFR|MVFR/.test(s)) {
            const fc = s.match(/(LIFR|IFR|MVFR)/);
            if (fc) return fc[1];
          }
          if (/能见度|RVR|雾|FG|BR/.test(s)) return "低能见度";
          if (/云底|低云|OVC|BKN|VV/.test(s)) return "低云";
          if (/阵风/.test(s)) return "阵风";
          if (/风速|大风/.test(s)) return "大风";
          if (/雷|TS/.test(s)) return "雷雨";
          if (/雪|SN/.test(s)) return "降雪";
          if (/降水|雨|RA|DZ|SHRA/.test(s)) return "降水";
          if (/尘|SA|DU/.test(s)) return "尘暴";
          const head = s.split("（")[0].trim();
          return head.length <= 10 ? head : "";
        }

        function collectStationWeatherTags(entry) {
          const tags = [];
          const seen = new Set();
          const add = (t) => {
            const x = String(t || "").trim();
            if (!x || seen.has(x)) return;
            seen.add(x);
            tags.push(x);
          };
          entry.alertPhen.forEach(add);
          [...entry.metarReasons, ...entry.tafReasons].forEach((r) => add(simplifyAlertReason(r)));
          if (!tags.length && entry.wx.size) [...entry.wx].slice(0, 4).forEach(add);
          return tags;
        }

        function airportRegionTag(icao) {
          const code = String(icao || "").trim().toUpperCase();
          if (typeof isMainlandChinaIcao === "function" && isMainlandChinaIcao(code)) return "国内";
          const fromDefault =
            typeof OBJ_DEFAULT_AIRPORTS !== "undefined"
              ? OBJ_DEFAULT_AIRPORTS.find((a) => a.icao === code)
              : null;
          if (fromDefault?.region) return fromDefault.region === "国内" ? "国内" : "国际/地区";
          if (/^Z/.test(code)) return "国内";
          return "国际/地区";
        }

        /** 生效警报 + 报文恶劣天气 → 机场行数据 */
        function collectReviewDutyRows(ctx) {
          /** @type {Map<string, { alertPhen: Set<string>, metarReasons: Set<string>, tafReasons: Set<string>, wx: Set<string>, hasAlert: boolean, metar: boolean, taf: boolean }>} */
          const byStation = new Map();
          const ensure = (icao) => {
            const c = String(icao || "").trim().toUpperCase();
            if (!c) return null;
            if (!byStation.has(c)) {
              byStation.set(c, {
                alertPhen: new Set(),
                metarReasons: new Set(),
                tafReasons: new Set(),
                wx: new Set(),
                hasAlert: false,
                metar: false,
                taf: false,
              });
            }
            return byStation.get(c);
          };

          for (const w of warningPool) {
            const e = ensure(w.station);
            if (!e) continue;
            e.hasAlert = true;
            warningPhenomenaList(w).forEach((p) => {
              const t = String(p || "").trim();
              if (t) e.alertPhen.add(t);
            });
          }
          for (const m of getFilteredMessages().filter(isSevereMonitorMessage)) {
            const e = ensure(m.station);
            if (!e) continue;
            e.metar = true;
            (Array.isArray(m.alertReasons) ? m.alertReasons : []).forEach((r) => {
              const t = String(r || "").trim();
              if (t) e.metarReasons.add(t);
            });
            extractBadWeatherCodesFromRaw(m.raw).forEach((c) => e.wx.add(c));
          }
          for (const m of getFilteredTafMessages().filter(isSevereMonitorMessage)) {
            const e = ensure(m.station);
            if (!e) continue;
            e.taf = true;
            (Array.isArray(m.alertReasons) ? m.alertReasons : []).forEach((r) => {
              const t = String(r || "").trim();
              if (t) e.tafReasons.add(t);
            });
            extractBadWeatherCodesFromRaw(m.raw).forEach((c) => e.wx.add(c));
          }

          const rows = [];
          for (const icao of [...byStation.keys()].sort()) {
            const region = airportRegionTag(icao);
            if (ctx.msgRegionMode === "domestic" && region !== "国内") continue;
            if (ctx.msgRegionMode === "intl" && region === "国内") continue;
            const entry = byStation.get(icao);
            const wx = collectStationWeatherTags(entry);
            if (!wx.length) continue;
            rows.push({
              icao,
              region,
              wx: wx.join("、"),
              hasAlert: entry.hasAlert,
            });
          }

          rows.sort((a, b) => {
            if (a.hasAlert !== b.hasAlert) return a.hasAlert ? -1 : 1;
            if (a.region !== b.region) return a.region === "国内" ? -1 : 1;
            return a.icao.localeCompare(b.icao);
          });
          return rows;
        }

        function filterReviewDutyRows(rows, regionFilter) {
          if (regionFilter === "domestic") return rows.filter((r) => r.region === "国内");
          if (regionFilter === "intl") return rows.filter((r) => r.region !== "国内");
          return rows;
        }

        function renderReviewDutyTableBody(rows, regionFilter) {
          const filtered = filterReviewDutyRows(rows, regionFilter);
          if (!filtered.length) {
            return `<tr><td colspan="2" class="review-search-empty" style="border:none">当前分类下暂无需关注机场</td></tr>`;
          }

          if (regionFilter !== "all") {
            return filtered
              .map(
                (r) => `
              <tr>
                <td class="col-airport">${escapeHtml(r.icao)}</td>
                <td class="col-wx">${escapeHtml(r.wx)}</td>
              </tr>`,
              )
              .join("");
          }

          const domestic = filtered.filter((r) => r.region === "国内");
          const intl = filtered.filter((r) => r.region !== "国内");
          const parts = [];
          const pushSection = (label, list) => {
            if (!list.length) return;
            parts.push(
              `<tr class="review-duty-section-row"><td colspan="2">${escapeHtml(label)} · ${list.length} 站</td></tr>`,
            );
            list.forEach((r) => {
              parts.push(`
              <tr>
                <td class="col-airport">${escapeHtml(r.icao)}</td>
                <td class="col-wx">${escapeHtml(r.wx)}</td>
              </tr>`);
            });
          };
          pushSection("国内", domestic);
          pushSection("国际/地区", intl);
          return parts.join("");
        }

        function renderReviewDutyBriefingHtml(state) {
          const { rows, ctx, payload, regionFilter } = state;
          if (!rows.length || !ctx) return "";

          const regionScope =
            ctx.msgRegionMode === "domestic" ? "国内" : ctx.msgRegionMode === "intl" ? "国际/地区" : "全部";
          const count = payload?.count ?? 0;
          const filtered = filterReviewDutyRows(rows, regionFilter);
          const filterLabel =
            regionFilter === "domestic" ? "国内" : regionFilter === "intl" ? "国际/地区" : "全部";

          const summary =
            count > 0
              ? `共 ${filtered.length} 个需关注机场 · 显示 ${filterLabel} · 告警屏 ${regionScope} · 已匹配 ${count} 条复盘`
              : `共 ${filtered.length} 个需关注机场 · 显示 ${filterLabel} · 告警屏 ${regionScope} · 暂无匹配复盘`;

          const meta = [
            `METAR ${formatReviewDataSourceLabel(ctx.metarSource)}`,
            `TAF ${formatReviewDataSourceLabel(ctx.tafSource)}`,
            "与告警屏口径一致",
          ].join(" · ");

          const tab = (id, label) =>
            `<button type="button" class="elem-mode-btn${regionFilter === id ? " is-active" : ""}" data-review-duty-region="${id}">${label}</button>`;

          return `
              <p class="review-duty-summary">${escapeHtml(summary)}</p>
              <div class="review-duty-toolbar">
                <span class="hint" style="margin:0;font-size:11px">机场分类</span>
                <div class="review-duty-region-tabs" role="tablist" aria-label="机场国内国际分类">
                  ${tab("all", "全部")}
                  ${tab("domestic", "国内")}
                  ${tab("intl", "国际/地区")}
                </div>
              </div>
              <div class="review-duty-table-wrap">
                <table class="review-duty-table">
                  <thead>
                    <tr>
                      <th class="col-airport">机场</th>
                      <th class="col-wx">关注天气</th>
                    </tr>
                  </thead>
                  <tbody id="reviewDutyTableBody">${renderReviewDutyTableBody(rows, regionFilter)}</tbody>
                </table>
              </div>
              <p class="review-duty-meta">${escapeHtml(meta)}</p>`;
        }

        function updateReviewSearchContext(ctx, payload) {
          if (!reviewSearchContext) return;
          reviewDutyTableState = {
            rows: collectReviewDutyRows(ctx),
            ctx,
            payload,
            regionFilter: reviewDutyTableState.regionFilter || "all",
          };
          if (!reviewDutyTableState.rows.length) {
            reviewSearchContext.innerHTML = "";
            return;
          }
          reviewSearchContext.innerHTML = renderReviewDutyBriefingHtml(reviewDutyTableState);
        }

        function setReviewDutyRegionFilter(filter) {
          const next = filter === "domestic" || filter === "intl" ? filter : "all";
          reviewDutyTableState.regionFilter = next;
          if (!reviewSearchContext || !reviewDutyTableState.rows.length) return;
          reviewSearchContext.innerHTML = renderReviewDutyBriefingHtml(reviewDutyTableState);
        }

        function openReviewRecommendModal() {
          if (!reviewRecommendBackdrop) return;
          reviewDutyTableState.regionFilter = "all";
          reviewRecommendBackdrop.classList.add("is-open");
          reviewRecommendBackdrop.setAttribute("aria-hidden", "false");
          refreshReviewRecommend(true);
        }

        function closeReviewRecommendModal() {
          if (!reviewRecommendBackdrop) return;
          reviewRecommendBackdrop.classList.remove("is-open");
          reviewRecommendBackdrop.setAttribute("aria-hidden", "true");
        }

        async function refreshReviewRecommend(force = false) {
          if (!reviewRecommendList) return;
          const now = Date.now();
          if (!force && now - reviewRecommendLastFetch < 15000) return;
          if (reviewRecommendLoading) return;
          reviewRecommendLoading = true;
          const ctx = collectReviewRecommendContext();
          updateReviewSearchContext(ctx, { count: 0 });
          if (!ctx.airports.length) {
            renderReviewRecommendEmpty(
              "当前无生效机场警报，报文监控中也无公司标准下的恶劣天气机场，暂无今日相关推荐。请先在处置屏发布警报或等待报文监控出现异常。"
            );
            reviewRecommendLoading = false;
            return;
          }
          renderReviewRecommendEmpty("正在按生效警报与报文恶劣天气匹配复盘…");
          try {
            const params = new URLSearchParams();
            params.set("airports", ctx.airports.join(","));
            if (ctx.phenomena.length) params.set("phenomena", ctx.phenomena.join(","));
            if (ctx.weather.length) params.set("weather", ctx.weather.join(","));
            params.set("top_k", "5");
            const apiBase = getReviewApiBase();
            let data = null;
            let lastErr = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
              try {
                const recommendPath = apiBase.startsWith("http") ? `${apiBase}/api/recommend` : `${apiBase}/recommend`;
                const res = await fetch(`${recommendPath}?${params.toString()}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
                break;
              } catch (e) {
                lastErr = e;
              }
            }
            if (!data) throw lastErr || new Error("API unavailable");
            reviewRecommendLastFetch = Date.now();
            updateReviewSearchContext(ctx, data);
            renderReviewRecommendItems(Array.isArray(data.items) ? data.items : []);
          } catch (err) {
            const focHint =
              ctx.metarSource === "demo" || ctx.tafSource === "demo"
                ? " 当前报文为演示数据（公司 FOC 未接通时与告警屏一致回退演示）。"
                : "";
            const clientHint =
              reviewServiceState.role === "client"
                ? `请确认复盘服务机已运行 review-search\\start-review-server.bat（${reviewServiceState.host || "见 data/review-service-config.json"}），且防火墙已放行 8502。`
                : "请先运行工作台 start.bat 并保持窗口不关（local 模式会自动启动推荐 API）；8501 复盘页需服务机 start-review-server.bat 或本机 start-search.bat。";
            renderReviewRecommendEmpty(
              `今日相关服务未就绪。${clientHint} 若仍失败，在 review-search 目录执行 pip install -r requirements.txt 后重启。${focHint}`
            );
            updateReviewSearchContext(ctx, { count: 0 });
          } finally {
            reviewRecommendLoading = false;
          }
        }

        const accuracyValue = $("#accuracyValue");
        const accuracyBar = $("#accuracyBar");

        // ----- Data (mock) -----
        /** 带班审核上线后使用；当前无待审核 UI */
        /** @type {Array<{id:string, text:string, receiver:string, createdAt:string, status:"pending"|"approved"|"rejected", publishType:"weather"|"period", syncFengsheng:boolean}>} */
        let reviewItems = [];

        function nowHHMM() {
          const d = new Date();
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          return `${hh}:${mm}`;
        }

        function setRoleHint(role) {
          if (role === "leader") roleHint.textContent = "当前：带班";
          else roleHint.textContent = "当前：值班员";
        }

        function canReview(role) {
          return role === "leader";
        }

        function escapeHtml(str) {
          return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function renderPending() {
          /* 待审核列表已隐藏，保留供带班岗上线后恢复 */
        }


        /* ========== 客观预报（Open-Meteo） ========== */
        const OBJ_MODEL_STORAGE = "wx_obj_forecast_model_v1";
        const OBJ_PHENOMENA_STORAGE = "wx_obj_forecast_phenomena_v1";
        const OBJ_DEFAULT_AIRPORTS = [
          { icao: "ZBAA", name: "北京首都", region: "国内" },
          { icao: "ZBTJ", name: "天津滨海", region: "国内" },
          { icao: "ZSPD", name: "上海浦东", region: "国内" },
          { icao: "ZGGG", name: "广州白云", region: "国内" },
          { icao: "ZGSZ", name: "深圳宝安", region: "国内" },
          { icao: "ZSHC", name: "杭州萧山", region: "国内" },
          { icao: "ZUUU", name: "成都天府", region: "国内" },
          { icao: "ZLXY", name: "西安咸阳", region: "国内" },
          { icao: "ZUCK", name: "重庆江北", region: "国内" },
          { icao: "ZWWW", name: "乌鲁木齐", region: "国内" },
          { icao: "ZSAM", name: "厦门高崎", region: "国内" },
          { icao: "ZHHH", name: "武汉天河", region: "国内" },
          { icao: "ZHEC", name: "鄂州花湖", region: "国内" },
          { icao: "VHHH", name: "香港", region: "国际/地区" },
          { icao: "RCTP", name: "台北桃园", region: "国际/地区" },
          { icao: "RJTT", name: "东京成田", region: "国际/地区" },
          { icao: "RKSI", name: "首尔仁川", region: "国际/地区" },
          { icao: "WSSS", name: "新加坡", region: "国际/地区" },
          { icao: "VTBS", name: "曼谷", region: "国际/地区" },
          { icao: "OMDB", name: "迪拜", region: "国际/地区" },
          { icao: "EGLL", name: "伦敦希思罗", region: "国际/地区" },
          { icao: "LFPG", name: "巴黎戴高乐", region: "国际/地区" },
          { icao: "EDDF", name: "法兰克福", region: "国际/地区" },
          { icao: "KJFK", name: "纽约肯尼迪", region: "国际/地区" },
          { icao: "KLAX", name: "洛杉矶", region: "国际/地区" },
          { icao: "CYYZ", name: "多伦多", region: "国际/地区" },
        ];
        const OBJ_DEFAULT_PHENOMENA = [
          "小雨",
          "中雨",
          "大雨",
          "小阵雨",
          "中阵雨",
          "大阵雨",
          "小雪",
          "中雪",
          "大雪",
          "小阵雪",
          "中阵雪",
          "大阵雪",
          "弱雷雨",
          "中雷雨",
          "强雷雨",
          "大雾（能见度＜1000米）",
          "轻雾",
          "冻雾（能见度＜1000米，气温＜0摄氏度）",
          "大阵风（阵风风速≥17米/秒）",
          "炎热天气（气温≥35摄氏度）",
          "低云（云低高≤60米，云量5-7个量）",
          "晴",
          "多云",
          "阴",
        ];

        const objForecastGenerateBtn = $("#objForecastGenerateBtn");
        const objForecastSettingsBtn = $("#objForecastSettingsBtn");
        const objForecastSettingsBackdrop = $("#objForecastSettingsBackdrop");
        const objForecastSettingsClose = $("#objForecastSettingsClose");
        const objForecastSettingsSave = $("#objForecastSettingsSave");
        const objAirportSettingsBody = $("#objAirportSettingsBody");
        const objPhenomenonSettingsBody = $("#objPhenomenonSettingsBody");
        const objAirportAddBtn = $("#objAirportAddBtn");
        const objPhenomenonAddBtn = $("#objPhenomenonAddBtn");
        const objForecastTable = $("#objForecastTable");
        const objForecastTableWrap = $("#objForecastTableWrap");
        const objForecastEmpty = $("#objForecastEmpty");
        const objForecastLegend = $("#objForecastLegend");
        const objForecastTableBackdrop = $("#objForecastTableBackdrop");
        const objForecastTableModalClose = $("#objForecastTableModalClose");
        const objForecastTableModalTitle = $("#objForecastTableModalTitle");
        const objForecastTableMeta = $("#objForecastTableMeta");
        const weatherBrushBackdrop = $("#weatherBrushBackdrop");
        const weatherBrushModalClose = $("#weatherBrushModalClose");
        const weatherBrushText = $("#weatherBrushText");
        const weatherBrushSaveDraftBtn = $("#weatherBrushSaveDraftBtn");
        const weatherBrushClearContentBtn = $("#weatherBrushClearContentBtn");
        const weatherBrushCopyDoneBtn = $("#weatherBrushCopyDoneBtn");
        const weatherBrushPublishBtn = $("#weatherBrushPublishBtn");
        const WEATHER_BRUSH_DRAFT_KEY = "wx_weather_brush_draft_v1";
        const WARN_DRAFT_KEY = "wx_airport_alert_draft_v1";

        const publishTileAlert = $("#publishTileAlert");
        const publishTilePeriod = $("#publishTilePeriod");
        const publishTileBrush = $("#publishTileBrush");
        const publishTileObjective = $("#publishTileObjective");
        /** 未来24小时预报外部发布系统 URL（同事对接后填入完整地址，留空则点击时提示未配置） */
        const FORECAST_24H_PUBLISH_URL = "";
        const forecastPublishHubBackdrop = $("#forecastPublishHubBackdrop");
        const forecastPublishHubClose = $("#forecastPublishHubClose");
        const forecastPublishPeriodOption = $("#forecastPublishPeriodOption");
        const forecastPublish24hOption = $("#forecastPublish24hOption");
        const airportAlertBackdrop = $("#airportAlertBackdrop");
        const airportAlertModalClose = $("#airportAlertModalClose");
        const warnSaveDraftBtn = $("#warnSaveDraftBtn");
        const warnClearContentBtn = $("#warnClearContentBtn");
        const warnCopyDoneBtn = $("#warnCopyDoneBtn");
        const periodForecastBackdrop = $("#periodForecastBackdrop");
        const periodForecastModalClose = $("#periodForecastModalClose");
        const objForecastWorkspaceBackdrop = $("#objForecastWorkspaceBackdrop");
        const objForecastWorkspaceClose = $("#objForecastWorkspaceClose");

        const PUBLISH_ARCHIVE_RETENTION_DAYS = 31;
        const PUBLISH_OUTBOX_API = "/api/publish/outbox";
        const publishArchiveBtn = $("#publishArchiveBtn");

        const publishArchiveBackdrop = $("#publishArchiveBackdrop");
        const publishArchiveModalClose = $("#publishArchiveModalClose");
        const publishArchiveRefreshBtn = $("#publishArchiveRefreshBtn");
        const publishArchiveFilterDate = $("#publishArchiveFilterDate");
        const publishArchiveFilterType = $("#publishArchiveFilterType");
        const publishArchiveFilterPush = $("#publishArchiveFilterPush");
        const publishArchiveFilterHint = $("#publishArchiveFilterHint");
        const publishArchiveList = $("#publishArchiveList");
        const publishArchiveDetail = $("#publishArchiveDetail");
        const publishArchiveDetailTitle = $("#publishArchiveDetailTitle");
        const publishArchiveDetailTime = $("#publishArchiveDetailTime");
        const publishArchiveDetailBody = $("#publishArchiveDetailBody");
        const publishArchiveDetailPushStatus = $("#publishArchiveDetailPushStatus");
        const publishArchiveDetailOverdue = $("#publishArchiveDetailOverdue");
        const publishArchiveCopyBtn = $("#publishArchiveCopyBtn");
        const publishArchiveMarkPushedBtn = $("#publishArchiveMarkPushedBtn");
        const publishOutboxBadge = $("#publishOutboxBadge");
        const publishOutboxGuard = $("#publishOutboxGuard");
        const publishOutboxGuardTitle = $("#publishOutboxGuardTitle");
        const publishOutboxGuardList = $("#publishOutboxGuardList");
        const publishOutboxGuardToggle = $("#publishOutboxGuardToggle");
        const publishOutboxGuardClose = $("#publishOutboxGuardClose");
        const publishOutboxGuardAck = $("#publishOutboxGuardAck");
        let publishOutboxGuardExpanded = false;
        const objForecastExportPngBtn = $("#objForecastExportPngBtn");
        const objForecastExportPanelBtn = $("#objForecastExportPanelBtn");
        let publishArchiveSelectedId = null;
        let publishArchiveCache = null;
        let publishArchiveCacheLoading = null;
        let publishArchiveCacheEpoch = 0;
        let publishOutboxGuardTimer = null;

        function publishArchiveStorageKey() {
          return `wx_publish_archive_v1_${getAccount()}`;
        }

        function publishArchiveMigrateKey() {
          return `wx_publish_outbox_migrated_v1_${getAccount()}`;
        }

        function publishGuardDismissStorageKey() {
          return `wx_publish_guard_dismiss_v1_${getAccount()}`;
        }

        function loadPublishGuardDismissals() {
          try {
            const raw = localStorage.getItem(publishGuardDismissStorageKey());
            const data = raw ? JSON.parse(raw) : {};
            return {
              entryIds: new Set(Array.isArray(data.entryIds) ? data.entryIds.map(String) : []),
              missingKeys: new Set(Array.isArray(data.missingKeys) ? data.missingKeys.map(String) : []),
            };
          } catch {
            return { entryIds: new Set(), missingKeys: new Set() };
          }
        }

        function savePublishGuardDismissals(dismiss) {
          try {
            localStorage.setItem(
              publishGuardDismissStorageKey(),
              JSON.stringify({
                entryIds: [...(dismiss?.entryIds || [])],
                missingKeys: [...(dismiss?.missingKeys || [])],
              }),
            );
          } catch {
            /* ignore */
          }
        }

        function missingGuardDismissKey(today, item) {
          return `missing:${today}:${item.slotId || ""}:${item.kind}:${item.label}`;
        }

        function publishArchiveEntryIsTc(entry) {
          return entry?.type === "alert" && Array.isArray(entry.phenomena) && entry.phenomena.includes("热带气旋");
        }

        function publishArchiveTypeLabel(entry) {
          const type = typeof entry === "object" ? entry?.type : entry;
          if (publishArchiveEntryIsTc(typeof entry === "object" ? entry : null)) return "热带气旋";
          if (type === "alert") return "机场警报";
          if (type === "period") return "时段预报";
          if (type === "brush") return "天气梳理";
          return "其他";
        }

        function loadPublishArchiveEntriesLocal() {
          try {
            const raw = localStorage.getItem(publishArchiveStorageKey());
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
          } catch {
            return [];
          }
        }

        function loadPublishArchiveEntries() {
          if (Array.isArray(publishArchiveCache)) return publishArchiveCache.slice();
          return loadPublishArchiveEntriesLocal();
        }

        function prunePublishArchiveEntries(list) {
          const cutoff = Date.now() - PUBLISH_ARCHIVE_RETENTION_DAYS * 86400000;
          return list.filter((e) => {
            const ms = e?.savedAt ? new Date(e.savedAt).getTime() : 0;
            return ms >= cutoff;
          });
        }

        function savePublishArchiveEntriesLocal(list) {
          const pruned = prunePublishArchiveEntries(list);
          localStorage.setItem(publishArchiveStorageKey(), JSON.stringify(pruned));
          return pruned;
        }

        function normalizePublishArchiveEntry(raw) {
          if (!raw || typeof raw !== "object") return null;
          const text = String(raw.text || "").trim();
          if (!text) return null;
          const phenomena = Array.isArray(raw.phenomena)
            ? raw.phenomena.map(String).filter(Boolean)
            : [];
          return {
            id: String(raw.id || `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            type: String(raw.type || "other"),
            text,
            savedAt: raw.savedAt || new Date().toISOString(),
            savedBy: String(raw.savedBy || raw.publishedBy || ""),
            station: String(raw.station || "").trim().toUpperCase(),
            phenomena,
            periodSlotId: String(raw.periodSlotId || "").trim(),
            anchorYmd: String(raw.anchorYmd || "").trim().slice(0, 10),
            publishDeadlineAt: raw.publishDeadlineAt || null,
            urgency: raw.urgency || "",
            pushedToNext: Boolean(raw.pushedToNext),
            pushedAt: raw.pushedAt || null,
            pushedBy: String(raw.pushedBy || ""),
          };
        }

        async function refreshPublishArchiveCache(opts = {}) {
          const force = Boolean(opts.force);
          if (!force && publishArchiveCacheLoading) return publishArchiveCacheLoading;
          const epoch = ++publishArchiveCacheEpoch;
          const run = (async () => {
            try {
              const r = await fetch(`${PUBLISH_OUTBOX_API}?t=${Date.now()}`, {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
              });
              if (r.ok) {
                const data = await r.json();
                if (epoch !== publishArchiveCacheEpoch) {
                  return publishArchiveCache || [];
                }
                publishArchiveCache = Array.isArray(data.items)
                  ? data.items.map(normalizePublishArchiveEntry).filter(Boolean)
                  : [];
                savePublishArchiveEntriesLocal(publishArchiveCache);
                return publishArchiveCache;
              }
            } catch {
              /* fallback below */
            }
            if (epoch !== publishArchiveCacheEpoch) {
              return publishArchiveCache || [];
            }
            publishArchiveCache = loadPublishArchiveEntriesLocal()
              .map(normalizePublishArchiveEntry)
              .filter(Boolean);
            return publishArchiveCache;
          })();
          publishArchiveCacheLoading = run;
          try {
            return await run;
          } finally {
            if (publishArchiveCacheLoading === run) publishArchiveCacheLoading = null;
          }
        }

        async function migratePublishArchiveToServer() {
          try {
            if (localStorage.getItem(publishArchiveMigrateKey())) return;
          } catch {
            return;
          }
          const local = loadPublishArchiveEntriesLocal()
            .map(normalizePublishArchiveEntry)
            .filter(Boolean);
          if (!local.length) {
            try {
              localStorage.setItem(publishArchiveMigrateKey(), "1");
            } catch {
              /* ignore */
            }
            return;
          }
          for (const entry of local.slice().reverse()) {
            try {
              await fetch(PUBLISH_OUTBOX_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entry }),
              });
            } catch {
              return;
            }
          }
          try {
            localStorage.setItem(publishArchiveMigrateKey(), "1");
          } catch {
            /* ignore */
          }
          await refreshPublishArchiveCache();
        }

        function normalizePublishTextForDedup(text) {
          return String(text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }

        function periodPublishDedupKey(type, text, meta = {}) {
          if (type !== "period") return "";
          return [
            type,
            String(meta.periodSlotId || "").trim(),
            String(meta.anchorYmd || "").trim().slice(0, 10),
            normalizePublishTextForDedup(text),
          ].join("\x1e");
        }

        async function appendPublishArchive(type, text, meta = {}) {
          const body = String(text || "").trim();
          if (!body) return { ok: false };
          await refreshPublishArchiveCache();
          const dedupKey = periodPublishDedupKey(type, body, meta);
          if (dedupKey) {
            const hit = (publishArchiveCache || []).find(
              (e) =>
                !e.pushedToNext &&
                periodPublishDedupKey(e.type, e.text, {
                  periodSlotId: e.periodSlotId,
                  anchorYmd: e.anchorYmd,
                }) === dedupKey,
            );
            if (hit) {
              renderPublishOutboxGuard();
              return { ok: true, deduped: true, entry: hit };
            }
          }
          const savedAt = new Date().toISOString();
          const anchorYmd = meta.anchorYmd || fmtYmdBeijing(new Date(savedAt));
          const draftEntry = {
            id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type,
            text: body,
            savedAt,
            savedBy: getAccountDisplayName(),
            station: meta.station || "",
            phenomena: meta.phenomena || [],
            periodSlotId: meta.periodSlotId || "",
            anchorYmd,
            pushedToNext: false,
            pushedAt: null,
            pushedBy: "",
          };
          draftEntry.publishDeadlineAt = computeClientPublishDeadlineAt(draftEntry);
          const entry = normalizePublishArchiveEntry(draftEntry);
          if (!entry) return { ok: false };
          try {
            const r = await fetch(PUBLISH_OUTBOX_API, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entry }),
            });
            if (r.ok) {
              const data = await r.json();
              const saved = normalizePublishArchiveEntry(data.entry || entry);
              if (saved) {
                const list = loadPublishArchiveEntries();
                publishArchiveCache = [saved, ...list.filter((x) => x.id !== saved.id)];
              }
              savePublishArchiveEntriesLocal(publishArchiveCache || [entry]);
              renderPublishOutboxGuard();
              return { ok: true, deduped: Boolean(data.deduped), entry: saved || entry };
            }
          } catch {
            /* fallback local */
          }
          const list = loadPublishArchiveEntriesLocal();
          list.unshift(entry);
          publishArchiveCache = savePublishArchiveEntriesLocal(list);
          renderPublishOutboxGuard();
          return { ok: true, deduped: false, entry };
        }

        async function markPublishArchivePushed(id) {
          if (!id) return false;
          return markPublishArchivePushedBulk([id]);
        }

        async function markPublishArchivePushedBulk(ids) {
          const list = [...new Set((ids || []).map(String).filter(Boolean))];
          if (!list.length) return true;
          try {
            const r = await fetch(PUBLISH_OUTBOX_API, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "mark-pushed",
                ids: list,
                pushedBy: getAccountDisplayName(),
              }),
            });
            if (!r.ok) return false;
            await refreshPublishArchiveCache();
            renderPublishOutboxGuard();
            return true;
          } catch {
            return false;
          }
        }

        function beijingDeadlineIsoFromYmd(ymd, hour) {
          const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          const y = Number(m[1]);
          const mo = Number(m[2]);
          const d = Number(m[3]);
          let day = d;
          let month = mo;
          let year = y;
          let h = hour;
          if (h >= 24) {
            const next = addCalendarDays(y, mo, d, 1);
            year = next.year;
            month = next.month;
            day = next.day;
            h = 0;
          }
          return new Date(Date.UTC(year, month - 1, day, h - 8, 0)).toISOString();
        }

        function computeClientPublishDeadlineAt(entry) {
          if (!entry || entry.pushedToNext) return entry?.publishDeadlineAt || null;
          if (entry.publishDeadlineAt) return entry.publishDeadlineAt;
          const savedAt = entry.savedAt || new Date().toISOString();
          const anchorYmd = entry.anchorYmd || fmtYmdBeijing(new Date(savedAt));
          if (entry.type === "period") {
            const map = { h4: 4, h12: 8, h8: 20 };
            const hour = map[entry.periodSlotId];
            if (hour == null) return null;
            return beijingDeadlineIsoFromYmd(anchorYmd, hour);
          }
          if (entry.type === "brush") {
            return beijingDeadlineIsoFromYmd(anchorYmd, 24);
          }
          if (entry.type === "alert") {
            return new Date(new Date(savedAt).getTime() + 15 * 60000).toISOString();
          }
          return null;
        }

        function classifyClientPublishUrgency(entry, nowMs = Date.now()) {
          if (!entry || entry.pushedToNext) return "done";
          const deadlineIso = computeClientPublishDeadlineAt(entry);
          if (!deadlineIso) return entry.urgency || "pending";
          const deadlineMs = new Date(deadlineIso).getTime();
          if (Number.isNaN(deadlineMs)) return entry.urgency || "pending";
          if (nowMs > deadlineMs) return "overdue";
          const warnLeadMs =
            entry.type === "alert" ? 5 * 60000 : entry.type === "brush" ? 120 * 60000 : 90 * 60000;
          if (deadlineMs - nowMs <= warnLeadMs) return "due_soon";
          return "pending";
        }

        function formatPublishDeadlineHint(iso) {
          if (!iso) return "";
          return String(iso).replace("T", " ").slice(0, 16) + "（北京时换算）";
        }

        function periodSlotGuardLabel(slotId) {
          if (slotId === "h4") return "未来4小时时段预报（须 04:00 前发群）";
          if (slotId === "h12") return "未来12小时时段预报（须 08:00 前发群）";
          if (slotId === "h8") return "未来8小时时段预报（须 20:00 前发群）";
          return "时段预报";
        }

        function analyzePublishOutboxGuard(entries, dismiss = loadPublishGuardDismissals()) {
          const nowMs = Date.now();
          const today = fmtYmdBeijing();
          const all = Array.isArray(entries) ? entries : [];
          const pending = all.filter((e) => !e.pushedToNext);
          const overdueItems = pending
            .filter((e) => classifyClientPublishUrgency(e, nowMs) === "overdue")
            .filter((e) => !dismiss.entryIds.has(e.id));
          const dueSoonItems = pending
            .filter((e) => classifyClientPublishUrgency(e, nowMs) === "due_soon")
            .filter((e) => !dismiss.entryIds.has(e.id));
          const missing = [];

          for (const slot of [
            { slotId: "h4", hour: 4 },
            { slotId: "h12", hour: 8 },
            { slotId: "h8", hour: 20 },
          ]) {
            const dl = beijingDeadlineIsoFromYmd(today, slot.hour);
            if (!dl || nowMs <= new Date(dl).getTime()) continue;
            const pushed = all.some(
              (e) =>
                e.type === "period" &&
                e.periodSlotId === slot.slotId &&
                (e.anchorYmd === today || (!e.anchorYmd && publishArchiveYmd(e.savedAt) === today)) &&
                e.pushedToNext,
            );
            if (pushed) continue;
            const inPool = pending.some(
              (e) =>
                e.type === "period" &&
                e.periodSlotId === slot.slotId &&
                (e.anchorYmd === today || (!e.anchorYmd && publishArchiveYmd(e.savedAt) === today)),
            );
            missing.push({
              kind: inPool ? "stuck_in_pool" : "never_pooled",
              slotId: slot.slotId,
              label: periodSlotGuardLabel(slot.slotId),
            });
          }

          const brushDeadline = beijingDeadlineIsoFromYmd(today, 24);
          if (brushDeadline && nowMs > new Date(brushDeadline).getTime()) {
            const brushPushed = all.some(
              (e) =>
                e.type === "brush" &&
                (e.anchorYmd === today || publishArchiveYmd(e.savedAt) === today) &&
                e.pushedToNext,
            );
            if (!brushPushed) {
              const inPool = pending.some(
                (e) =>
                  e.type === "brush" &&
                  (e.anchorYmd === today || publishArchiveYmd(e.savedAt) === today),
              );
              missing.push({
                kind: inPool ? "stuck_in_pool" : "never_pooled",
                label: "天气梳理（须 24:00 前发群）",
              });
            }
          }

          const missingFiltered = missing.filter(
            (m) => !dismiss.missingKeys.has(missingGuardDismissKey(today, m)),
          );

          return { overdueItems, dueSoonItems, missing: missingFiltered, pendingCount: pending.length };
        }

        async function acknowledgePublishOutboxGuard() {
          const entries = loadPublishArchiveEntries();
          const report = analyzePublishOutboxGuard(entries);
          const dismiss = loadPublishGuardDismissals();
          const today = fmtYmdBeijing();
          const overduePendingIds = report.overdueItems.filter((e) => !e.pushedToNext).map((e) => e.id);

          if (overduePendingIds.length) {
            const ok = await markPublishArchivePushedBulk(overduePendingIds);
            if (!ok) {
              showToast("处理失败", "超时条目未能标记已推送，请确认 start.bat 已启动。");
              return;
            }
          }

          for (const e of [...report.overdueItems, ...report.dueSoonItems]) {
            dismiss.entryIds.add(e.id);
          }
          for (const m of report.missing) {
            dismiss.missingKeys.add(missingGuardDismissKey(today, m));
          }
          savePublishGuardDismissals(dismiss);

          publishOutboxGuardExpanded = false;
          await refreshPublishOutboxGuard();
          const marked = overduePendingIds.length;
          showToast(
            "已处理",
            marked
              ? `兜底提醒已关闭；${marked} 条超时待发已标记为已推送 Next。`
              : "兜底提醒已关闭；今日漏发提示已确认处理。",
          );
        }

        function renderPublishOutboxGuard() {
          const entries = loadPublishArchiveEntries();
          const report = analyzePublishOutboxGuard(entries);
          const dangerCount = report.overdueItems.length + report.missing.length;

          if (publishOutboxBadge) {
            if (report.pendingCount > 0) {
              publishOutboxBadge.hidden = false;
              publishOutboxBadge.textContent = String(report.pendingCount);
              publishOutboxBadge.classList.toggle("is-danger", dangerCount > 0);
            } else {
              publishOutboxBadge.hidden = true;
              publishOutboxBadge.textContent = "";
              publishOutboxBadge.classList.remove("is-danger");
            }
          }

          if (!publishOutboxGuard || !publishOutboxGuardList) return;

          const lines = [];
          for (const m of report.missing) {
            if (m.kind === "never_pooled") {
              lines.push(`<li class="is-overdue"><strong>漏发风险</strong>：${escapeHtml(m.label)} — 已过截止时间，待发池无已推送记录</li>`);
            } else {
              lines.push(`<li class="is-overdue"><strong>卡在池里</strong>：${escapeHtml(m.label)} — 已入池但未推送 Next，请手动复制发群或排查机器人</li>`);
            }
          }
          for (const e of report.overdueItems) {
            const label = publishArchiveTypeLabel(e);
            const dl = formatPublishDeadlineHint(computeClientPublishDeadlineAt(e));
            lines.push(`<li class="is-overdue"><strong>超时未推送</strong>：${escapeHtml(label)} · 应发截止 ${escapeHtml(dl)} · 入池 ${escapeHtml(formatPublishArchiveTime(e.savedAt))}</li>`);
          }
          for (const e of report.dueSoonItems) {
            const label = publishArchiveTypeLabel(e);
            const dl = formatPublishDeadlineHint(computeClientPublishDeadlineAt(e));
            lines.push(`<li><strong>临近截止</strong>：${escapeHtml(label)} · 应发截止 ${escapeHtml(dl)} · 若机器人未发请准备手动发群</li>`);
          }

          if (!lines.length) {
            publishOutboxGuardExpanded = false;
            if (publishOutboxGuardAck) publishOutboxGuardAck.hidden = true;
            if (publishOutboxGuard) {
              publishOutboxGuard.hidden = true;
              publishOutboxGuard.classList.remove("is-open", "is-warn");
              publishOutboxGuard.setAttribute("aria-hidden", "true");
            }
            if (publishOutboxGuardToggle) {
              publishOutboxGuardToggle.hidden = true;
              publishOutboxGuardToggle.setAttribute("aria-expanded", "false");
              publishOutboxGuardToggle.classList.remove("is-warn", "is-danger");
            }
            publishOutboxGuardList.innerHTML = "";
            return;
          }

          if (publishOutboxGuardToggle) {
            publishOutboxGuardToggle.hidden = false;
            publishOutboxGuardToggle.textContent =
              dangerCount > 0 ? `兜底 ${lines.length}（须处理）` : `兜底 ${lines.length}`;
            publishOutboxGuardToggle.classList.toggle("is-danger", dangerCount > 0);
            publishOutboxGuardToggle.classList.toggle("is-warn", dangerCount === 0);
            publishOutboxGuardToggle.setAttribute("aria-expanded", publishOutboxGuardExpanded ? "true" : "false");
          }
          if (publishOutboxGuard) {
            publishOutboxGuard.hidden = !publishOutboxGuardExpanded;
            publishOutboxGuard.classList.toggle("is-open", publishOutboxGuardExpanded);
            publishOutboxGuard.classList.toggle("is-warn", dangerCount === 0);
            publishOutboxGuard.setAttribute("aria-hidden", publishOutboxGuardExpanded ? "false" : "true");
          }
          if (publishOutboxGuardTitle) {
            publishOutboxGuardTitle.textContent =
              dangerCount > 0 ? `发布兜底提醒（${dangerCount} 项须处理）` : "发布兜底提醒（临近截止）";
          }
          if (publishOutboxGuardAck) publishOutboxGuardAck.hidden = false;
          publishOutboxGuardList.innerHTML = lines.join("");
        }

        async function refreshPublishOutboxGuard() {
          await refreshPublishArchiveCache();
          renderPublishOutboxGuard();
        }

        function startPublishOutboxGuardPolling() {
          if (publishOutboxGuardTimer) clearInterval(publishOutboxGuardTimer);
          void refreshPublishOutboxGuard();
          publishOutboxGuardTimer = setInterval(() => {
            void refreshPublishOutboxGuard();
          }, 120000);
        }

        const PUBLISH_OUTBOX_POOL_HINT =
          "已写入待发池，尚未发到 Next 群；机器人会抓取，发群后请在「存档」标记已推送。";
        const PUBLISH_OUTBOX_POOL_FAIL_HINT = "待发池写入失败（请确认 start.bat 已启动）。";
        const PUBLISH_COPY_ONLY_HINT = "已复制到剪贴板；未入待发池。机器人抓取须点「发布」。";

        function publishArchivePushBadgeHtml(entry) {
          if (entry?.pushedToNext) {
            return '<span class="publish-archive-item-push is-done">已推送 Next</span>';
          }
          return '<span class="publish-archive-item-push is-pending">待推送 Next</span>';
        }

        function formatPublishArchiveTime(iso) {
          if (!iso) return "—";
          return String(iso).replace("T", " ").slice(0, 19);
        }

        function publishArchiveYmd(iso) {
          if (!iso) return "";
          const parts = getBeijingDateParts(new Date(iso));
          return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        }

        function fmtYmdBeijing(date = new Date()) {
          const parts = getBeijingDateParts(date);
          return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        }

        function countPublishArchivePending(list) {
          return list.filter((e) => !e.pushedToNext).length;
        }

        async function openPublishArchiveModal() {
          if (!publishArchiveBackdrop) return;
          await migratePublishArchiveToServer();
          await refreshPublishArchiveCache({ force: true });
          const all = prunePublishArchiveEntries(loadPublishArchiveEntries());
          const pendingAll = countPublishArchivePending(all);
          const beijingToday = fmtYmdBeijing();
          if (publishArchiveFilterPush && pendingAll > 0) {
            publishArchiveFilterPush.value = "pending";
          } else if (publishArchiveFilterPush && pendingAll === 0) {
            publishArchiveFilterPush.value = "all";
          }
          if (publishArchiveFilterDate) {
            if (pendingAll > 0) {
              publishArchiveFilterDate.value = "";
            } else {
              publishArchiveFilterDate.value = beijingToday;
              const todayCount = all.filter((e) => publishArchiveYmd(e.savedAt) === beijingToday).length;
              if (todayCount === 0 && all.length > 0) {
                publishArchiveFilterDate.value = "";
              }
            }
          }
          publishArchiveSelectedId = null;
          publishArchiveBackdrop.classList.add("is-open");
          publishArchiveBackdrop.setAttribute("aria-hidden", "false");
          renderPublishArchive();
        }

        function closePublishArchiveModal() {
          publishArchiveBackdrop?.classList.remove("is-open");
          publishArchiveBackdrop?.setAttribute("aria-hidden", "true");
        }

        function renderPublishArchiveDetail(entry) {
          if (!publishArchiveDetail || !entry) {
            publishArchiveDetail?.setAttribute("hidden", "");
            return;
          }
          publishArchiveDetail.removeAttribute("hidden");
          if (publishArchiveDetailTitle) {
            publishArchiveDetailTitle.textContent = publishArchiveTypeLabel(entry);
          }
          if (publishArchiveDetailTime) {
            const who = entry.savedBy ? ` · ${entry.savedBy}` : "";
            publishArchiveDetailTime.textContent = `${formatPublishArchiveTime(entry.savedAt)}${who}`;
          }
          if (publishArchiveDetailPushStatus) {
            publishArchiveDetailPushStatus.removeAttribute("hidden");
            if (entry.pushedToNext) {
              publishArchiveDetailPushStatus.className = "publish-archive-item-push is-done";
              const when = entry.pushedAt ? ` · ${formatPublishArchiveTime(entry.pushedAt)}` : "";
              const who = entry.pushedBy ? ` · ${entry.pushedBy}` : "";
              publishArchiveDetailPushStatus.textContent = `已推送 Next${when}${who}`;
            } else {
              publishArchiveDetailPushStatus.className = "publish-archive-item-push is-pending";
              publishArchiveDetailPushStatus.textContent = "待推送 Next";
            }
          }
          if (publishArchiveMarkPushedBtn) {
            if (entry.pushedToNext) publishArchiveMarkPushedBtn.setAttribute("hidden", "");
            else publishArchiveMarkPushedBtn.removeAttribute("hidden");
          }
          if (publishArchiveCopyBtn) {
            publishArchiveCopyBtn.removeAttribute("hidden");
          }
          if (publishArchiveDetailOverdue) {
            const urgency = classifyClientPublishUrgency(entry);
            if (!entry.pushedToNext && urgency === "overdue") {
              publishArchiveDetailOverdue.hidden = false;
              publishArchiveDetailOverdue.textContent =
                "已超过应发时间且仍未推送 Next。请立即复制正文手动发群，发完后点「标记已推送 Next」，并排查机器人是否离线。";
            } else if (!entry.pushedToNext && urgency === "due_soon") {
              publishArchiveDetailOverdue.hidden = false;
              publishArchiveDetailOverdue.textContent =
                "临近发布截止。若机器人尚未发群，请准备手动复制发群。";
            } else {
              publishArchiveDetailOverdue.hidden = true;
              publishArchiveDetailOverdue.textContent = "";
            }
          }
          if (publishArchiveDetailBody) publishArchiveDetailBody.textContent = entry.text || "";
        }

        function renderPublishArchive() {
          if (!publishArchiveList) return;
          const dateVal = (publishArchiveFilterDate?.value || "").trim().slice(0, 10);
          const typeVal = publishArchiveFilterType?.value || "all";
          const pushVal = publishArchiveFilterPush?.value || "all";
          let rows = loadPublishArchiveEntries();
          rows = prunePublishArchiveEntries(rows);
          if (dateVal) rows = rows.filter((e) => publishArchiveYmd(e.savedAt) === dateVal);
          if (typeVal === "tc") rows = rows.filter((e) => publishArchiveEntryIsTc(e));
          else if (typeVal !== "all") rows = rows.filter((e) => e.type === typeVal);
          if (pushVal === "pending") rows = rows.filter((e) => !e.pushedToNext);
          else if (pushVal === "pushed") rows = rows.filter((e) => e.pushedToNext);
          rows = rows.slice().sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

          if (publishArchiveFilterHint) {
            const d0 = new Date();
            d0.setDate(d0.getDate() - PUBLISH_ARCHIVE_RETENTION_DAYS);
            const pendingAll = countPublishArchivePending(
              prunePublishArchiveEntries(loadPublishArchiveEntries()),
            );
            const pushedAll = prunePublishArchiveEntries(loadPublishArchiveEntries()).filter((e) => e.pushedToNext)
              .length;
            const dateNote = dateVal ? `日期 ${dateVal}` : "全部日期";
            const pushNote =
              pushVal === "pending" ? " · 仅待推送" : pushVal === "pushed" ? " · 仅已推送" : "";
            publishArchiveFilterHint.textContent =
              `${dateNote} · 当前 ${rows.length} 条${pushNote} · 全库待推送 ${pendingAll} · 已推送 ${pushedAll} · 须点「发布」才会入待发池 · 保留约 ${PUBLISH_ARCHIVE_RETENTION_DAYS} 天${
                pendingAll > 0 && rows.length === 0
                  ? " · 有待推送条目不在当前筛选日期内，已建议切到「待推送 Next」+ 全部日期"
                  : ""
              }`;
          }

          if (!rows.length) {
            publishArchiveList.innerHTML = '<div class="hint" style="padding:14px">该日期/类型下暂无存档。</div>';
            publishArchiveDetail?.setAttribute("hidden", "");
            return;
          }

          if (!publishArchiveSelectedId || !rows.some((e) => e.id === publishArchiveSelectedId)) {
            publishArchiveSelectedId = rows[0].id;
          }

          publishArchiveList.innerHTML = rows
            .map((e) => {
              const active = e.id === publishArchiveSelectedId ? " is-active" : "";
              const preview = escapeHtml((e.text || "").replace(/\s+/g, " ").slice(0, 48));
              return `<button type="button" class="publish-archive-item${active}" data-pa-id="${escapeHtml(e.id)}">
                <div class="publish-archive-item-type">${escapeHtml(publishArchiveTypeLabel(e))}</div>
                <div class="publish-archive-item-time">${escapeHtml(formatPublishArchiveTime(e.savedAt))}</div>
                <div class="publish-archive-item-preview">${preview || "（空）"}</div>
                ${publishArchivePushBadgeHtml(e)}
              </button>`;
            })
            .join("");

          const selected = rows.find((e) => e.id === publishArchiveSelectedId) || rows[0];
          renderPublishArchiveDetail(selected);
        }

        function initPublishArchive() {
          publishArchiveBtn?.addEventListener("click", () => {
            void openPublishArchiveModal();
          });
          publishArchiveRefreshBtn?.addEventListener("click", () => {
            void (async () => {
              publishArchiveRefreshBtn.disabled = true;
              try {
                await refreshPublishArchiveCache({ force: true });
                const all = prunePublishArchiveEntries(loadPublishArchiveEntries());
                const selected = all.find((e) => e.id === publishArchiveSelectedId);
                // 筛选停在「待推送」时，机器人已推送的条目会被滤掉，看起来像刷新无效
                if (
                  publishArchiveFilterPush?.value === "pending" &&
                  selected?.pushedToNext
                ) {
                  publishArchiveFilterPush.value = "all";
                }
                renderPublishArchive();
                renderPublishOutboxGuard();
                showToast("已刷新", "发布存档已从服务器同步（含待推送/已推送 Next）。");
              } finally {
                publishArchiveRefreshBtn.disabled = false;
              }
            })();
          });
          publishOutboxGuardToggle?.addEventListener("click", () => {
            publishOutboxGuardExpanded = !publishOutboxGuardExpanded;
            renderPublishOutboxGuard();
          });
          publishOutboxGuardClose?.addEventListener("click", () => {
            publishOutboxGuardExpanded = false;
            renderPublishOutboxGuard();
          });
          publishOutboxGuardAck?.addEventListener("click", () => {
            void acknowledgePublishOutboxGuard();
          });
          publishArchiveModalClose?.addEventListener("click", () => closePublishArchiveModal());
          publishArchiveBackdrop?.addEventListener("click", (e) => {
            if (e.target === publishArchiveBackdrop) closePublishArchiveModal();
          });
          publishArchiveFilterDate?.addEventListener("change", () => {
            publishArchiveSelectedId = null;
            renderPublishArchive();
          });
          publishArchiveFilterType?.addEventListener("change", () => {
            publishArchiveSelectedId = null;
            renderPublishArchive();
          });
          publishArchiveFilterPush?.addEventListener("change", () => {
            publishArchiveSelectedId = null;
            renderPublishArchive();
          });
          publishArchiveMarkPushedBtn?.addEventListener("click", () => {
            const id = publishArchiveSelectedId;
            if (!id) return;
            void markPublishArchivePushed(id).then((ok) => {
              if (!ok) {
                showToast("标记失败", "无法写入服务器，请确认 start.bat 已启动。");
                return;
              }
              renderPublishArchive();
              renderPublishOutboxGuard();
              showToast("已标记", "该条已标记为已推送 Next。");
            });
          });
          publishArchiveCopyBtn?.addEventListener("click", async () => {
            const entry = loadPublishArchiveEntries().find((x) => x.id === publishArchiveSelectedId);
            const text = entry?.text || "";
            if (!text.trim()) {
              showToast("内容为空", "无可复制正文。");
              return;
            }
            try {
              await navigator.clipboard.writeText(text);
              showToast("已复制", "正文已复制，请粘贴到丰声 Next 群；发完后点「标记已推送 Next」。");
            } catch {
              showToast("复制失败", "请手动选择正文复制。");
            }
          });
          publishArchiveList?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-pa-id]");
            if (!btn) return;
            publishArchiveSelectedId = btn.getAttribute("data-pa-id");
            const entry = loadPublishArchiveEntries().find((x) => x.id === publishArchiveSelectedId);
            renderPublishArchive();
            if (entry) renderPublishArchiveDetail(entry);
          });
          void migratePublishArchiveToServer();
          startPublishOutboxGuardPolling();
        }

        function alertHitInnerHtml(display, severity) {
          const text = String(display ?? "");
          const sev = String(severity || "none").toLowerCase();
          if (!text || text === "—" || sev === "none") {
            return escapeHtml(text || "—");
          }
          return `<span class="metar-refined-hit metar-refined-hit--${sev}">${escapeHtml(text)}</span>`;
        }

        /** @typedef {{ label: string, severity: string, companyLevel?: string }} ObjForecastCell */

        function normalizeObjForecastCell(cell) {
          const label =
            cell && typeof cell === "object" && "label" in cell
              ? String(cell.label ?? "—")
              : String(cell ?? "—");
          const ev = objPhenomenonLabelSeverity(label);
          return { label, severity: ev.severity, companyLevel: ev.companyLevel };
        }

        const OBJ_PHENOMENON_LEVEL_FALLBACK = {
          小雨: "G",
          中雨: "Y",
          大雨: "R",
          小阵雨: "G",
          中阵雨: "Y",
          大阵雨: "R",
          小雪: "G",
          中雪: "Y",
          大雪: "R",
          小阵雪: "G",
          中阵雪: "Y",
          大阵雪: "R",
          弱雷雨: "Y",
          中雷雨: "Y",
          强雷雨: "R",
          轻雾: "G",
          大雾: "R",
          冻雾: "R",
          大阵风: "Y",
          炎热天气: "Y",
          低云: "Y",
        };

        function normalizeObjPhenLabel(text) {
          return String(text || "")
            .replace(/（[^）]*）/g, "")
            .replace(/\([^)]*\)/g, "")
            .trim();
        }

        function objPhenomenonLabelSeverity(label) {
          const s = String(label || "").trim();
          if (!s || s === "—") return { severity: "none", companyLevel: "" };
          const plain = normalizeObjPhenLabel(s);

          if (/^(晴|多云|阴)$/.test(plain)) {
            return { severity: "none", companyLevel: "" };
          }

          if (weatherStandards?.phenomena?.length) {
            const sorted = [...weatherStandards.phenomena].sort(
              (a, b) => normalizeObjPhenLabel(b.label).length - normalizeObjPhenLabel(a.label).length,
            );
            for (const p of sorted) {
              const pl = normalizeObjPhenLabel(p.label);
              if (!pl) continue;
              if (plain === pl || s === String(p.label || "").trim()) {
                const lv = String(p.level || "G").toUpperCase();
                return { severity: levelToSeverity(lv), companyLevel: lv };
              }
            }
          }

          const fb = OBJ_PHENOMENON_LEVEL_FALLBACK[plain];
          if (fb) {
            return { severity: levelToSeverity(fb), companyLevel: fb };
          }

          return { severity: "none", companyLevel: "" };
        }

        /** 客观预报单元格：仅按显示的现象类型着色（与 METAR 精细化「逐要素」逻辑不同） */
        function evaluateObjectiveCell(_h, phenomenonLabel) {
          const label = String(phenomenonLabel || "—");
          const ev = objPhenomenonLabelSeverity(label);
          return { label, severity: ev.severity, companyLevel: ev.companyLevel };
        }

        function objForecastSeverityFill(severity) {
          const sev = String(severity || "none").toLowerCase();
          if (sev === "critical") return "rgba(255, 71, 87, 0.22)";
          if (sev === "warning") return "rgba(230, 201, 76, 0.18)";
          if (sev === "caution") return "rgba(61, 214, 140, 0.14)";
          return "rgba(255, 255, 255, 0.03)";
        }

        function objForecastSeverityText(severity) {
          const sev = String(severity || "none").toLowerCase();
          if (sev === "critical") return "#ffb3ba";
          if (sev === "warning") return "#fff0a8";
          if (sev === "caution") return "#aaf5d0";
          return "#e8eefc";
        }

        function objForecastSeverityBar(severity) {
          const sev = String(severity || "none").toLowerCase();
          if (sev === "critical") return "#ff4757";
          if (sev === "warning") return "#e6c94c";
          if (sev === "caution") return "#3dd68c";
          return "";
        }

        function syncObjForecastExportButtons() {
          const has = Boolean(objForecastTableData?.rows?.length);
          if (objForecastExportPanelBtn) objForecastExportPanelBtn.hidden = !has;
        }

        function exportObjForecastAsPng() {
          if (!objForecastTableData?.rows?.length) {
            showToast("无法导出", "请先生成客观预报。");
            return;
          }
          const { hourLabels, rows, anchorUtcMs } = objForecastTableData;
          const hoursLabel = objForecastHours === 48 ? "客观预报 · 未来48小时" : "客观预报 · 未来24小时";
          const pad = 28;
          const airportW = 112;
          const cellW = 56;
          const cellH = 32;
          const headH = 40;
          const titleBlock = 52;
          const nCols = hourLabels.length;
          const tableW = airportW + nCols * cellW;
          const tableH = headH + rows.length * cellH;
          const W = tableW + pad * 2;
          const H = tableH + titleBlock + pad * 2;

          const canvas = document.createElement("canvas");
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.ceil(W * dpr);
          canvas.height = Math.ceil(H * dpr);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            showToast("导出失败", "浏览器不支持 Canvas。");
            return;
          }
          ctx.scale(dpr, dpr);
          ctx.fillStyle = "#0b1024";
          ctx.fillRect(0, 0, W, H);

          ctx.fillStyle = "#eef3ff";
          ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
          ctx.fillText(hoursLabel, pad, pad + 18);
          ctx.fillStyle = "rgba(200, 215, 240, 0.65)";
          ctx.font = "12px system-ui, 'Segoe UI', sans-serif";
          const sub = `Open-Meteo · ${meteoModelLabel(objForecastTableData?.model || objForecastMeteoModel)} · UTC 起报 ${formatObjColTime(anchorUtcMs)} · 导出 ${fmtYmd(new Date())} ${new Date().toTimeString().slice(0, 8)}`;
          ctx.fillText(sub, pad, pad + 38);

          const ox = pad;
          const oy = pad + titleBlock;

          ctx.fillStyle = "#1a2848";
          ctx.fillRect(ox, oy, tableW, headH);
          ctx.strokeStyle = "rgba(157, 181, 255, 0.2)";
          ctx.lineWidth = 1;
          ctx.fillStyle = "#e8eeff";
          ctx.font = "600 12px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("机场", ox + 10, oy + headH / 2);
          ctx.textAlign = "center";
          hourLabels.forEach((lb, i) => {
            const x = ox + airportW + i * cellW + cellW / 2;
            ctx.fillText(lb, x, oy + headH / 2, cellW - 6);
          });

          rows.forEach((row, ri) => {
            const y = oy + headH + ri * cellH;
            const zebra = ri % 2 === 1;
            ctx.fillStyle = zebra ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.04)";
            ctx.fillRect(ox, y, airportW, cellH);
            ctx.fillStyle = "#f0f4ff";
            ctx.font = "600 13px system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(row.icao, ox + 10, y + cellH / 2 - 4);
            ctx.fillStyle = "rgba(200, 215, 240, 0.7)";
            ctx.font = "10px system-ui, sans-serif";
            const nm = String(row.name || "").slice(0, 10);
            if (nm) ctx.fillText(nm, ox + 10, y + cellH / 2 + 9);

            row.cells.forEach((cell, ci) => {
              const x = ox + airportW + ci * cellW;
              const norm = normalizeObjForecastCell(cell);
              const sev = norm.severity;
              ctx.fillStyle = zebra ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.04)";
              ctx.fillRect(x, y, cellW, cellH);
              if (sev !== "none") {
                ctx.fillStyle = objForecastSeverityFill(sev);
                ctx.fillRect(x + 2, y + 3, cellW - 4, cellH - 6);
                const bar = objForecastSeverityBar(sev);
                if (bar) {
                  ctx.fillStyle = bar;
                  ctx.fillRect(x + 2, y + 3, 3, cellH - 6);
                }
              }
              ctx.strokeStyle = "rgba(157, 181, 255, 0.12)";
              ctx.strokeRect(x, y, cellW, cellH);
              const disp = formatPhenomenonForTable(norm.label);
              ctx.fillStyle = objForecastSeverityText(sev);
              ctx.font = sev !== "none" ? "600 11px system-ui, sans-serif" : "11px system-ui, sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(disp || "—", x + cellW / 2, y + cellH / 2, cellW - 8);
            });
            ctx.strokeRect(ox, y, airportW, cellH);
          });

          ctx.strokeRect(ox, oy, tableW, tableH);

          canvas.toBlob((blob) => {
            if (!blob) {
              showToast("导出失败", "无法生成图片。");
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `客观预报_${objForecastHours}h_${fmtYmd(new Date())}.png`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("已导出", "客观预报表格已保存为 PNG。");
          }, "image/png");
        }


        let objForecastHours = 24;
        let objForecastMeteoModel = "ecmwf";
        /** @type {{ airports: Array<{icao:string,name:string,region:string}>, phenomena: string[] }} */
        let objForecastConfig = { airports: [], phenomena: [] };
        /** @type {{ anchorUtcMs: number, hourLabels: string[], model: string, rows: Array<{icao:string,name:string,cells:string[]}> } | null} */
        let objForecastTableData = null;

        function syncObjForecastModelButtons() {
          document.querySelectorAll("[data-obj-model]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-obj-model") === objForecastMeteoModel);
          });
        }

        function loadObjForecastModel() {
          try {
            const m = localStorage.getItem(OBJ_MODEL_STORAGE);
            if (m === "auto" || m === "gfs" || m === "ecmwf") objForecastMeteoModel = m;
          } catch {
            /* ignore */
          }
          syncObjForecastModelButtons();
        }

        function saveObjForecastModel() {
          try {
            localStorage.setItem(OBJ_MODEL_STORAGE, objForecastMeteoModel);
          } catch {
            /* ignore */
          }
        }

        function loadObjForecastConfig() {
          try {
            const a = JSON.parse(localStorage.getItem(OBJ_AIRPORTS_STORAGE) || "null");
            const p = JSON.parse(localStorage.getItem(OBJ_PHENOMENA_STORAGE) || "null");
            objForecastConfig = {
              airports: Array.isArray(a) && a.length ? a : OBJ_DEFAULT_AIRPORTS.slice(),
              phenomena: Array.isArray(p) && p.length ? p : OBJ_DEFAULT_PHENOMENA.slice(),
            };
          } catch {
            objForecastConfig = {
              airports: OBJ_DEFAULT_AIRPORTS.slice(),
              phenomena: OBJ_DEFAULT_PHENOMENA.slice(),
            };
          }
        }

        function saveObjForecastConfig() {
          localStorage.setItem(OBJ_AIRPORTS_STORAGE, JSON.stringify(objForecastConfig.airports));
          localStorage.setItem(OBJ_PHENOMENA_STORAGE, JSON.stringify(objForecastConfig.phenomena));
        }

        async function fetchOpenMeteoHourlyObjective(lat, lon, hours, model = "ecmwf") {
          const hourly = [
            "temperature_2m",
            "precipitation",
            "rain",
            "showers",
            "snowfall",
            "weather_code",
            "wind_gusts_10m",
            "cloud_cover",
            "cloud_cover_low",
            "visibility",
          ].join(",");
          const useEcmwfApi = model === "ecmwf";
          const url = new URL(
            useEcmwfApi ? "https://api.open-meteo.com/v1/ecmwf" : "https://api.open-meteo.com/v1/forecast",
          );
          url.searchParams.set("latitude", String(lat));
          url.searchParams.set("longitude", String(lon));
          url.searchParams.set("hourly", hourly);
          url.searchParams.set("wind_speed_unit", "ms");
          url.searchParams.set("forecast_hours", String(hours));
          url.searchParams.set("timezone", "UTC");
          if (model === "gfs") url.searchParams.set("models", "gfs_seamless");
          const res = await fetch(url.toString(), { cache: "no-store" });
          const data = await res.json();
          if (!res.ok) {
            const reason = data?.reason || data?.error || res.status;
            throw new Error(`Open-Meteo ${reason}`);
          }
          const H = data.hourly;
          if (!H?.time?.length) return null;
          const numOrNull = (v) => {
            if (v == null || v === "") return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const n = Math.min(hours, H.time.length);
          const rows = [];
          for (let i = 0; i < n; i++) {
            const codeRaw = H.weather_code[i];
            rows.push({
              timeMs: new Date(H.time[i]).getTime(),
              temp: numOrNull(H.temperature_2m[i]),
              precip: numOrNull(H.precipitation[i]) ?? 0,
              rain: numOrNull(H.rain[i]) ?? 0,
              showers: numOrNull(H.showers[i]) ?? 0,
              snow: numOrNull(H.snowfall[i]) ?? 0,
              weatherCode: codeRaw != null && Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : null,
              gust: numOrNull(H.wind_gusts_10m[i]) ?? 0,
              cloud: numOrNull(H.cloud_cover[i]) ?? 0,
              cloudLow: numOrNull(H.cloud_cover_low[i]) ?? 0,
              visibility: numOrNull(H.visibility[i]),
              meteoModel: model,
            });
          }
          return rows.length ? { rows, startMs: rows[0].timeMs, model } : null;
        }

        function objHourlyPrecipMax(h) {
          return Math.max(h.precip ?? 0, h.rain ?? 0, h.showers ?? 0);
        }

        function objHourlyHasPrecip(h, minMm = 0.15) {
          return Math.max(h.precip ?? 0, h.rain ?? 0, h.showers ?? 0) >= minMm;
        }

        function classifyObjectivePhenomenon(h) {
          const temp = h.temp;
          const gust = h.gust ?? 0;
          const vis = h.visibility;
          const codeRaw = h.weatherCode;
          const code = codeRaw != null && Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : null;
          const precip = h.precip ?? 0;
          const rain = h.rain ?? 0;
          const showers = h.showers ?? 0;
          const snow = h.snow ?? 0;
          const cloudLow = h.cloudLow ?? 0;
          const cloud = h.cloud ?? 0;
          const meteoModel = h.meteoModel || "gfs";
          const trustThunderCodes = meteoModel !== "ecmwf";

          if (gust >= 17) return "大阵风（阵风风速≥17米/秒）";
          if (Number.isFinite(temp) && temp >= 35) return "炎热天气（气温≥35摄氏度）";
          if (vis != null && vis < 1000 && Number.isFinite(temp) && temp < 0)
            return "冻雾（能见度＜1000米，气温＜0摄氏度）";
          if (vis != null && vis < 1000) return "大雾（能见度＜1000米）";

          if (meteoModel === "ecmwf") {
            const r = objHourlyPrecipMax(h);
            if (r >= 0.08) {
              if (r > 8) return "大雨";
              if (r > 2.5) return "中雨";
              return "小雨";
            }
          }

          if (trustThunderCodes && code != null && [95, 96, 99].includes(code) && objHourlyHasPrecip(h)) return "强雷雨";
          if (code === 82 || showers > 8) return "大阵雨";
          if ((code != null && [80, 81].includes(code)) || (showers > 2 && precip > 0.5)) return "小阵雨";
          if (showers > 3) return "中阵雨";
          if (showers > 0.2) return "小阵雨";

          if ((code != null && [71, 73, 75, 77].includes(code)) || snow > 0.5) {
            if (snow > 4 || code === 75) return "大雪";
            if (snow > 1.5 || code === 73) return "中雪";
            return "小雪";
          }
          if (code != null && [85, 86].includes(code)) return snow > 2 || code === 86 ? "大阵雪" : "小阵雪";

          if ((code != null && [61, 63, 65, 66, 67].includes(code)) || rain > 0.1) {
            const r = Math.max(rain, precip);
            if (r > 8 || code === 65) return "大雨";
            if (r > 2.5 || code === 63) return "中雨";
            if (r > 0.05 || code === 61) return "小雨";
          }

          if (code != null && [51, 53, 55, 56, 57].includes(code)) return "小雨";
          if (code === 0) return "晴";
          if (code != null && code >= 1 && code <= 3) return "多云";
          if (cloudLow >= 50 && cloud >= 50) return "低云（云低高≤60米，云量5-7个量）";
          if (code != null && [45, 48].includes(code)) return vis != null && vis < 1000 ? "大雾（能见度＜1000米）" : "轻雾";
          if (vis != null && vis < 8000) return "轻雾";
          if (code != null && code >= 51 && code <= 67) return "阴";
          if (meteoModel === "ecmwf") {
            if (cloud <= 15) return "晴";
            if (cloud <= 75) return "多云";
            return "阴";
          }
          if (cloud >= 85) return "阴";
          return precip > 0.1 ? "小雨" : "多云";
        }

        function formatObjColTime(ms) {
          const d = new Date(ms);
          const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
          const da = String(d.getUTCDate()).padStart(2, "0");
          const hh = String(d.getUTCHours()).padStart(2, "0");
          return `${mo}-${da} ${hh}时`;
        }

        /** 表格展示用：去掉现象名中括号及括号内说明 */
        function formatPhenomenonForTable(label) {
          return String(label || "")
            .replace(/（[^）]*）/g, "")
            .replace(/\([^)]*\)/g, "")
            .trim();
        }

        function updateObjForecastTableMeta() {
          if (!objForecastTableMeta) return;
          if (!objForecastTableData?.rows?.length) {
            objForecastTableMeta.hidden = true;
            objForecastTableMeta.textContent = "";
            return;
          }
          const model = objForecastTableData.model || objForecastMeteoModel;
          const bits = [
            `数据源：Open-Meteo · ${meteoModelLabel(model)}`,
            `UTC 起报 ${formatObjColTime(objForecastTableData.anchorUtcMs)}`,
          ];
          if (objForecastTableData.autoFallback) bits.push("AUTO 雷暴码异常，已自动改用 GFS");
          objForecastTableMeta.textContent = bits.join(" · ");
          objForecastTableMeta.hidden = false;
        }

        function openObjForecastTableModal() {
          if (!objForecastTableBackdrop) return;
          const title = objForecastHours === 48 ? "客观预报 · 未来48小时" : "客观预报 · 未来24小时";
          if (objForecastTableModalTitle) objForecastTableModalTitle.textContent = title;
          syncObjForecastModelButtons();
          updateObjForecastTableMeta();
          objForecastTableBackdrop.classList.add("is-open");
          objForecastTableBackdrop.setAttribute("aria-hidden", "false");
        }

        function closeObjForecastTableModal() {
          objForecastTableBackdrop?.classList.remove("is-open");
          objForecastTableBackdrop?.setAttribute("aria-hidden", "true");
        }

        function renderObjForecastTable() {
          if (!objForecastTable || !objForecastEmpty) return;
          if (!objForecastTableData?.rows?.length) {
            objForecastTable.hidden = true;
            objForecastEmpty.hidden = false;
            if (objForecastLegend) objForecastLegend.hidden = true;
            return;
          }
          objForecastEmpty.hidden = true;
          if (objForecastLegend) objForecastLegend.hidden = false;
          objForecastTable.hidden = false;
          const { hourLabels, rows } = objForecastTableData;
          const head =
            `<tr><th class="col-airport">机场</th>` +
            hourLabels.map((lb) => `<th>${escapeHtml(lb)}</th>`).join("") +
            `</tr>`;
          const body = rows
            .map((r) => {
              const cells = r.cells
                .map((c) => {
                  const norm = normalizeObjForecastCell(c);
                  const disp = formatPhenomenonForTable(norm.label);
                  return `<td class="cell-wx">${alertHitInnerHtml(disp, norm.severity)}</td>`;
                })
                .join("");
              return `<tr><th class="col-airport">${escapeHtml(r.icao)}<br /><span class="hint" style="font-weight:400">${escapeHtml(r.name)}</span></th>${cells}</tr>`;
            })
            .join("");
          objForecastTable.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
          updateObjForecastTableMeta();
        }

        async function fetchOpenMeteoHourlyObjectiveResolved(lat, lon, hours, model = "gfs") {
          const fc = await fetchOpenMeteoHourlyObjective(lat, lon, hours, model);
          if (!fc?.rows?.length || model !== "auto") return fc;
          const phantomTs = fc.rows.filter(
            (r) => r.weatherCode != null && [95, 96, 99].includes(r.weatherCode) && !objHourlyHasPrecip(r),
          ).length;
          if (phantomTs < Math.max(3, Math.ceil(fc.rows.length * 0.35))) return fc;
          try {
            const gfs = await fetchOpenMeteoHourlyObjective(lat, lon, hours, "gfs");
            if (!gfs?.rows?.length) return fc;
            return { ...gfs, autoFallback: true };
          } catch {
            return fc;
          }
        }

        async function generateObjectiveForecast() {
          const airports = objForecastConfig.airports.filter((a) => a.icao?.trim());
          if (!airports.length) {
            showToast("无法生成", "请先在设置中添加运行机场。");
            return;
          }
          await loadWeatherStandards();
          const hours = objForecastHours;
          if (objForecastGenerateBtn) {
            objForecastGenerateBtn.disabled = true;
            objForecastGenerateBtn.textContent = "生成中…";
          }
          document.querySelectorAll("[data-obj-model]").forEach((btn) => {
            btn.disabled = true;
          });
          const anchorUtcMs = utcHourStartMs();
          const tableRows = [];
          let hourLabels = Array.from({ length: hours }, (_, i) =>
            formatObjColTime(anchorUtcMs + i * 3600000)
          );
          let ok = 0;
          let fail = 0;
          let autoFallbackUsed = false;
          const batch = 4;
          for (let i = 0; i < airports.length; i += batch) {
            const chunk = airports.slice(i, i + batch);
            await Promise.all(
              chunk.map(async (ap) => {
                const icao = String(ap.icao).trim().toUpperCase();
                try {
                  const coord = await resolveAirportLatLon(icao);
                  if (!coord) throw new Error("no coord");
                  const fc = await fetchOpenMeteoHourlyObjectiveResolved(
                    coord.lat,
                    coord.lon,
                    hours,
                    objForecastMeteoModel,
                  );
                  if (!fc?.rows?.length) throw new Error("no data");
                  if (fc.autoFallback) autoFallbackUsed = true;
                  if (!hourLabels.length) {
                    hourLabels = fc.rows.map((r) => formatObjColTime(r.timeMs));
                  }
                  const cells = fc.rows.map((h) => evaluateObjectiveCell(h, classifyObjectivePhenomenon(h)));
                  tableRows.push({ icao, name: ap.name || icao, cells });
                  ok++;
                } catch {
                  tableRows.push({
                    icao,
                    name: ap.name || icao,
                    cells: Array.from({ length: hours }, () => ({ label: "—", severity: "none", companyLevel: "" })),
                  });
                  fail++;
                }
              })
            );
          }
          objForecastTableData = {
            anchorUtcMs,
            hourLabels,
            model: autoFallbackUsed ? "gfs" : objForecastMeteoModel,
            autoFallback: autoFallbackUsed,
            rows: tableRows,
          };
          renderObjForecastTable();
          syncObjForecastExportButtons();
          if (objForecastGenerateBtn) {
            objForecastGenerateBtn.disabled = false;
            objForecastGenerateBtn.textContent = "自动生成客观预报";
          }
          document.querySelectorAll("[data-obj-model]").forEach((btn) => {
            btn.disabled = false;
          });
          if (ok > 0) {
            openObjForecastTableModal();
            const modelNote = autoFallbackUsed
              ? "AUTO 异常已改 GFS"
              : meteoModelLabel(objForecastMeteoModel);
            showToast("客观预报已生成", `${ok} 个机场 · 未来 ${hours} 小时 · ${modelNote}`);
          } else {
            showToast("生成失败", fail ? `共 ${fail} 站未取到数据，请检查网络或机场设置。` : "未生成数据");
          }
        }

        function renderObjAirportSettingsRows() {
          if (!objAirportSettingsBody) return;
          objAirportSettingsBody.innerHTML = objForecastConfig.airports
            .map(
              (a, idx) => `
            <tr data-obj-ap-idx="${idx}">
              <td><input type="text" data-field="icao" value="${escapeHtml(a.icao || "")}" maxlength="4" style="text-transform:uppercase" /></td>
              <td><input type="text" data-field="name" value="${escapeHtml(a.name || "")}" /></td>
              <td>
                <select data-field="region">
                  <option value="国内"${a.region === "国内" ? " selected" : ""}>国内</option>
                  <option value="国际/地区"${a.region === "国际/地区" ? " selected" : ""}>国际/地区</option>
                </select>
              </td>
              <td><button type="button" class="btn secondary" data-obj-ap-del="${idx}">删</button></td>
            </tr>`
            )
            .join("");
        }

        function renderObjPhenomenonSettingsRows() {
          if (!objPhenomenonSettingsBody) return;
          objPhenomenonSettingsBody.innerHTML = objForecastConfig.phenomena
            .map(
              (p, idx) => `
            <tr data-obj-ph-idx="${idx}">
              <td><input type="text" data-field="label" value="${escapeHtml(p)}" /></td>
              <td><button type="button" class="btn secondary" data-obj-ph-del="${idx}">删</button></td>
            </tr>`
            )
            .join("");
        }

        function syncObjSettingsFromDom() {
          if (objAirportSettingsBody) {
            objForecastConfig.airports = Array.from(objAirportSettingsBody.querySelectorAll("tr[data-obj-ap-idx]")).map(
              (row) => ({
                icao: row.querySelector('[data-field="icao"]')?.value?.trim().toUpperCase() || "",
                name: row.querySelector('[data-field="name"]')?.value?.trim() || "",
                region: row.querySelector('[data-field="region"]')?.value || "国内",
              })
            ).filter((a) => a.icao);
          }
          if (objPhenomenonSettingsBody) {
            objForecastConfig.phenomena = Array.from(objPhenomenonSettingsBody.querySelectorAll("tr[data-obj-ph-idx]"))
              .map((row) => row.querySelector('[data-field="label"]')?.value?.trim() || "")
              .filter(Boolean);
          }
        }

        function openObjForecastSettings() {
          loadObjForecastConfig();
          renderObjAirportSettingsRows();
          renderObjPhenomenonSettingsRows();
          objForecastSettingsBackdrop?.classList.add("is-open");
          objForecastSettingsBackdrop?.setAttribute("aria-hidden", "false");
        }

        function closeObjForecastSettings() {
          objForecastSettingsBackdrop?.classList.remove("is-open");
          objForecastSettingsBackdrop?.setAttribute("aria-hidden", "true");
        }

        function openAirportAlertModal() {
          if (!airportAlertBackdrop) return;
          populateWarnFormOptions();
          const draft = readWarnDraft();
          if (warnIsRevision) warnIsRevision.checked = false;
          if (warnIsCancel) warnIsCancel.checked = false;
          syncWarnCancelUi();
          applyWarnDraft(draft);
          airportAlertBackdrop.classList.add("is-open");
          airportAlertBackdrop.setAttribute("aria-hidden", "false");
          warnStation?.focus();
        }

        function closeAirportAlertModal() {
          airportAlertBackdrop?.classList.remove("is-open");
          airportAlertBackdrop?.setAttribute("aria-hidden", "true");
        }

        function getForecast24hPublishUrl() {
          try {
            const stored = localStorage.getItem("wx_forecast_24h_publish_url_v1");
            return String(stored || FORECAST_24H_PUBLISH_URL || "").trim();
          } catch {
            return String(FORECAST_24H_PUBLISH_URL || "").trim();
          }
        }

        function openForecastPublishHub() {
          if (!forecastPublishHubBackdrop) return;
          forecastPublishHubBackdrop.classList.add("is-open");
          forecastPublishHubBackdrop.setAttribute("aria-hidden", "false");
        }

        function closeForecastPublishHub() {
          forecastPublishHubBackdrop?.classList.remove("is-open");
          forecastPublishHubBackdrop?.setAttribute("aria-hidden", "true");
        }

        function openForecast24hExternal() {
          const url = getForecast24hPublishUrl();
          if (!url) {
            showToast("入口未配置", "未来24小时预报外链尚未设置，请在代码中配置 FORECAST_24H_PUBLISH_URL。");
            return;
          }
          window.open(url, "_blank", "noopener,noreferrer");
          closeForecastPublishHub();
        }

        const PERIOD_FORECAST_DRAFT_KEY = "wx_period_forecast_draft_v3";
        const PERIOD_SLOT_ORDER = ["h4", "h12", "h8"];
        const periodForecastSlotTabs = $("#periodForecastSlotTabs");
        const periodForecastEditorPanel = $("#periodForecastEditorPanel");
        const periodForecastAnchorHint = $("#periodForecastAnchorHint");
        const periodForecastSaveDraftBtn = $("#periodForecastSaveDraftBtn");
        const periodForecastClearContentBtn = $("#periodForecastClearContentBtn");
        const periodForecastCopyDoneBtn = $("#periodForecastCopyDoneBtn");
        const periodForecastPublishBtn = $("#periodForecastPublishBtn");
        /** @type {{ anchorYmd: string, slots: Array<{id:string,title:string,validLabel:string,nextReportLabel:string}> } | null} */
        let periodForecastEditorMeta = null;
        let periodForecastActiveSlotId = "h4";
        /** @type {{ h4: {region:string,airport:string}, h12: {...}, h8: {...} }} */
        let periodForecastBodiesCache = null;

        function getBeijingDateParts(date = new Date()) {
          const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(date);
          const pick = (type) => parts.find((p) => p.type === type)?.value || "0";
          return {
            year: Number(pick("year")),
            month: Number(pick("month")),
            day: Number(pick("day")),
            hour: Number(pick("hour")) % 24,
            minute: Number(pick("minute")),
          };
        }

        function addCalendarDays(y, m, d, delta) {
          const dt = new Date(Date.UTC(y, m - 1, d + delta));
          return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
        }

        function getPeriodForecastAnchor(parts) {
          return { year: parts.year, month: parts.month, day: parts.day };
        }

        /** 按北京时与有效时段开始时刻（04/08/20 时）比对，定位当前应发布的时段预报 */
        function resolvePeriodForecastSlotByBeijingTime(parts) {
          const nowMin = parts.hour * 60 + parts.minute;
          const ordered = [
            { id: "h4", startMin: 4 * 60 },
            { id: "h12", startMin: 8 * 60 },
            { id: "h8", startMin: 20 * 60 },
          ];
          for (const slot of ordered) {
            if (nowMin < slot.startMin) return slot.id;
          }
          return "h4";
        }

        function periodNumberedLineContent(line) {
          return String(line).replace(/^\s*\d+\./, "");
        }

        function periodNumberedLineIsEmpty(line) {
          return !periodNumberedLineContent(line).trim();
        }

        function periodNumberedTextHasContent(text) {
          return String(text ?? "")
            .split(/\r?\n/)
            .some((line) => !periodNumberedLineIsEmpty(line));
        }

        function renumberPeriodNumberedText(text) {
          const lines = String(text ?? "").split(/\r?\n/);
          let num = 0;
          return lines
            .map((line) => {
              num += 1;
              if (!line.trim()) return `${num}.`;
              const content = periodNumberedLineContent(line);
              return `${num}.${content}`;
            })
            .join("\n");
        }

        function ensurePeriodNumberedFirstLine(ta) {
          if (!ta || ta.value.trim()) return;
          ta.value = "1.";
          ta.setSelectionRange(2, 2);
        }

        function handlePeriodNumberedEnterKeydown(e) {
          const ta = e.target;
          const field = ta?.getAttribute("data-field");
          if (field !== "airport" && field !== "region") return;
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          e.preventDefault();

          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const value = ta.value;
          const before = value.slice(0, start);
          const after = value.slice(end);
          const newLineIdx = before.split("\n").length;
          const newValue = renumberPeriodNumberedText(`${before}\n${after}`);
          const lines = newValue.split("\n");
          let newPos = 0;
          for (let i = 0; i < newLineIdx && i < lines.length; i++) {
            newPos += lines[i].length + 1;
          }
          if (newLineIdx < lines.length) {
            const prefix = lines[newLineIdx].match(/^(\d+\.)/);
            newPos += prefix ? prefix[1].length : 0;
          } else {
            newPos = newValue.length;
          }

          ta.value = newValue;
          ta.setSelectionRange(newPos, newPos);
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }

        function periodAnchorYmd(anchor) {
          const m = String(anchor.month).padStart(2, "0");
          const d = String(anchor.day).padStart(2, "0");
          return `${anchor.year}-${m}-${d}`;
        }

        function fmtCnDateTime(y, m, d, h, min = 0) {
          return `${y}年${m}月${d}日${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        }

        function fmtCnValidRange(y1, m1, d1, h1, y2, m2, d2, h2, min2 = 0) {
          return `${fmtCnDateTime(y1, m1, d1, h1)}-${fmtCnDateTime(y2, m2, d2, h2, min2)}`;
        }

        function buildPeriodForecastSlots(anchor) {
          const { year, month, day } = anchor;
          const next = addCalendarDays(year, month, day, 1);
          return [
            {
              id: "h4",
              title: "未来4小时天气预报",
              validLabel: fmtCnValidRange(year, month, day, 4, year, month, day, 8),
              nextReportLabel: fmtCnDateTime(year, month, day, 8),
            },
            {
              id: "h12",
              title: "未来12小时天气预报",
              validLabel: fmtCnValidRange(year, month, day, 8, year, month, day, 20),
              nextReportLabel: fmtCnDateTime(year, month, day, 20),
            },
            {
              id: "h8",
              title: "未来8小时天气预报",
              validLabel: fmtCnValidRange(year, month, day, 20, next.year, next.month, next.day, 4),
              nextReportLabel: fmtCnDateTime(next.year, next.month, next.day, 4),
            },
          ];
        }

        function loadPeriodForecastDraft() {
          try {
            const raw = localStorage.getItem(PERIOD_FORECAST_DRAFT_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
          } catch {
            return null;
          }
        }

        function savePeriodForecastDraft(payload) {
          localStorage.setItem(PERIOD_FORECAST_DRAFT_KEY, JSON.stringify(payload));
        }

        function emptyPeriodBodies() {
          return { h4: { region: "", airport: "" }, h12: { region: "", airport: "" }, h8: { region: "", airport: "" } };
        }

        function getPeriodSlotMeta(id) {
          return periodForecastEditorMeta?.slots?.find((s) => s.id === id) || null;
        }

        function syncActiveSlotFromDom() {
          if (!periodForecastEditorPanel || !periodForecastBodiesCache) return;
          const region = periodForecastEditorPanel.querySelector('[data-field="region"]')?.value ?? "";
          const airport = periodForecastEditorPanel.querySelector('[data-field="airport"]')?.value ?? "";
          periodForecastBodiesCache[periodForecastActiveSlotId] = { region, airport };
        }

        function getPeriodAirportMaxLineNumber(text) {
          let max = 0;
          for (const line of String(text).split(/\r?\n/)) {
            const m = line.match(/^\s*(\d+)\./);
            if (m) max = Math.max(max, Number(m[1]));
          }
          return max;
        }

        function periodAirportLineIsEmpty(line) {
          return periodNumberedLineIsEmpty(line);
        }

        function periodAirportTextHasMeaningfulContent(text) {
          return periodNumberedTextHasContent(text);
        }

        function ensurePeriodAirportFirstLine(ta) {
          ensurePeriodNumberedFirstLine(ta);
        }

        function handlePeriodAirportEnterKeydown(e) {
          handlePeriodNumberedEnterKeydown(e);
        }

        function composePeriodForecastSlot(slot, body) {
          const region = String(body?.region ?? "").trimEnd();
          const airport = String(body?.airport ?? "").trimEnd();
          return [
            slot.title,
            "",
            `有效时间：${slot.validLabel}（北京时）`,
            "",
            "区域天气：",
            region,
            "",
            "机场天气：",
            airport,
            "",
            `下次通报时间：${slot.nextReportLabel}（北京时）`,
          ].join("\n");
        }

        function periodForecastBodyHasContent(slotId) {
          const b = periodForecastBodiesCache?.[slotId];
          return Boolean(periodNumberedTextHasContent(b?.region) || periodNumberedTextHasContent(b?.airport));
        }

        function buildPeriodForecastTextForSlot(slotId) {
          const slot = getPeriodSlotMeta(slotId);
          if (!slot || !periodForecastBodiesCache) return "";
          return composePeriodForecastSlot(slot, periodForecastBodiesCache[slotId]);
        }

        function renderPeriodForecastEditorPanel() {
          if (!periodForecastEditorPanel || !periodForecastBodiesCache) return;
          const slot = getPeriodSlotMeta(periodForecastActiveSlotId);
          if (!slot) return;
          const b = periodForecastBodiesCache[periodForecastActiveSlotId] || { region: "", airport: "" };
          periodForecastEditorPanel.innerHTML = `
            <pre class="period-forecast-meta">${escapeHtml(slot.title)}</pre>
            <pre class="period-forecast-meta" style="margin-top: 8px">有效时间：${escapeHtml(slot.validLabel)}（北京时）</pre>
            <label class="period-forecast-label">区域天气：</label>
            <span class="period-forecast-field-hint">回车自动下一行并编号；Shift+回车 在同一条内换行</span>
            <textarea class="publish-textarea period-forecast-field" data-field="region" rows="3" placeholder="1.区域天气…">${escapeHtml(b.region)}</textarea>
            <label class="period-forecast-label">机场天气：</label>
            <span class="period-forecast-field-hint">每条一个机场，回车自动下一行并编号；Shift+回车 在同一条内换行</span>
            <textarea class="publish-textarea period-forecast-field" data-field="airport" rows="10" placeholder="1.ZBAA…">${escapeHtml(b.airport)}</textarea>
            <pre class="period-forecast-meta period-forecast-meta--foot">下次通报时间：${escapeHtml(slot.nextReportLabel)}（北京时）</pre>`;
          periodForecastEditorPanel.querySelectorAll("textarea[data-field]").forEach((ta) => {
            ta.addEventListener("keydown", handlePeriodNumberedEnterKeydown);
            if (!String(ta.value).trim()) ensurePeriodNumberedFirstLine(ta);
          });
        }

        function renderPeriodForecastSlotTabs() {
          if (!periodForecastSlotTabs || !periodForecastEditorMeta?.slots) return;
          const labels = { h4: "未来4小时预报", h12: "未来12小时预报", h8: "未来8小时预报" };
          periodForecastSlotTabs.innerHTML = PERIOD_SLOT_ORDER.map((id) => {
            const active = id === periodForecastActiveSlotId ? " is-active" : "";
            return `<button type="button" class="elem-mode-btn${active}" data-period-tab="${id}" role="tab" aria-selected="${id === periodForecastActiveSlotId}">${labels[id]}</button>`;
          }).join("");
        }

        function setPeriodForecastActiveSlot(slotId) {
          if (!PERIOD_SLOT_ORDER.includes(slotId)) return;
          syncActiveSlotFromDom();
          periodForecastActiveSlotId = slotId;
          renderPeriodForecastSlotTabs();
          renderPeriodForecastEditorPanel();
        }

        function renderPeriodForecastEditor() {
          const parts = getBeijingDateParts();
          const anchor = getPeriodForecastAnchor(parts);
          const anchorYmd = periodAnchorYmd(anchor);
          const slots = buildPeriodForecastSlots(anchor);
          periodForecastEditorMeta = { anchorYmd, slots };

          let bodies = emptyPeriodBodies();
          const draft = loadPeriodForecastDraft();
          if (draft?.anchorYmd === anchorYmd && draft.bodies) {
            bodies = { ...bodies, ...draft.bodies };
          }
          periodForecastBodiesCache = bodies;
          periodForecastActiveSlotId = resolvePeriodForecastSlotByBeijingTime(parts);

          if (periodForecastAnchorHint) {
            const slotLabels = { h4: "未来4小时（04:00 起）", h12: "未来12小时（08:00 起）", h8: "未来8小时（20:00 起）" };
            periodForecastAnchorHint.textContent =
              `预报日 ${anchor.year}年${anchor.month}月${anchor.day}日（北京时 ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}）· 已按有效时段开始时刻默认选中「${slotLabels[periodForecastActiveSlotId]}」· 可切换类型`;
          }

          renderPeriodForecastSlotTabs();
          renderPeriodForecastEditorPanel();
          const regionTa = periodForecastEditorPanel?.querySelector('[data-field="region"]');
          const airportTa = periodForecastEditorPanel?.querySelector('[data-field="airport"]');
          if (regionTa && !String(regionTa.value).trim()) ensurePeriodNumberedFirstLine(regionTa);
          if (airportTa && !String(airportTa.value).trim()) ensurePeriodNumberedFirstLine(airportTa);
        }

        function persistPeriodForecastDraft() {
          if (!periodForecastEditorMeta) return;
          syncActiveSlotFromDom();
          savePeriodForecastDraft({
            anchorYmd: periodForecastEditorMeta.anchorYmd,
            activeSlot: periodForecastActiveSlotId,
            bodies: { ...periodForecastBodiesCache },
          });
        }

        function openPeriodForecastModal() {
          if (!periodForecastBackdrop) return;
          renderPeriodForecastEditor();
          periodForecastBackdrop.classList.add("is-open");
          periodForecastBackdrop.setAttribute("aria-hidden", "false");
          periodForecastEditorPanel?.querySelector("textarea")?.focus();
        }

        function closePeriodForecastModal() {
          periodForecastBackdrop?.classList.remove("is-open");
          periodForecastBackdrop?.setAttribute("aria-hidden", "true");
        }

        function openPeriodForecastFromHub() {
          closeForecastPublishHub();
          openPeriodForecastModal();
        }

        function openObjForecastWorkspace() {
          if (!objForecastWorkspaceBackdrop) return;
          syncObjForecastExportButtons();
          objForecastWorkspaceBackdrop.classList.add("is-open");
          objForecastWorkspaceBackdrop.setAttribute("aria-hidden", "false");
        }

        function closeObjForecastWorkspace() {
          objForecastWorkspaceBackdrop?.classList.remove("is-open");
          objForecastWorkspaceBackdrop?.setAttribute("aria-hidden", "true");
        }

        function initPublishLauncher() {
          publishTileAlert?.addEventListener("click", () => openAirportAlertModal());
          publishTilePeriod?.addEventListener("click", () => openForecastPublishHub());
          publishTileBrush?.addEventListener("click", () => openWeatherBrushModal());
          publishTileObjective?.addEventListener("click", () => openObjForecastWorkspace());

          airportAlertModalClose?.addEventListener("click", () => closeAirportAlertModal());
          airportAlertBackdrop?.addEventListener("click", (e) => {
            if (e.target === airportAlertBackdrop) closeAirportAlertModal();
          });
          warnClearContentBtn?.addEventListener("click", () => {
            clearWarnFormContent();
            showToast("已清空", "机场警报表单内容已清空。");
          });
          warnSaveDraftBtn?.addEventListener("click", () => {
            writeWarnDraft();
            showToast("已保存草稿", "机场警报草稿已写入本机。");
          });
          warnStation?.addEventListener("input", () => {
            if (!warnStation) return;
            const normalized = normalizeWarnStationInput(warnStation.value);
            if (warnStation.value !== normalized) warnStation.value = normalized;
            syncWarnRevisionDefault();
            syncWarnCancelUi();
          });
          warnIsRevision?.addEventListener("change", () => {
            if (warnIsRevision?.checked && warnIsCancel) warnIsCancel.checked = false;
            syncWarnCancelUi();
          });
          warnIsCancel?.addEventListener("change", () => {
            if (warnIsCancel?.checked && warnIsRevision) warnIsRevision.checked = false;
            syncWarnCancelUi();
          });
          warnCopyDoneBtn?.addEventListener("click", async () => {
            const station = getWarnStationValue();
            const isCancel = Boolean(warnIsCancel?.checked);
            if (!station || station.length !== 4) {
              showToast("内容不完整", "请填写有效的机场四字码。");
              return;
            }
            if (isCancel) {
              const selectedItems = getSelectedCancelWarningItems(station);
              if (!selectedItems.length) {
                showToast("无法解除", `${station} 请至少勾选一条要解除的生效警报。`);
                return;
              }
              const phen = [];
              const seen = new Set();
              for (const w of selectedItems) {
                for (const p of warningPhenomenaList(w)) {
                  if (!seen.has(p)) {
                    seen.add(p);
                    phen.push(p);
                  }
                }
              }
              const full = formatWarningCancelPlain(station, phen);
              try {
                await navigator.clipboard.writeText(full);
                showToast("已复制", `解除通报已复制（${selectedItems.length} 条：${phen.join("、")}）。`);
                closeAirportAlertModal();
              } catch {
                showToast("复制失败", "请手动全选复制，或检查浏览器权限。");
              }
              return;
            }
            const phenomena = getSelectedWarnPhenomena();
            const text = warnText?.value?.trim() ?? "";
            const isRevision = Boolean(warnIsRevision?.checked);
            if (!phenomena.length || !text) {
              showToast("内容不完整", "请填写机场四字码、至少一种现象，并填写正文。");
              return;
            }
            const full = formatWarningAlertPlain(station, phenomena, text, isRevision);
            try {
              await navigator.clipboard.writeText(full);
              showToast("已复制", PUBLISH_COPY_ONLY_HINT);
              closeAirportAlertModal();
            } catch {
              showToast("复制失败", "请手动全选复制，或检查浏览器权限。");
            }
          });

          forecastPublishHubClose?.addEventListener("click", () => closeForecastPublishHub());
          forecastPublishHubBackdrop?.addEventListener("click", (e) => {
            if (e.target === forecastPublishHubBackdrop) closeForecastPublishHub();
          });
          forecastPublishPeriodOption?.addEventListener("click", () => openPeriodForecastFromHub());
          forecastPublish24hOption?.addEventListener("click", () => openForecast24hExternal());

          periodForecastSlotTabs?.addEventListener("click", (e) => {
            const tab = e.target.closest("[data-period-tab]");
            if (!tab) return;
            setPeriodForecastActiveSlot(tab.getAttribute("data-period-tab"));
            const regionTa = periodForecastEditorPanel?.querySelector('[data-field="region"]');
            const airportTa = periodForecastEditorPanel?.querySelector('[data-field="airport"]');
            if (regionTa && !String(regionTa.value).trim()) ensurePeriodNumberedFirstLine(regionTa);
            if (airportTa && !String(airportTa.value).trim()) ensurePeriodNumberedFirstLine(airportTa);
            (regionTa || airportTa)?.focus();
          });

          periodForecastEditorPanel?.addEventListener("focusin", (e) => {
            const field = e.target?.getAttribute?.("data-field");
            if (field === "airport" || field === "region") ensurePeriodNumberedFirstLine(e.target);
          });

          periodForecastClearContentBtn?.addEventListener("click", () => {
            clearPeriodForecastContent();
            showToast("已清空", "当前时段预报内容已清空（含三类时段缓存）。");
          });
          periodForecastSaveDraftBtn?.addEventListener("click", () => {
            persistPeriodForecastDraft();
            const labels = { h4: "未来4小时", h12: "未来12小时", h8: "未来8小时" };
            showToast("已保存草稿", `${labels[periodForecastActiveSlotId] || ""}预报草稿已写入本机（含另外两类已填内容）。`);
          });
          periodForecastCopyDoneBtn?.addEventListener("click", async () => {
            syncActiveSlotFromDom();
            if (!periodForecastBodyHasContent(periodForecastActiveSlotId)) {
              showToast("内容为空", "请填写区域或机场天气内容。");
              return;
            }
            const text = buildPeriodForecastTextForSlot(periodForecastActiveSlotId);
            persistPeriodForecastDraft();
            try {
              await navigator.clipboard.writeText(text);
              showToast("已复制", PUBLISH_COPY_ONLY_HINT);
            } catch {
              showToast("复制失败", "草稿已保存，请手动全选复制。");
            }
          });
          periodForecastPublishBtn?.addEventListener("click", async () => {
            syncActiveSlotFromDom();
            if (!periodForecastBodyHasContent(periodForecastActiveSlotId)) {
              showToast("内容为空", "请填写区域或机场天气内容。");
              return;
            }
            const text = buildPeriodForecastTextForSlot(periodForecastActiveSlotId);
            persistPeriodForecastDraft();
            const archiveResult = await appendPublishArchive("period", text, {
              periodSlotId: periodForecastActiveSlotId,
              anchorYmd: periodForecastEditorMeta?.anchorYmd || fmtYmdBeijing(),
            });
            const archived = Boolean(archiveResult?.ok);
            const deduped = Boolean(archiveResult?.deduped);
            showToast(
              deduped ? "已发布（未重复入池）" : archived ? "已发布" : "发布失败",
              deduped
                ? "相同内容的时段预报已在待发池，未重复添加。"
                : archived
                  ? PUBLISH_OUTBOX_POOL_HINT
                  : PUBLISH_OUTBOX_POOL_FAIL_HINT,
            );
          });

          periodForecastModalClose?.addEventListener("click", () => {
            syncActiveSlotFromDom();
            closePeriodForecastModal();
          });
          periodForecastBackdrop?.addEventListener("click", (e) => {
            if (e.target === periodForecastBackdrop) {
              syncActiveSlotFromDom();
              closePeriodForecastModal();
            }
          });

          objForecastWorkspaceClose?.addEventListener("click", () => closeObjForecastWorkspace());
          objForecastWorkspaceBackdrop?.addEventListener("click", (e) => {
            if (e.target === objForecastWorkspaceBackdrop) closeObjForecastWorkspace();
          });
        }

        function openWeatherBrushModal() {
          if (!weatherBrushBackdrop) return;
          try {
            const draft = localStorage.getItem(WEATHER_BRUSH_DRAFT_KEY);
            if (weatherBrushText && draft) weatherBrushText.value = draft;
          } catch {
            /* ignore */
          }
          weatherBrushBackdrop.classList.add("is-open");
          weatherBrushBackdrop.setAttribute("aria-hidden", "false");
          weatherBrushText?.focus();
        }

        function closeWeatherBrushModal() {
          weatherBrushBackdrop?.classList.remove("is-open");
          weatherBrushBackdrop?.setAttribute("aria-hidden", "true");
        }

        function initWeatherBrush() {
          weatherBrushModalClose?.addEventListener("click", () => closeWeatherBrushModal());
          weatherBrushBackdrop?.addEventListener("click", (e) => {
            if (e.target === weatherBrushBackdrop) closeWeatherBrushModal();
          });
          weatherBrushClearContentBtn?.addEventListener("click", () => {
            clearWeatherBrushContent();
            showToast("已清空", "天气梳理内容已清空。");
          });
          weatherBrushSaveDraftBtn?.addEventListener("click", () => {
            const text = weatherBrushText?.value ?? "";
            try {
              localStorage.setItem(WEATHER_BRUSH_DRAFT_KEY, text);
              showToast("已保存草稿", "天气梳理内容已写入本机。");
            } catch {
              showToast("保存失败", "无法写入本地存储。");
            }
          });
          weatherBrushCopyDoneBtn?.addEventListener("click", async () => {
            const text = weatherBrushText?.value ?? "";
            if (!text.trim()) {
              showToast("内容为空", "请先编写天气梳理内容。");
              return;
            }
            try {
              localStorage.setItem(WEATHER_BRUSH_DRAFT_KEY, text);
            } catch {
              /* ignore */
            }
            try {
              await navigator.clipboard.writeText(text);
              showToast("已复制", PUBLISH_COPY_ONLY_HINT);
            } catch {
              showToast("复制失败", "请手动全选复制，或检查浏览器权限。");
            }
          });
          weatherBrushPublishBtn?.addEventListener("click", async () => {
            const text = weatherBrushText?.value ?? "";
            if (!text.trim()) {
              showToast("内容为空", "请先编写天气梳理内容。");
              return;
            }
            try {
              localStorage.setItem(WEATHER_BRUSH_DRAFT_KEY, text);
            } catch {
              /* ignore */
            }
            const archiveResult = await appendPublishArchive("brush", text, {
              anchorYmd: fmtYmdBeijing(),
            });
            const archived = Boolean(archiveResult?.ok);
            showToast(
              archived ? "已发布" : "发布失败",
              archived ? PUBLISH_OUTBOX_POOL_HINT : PUBLISH_OUTBOX_POOL_FAIL_HINT,
            );
            if (archived) closeWeatherBrushModal();
          });
        }

        function initObjectiveForecast() {
          loadObjForecastConfig();
          loadObjForecastModel();
          initPublishLauncher();
          initWeatherBrush();
          initPublishArchive();
          objForecastExportPngBtn?.addEventListener("click", () => exportObjForecastAsPng());
          objForecastExportPanelBtn?.addEventListener("click", () => exportObjForecastAsPng());
          objForecastTableModalClose?.addEventListener("click", () => closeObjForecastTableModal());
          objForecastTableBackdrop?.addEventListener("click", (e) => {
            if (e.target === objForecastTableBackdrop) closeObjForecastTableModal();
          });
          document.querySelectorAll("[data-obj-hours]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const h = Number(btn.getAttribute("data-obj-hours"));
              if (h !== 24 && h !== 48) return;
              objForecastHours = h;
              document.querySelectorAll("[data-obj-hours]").forEach((b) => {
                b.classList.toggle("is-active", b === btn);
              });
              if (objForecastTableData) generateObjectiveForecast();
            });
          });
          document.querySelectorAll("[data-obj-model]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const model = btn.getAttribute("data-obj-model");
              if (model !== "auto" && model !== "gfs" && model !== "ecmwf") return;
              if (model === objForecastMeteoModel) return;
              objForecastMeteoModel = model;
              saveObjForecastModel();
              syncObjForecastModelButtons();
              if (objForecastTableData) generateObjectiveForecast();
            });
          });
          objForecastGenerateBtn?.addEventListener("click", () => generateObjectiveForecast());
          objForecastSettingsBtn?.addEventListener("click", () => openObjForecastSettings());
          objForecastSettingsClose?.addEventListener("click", () => closeObjForecastSettings());
          objForecastSettingsBackdrop?.addEventListener("click", (e) => {
            if (e.target === objForecastSettingsBackdrop) closeObjForecastSettings();
          });
          objForecastSettingsSave?.addEventListener("click", () => {
            syncObjSettingsFromDom();
            if (!objForecastConfig.airports.length) {
              showToast("未保存", "至少保留一个机场。");
              return;
            }
            saveObjForecastConfig();
            closeObjForecastSettings();
            showToast("设置已保存", "机场目录与天气现象类型已更新。");
          });
          objAirportAddBtn?.addEventListener("click", () => {
            syncObjSettingsFromDom();
            objForecastConfig.airports.push({ icao: "", name: "", region: "国内" });
            renderObjAirportSettingsRows();
          });
          objPhenomenonAddBtn?.addEventListener("click", () => {
            syncObjSettingsFromDom();
            objForecastConfig.phenomena.push("新天气类型");
            renderObjPhenomenonSettingsRows();
          });
          objAirportSettingsBody?.addEventListener("click", (e) => {
            const del = e.target.closest("[data-obj-ap-del]");
            if (!del) return;
            syncObjSettingsFromDom();
            const idx = Number(del.getAttribute("data-obj-ap-del"));
            objForecastConfig.airports.splice(idx, 1);
            renderObjAirportSettingsRows();
          });
          objPhenomenonSettingsBody?.addEventListener("click", (e) => {
            const del = e.target.closest("[data-obj-ph-del]");
            if (!del) return;
            syncObjSettingsFromDom();
            const idx = Number(del.getAttribute("data-obj-ph-del"));
            objForecastConfig.phenomena.splice(idx, 1);
            renderObjPhenomenonSettingsRows();
          });
        }
        function publishWarningNow() {
          const station = getWarnStationValue();
          const isCancel = Boolean(warnIsCancel?.checked);
          const phenomena = getSelectedWarnPhenomena();
          const text = warnText?.value?.trim();
          const isRevision = Boolean(warnIsRevision?.checked);
          if (!station) {
            showToast("未发布", "请填写机场四字码。");
            return;
          }
          if (station.length !== 4) {
            showToast("未发布", "四字码须为 4 位（如 ZGSZ）。");
            return;
          }
          if (isCancel) {
            const selectedItems = getSelectedCancelWarningItems(station);
            if (!selectedItems.length) {
              showToast("无法解除", `${station} 请至少勾选一条要解除的生效警报。`);
              return;
            }
            const activePhen = [];
            const seen = new Set();
            for (const w of selectedItems) {
              for (const p of warningPhenomenaList(w)) {
                if (!seen.has(p)) {
                  seen.add(p);
                  activePhen.push(p);
                }
              }
            }
            applyWarningCancelByIds(selectedItems.map((w) => w.id));
            warningPool = dedupeWarningPoolItems(warningPool);
            persistWarningPool().then((result) => {
              renderWarningPanel();
              appendPublishArchive("alert", formatWarningCancelPlain(station, activePhen), {
                station,
                phenomena: activePhen,
                isCancel: true,
                anchorYmd: fmtYmdBeijing(),
              });
              closeAirportAlertModal();
              try {
                localStorage.removeItem(WARN_DRAFT_KEY);
              } catch {
                /* ignore */
              }
              const modeText = result.mode === "server" ? "已同步至服务器" : "已保存到本浏览器";
              showToast(
                "解除警报已发布",
                `${station} · 已解除 ${selectedItems.length} 条 · ${activePhen.join("、")} · ${modeText}`,
              );
            });
            return;
          }
          if (alertPublishMode !== "allowAllValidIcao") {
            const allowed = getAlertPublishIcaoSet();
            if (allowed.size && !allowed.has(station)) {
              showToast(
                "未发布",
                `${station} 不在当前可发布机场清单内（共 ${allowed.size} 站）。可在客观预报设置中维护机场，或通过接口整表更新 data/icao-whitelist.json。`
              );
              return;
            }
          }
          if (!phenomena.length) {
            showToast("未发布", "请至少选择一种现象类型。");
            return;
          }
          if (!text) {
            showToast("未发布", "请填写机场警报正文。");
            return;
          }
          let revokedLabels = [];
          if (isRevision) revokedLabels = applyWarningRevision(station, phenomena);
          const key = phenomenaKey(phenomena);
          const existing = warningPool.find(
            (w) =>
              String(w.station || "").toUpperCase() === station &&
              phenomenaKey(warningPhenomenaList(w)) === key,
          );
          upsertWarningRecord({
            station,
            airportName: resolveAirportDisplayName(station),
            phenomena,
            text,
            isRevision,
            time: nowHHMM(),
            publishedAt: new Date().toISOString(),
            publishedBy: getAccountDisplayName(),
          });
          warningPool = dedupeWarningPoolItems(warningPool);
          persistWarningPool().then((result) => {
            renderWarningPanel();
            appendPublishArchive("alert", formatWarningAlertPlain(station, phenomena, text, isRevision), {
              station,
              phenomena,
              anchorYmd: fmtYmdBeijing(),
            });
            closeAirportAlertModal();
            try {
              localStorage.removeItem(WARN_DRAFT_KEY);
            } catch {
              /* ignore */
            }
            const modeText = result.mode === "server" ? "已同步至服务器" : "已保存到本浏览器";
            const action = isRevision ? "已修订" : existing ? "已更新" : "已发布";
            const label = phenomena.join("、");
            let detail = `${station} · ${label}`;
            if (revokedLabels.length) detail += ` · 已撤销重叠旧警报现象：${revokedLabels.join("、")}`;
            detail += ` · ${modeText}`;
            showToast(`机场警报${action}`, detail);
          });
        }

        const ACTIVE_WARNINGS_API = "/api/warnings/active";
        const ACTIVE_WARNINGS_STORAGE_KEY = "wx_active_warnings_v1";

        /** 机场警报现象类型（与告警屏着色规则一致） */
        const AIRPORT_ALERT_PHENOMENA = [
          "热带气旋",
          "雷暴",
          "强降水",
          "冰雹",
          "小雹（霰）",
          "雪",
          "雨夹雪",
          "冻降水",
          "沙暴",
          "尘暴",
          "火山灰",
          "米雪",
          "冰粒",
          "冰晶",
          "强地面风和阵风",
          "低能见度",
          "低云",
          "炎热天气",
          "极寒天气",
        ];

        /** 现象 → 告警屏色类（与左侧机场列表一致） */
        const PHENOMENON_COLOR_ID = {
          热带气旋: "red",
          雷暴: "red",
          冰雹: "red",
          "小雹（霰）": "red",
          冻降水: "red",
          冰粒: "red",
          火山灰: "red",
          强地面风和阵风: "brown",
          沙暴: "brown",
          尘暴: "brown",
          低云: "orange",
          低能见度: "yellow",
          雪: "gray",
          雨夹雪: "gray",
          米雪: "gray",
          冰晶: "gray",
          强降水: "green",
        };

        /** @type {Array<{id:string,station:string,airportName:string,time:string,text:string,level:"high"|"mid"|"low",type:string,publishedAt?:string,publishedBy?:string}>} */
        let warningPool = [];
        let warningPoolVersion = 0;

        function resolveAirportDisplayName(icao) {
          const code = String(icao || "").trim().toUpperCase();
          const sf = sfApprovedAirportsMap.get(code);
          if (sf?.name) {
            const name = String(sf.name);
            return name.includes("机场") ? name : `${name}机场`;
          }
          const found = OBJ_DEFAULT_AIRPORTS.find((a) => String(a.icao || "").toUpperCase() === code);
          if (!found) return code;
          const name = String(found.name || code);
          return name.includes("机场") ? name : `${name}机场`;
        }

        function normalizeWarnStationInput(raw) {
          return String(raw || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 4);
        }

        function getWarnStationValue() {
          return normalizeWarnStationInput(warnStation?.value);
        }

        function pushAlertPublishIcao(set, code) {
          const x = String(code || "")
            .trim()
            .toUpperCase();
          if (x.length === 4) set.add(x);
        }

        /** 机场警报发布可用四字码（合并静态清单、客观预报、航班计划等，无需逐个维护） */
        function getAlertPublishIcaoSet() {
          const set = new Set();
          if (alertPublishMode === "staticOnly") {
            airportWhitelistIcao.forEach((c) => set.add(c));
            return set;
          }
          airportWhitelistIcao.forEach((c) => set.add(c));
          DEFAULT_ICAO_WHITELIST.forEach((c) => set.add(c));
          if (typeof OBJ_DEFAULT_AIRPORTS !== "undefined") {
            OBJ_DEFAULT_AIRPORTS.forEach((a) => pushAlertPublishIcao(set, a.icao));
          }
          if (Array.isArray(objForecastConfig?.airports)) {
            objForecastConfig.airports.forEach((a) => {
              if (typeof a === "string") pushAlertPublishIcao(set, a);
              else pushAlertPublishIcao(set, a?.icao);
            });
          }
          flightMonitorIcao.forEach((c) => set.add(c));
          sfApprovedAirportsMap.forEach((_v, c) => set.add(c));
          return set;
        }

        function populateWarnFormOptions() {
          renderWarnPhenomenonCheckboxes();
          const listEl = document.getElementById("warnStationList");
          if (listEl) {
            const list =
              alertPublishMode === "allowAllValidIcao"
                ? []
                : [...getAlertPublishIcaoSet()].sort();
            listEl.innerHTML = list.map((icao) => `<option value="${escapeHtml(icao)}"></option>`).join("");
          }
          if (warnStation) {
            warnStation.value = normalizeWarnStationInput(warnStation.value);
          }
        }

        function renderWarnPhenomenonCheckboxes() {
          if (!warnPhenomenonGroup || warnPhenomenonGroup.dataset.built === "1") return;
          warnPhenomenonGroup.innerHTML = AIRPORT_ALERT_PHENOMENA.map(
            (p) => `<label class="publish-phenomenon-chip">
              <input type="checkbox" value="${escapeHtml(p)}" />
              <span>${escapeHtml(p)}</span>
            </label>`
          ).join("");
          warnPhenomenonGroup.dataset.built = "1";
          warnPhenomenonGroup.addEventListener("change", () => {
            if (!warnIsCancel?.checked) syncWarnRevisionDefault();
          });
        }

        function getSelectedWarnPhenomena() {
          if (!warnPhenomenonGroup) return [];
          const checked = new Set(
            Array.from(warnPhenomenonGroup.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value)
          );
          return AIRPORT_ALERT_PHENOMENA.filter((p) => checked.has(p));
        }

        function setSelectedWarnPhenomena(phenomena) {
          if (!warnPhenomenonGroup) return;
          const set = new Set(Array.isArray(phenomena) ? phenomena : []);
          warnPhenomenonGroup.querySelectorAll('input[type="checkbox"]').forEach((el) => {
            el.checked = set.has(el.value);
          });
        }

        function warningPhenomenaList(w) {
          if (Array.isArray(w?.phenomena) && w.phenomena.length) return w.phenomena.map(String);
          const t = String(w?.type || "").trim();
          if (!t || t === "天气预警") return [];
          return t
            .split("、")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        function warningPhenomenaLabel(w) {
          const list = warningPhenomenaList(w);
          return list.length ? list.join("、") : "天气预警";
        }

        function phenomenaKey(phenomena) {
          return [...phenomena].slice().sort().join("|");
        }

        function phenomenaOverlap(a, b) {
          const setB = new Set(b);
          return a.some((p) => setB.has(p));
        }

        /** 智能修订：撤销同机场与新现象有重叠的旧警报，返回被撤销的现象标签 */
        function applyWarningRevision(station, newPhenomena) {
          const code = String(station || "").trim().toUpperCase();
          const newSet = new Set(newPhenomena);
          const removedPhenomena = [];
          warningPool = warningPool.filter((w) => {
            if (String(w.station || "").toUpperCase() !== code) return true;
            const oldPhen = warningPhenomenaList(w);
            if (!phenomenaOverlap(oldPhen, newPhenomena)) return true;
            removedPhenomena.push(...oldPhen);
            return false;
          });
          return [...new Set(removedPhenomena.filter((p) => !newSet.has(p)))];
        }

        function syncWarnRevisionDefault() {
          if (!warnIsRevision || !warnStation || warnIsCancel?.checked) return;
          const station = getWarnStationValue();
          if (station.length !== 4) return;
          const selected = getSelectedWarnPhenomena();
          // 仅当所选现象与该机场已有警报有重叠时，默认勾选「智能修订」
          const shouldRevise =
            selected.length > 0 &&
            warningsForStation(station).some((w) => phenomenaOverlap(warningPhenomenaList(w), selected));
          warnIsRevision.checked = shouldRevise;
        }

        function collectStationActivePhenomena(station) {
          const seen = new Set();
          const out = [];
          for (const w of warningsForStation(station)) {
            for (const p of warningPhenomenaList(w)) {
              if (!seen.has(p)) {
                seen.add(p);
                out.push(p);
              }
            }
          }
          return out;
        }

        function formatWarningCancelPlain(station, phenomena) {
          const label = phenomena.length ? phenomena.join("、") : "天气";
          return `解除【${label}】${station}天气警报：以上天气对公司运行影响结束，解除天气警报。`;
        }

        function applyWarningCancel(station) {
          const code = String(station || "").trim().toUpperCase();
          warningPool = warningPool.filter((w) => String(w.station || "").toUpperCase() !== code);
        }

        function applyWarningCancelByIds(ids) {
          const idSet = new Set((ids || []).map(String).filter(Boolean));
          if (!idSet.size) return;
          warningPool = warningPool.filter((w) => !idSet.has(String(w.id || "")));
        }

        function getSelectedCancelWarningItems(station) {
          const code = String(station || "").trim().toUpperCase();
          if (!warnCancelSelectList || code.length !== 4) return [];
          const checkedIds = new Set(
            Array.from(warnCancelSelectList.querySelectorAll('input[type="checkbox"]:checked')).map((el) =>
              String(el.value || ""),
            ),
          );
          return warningsForStation(code).filter((w) => checkedIds.has(String(w.id || "")));
        }

        function syncWarnCancelUi() {
          const cancel = Boolean(warnIsCancel?.checked);
          const station = getWarnStationValue();
          const activeItems = station.length === 4 ? warningsForStation(station) : [];
          const phenomena = station.length === 4 ? collectStationActivePhenomena(station) : [];
          if (warnPhenomenonGroup) {
            warnPhenomenonGroup.querySelectorAll('input[type="checkbox"]').forEach((el) => {
              el.disabled = cancel;
            });
            if (cancel && phenomena.length) setSelectedWarnPhenomena(phenomena);
          }
          if (warnText) {
            warnText.disabled = cancel;
            warnText.style.opacity = cancel ? "0.45" : "";
          }
          if (warnIsRevision) warnIsRevision.disabled = cancel;
          if (warnCancelPanel) {
            if (cancel && station.length === 4) {
              warnCancelPanel.hidden = false;
              if (warnCancelSelectHint) {
                warnCancelSelectHint.textContent = activeItems.length
                  ? `请勾选要解除的生效警报（可多选；未勾选的其它天气类型仍保留）：`
                  : `${station} 当前无有效机场警报。`;
              }
              if (warnCancelSelectList) {
                if (!activeItems.length) {
                  warnCancelSelectList.innerHTML = "";
                } else {
                  warnCancelSelectList.innerHTML = activeItems
                    .map((w) => {
                      const id = escapeHtml(String(w.id || ""));
                      const phen = escapeHtml(warningPhenomenaLabel(w));
                      const preview = escapeHtml(
                        String(w.text || "")
                          .replace(/\s+/g, " ")
                          .trim()
                          .slice(0, 48) || "（无正文）",
                      );
                      return `<label class="warn-cancel-select-item">
                        <input type="checkbox" value="${id}" checked data-warn-cancel-id="${id}" />
                        <span>【${phen}】${preview}</span>
                      </label>`;
                    })
                    .join("");
                  warnCancelSelectList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
                    el.addEventListener("change", () => updateWarnCancelPreviewText(station));
                  });
                }
              }
              updateWarnCancelPreviewText(station);
            } else {
              warnCancelPanel.hidden = true;
              if (warnCancelSelectList) warnCancelSelectList.innerHTML = "";
              if (warnCancelPreview) warnCancelPreview.textContent = "";
            }
          }
          if (warnFormatHint) {
            warnFormatHint.hidden = cancel;
          }
        }

        function updateWarnCancelPreviewText(station) {
          if (!warnCancelPreview) return;
          const selected = getSelectedCancelWarningItems(station);
          if (!selected.length) {
            warnCancelPreview.textContent = "尚未勾选任何条目。请至少勾选一条要解除的警报。";
            return;
          }
          const phen = [];
          const seen = new Set();
          for (const w of selected) {
            for (const p of warningPhenomenaList(w)) {
              if (!seen.has(p)) {
                seen.add(p);
                phen.push(p);
              }
            }
          }
          warnCancelPreview.textContent =
            `将解除 ${selected.length} 条：${phen.join("、")}\n\n` + formatWarningCancelPlain(station, phen);
        }

        function formatWarningAlertPlain(station, phenomena, text, isRevision = false) {
          const label = phenomena.join("、");
          const prefix = isRevision ? "更新" : "";
          return `${prefix}【${label}】${station}天气警报\n${text}`;
        }

        function normalizeWarningItem(raw) {
          const station = String(raw?.station || "").trim().toUpperCase();
          const phenomena = Array.isArray(raw?.phenomena)
            ? raw.phenomena.map(String).filter(Boolean)
            : String(raw?.type || "")
                .split("、")
                .map((s) => s.trim())
                .filter(Boolean);
          return {
            id: String(raw?.id || `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
            station,
            airportName: String(raw?.airportName || resolveAirportDisplayName(station)),
            phenomena,
            type: phenomena.join("、"),
            text: String(raw?.text || ""),
            time: String(raw?.time || nowHHMM()),
            isRevision: Boolean(raw?.isRevision),
            publishedAt: raw?.publishedAt || new Date().toISOString(),
            publishedBy: String(raw?.publishedBy || ""),
          };
        }

        function normalizeWarningStore(data) {
          const base = data && typeof data === "object" ? data : {};
          const items = (Array.isArray(base.items) ? base.items : [])
            .map(normalizeWarningItem)
            .filter((it) => it.station && it.text);
          return {
            version: Number(base.version) || 1,
            source: String(base.source || "工作台·机场警报"),
            updatedAt: base.updatedAt || new Date().toISOString(),
            items,
          };
        }

        async function loadWarningPool() {
          let data = null;
          if (window.location.protocol !== "file:") {
            if (!isStaticHuiDeploy()) {
              try {
                const r = await fetchWithTimeout(`${ACTIVE_WARNINGS_API}?t=${Date.now()}`, { cache: "no-store" }, 4000);
                if (r.ok) data = normalizeWarningStore(await r.json());
              } catch {
                /* ignore */
              }
            }
            if (!data?.items?.length) {
              try {
                const r2 = await fetchWithTimeout(resolveAppAssetUrl("data/active-warnings.json"), { cache: "no-store" }, 6000);
                if (r2.ok) data = normalizeWarningStore(await r2.json());
              } catch {
                /* ignore */
              }
            }
          }
          try {
            const raw = localStorage.getItem(ACTIVE_WARNINGS_STORAGE_KEY);
            if (raw) {
              const local = normalizeWarningStore(JSON.parse(raw));
              if (!data?.items?.length || (local.updatedAt && local.updatedAt > (data.updatedAt || ""))) {
                data = local;
              }
            }
          } catch {
            /* ignore */
          }
          if (data?.items) {
            warningPool = dedupeWarningPoolItems(
              data.items.filter((w) => !String(w?.id || "").startsWith("wa-demo-")),
            );
            warningPoolVersion = data.version || 1;
          } else {
            warningPool = [];
            warningPoolVersion = 1;
          }
        }

        async function persistWarningPool() {
          const payload = {
            version: warningPoolVersion + 1,
            source: "工作台·机场警报",
            updatedAt: new Date().toISOString(),
            items: warningPool,
          };
          localStorage.setItem(ACTIVE_WARNINGS_STORAGE_KEY, JSON.stringify(payload));
          warningPoolVersion = payload.version;
          if (window.location.protocol === "file:") return { ok: true, mode: "local" };
          try {
            const r = await fetch(ACTIVE_WARNINGS_API, {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify(payload),
            });
            if (r.ok) return { ok: true, mode: "server" };
            return { ok: false, mode: "local", err: await r.text() };
          } catch (e) {
            return { ok: false, mode: "local", err: String(e.message || e) };
          } finally {
            notifyWarningMapClients();
          }
        }

        function warningItemDedupeKey(w) {
          const station = String(w?.station || "").trim().toUpperCase();
          // 同一机场 + 同一天气类型组合只保留一份（正文不同也合并，避免测试遗留叠两条）
          const phen = phenomenaKey(warningPhenomenaList(w));
          return `${station}|${phen || "_"}`;
        }

        function dedupeWarningPoolItems(items) {
          const map = new Map();
          for (const w of items) {
            const key = warningItemDedupeKey(w);
            const prev = map.get(key);
            if (!prev || String(w.publishedAt || "") >= String(prev.publishedAt || "")) {
              map.set(key, w);
            }
          }
          return [...map.values()];
        }

        async function refreshWarningPanelFromSource(showToastOnDone = false) {
          await loadWarningPool();
          warningPool = dedupeWarningPoolItems(warningPool);
          renderWarningPanel();
          if (showToastOnDone) showToast("已刷新", `天气预警已更新，共 ${warningPool.length} 条。`);
        }

        /** 联调/测试：清空跑马灯生效警报（服务器 + 本机缓存），不改动待发池 */
        async function clearActiveWarningsPool() {
          const n = warningPool.length;
          if (!n) {
            showToast("无需清空", "当前没有生效机场警报。");
            return;
          }
          if (!window.confirm(`确认清空跑马灯中的 ${n} 条生效警报？\n（不影响「存档/待发池」里的机器人推送记录）`)) {
            return;
          }
          warningPool = [];
          warningPoolVersion = 1;
          try {
            localStorage.removeItem(ACTIVE_WARNINGS_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          const result = await persistWarningPool();
          renderWarningPanel();
          const modeText = result.mode === "server" ? "已同步服务器" : "已清本机缓存";
          showToast("已清空生效警报", `${modeText} · 再发新警报不会自动勾「智能修订」。`);
        }

        let warningPanelAutoRefreshTimer = null;
        function startWarningPanelAutoRefresh() {
          if (warningPanelAutoRefreshTimer) clearInterval(warningPanelAutoRefreshTimer);
          warningPanelAutoRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            refreshWarningPanelFromSource(false);
          }, 5 * 60 * 1000);
        }

        /** @type {import("leaflet").Map | null} */
        let warningMapLeaflet = null;
        /** @type {import("leaflet").LayerGroup | null} */
        let warningMapOverlayGroup = null;
        let warningMapTilesReady = false;
        let warningMapAutoRefreshTimer = null;
        let warningMapToolbarBound = false;
        let warningMapResizeBound = false;
        /** @type {{ region: string, layer: string, readonly: boolean }} */
        let warningMapState = { region: "china", layer: "alert", readonly: false };
        /** @type {Window | null} */
        let warningMapPopupWindow = null;
        /** @type {BroadcastChannel | null} */
        let warningMapBroadcast = null;
        let tiandituTkCache = "";
        let tiandituTkLoaded = false;
        const TIANDITU_TK_STORAGE_KEY = "wx_tianditu_tk";

        /** Leaflet 视角：center 为 [纬度, 经度] */
        const WARNING_MAP_REGIONS = {
          china: { name: "中国", center: [35.5, 104.5], zoom: 4.6 },
          asia: { name: "亚洲", center: [32, 85], zoom: 3.2 },
          europe: { name: "欧洲", center: [54, 15], zoom: 3.6 },
          "north-america": { name: "北美洲", center: [48, -98], zoom: 3.5 },
          oceania: { name: "大洋洲", center: [-25, 135], zoom: 3.8 },
          global: { name: "全球", center: [20, 20], zoom: 2.2 },
        };

        function isWarningMapOpen() {
          return Boolean(warningMapLeaflet) || isWarningMapEmbed();
        }

        const WX_CAT_COLOR_HEX = {
          red: "#ff4757",
          brown: "#a06e46",
          orange: "#ff9f43",
          yellow: "#e6c94c",
          gray: "#94a3b8",
          green: "#2ee59d",
          blue: "#54a0ff",
          default: "#ffb020",
        };

        const METEO_LEVEL_COLORS = { R: "#ff4757", Y: "#e6c94c", G: "#3dd68c" };

        const NMC_TYPHOON_LIST_API = "/api/typhoon/list";
        const NMC_TYPHOON_VIEW_API = (id) => `/api/typhoon/${id}`;
        /** 西北太平洋（中央气象台业务范围） */
        const WPAC_BOUNDS = { lonMin: 100, lonMax: 180, latMin: 0, latMax: 55 };
        const NMC_TYPHOON_CACHE_MS = 30 * 60 * 1000;
        /** @type {{ fetchedAt: number, items: Array<object>, error?: string }} */
        let nmcTyphoonCache = { fetchedAt: 0, items: [] };

        const NMC_WIND_RING_STYLE = {
          "30KTS": { fill: "rgba(230, 201, 76, 0.24)", stroke: "rgba(230, 201, 76, 0.72)", label: "7级风圈" },
          "50KTS": { fill: "rgba(255, 159, 67, 0.28)", stroke: "rgba(255, 159, 67, 0.82)", label: "10级风圈" },
          "58KTS": { fill: "rgba(255, 71, 87, 0.3)", stroke: "rgba(255, 71, 87, 0.85)", label: "12级风圈" },
          "64KTS": { fill: "rgba(255, 71, 87, 0.32)", stroke: "rgba(255, 71, 87, 0.88)", label: "12级风圈" },
        };

        function parseNmcJsonp(text) {
          const m = String(text || "").match(/\(({[\s\S]*})\)/);
          if (!m) return null;
          try {
            return JSON.parse(m[1]);
          } catch {
            return null;
          }
        }

        function isWestPacificTyphoonCoord(lon, lat) {
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
          if (lat < WPAC_BOUNDS.latMin || lat > WPAC_BOUNDS.latMax) return false;
          return lon >= WPAC_BOUNDS.lonMin && lon <= WPAC_BOUNDS.lonMax;
        }

        function typhoonIntensityColor(code) {
          const c = String(code || "").toUpperCase();
          if (c.includes("SUPER")) return "#ff4757";
          if (c === "STY") return "#a855f7";
          if (c === "TY") return "#e6c94c";
          if (c === "STS" || c === "TS") return "#54a0ff";
          if (c === "TD") return "#3dd68c";
          return "#94a3b8";
        }

        function typhoonIntensityLabel(code) {
          const c = String(code || "").toUpperCase();
          if (c.includes("SUPER")) return "超强台风";
          if (c === "STY") return "强台风";
          if (c === "TY") return "台风";
          if (c === "STS") return "强热带风暴";
          if (c === "TS") return "热带风暴";
          if (c === "TD") return "热带低压";
          return c || "—";
        }

        /** 台风中心标记（菱形，与机场圆点区分） */
        const TYPHOON_CENTER_SYMBOL = "diamond";

        function parseNmcWindRadii(radiiArr) {
          const rings = [];
          for (const r of Array.isArray(radiiArr) ? radiiArr : []) {
            if (!Array.isArray(r) || r.length < 5) continue;
            const key = String(r[0] || "").toUpperCase();
            const style = NMC_WIND_RING_STYLE[key] || NMC_WIND_RING_STYLE["30KTS"];
            rings.push({
              key,
              ne: Number(r[1]) || 0,
              se: Number(r[2]) || 0,
              sw: Number(r[3]) || 0,
              nw: Number(r[4]) || 0,
              fill: style.fill,
              stroke: style.stroke,
              label: style.label,
            });
          }
          rings.sort((a, b) => b.ne + b.se + b.sw + b.nw - (a.ne + a.se + a.sw + a.nw));
          return rings;
        }

        function buildWindRingGeoPoints(lon, lat, ne, se, sw, nw, stepsPerQuadrant = 24) {
          const quads = [
            { start: 0, end: 90, r: ne },
            { start: 90, end: 180, r: se },
            { start: 180, end: 270, r: sw },
            { start: 270, end: 360, r: nw },
          ];
          const pts = [];
          const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
          for (const q of quads) {
            if (q.r <= 0) continue;
            for (let i = 0; i <= stepsPerQuadrant; i++) {
              const bearing = q.start + (i / stepsPerQuadrant) * (q.end - q.start);
              const br = (bearing * Math.PI) / 180;
              const dLat = (q.r * Math.cos(br)) / 111;
              const dLon = (q.r * Math.sin(br)) / (111 * cosLat);
              pts.push([lon + dLon, lat + dLat]);
            }
          }
          return pts;
        }

        const MAP_ALERT_CENTER_R = 6;
        const MAP_ALERT_RING_W = 3;
        const MAP_METEO_CENTER_R = 7;
        const MAP_METEO_RING_W = 5;

        function getMarkerLayerRadii(mapType, layerIndex) {
          if (mapType === "alert") {
            const outerR = MAP_ALERT_CENTER_R + layerIndex * MAP_ALERT_RING_W;
            const innerR = layerIndex === 0 ? 0 : MAP_ALERT_CENTER_R + (layerIndex - 1) * MAP_ALERT_RING_W;
            return { outerR, innerR };
          }
          const outerR = MAP_METEO_CENTER_R + (layerIndex + 1) * MAP_METEO_RING_W;
          const innerR = layerIndex === 0 ? 0 : MAP_METEO_CENTER_R + layerIndex * MAP_METEO_RING_W;
          return { outerR, innerR };
        }

        function buildAlertRippleSeries(stations) {
          const data = [];
          for (const row of stations) {
            const coord = resolveMapStationCoord(row.station);
            if (!coord) continue;
            const phenomena = uniqueOrderedStrings(row.phenomena || []);
            const pulseColor = WX_CAT_COLOR_HEX[colorIdForPhenomenon(phenomena[0])] || WX_CAT_COLOR_HEX.default;
            const n = Math.max(phenomena.length, 1);
            const { outerR } = getMarkerLayerRadii("alert", n - 1);
            data.push({
              value: [coord.lon, coord.lat],
              station: row.station,
              pulseColor,
              symbolSize: Math.max(outerR * 2, 12),
            });
          }
          if (!data.length) return null;
          return {
            name: "运行影响脉冲",
            type: "effectScatter",
            coordinateSystem: "geo",
            z: 7,
            silent: true,
            symbol: "circle",
            showEffectOn: "render",
            rippleEffect: {
              brushType: "stroke",
              scale: 2.8,
              period: 4.2,
              number: 2,
            },
            symbolSize: (val, params) => params.data?.symbolSize || 12,
            itemStyle: { opacity: 0.15, shadowBlur: 5 },
            data: data.map((d) => ({
              value: d.value,
              station: d.station,
              symbolSize: d.symbolSize,
              pulseColor: d.pulseColor,
              itemStyle: {
                color: d.pulseColor,
                opacity: 0.15,
                shadowBlur: 5,
                shadowColor: d.pulseColor,
              },
            })),
          };
        }

        function uniqueOrderedStrings(arr) {
          const seen = new Set();
          const out = [];
          for (const x of arr) {
            const k = String(x || "").trim();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(k);
          }
          return out;
        }

        function alertPhenomenonFromReason(reason) {
          const s = String(reason || "");
          if (!s) return null;
          for (const p of AIRPORT_ALERT_PHENOMENA) {
            if (s.includes(p)) return p;
          }
          const simple = simplifyAlertReason(s);
          const reasonMap = {
            低能见度: "低能见度",
            低云: "低云",
            阵风: "强地面风和阵风",
            大风: "强地面风和阵风",
            雷雨: "雷暴",
            降雪: "雪",
            降水: "强降水",
            尘暴: "尘暴",
          };
          if (reasonMap[simple]) return reasonMap[simple];
          if (/温度.*高|炎热|高温|酷热/.test(s)) return "炎热天气";
          if (/温度.*低|极寒/.test(s)) return "极寒天气";
          if (/云底|云高/.test(s)) return "低云";
          if (/能见度|RVR|跑道视程/.test(s)) return "低能见度";
          if (/风速|阵风|大风/.test(s)) return "强地面风和阵风";
          const matched = matchWarningPhenomenonCategory(s);
          if (matched) {
            for (const p of AIRPORT_ALERT_PHENOMENA) {
              if (matched.keywords.some((kw) => p.includes(kw) || kw.includes(p))) return p;
            }
          }
          return null;
        }

        /** METAR 从左到右扫描天气码 → 公司 R/Y/G 档（内圈优先；同色只保留一圈） */
        function collapseMeteoMapLevelsByColor(levels) {
          const seen = new Set();
          const out = [];
          for (const l of levels) {
            const lv = String(l.level || "").toUpperCase();
            if (lv !== "R" && lv !== "Y" && lv !== "G") continue;
            if (seen.has(lv)) continue;
            seen.add(lv);
            out.push({ ...l, level: lv });
          }
          return out;
        }

        function messageMapLevelsOrdered(m) {
          const out = [];
          const seen = new Set();
          const push = (level, code, label) => {
            const lv = String(level || "").toUpperCase();
            if (lv !== "R" && lv !== "Y" && lv !== "G") return;
            const c = String(code || "").toUpperCase();
            const key = `${c}|${lv}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ level: lv, code: c, label: label || c || "—" });
          };
          const raw = String(m?.raw || "")
            .trim()
            .replace(/=\s*$/, "");
          const parts = raw.split(/\s+/).filter(Boolean);
          for (const tok of parts) {
            if (!isWxToken(tok)) continue;
            const p = lookupWeatherPhenomenonCode(tok);
            if (!p) continue;
            const lv = String(p.companyLevel || "G").toUpperCase();
            if (companyLevelToRank(lv) < 1) continue;
            push(lv, p.match, p.zh || p.match);
          }
          if (!out.length) {
            const lv = messageCompanyLevel(m);
            if (lv) push(lv, "", "综合判色");
          }
          return collapseMeteoMapLevelsByColor(out);
        }

        function mergeOrderedLevelLayers(base, extra) {
          const seen = new Set();
          const out = [];
          for (const l of [...base, ...extra]) {
            const key = `${l.code}|${l.level}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(l);
          }
          return out;
        }

        function mapMarkerTrianglePoints(cx, cy, size) {
          return [
            [cx, cy - size * 0.62],
            [cx - size * 0.56, cy + size * 0.38],
            [cx + size * 0.56, cy + size * 0.38],
          ];
        }

        function buildNestedMapMarkerSeries(stations, shape, mapType) {
          const markerData = [];
          for (const row of stations) {
            const coord = resolveMapStationCoord(row.station);
            if (!coord) continue;
            const item = {
              value: [coord.lon, coord.lat],
              station: row.station,
              displayName: row.name || row.station,
              mapType,
              level: row.level,
              count: row.count,
            };
            if (mapType === "meteo") {
              item.layers = Array.isArray(row.layers) && row.layers.length ? row.layers : [];
              if (!item.layers.length && row.level) {
                item.layers = [{ level: row.level, code: "", label: "综合判色" }];
              }
            } else {
              const phenomena = uniqueOrderedStrings(row.phenomena || []);
              if (!phenomena.length) phenomena.push("天气预警");
              item.phenomena = phenomena;
              item.colorId = colorIdForPhenomenon(phenomena[0]) || "default";
            }
            markerData.push(item);
          }
          if (!markerData.length) return null;
          return {
            name: mapType === "meteo" ? "恶劣提示" : "运行影响",
            type: "custom",
            coordinateSystem: "geo",
            geoIndex: 0,
            z: mapType === "alert" ? 8 : 6,
            clip: false,
            animation: false,
            data: markerData.map((d) => ({
              value: d.value,
              station: d.station,
              displayName: d.displayName,
              mapType: d.mapType,
              level: d.level,
              count: d.count,
              phenomena: d.phenomena,
              layers: d.layers,
              colorId: d.colorId,
            })),
            renderItem(params, api) {
              const d = markerData[params.dataIndex];
              if (!d?.value) return;
              const pt = api.coord(d.value);
              if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return;
              let colors = [];
              if (d.mapType === "meteo") {
                colors = (d.layers || []).map((l) => METEO_LEVEL_COLORS[l.level] || "#94a3b8");
              } else {
                colors = (d.phenomena || []).map(
                  (p) => WX_CAT_COLOR_HEX[colorIdForPhenomenon(p)] || WX_CAT_COLOR_HEX.default,
                );
              }
              if (!colors.length) colors.push(WX_CAT_COLOR_HEX.default);
              const children = [];
              const singleLayer = colors.length === 1;
              for (let i = colors.length - 1; i >= 0; i--) {
                const { outerR, innerR } = getMarkerLayerRadii(d.mapType, i);
                const color = colors[i];
                const isOutermost = i === colors.length - 1;
                const hideOuterStroke = shape === "triangle" && (singleLayer || isOutermost);
                const stroke = hideOuterStroke ? "transparent" : "rgba(255,255,255,0.72)";
                const lineWidth = hideOuterStroke ? 0 : 1;
                if (shape === "circle") {
                  if (i === 0) {
                    children.push({
                      type: "circle",
                      shape: { cx: pt[0], cy: pt[1], r: outerR },
                      style: { fill: color, stroke, lineWidth },
                    });
                  } else {
                    children.push({
                      type: "ring",
                      shape: { cx: pt[0], cy: pt[1], r: outerR, r0: innerR },
                      style: { fill: color, stroke, lineWidth },
                    });
                  }
                } else {
                  const size = outerR * 1.12;
                  const tri = mapMarkerTrianglePoints(pt[0], pt[1], size);
                  children.push({
                    type: "polygon",
                    shape: { points: tri },
                    style: { fill: color, stroke, lineWidth },
                  });
                }
              }
              return { type: "group", children };
            },
          };
        }

        function parseNmcTyphoonDetail(json) {
          const t = json?.typhoon;
          if (!Array.isArray(t) || t.length < 9) return null;
          const trackRaw = t[8];
          if (!Array.isArray(trackRaw)) return null;
          const track = [];
          for (const pt of trackRaw) {
            if (!Array.isArray(pt) || pt.length < 8) continue;
            const lon = Number(pt[4]);
            const lat = Number(pt[5]);
            if (!isWestPacificTyphoonCoord(lon, lat)) continue;
            track.push({
              lon,
              lat,
              time: pt[1],
              intensity: pt[3],
              pressure: pt[6],
              windMs: pt[7],
              moveDir: pt[8],
              moveSpeed: pt[9],
              windRadii: parseNmcWindRadii(pt[10]),
              forecastAgencies: pt[11],
            });
          }
          if (!track.length) return null;
          const current = track[track.length - 1];
          let forecastPath = [];
          const babj = current.forecastAgencies?.BABJ;
          if (Array.isArray(babj)) {
            forecastPath = babj
              .map((f) => ({
                hour: f[0],
                time: f[1],
                lon: Number(f[2]),
                lat: Number(f[3]),
                pressure: f[4],
                windMs: f[5],
                intensity: f[7],
              }))
              .filter((p) => isWestPacificTyphoonCoord(p.lon, p.lat));
          }
          return {
            id: t[0],
            nameEn: t[1],
            nameCn: t[2],
            tfbh: t[3],
            status: t[7],
            track,
            current,
            forecastPath,
            windRings: current.windRadii,
          };
        }

        async function syncWarningMapTyphoonSources(force = false) {
          if (window.location.protocol === "file:") {
            nmcTyphoonCache = { fetchedAt: Date.now(), items: [], error: "file 协议下请使用 npm start" };
            return [];
          }
          if (!force && nmcTyphoonCache.fetchedAt && Date.now() - nmcTyphoonCache.fetchedAt < NMC_TYPHOON_CACHE_MS) {
            return nmcTyphoonCache.items;
          }
          try {
            const listRes = await fetch(`${NMC_TYPHOON_LIST_API}?t=${Date.now()}`, { cache: "no-store" });
            if (!listRes.ok) throw new Error(`台风列表 HTTP ${listRes.status}`);
            const listJson = parseNmcJsonp(await listRes.text());
            const active = (listJson?.typhoonList || []).filter((row) => String(row[7] || "").toLowerCase() === "start");
            const items = [];
            for (const row of active) {
              const id = row[0];
              if (id == null) continue;
              const detailRes = await fetch(`${NMC_TYPHOON_VIEW_API(id)}?t=${Date.now()}`, { cache: "no-store" });
              if (!detailRes.ok) continue;
              const parsed = parseNmcTyphoonDetail(parseNmcJsonp(await detailRes.text()));
              if (parsed) items.push(parsed);
            }
            nmcTyphoonCache = { fetchedAt: Date.now(), items, error: "" };
          } catch (e) {
            nmcTyphoonCache = {
              fetchedAt: Date.now(),
              items: nmcTyphoonCache.items || [],
              error: String(e.message || e),
            };
          }
          return nmcTyphoonCache.items;
        }

        function buildTyphoonTrackLineSeries(track, label, typhoonId) {
          const out = [];
          if (!Array.isArray(track) || track.length < 2) return out;
          for (let i = 1; i < track.length; i++) {
            const a = track[i - 1];
            const b = track[i];
            out.push({
              name: `${label}·实况`,
              type: "lines",
              coordinateSystem: "geo",
              polyline: true,
              z: 3,
              lineStyle: {
                width: 2.5,
                color: typhoonIntensityColor(b.intensity),
                opacity: 0.92,
              },
              data: [
                {
                  coords: [
                    [a.lon, a.lat],
                    [b.lon, b.lat],
                  ],
                  typhoonId,
                  typhoonLabel: label,
                  intensity: b.intensity,
                  mapKind: "track",
                },
              ],
            });
          }
          return out;
        }

        function buildTyphoonWindRingSeries(typhoons) {
          const ringRenderData = [];
          const outlineData = [];
          for (const t of typhoons) {
            const cur = t.current;
            if (!cur) continue;
            const rings = t.windRings || cur.windRadii || [];
            for (const ring of rings) {
              const ne = Number(ring.ne) || 0;
              const se = Number(ring.se) || 0;
              const sw = Number(ring.sw) || 0;
              const nw = Number(ring.nw) || 0;
              if (ne + se + sw + nw <= 0) continue;
              const ringCoords = buildWindRingGeoPoints(cur.lon, cur.lat, ne, se, sw, nw);
              ringRenderData.push({
                coords: ringCoords,
                fill: ring.fill,
                stroke: ring.stroke,
                typhoonId: t.id,
                ringKey: ring.key,
              });
              outlineData.push({
                coords: [...ringCoords, ringCoords[0]],
                lineStyle: { color: ring.stroke, width: 3, opacity: 0.98 },
              });
            }
          }
          const out = [];
          if (ringRenderData.length) {
            out.push({
              name: "台风风圈",
              type: "custom",
              coordinateSystem: "geo",
              geoIndex: 0,
              z: 2,
              silent: true,
              clip: false,
              animation: false,
              data: ringRenderData.map((item) => [item.coords[0][0], item.coords[0][1]]),
              renderItem(params, api) {
                const item = ringRenderData[params.dataIndex];
                if (!item?.coords?.length) return;
                const points = [];
                for (const c of item.coords) {
                  const pt = api.coord(c);
                  if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
                    points.push(pt);
                  }
                }
                if (points.length < 3) return;
                return {
                  type: "polygon",
                  shape: { points },
                  style: {
                    fill: item.fill || "rgba(230, 201, 76, 0.24)",
                    stroke: item.stroke || "rgba(230, 201, 76, 0.72)",
                    lineWidth: 2,
                    lineJoin: "round",
                    opacity: 0.95,
                  },
                };
              },
            });
          }
          if (outlineData.length) {
            out.push({
              name: "台风风圈轮廓",
              type: "lines",
              coordinateSystem: "geo",
              polyline: true,
              z: 4,
              silent: true,
              lineStyle: { width: 3, opacity: 0.98 },
              data: outlineData,
            });
          }
          return out;
        }

        function countTyphoonWindRings(typhoons) {
          let n = 0;
          for (const t of typhoons) {
            const rings = t.windRings || t.current?.windRadii || [];
            for (const ring of rings) {
              const sum =
                (Number(ring.ne) || 0) +
                (Number(ring.se) || 0) +
                (Number(ring.sw) || 0) +
                (Number(ring.nw) || 0);
              if (sum > 0) n += 1;
            }
          }
          return n;
        }

        function buildNmcTyphoonMapSeries(typhoons) {
          const series = [...buildTyphoonWindRingSeries(typhoons)];
          for (const t of typhoons) {
            const cur = t.current;
            if (!cur) continue;
            const label = `${t.tfbh || ""} ${t.nameCn || t.nameEn || "台风"}`.trim();
            series.push(...buildTyphoonTrackLineSeries(t.track, label, t.id));
            if (t.forecastPath.length) {
              series.push({
                name: `${label}·预报`,
                type: "lines",
                coordinateSystem: "geo",
                polyline: true,
                z: 3,
                lineStyle: {
                  width: 2,
                  color: "rgba(122, 200, 190, 0.88)",
                  type: [6, 4],
                  opacity: 0.88,
                },
                data: [
                  {
                    coords: [[cur.lon, cur.lat], ...t.forecastPath.map((p) => [p.lon, p.lat])],
                    typhoonId: t.id,
                    typhoonLabel: label,
                    mapKind: "forecast",
                  },
                ],
              });
            }
            series.push({
              name: `${label}·中心`,
              type: "scatter",
              coordinateSystem: "geo",
              z: 5,
              symbol: TYPHOON_CENTER_SYMBOL,
              symbolSize: 16,
              itemStyle: {
                color: typhoonIntensityColor(cur.intensity),
                borderColor: "rgba(255,255,255,0.95)",
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: typhoonIntensityColor(cur.intensity),
              },
              data: [
                {
                  value: [cur.lon, cur.lat],
                  typhoonId: t.id,
                  typhoonLabel: label,
                  intensity: cur.intensity,
                  intensityLabel: typhoonIntensityLabel(cur.intensity),
                  windMs: cur.windMs,
                  pressure: cur.pressure,
                  lon: cur.lon,
                  lat: cur.lat,
                  time: cur.time,
                },
              ],
            });
            series.push({
              name: `${label}·名称`,
              type: "scatter",
              coordinateSystem: "geo",
              z: 6,
              symbolSize: 1,
              label: {
                show: true,
                formatter: () => label,
                color: "rgba(255,255,255,0.95)",
                fontSize: 11,
                fontWeight: 600,
                position: "top",
                distance: 6,
              },
              data: [{ value: [cur.lon, cur.lat], typhoonId: t.id }],
            });
          }
          return series;
        }

        function formatWarningMapTooltip(params) {
          const d = params?.data || {};
          if (d.typhoonId || d.typhoonLabel) {
            const wind =
              d.windMs != null && Number.isFinite(Number(d.windMs)) ? `${Math.round(Number(d.windMs))} m/s` : "—";
            const pres = d.pressure != null && d.pressure !== "" ? `${d.pressure} hPa` : "—";
            const pos =
              d.lon != null && d.lat != null
                ? `${Number(d.lon).toFixed(1)}°E, ${Number(d.lat).toFixed(1)}°N`
                : "—";
            return `<strong>${escapeHtml(d.typhoonLabel || "台风")}</strong><br/>${escapeHtml(d.intensityLabel || typhoonIntensityLabel(d.intensity))} · ${wind}<br/>气压 ${escapeHtml(pres)} · ${pos}<br/><span style="opacity:0.75">中央气象台</span>`;
          }
          const kind = d.mapType === "meteo" ? "恶劣提示" : "运行影响";
          if (d.mapType === "meteo") {
            const layers = Array.isArray(d.layers) ? d.layers : [];
            const lvLabel = d.level === "R" ? "红" : d.level === "Y" ? "黄" : "绿";
            const layerText = layers.length
              ? layers
                  .map((l) => {
                    const lv = l.level === "R" ? "红" : l.level === "Y" ? "黄" : "绿";
                    const tag = l.code ? `${l.code}(${lv})` : `${l.label || "—"}(${lv})`;
                    return tag;
                  })
                  .join(" → ")
              : "—";
            const layerHint =
              layers.length > 1
                ? `<br/><span style="opacity:0.75">套色顺序（内→外）：${escapeHtml(layerText)}</span>`
                : "";
            return `<strong>${escapeHtml(d.station || "")}</strong> ${escapeHtml(d.displayName || "")}<br/>${kind} · 公司判色 ${lvLabel}档<br/>扫描：${escapeHtml(layerText)}${layerHint}`;
          }
          const phen = Array.isArray(d.phenomena) ? d.phenomena : [];
          const phenText = phen.length ? phen.join(" → ") : "—";
          const layerHint =
            phen.length > 1
              ? `<br/><span style="opacity:0.75">套色顺序（内→外）：${escapeHtml(phenText)}</span>`
              : "";
          return `<strong>${escapeHtml(d.station || "")}</strong> ${escapeHtml(d.displayName || "")}<br/>${kind} · ${warningsForStation(d.station).length} 条警报<br/>现象：${escapeHtml(phen.length ? phen.join("、") : "—")}${layerHint}`;
        }

        function isWarningMapEmbed() {
          return (new URLSearchParams(window.location.search).get("embed") || "").trim().toLowerCase() === "warning-map";
        }

        function waitForWarningMapChartLayout(maxTries = 24) {
          return new Promise((resolve) => {
            let tries = 0;
            const tick = () => {
              if (!warningMapChartEl) return resolve(false);
              const w = warningMapChartEl.clientWidth;
              const h = warningMapChartEl.clientHeight;
              if (w >= 80 && h >= 80) return resolve(true);
              if (++tries >= maxTries) return resolve(false);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        }

        function syncWarningMapChartSize() {
          if (warningMapLeaflet) {
            try {
              warningMapLeaflet.invalidateSize(true);
            } catch {
              /* ignore */
            }
          }
        }

        function prepareWarningMapEmbedShell() {
          if (!isWarningMapEmbed()) return;
          readWarningMapStateFromUrl();
          document.documentElement.classList.remove("warning-map-embed-boot");
          document.body.classList.add("warning-map-embed");
          if (warningMapEmbedRoot) warningMapEmbedRoot.hidden = false;
          bindWarningMapToolbar();
          bindWarningMapBroadcast();
          syncWarningMapToolbarUi();
          const closeBtn = document.getElementById("warningMapCloseBtn");
          if (closeBtn && !warningMapState.readonly) closeBtn.hidden = false;
          if (!warningMapResizeBound) {
            warningMapResizeBound = true;
            window.addEventListener("resize", () => syncWarningMapChartSize());
            window.addEventListener("load", () => syncWarningMapChartSize());
          }
        }

        function readWarningMapStateFromUrl() {
          const params = new URLSearchParams(window.location.search);
          const region = (params.get("region") || "china").trim().toLowerCase();
          const layer = (params.get("layer") || "alert").trim().toLowerCase();
          warningMapState.region = WARNING_MAP_REGIONS[region] ? region : "china";
          warningMapState.layer = ["alert", "meteo", "all"].includes(layer) ? layer : "alert";
          warningMapState.readonly = params.get("readonly") === "1";
        }

        function syncWarningMapUrlParams() {
          if (!isWarningMapEmbed()) return;
          const url = new URL(window.location.href);
          url.searchParams.set("embed", "warning-map");
          url.searchParams.set("view", "monitor");
          url.searchParams.set("region", warningMapState.region);
          url.searchParams.set("layer", warningMapState.layer);
          if (warningMapState.readonly) url.searchParams.set("readonly", "1");
          else url.searchParams.delete("readonly");
          history.replaceState(null, "", url);
        }

        function notifyWarningMapClients() {
          try {
            if (!warningMapBroadcast) warningMapBroadcast = new BroadcastChannel("wx-warning-map-v1");
            warningMapBroadcast.postMessage("warnings-updated");
          } catch {
            /* ignore */
          }
        }

        function bindWarningMapBroadcast() {
          try {
            if (!warningMapBroadcast) warningMapBroadcast = new BroadcastChannel("wx-warning-map-v1");
            warningMapBroadcast.onmessage = () => {
              if (isWarningMapOpen()) renderWarningMap().catch(() => {});
            };
          } catch {
            /* ignore */
          }
        }

        function getTiandituTkFromUrlOrStorage() {
          try {
            const q = new URLSearchParams(window.location.search).get("tdt_tk");
            if (q && String(q).trim()) return String(q).trim();
          } catch {
            /* ignore */
          }
          try {
            const local = localStorage.getItem(TIANDITU_TK_STORAGE_KEY);
            if (local && String(local).trim()) return String(local).trim();
          } catch {
            /* ignore */
          }
          return "";
        }

        async function loadTiandituTk(force = false) {
          if (tiandituTkLoaded && !force) return tiandituTkCache;
          const quick = getTiandituTkFromUrlOrStorage();
          if (quick) {
            tiandituTkCache = quick;
            tiandituTkLoaded = true;
            return tiandituTkCache;
          }
          try {
            const r = await fetch(`/api/config/tianditu?t=${Date.now()}`, { cache: "no-store" });
            if (r.ok) {
              const j = await r.json();
              tiandituTkCache = String(j.tk || "").trim();
            }
          } catch {
            tiandituTkCache = "";
          }
          tiandituTkLoaded = true;
          return tiandituTkCache;
        }

        function saveTiandituTkLocal(tk) {
          const v = String(tk || "").trim();
          tiandituTkCache = v;
          tiandituTkLoaded = true;
          warningMapTilesReady = false;
          try {
            if (v) localStorage.setItem(TIANDITU_TK_STORAGE_KEY, v);
            else localStorage.removeItem(TIANDITU_TK_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }

        function showWarningMapMissingKeyMessage() {
          if (!warningMapChartEl) return;
          destroyWarningMapLeaflet();
          warningMapChartEl.innerHTML = `<div class="warning-map-missing-key">
            <div class="warning-map-missing-key-card">
              <strong>还差一步：填写天地图密钥</strong>
              地图底图已改为国家天地图（合规底图）。请先申请浏览器端 Key，再点右上角「底图密钥」粘贴进去。<br/><br/>
              申请地址：console.tianditu.gov.cn<br/>
              也可写入席位文件 data/tianditu-config.local.json 的 tk 字段后重启服务。
            </div>
          </div>`;
        }

        function destroyWarningMapLeaflet() {
          if (warningMapLeaflet) {
            try {
              warningMapLeaflet.remove();
            } catch {
              /* ignore */
            }
          }
          warningMapLeaflet = null;
          warningMapOverlayGroup = null;
          warningMapTilesReady = false;
        }

        function flyWarningMapToRegion() {
          if (!warningMapLeaflet) return;
          const reg = WARNING_MAP_REGIONS[warningMapState.region] || WARNING_MAP_REGIONS.china;
          warningMapLeaflet.setView(reg.center, reg.zoom, { animate: false });
        }

        function tiandituTileUrl(layer) {
          return (
            `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
            `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
            `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(tiandituTkCache)}`
          );
        }

        function ensureWarningMapLeaflet() {
          if (typeof L === "undefined") return null;
          if (warningMapLeaflet && warningMapTilesReady) return warningMapLeaflet;
          if (!warningMapChartEl || !tiandituTkCache) return null;
          if (warningMapLeaflet) destroyWarningMapLeaflet();
          warningMapChartEl.innerHTML = "";
          const reg = WARNING_MAP_REGIONS[warningMapState.region] || WARNING_MAP_REGIONS.china;
          warningMapLeaflet = L.map(warningMapChartEl, {
            center: reg.center,
            zoom: reg.zoom,
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true,
          });
          const common = {
            subdomains: "01234567",
            maxZoom: 18,
            minZoom: 2,
            tileSize: 256,
            zoomOffset: 0,
          };
          L.tileLayer(tiandituTileUrl("vec"), {
            ...common,
            attribution: '&copy; <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noopener">国家天地图</a>',
          }).addTo(warningMapLeaflet);
          L.tileLayer(tiandituTileUrl("cva"), { ...common, attribution: "" }).addTo(warningMapLeaflet);
          warningMapOverlayGroup = L.layerGroup().addTo(warningMapLeaflet);
          warningMapTilesReady = true;
          return warningMapLeaflet;
        }

        function buildStationMarkerHtml(row, shape, mapType) {
          let colors = [];
          if (mapType === "meteo") {
            const layers = Array.isArray(row.layers) && row.layers.length
              ? row.layers
              : row.level
                ? [{ level: row.level }]
                : [];
            colors = layers.map((l) => METEO_LEVEL_COLORS[l.level] || "#94a3b8");
          } else {
            const phenomena = uniqueOrderedStrings(row.phenomena || []);
            if (!phenomena.length) phenomena.push("天气预警");
            colors = phenomena.map((p) => WX_CAT_COLOR_HEX[colorIdForPhenomenon(p)] || WX_CAT_COLOR_HEX.default);
          }
          if (!colors.length) colors.push(WX_CAT_COLOR_HEX.default);
          const n = colors.length;
          const { outerR } = getMarkerLayerRadii(mapType, n - 1);
          const box = Math.ceil(outerR * 2 + (mapType === "alert" ? 10 : 4));
          const layersHtml = [];
          for (let i = n - 1; i >= 0; i--) {
            const { outerR: r } = getMarkerLayerRadii(mapType, i);
            const color = colors[i];
            if (shape === "circle") {
              layersHtml.push(
                `<span class="wm-nest-layer is-circle" style="width:${r * 2}px;height:${r * 2}px;background:${color}"></span>`,
              );
            } else {
              const size = r * 1.12;
              const bw = Math.max(6, Math.round(size * 0.56));
              const bh = Math.max(10, Math.round(size * 1.0));
              layersHtml.push(
                `<span class="wm-nest-layer is-tri" style="border-left-width:${bw}px;border-right-width:${bw}px;border-bottom-width:${bh}px;border-bottom-color:${color}"></span>`,
              );
            }
          }
          const pulse =
            mapType === "alert"
              ? `<span class="wm-alert-pulse" style="color:${colors[0]};width:${box}px;height:${box}px"></span>`
              : "";
          return `<div class="wm-marker-wrap" style="width:${box}px;height:${box}px">${pulse}<div class="wm-nest" style="width:${box}px;height:${box}px">${layersHtml.join("")}</div></div>`;
        }

        function stationTooltipHtml(row, mapType) {
          return formatWarningMapTooltip({
            data: {
              station: row.station,
              displayName: row.name || row.station,
              mapType,
              level: row.level,
              count: row.count,
              phenomena: row.phenomena,
              layers: row.layers,
            },
          });
        }

        function paintLeafletStationMarkers(alertData, meteoData) {
          if (!warningMapOverlayGroup) return;
          const addOne = (row, shape, mapType) => {
            const coord = resolveMapStationCoord(row.station);
            if (!coord) return;
            const html = buildStationMarkerHtml(row, shape, mapType);
            const sizeMatch = html.match(/width:(\d+)px/);
            const box = sizeMatch ? Number(sizeMatch[1]) : 24;
            const icon = L.divIcon({
              className: "wm-div-icon",
              html,
              iconSize: [box, box],
              iconAnchor: [box / 2, box / 2],
            });
            const marker = L.marker([coord.lat, coord.lon], { icon, interactive: true, zIndexOffset: mapType === "alert" ? 80 : 40 });
            marker.bindTooltip(stationTooltipHtml(row, mapType), {
              className: "wm-map-tip",
              direction: "top",
              sticky: true,
              opacity: 1,
            });
            marker.on("click", () => {
              if (warningMapState.readonly) return;
              openWarningAirportModal(row.station);
            });
            warningMapOverlayGroup.addLayer(marker);
          };
          for (const row of meteoData) addOne(row, "triangle", "meteo");
          for (const row of alertData) addOne(row, "circle", "alert");
        }

        function paintLeafletTyphoonLayers(typhoons) {
          if (!warningMapOverlayGroup || !Array.isArray(typhoons)) return;
          for (const t of typhoons) {
            const cur = t.current;
            if (!cur) continue;
            const label = `${t.tfbh || ""} ${t.nameCn || t.nameEn || "台风"}`.trim();
            const rings = t.windRings || cur.windRadii || [];
            for (const ring of rings) {
              const ne = Number(ring.ne) || 0;
              const se = Number(ring.se) || 0;
              const sw = Number(ring.sw) || 0;
              const nw = Number(ring.nw) || 0;
              if (ne + se + sw + nw <= 0) continue;
              const ringCoords = buildWindRingGeoPoints(cur.lon, cur.lat, ne, se, sw, nw);
              const latlngs = ringCoords.map((c) => [c[1], c[0]]);
              warningMapOverlayGroup.addLayer(
                L.polygon(latlngs, {
                  color: ring.stroke || "rgba(230, 201, 76, 0.72)",
                  weight: 2,
                  fillColor: ring.fill || "rgba(230, 201, 76, 0.24)",
                  fillOpacity: 0.85,
                  interactive: false,
                }),
              );
            }
            if (Array.isArray(t.track) && t.track.length >= 2) {
              for (let i = 1; i < t.track.length; i++) {
                const a = t.track[i - 1];
                const b = t.track[i];
                warningMapOverlayGroup.addLayer(
                  L.polyline(
                    [
                      [a.lat, a.lon],
                      [b.lat, b.lon],
                    ],
                    {
                      color: typhoonIntensityColor(b.intensity),
                      weight: 2.5,
                      opacity: 0.92,
                      interactive: false,
                    },
                  ),
                );
              }
            }
            if (Array.isArray(t.forecastPath) && t.forecastPath.length) {
              const fc = [[cur.lat, cur.lon], ...t.forecastPath.map((p) => [p.lat, p.lon])];
              warningMapOverlayGroup.addLayer(
                L.polyline(fc, {
                  color: "rgba(122, 200, 190, 0.88)",
                  weight: 2,
                  opacity: 0.88,
                  dashArray: "6 4",
                  interactive: false,
                }),
              );
            }
            const color = typhoonIntensityColor(cur.intensity);
            const centerIcon = L.divIcon({
              className: "wm-div-icon",
              html: `<div class="wm-typhoon-center" style="background:${color};color:${color}"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });
            const center = L.marker([cur.lat, cur.lon], { icon: centerIcon, interactive: true, zIndexOffset: 100 });
            center.bindTooltip(
              formatWarningMapTooltip({
                data: {
                  typhoonId: t.id,
                  typhoonLabel: label,
                  intensity: cur.intensity,
                  intensityLabel: typhoonIntensityLabel(cur.intensity),
                  windMs: cur.windMs,
                  pressure: cur.pressure,
                  lon: cur.lon,
                  lat: cur.lat,
                  time: cur.time,
                },
              }),
              { className: "wm-map-tip", direction: "top", sticky: true, opacity: 1 },
            );
            warningMapOverlayGroup.addLayer(center);
            warningMapOverlayGroup.addLayer(
              L.marker([cur.lat, cur.lon], {
                icon: L.divIcon({
                  className: "wm-div-icon",
                  html: `<div class="wm-typhoon-label">${escapeHtml(label)}</div>`,
                  iconSize: [120, 18],
                  iconAnchor: [60, 22],
                }),
                interactive: false,
                zIndexOffset: 90,
              }),
            );
          }
        }

        function promptWarningMapTiandituTk() {
          const current = tiandituTkCache || getTiandituTkFromUrlOrStorage() || "";
          const next = window.prompt(
            "请粘贴天地图「浏览器端」Key（申请：console.tianditu.gov.cn）\n留空并确定可清除本机已存密钥。",
            current,
          );
          if (next == null) return;
          saveTiandituTkLocal(next);
          if (!String(next).trim()) {
            showToast("已清除本机密钥", "仍可使用 data/tianditu-config.local.json");
          } else {
            showToast("天地图密钥已保存", "仅保存在本浏览器；席位长期使用请写入配置文件");
          }
          renderWarningMap().catch(() => {});
        }

        function resolveMapStationCoord(code) {
          const icao = String(code || "").trim().toUpperCase();
          if (icao.length !== 4) return null;
          const sf = sfApprovedAirportsMap.get(icao);
          if (sf && Number.isFinite(sf.lat) && Number.isFinite(sf.lon)) {
            return { lat: sf.lat, lon: sf.lon };
          }
          const table = AIRPORT_COORDS[icao];
          if (table) {
            const n = normalizeOverrideEntry(table);
            if (n) return { lat: n.lat, lon: n.lon };
          }
          return null;
        }

        function collectAlertMapStations() {
          const byStation = new Map();
          for (const w of warningPool) {
            const code = String(w.station || "").trim().toUpperCase();
            if (!code) continue;
            if (!byStation.has(code)) {
              byStation.set(code, {
                station: code,
                name: w.airportName || resolveAirportDisplayName(code),
                phenomena: [],
              });
            }
            byStation.get(code).phenomena.push(...warningPhenomenaList(w));
          }
          return [...byStation.values()].map((row) => {
            const phenomena = uniqueOrderedStrings(row.phenomena);
            return {
              station: row.station,
              name: row.name,
              colorId: colorIdForPhenomenon(phenomena[0]) || "default",
              phenomena,
              count: warningsForStation(row.station).length,
            };
          });
        }

        function collectMeteoMapStations() {
          const byStation = new Map();
          const ingest = (m, kind) => {
            if (!isSevereMonitorMessage(m)) return;
            const code = String(m.station || "").trim().toUpperCase();
            if (!code) return;
            const lv = messageCompanyLevel(m);
            if (!lv) return;
            const rank = companyLevelToRank(lv);
            const phen = messageMapLevelsOrdered(m);
            const cur = byStation.get(code);
            if (!cur) {
              byStation.set(code, {
                station: code,
                name: resolveAirportDisplayName(code),
                level: lv,
                rank,
                kind,
                layers: collapseMeteoMapLevelsByColor([...phen]),
              });
              return;
            }
            if (rank > cur.rank) {
              cur.level = lv;
              cur.rank = rank;
              cur.kind = kind;
              cur.layers = collapseMeteoMapLevelsByColor(mergeOrderedLevelLayers(phen, cur.layers));
            } else {
              cur.layers = collapseMeteoMapLevelsByColor(mergeOrderedLevelLayers(cur.layers, phen));
            }
          };
          getFilteredMessages().forEach((m) => ingest(m, "metar"));
          return [...byStation.values()];
        }

        function buildWarningMapMarkerData(stations, type) {
          const out = [];
          for (const row of stations) {
            const coord = resolveMapStationCoord(row.station);
            if (!coord) continue;
            const base = {
              name: row.station,
              station: row.station,
              displayName: row.name || row.station,
              value: [coord.lon, coord.lat, type === "alert" ? row.count || 1 : row.rank || 1],
              colorId: row.colorId,
              level: row.level,
              mapType: type,
              phenomena: row.phenomena,
            };
            if (type === "meteo") {
              base.itemStyle = {
                color: "rgba(0,0,0,0)",
                borderColor: METEO_LEVEL_COLORS[row.level] || "#94a3b8",
                borderWidth: 3,
              };
            }
            out.push(base);
          }
          return out;
        }

        function renderWarningMapLegend(alertCount, meteoCount, typhoonCount) {
          const el = document.getElementById("warningMapLegend");
          if (!el) return;
          const layer = warningMapState.layer;
          let html = "";
          html += `<div class="warning-map-legend-block">
            <div class="warning-map-legend-title">台风（西太平洋·${typhoonCount}）</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-line" style="background:#e6c94c"></i>实况路径（按段强度变色）</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-line warning-map-legend-line--forecast"></i>中央气象台预报（虚线）</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-pin" style="background:#e6c94c;border:2px solid #fff"></i>台风中心（菱形）</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-ring no-glow" style="border:2px solid rgba(230,201,76,0.8);background:rgba(230,201,76,0.12)"></i>7级风圈</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-ring no-glow" style="border:2px solid rgba(255,159,67,0.85);background:rgba(255,159,67,0.12)"></i>10级风圈</div>
            <div class="warning-map-legend-item"><i class="warning-map-legend-ring no-glow" style="border:2px solid rgba(255,71,87,0.85);background:rgba(255,71,87,0.12)"></i>12级风圈</div>
          </div>`;
          if (layer === "alert" || layer === "all") {
            html += `<div class="warning-map-legend-block">
              <div class="warning-map-legend-title">运行影响（${alertCount}）</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-nested"></i>套色圆点（内→外按警报顺序）</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#ff4757;background:#ff4757"></i>红：雷暴/热带气旋/冰雹/冻降水/冰粒/火山灰</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#a06e46;background:#a06e46"></i>棕：强地面风/沙暴/尘暴</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#e6c94c;background:#e6c94c"></i>黄：低能见度</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#ff9f43;background:#ff9f43"></i>橙：低云</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#2ee59d;background:#2ee59d"></i>绿：强降水</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#54a0ff;background:#54a0ff"></i>蓝：炎热/极寒</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-dot" style="color:#94a3b8;background:#94a3b8"></i>灰：雪/雨夹雪/米雪/冰晶</div>
            </div>`;
          }
          if (layer === "meteo" || layer === "all") {
            html += `<div class="warning-map-legend-block">
              <div class="warning-map-legend-title">恶劣提示（${meteoCount}）</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-tri" style="color:#ff4757"></i>套色三角（内→外按报文扫描顺序）</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-tri" style="color:#ff4757"></i>红档告警</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-tri" style="color:#e6c94c"></i>黄档告警</div>
              <div class="warning-map-legend-item"><i class="warning-map-legend-tri" style="color:#3dd68c"></i>绿档告警</div>
            </div>`;
          }
          el.innerHTML = html;
        }

        function syncWarningMapToolbarUi() {
          document.querySelectorAll("[data-warning-map-region]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-warning-map-region") === warningMapState.region);
          });
          document.querySelectorAll("[data-warning-map-layer]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-warning-map-layer") === warningMapState.layer);
          });
          const modeTag = document.getElementById("warningMapModeTag");
          if (modeTag) {
            const labels = { alert: "运行影响", meteo: "恶劣提示", all: "双图层" };
            modeTag.textContent = labels[warningMapState.layer] || "运行影响";
          }
          const foot = document.getElementById("warningMapFootHint");
          if (foot) {
            const base = warningMapState.readonly
              ? "态势展示模式（只读）"
              : "席位模式：点击机场圆点可查看生效警报与 METAR/TAF";
            foot.textContent = `${base} · 底图：国家天地图 · 台风：中央气象台（西北太平洋）`;
          }
        }

        async function renderWarningMap() {
          if (!warningMapChartEl) return;
          if (typeof L === "undefined") {
            warningMapChartEl.innerHTML =
              '<div class="hint" style="padding:24px">未加载 Leaflet 地图组件，请检查网络后重试。</div>';
            return;
          }
          await loadTiandituTk(false);
          if (!tiandituTkCache) {
            showWarningMapMissingKeyMessage();
            syncWarningMapToolbarUi();
            return;
          }
          await waitForWarningMapChartLayout();
          if (!ensureWarningMapLeaflet()) {
            showWarningMapMissingKeyMessage();
            return;
          }
          flyWarningMapToRegion();

          await syncWarningMapTyphoonSources(false);
          const typhoonItems = nmcTyphoonCache.items || [];

          const alertStations = collectAlertMapStations();
          const meteoStationsAll = collectMeteoMapStations();
          const alertSet = new Set(alertStations.map((s) => s.station));
          const meteoStations = meteoStationsAll.filter((s) => !alertSet.has(s.station));
          const layer = warningMapState.layer;

          const alertData = layer === "meteo" ? [] : alertStations;
          const meteoData = layer === "alert" ? [] : meteoStations;

          if (warningMapOverlayGroup) warningMapOverlayGroup.clearLayers();
          paintLeafletTyphoonLayers(typhoonItems);
          paintLeafletStationMarkers(alertData, meteoData);

          renderWarningMapLegend(alertData.length, meteoData.length, typhoonItems.length);
          const updatedTag = document.getElementById("warningMapUpdatedTag");
          if (updatedTag) {
            const typhoonNote = nmcTyphoonCache.error ? " · 台风拉取失败" : "";
            const ringCount = countTyphoonWindRings(typhoonItems);
            updatedTag.textContent = `更新 ${nowHHMM()} · 运行影响 ${alertData.length} · 恶劣提示 ${meteoData.length} · 台风 ${typhoonItems.length} · 风圈 ${ringCount}${typhoonNote}`;
          }
          syncWarningMapToolbarUi();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => syncWarningMapChartSize());
          });
        }

        async function syncWarningMapMeteoSources() {
          await loadFlightMonitorAirports().catch(() => {});
          if (!airportWhitelistIcao.size) await loadAirportWhitelist().catch(() => {});
          await loadWeatherStandards().catch(() => {});
          await loadMessages({ silent: true }).catch(() => {});
          reapplyMessageSeverity();
        }

        async function bootstrapWarningMapEmbedData() {
          if (!isWarningMapEmbed()) return;
          await loadSfApprovedAirports();
          await loadWarningPool();
          warningPool = dedupeWarningPoolItems(warningPool);
          if (warningMapState.layer !== "alert") {
            await syncWarningMapMeteoSources();
          }
          await renderWarningMap();
          startWarningMapAutoRefresh();
        }

        async function refreshWarningMapData(showToastOnDone = false) {
          await loadWarningPool();
          warningPool = dedupeWarningPoolItems(warningPool);
          if (warningMapState.layer !== "alert") {
            await syncWarningMapMeteoSources();
          }
          await syncWarningMapTyphoonSources(true);
          await renderWarningMap();
          if (showToastOnDone) {
            showToast("地图已刷新", `运行影响 ${collectAlertMapStations().length} 个机场`);
          }
        }

        function startWarningMapAutoRefresh() {
          if (warningMapAutoRefreshTimer) clearInterval(warningMapAutoRefreshTimer);
          warningMapAutoRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            refreshWarningMapData(false);
          }, 60 * 1000);
        }

        function bindWarningMapToolbar() {
          if (warningMapToolbarBound) return;
          warningMapToolbarBound = true;
          document.getElementById("warningMapRegionSeg")?.addEventListener("click", (e) => {
            const btn = /** @type {HTMLElement | null} */ (e.target.closest("[data-warning-map-region]"));
            if (!btn) return;
            warningMapState.region = btn.getAttribute("data-warning-map-region") || "china";
            syncWarningMapUrlParams();
            syncWarningMapToolbarUi();
            flyWarningMapToRegion();
          });
          document.getElementById("warningMapLayerSeg")?.addEventListener("click", async (e) => {
            const btn = /** @type {HTMLElement | null} */ (e.target.closest("[data-warning-map-layer]"));
            if (!btn) return;
            const next = btn.getAttribute("data-warning-map-layer") || "alert";
            if (next === warningMapState.layer) return;
            warningMapState.layer = next;
            syncWarningMapUrlParams();
            syncWarningMapToolbarUi();
            const updatedTag = document.getElementById("warningMapUpdatedTag");
            if (next !== "alert" && updatedTag) {
              updatedTag.textContent = "正在拉取报文监控数据…";
            }
            if (next !== "alert") {
              await syncWarningMapMeteoSources();
            }
            await renderWarningMap();
          });
          document.getElementById("warningMapTkBtn")?.addEventListener("click", () => {
            promptWarningMapTiandituTk();
          });
          document.getElementById("warningMapRefreshBtn")?.addEventListener("click", () => {
            refreshWarningMapData(true);
          });
          document.getElementById("warningMapCloseBtn")?.addEventListener("click", () => {
            window.close();
          });
        }

        function openWarningMapPopupWindow() {
          if (warningMapPopupWindow && !warningMapPopupWindow.closed) {
            warningMapPopupWindow.focus();
            return warningMapPopupWindow;
          }
          const url = new URL(window.location.href);
          url.searchParams.set("view", "monitor");
          url.searchParams.set("embed", "warning-map");
          url.searchParams.set("region", "china");
          url.searchParams.set("layer", "alert");
          url.searchParams.delete("readonly");
          const w = Math.round(window.screen.availWidth);
          const h = Math.round(window.screen.availHeight);
          const features = [
            "popup=yes",
            `width=${w}`,
            `height=${h}`,
            "left=0",
            "top=0",
            "menubar=no",
            "toolbar=no",
            "location=no",
            "status=no",
            "scrollbars=no",
            "resizable=yes",
          ].join(",");
          warningMapPopupWindow = window.open(url.toString(), "warning-map-popup", features);
          return warningMapPopupWindow;
        }

        async function initWarningMapEmbed() {
          if (!isWarningMapEmbed()) return;
          prepareWarningMapEmbedShell();
          await bootstrapWarningMapEmbedData();
        }


        function upsertWarningRecord(record) {
          const station = String(record.station || "").trim().toUpperCase();
          const phenomena = Array.isArray(record.phenomena)
            ? record.phenomena.map(String).filter(Boolean)
            : warningPhenomenaList(record);
          const key = warningItemDedupeKey({ station, phenomena, text: record.text });
          const idx = warningPool.findIndex((w) => warningItemDedupeKey(w) === key);
          const row = normalizeWarningItem({ ...record, station, phenomena });
          if (idx >= 0) {
            row.id = warningPool[idx].id;
            warningPool[idx] = row;
          } else {
            warningPool.unshift(row);
          }
          return row;
        }

        function readWarnDraft() {
          try {
            const raw = localStorage.getItem(WARN_DRAFT_KEY);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        }

        function writeWarnDraft() {
          try {
            localStorage.setItem(
              WARN_DRAFT_KEY,
              JSON.stringify({
                station: getWarnStationValue(),
                phenomena: getSelectedWarnPhenomena(),
                text: warnText?.value ?? "",
                isRevision: Boolean(warnIsRevision?.checked),
                isCancel: Boolean(warnIsCancel?.checked),
              })
            );
          } catch {
            /* ignore */
          }
        }

        function applyWarnDraft(draft) {
          if (!draft || typeof draft !== "object") return;
          populateWarnFormOptions();
          if (draft.station && warnStation) warnStation.value = normalizeWarnStationInput(draft.station);
          if (Array.isArray(draft.phenomena)) setSelectedWarnPhenomena(draft.phenomena);
          else if (draft.phenomenon) setSelectedWarnPhenomena([draft.phenomenon]);
          if (draft.text != null && warnText) warnText.value = draft.text;
          if (warnIsRevision) warnIsRevision.checked = Boolean(draft.isRevision);
          if (warnIsCancel) warnIsCancel.checked = Boolean(draft.isCancel);
          syncWarnRevisionDefault();
          syncWarnCancelUi();
        }

        function clearWarnFormContent() {
          if (warnStation) warnStation.value = "";
          setSelectedWarnPhenomena([]);
          if (warnText) warnText.value = "";
          if (warnIsRevision) warnIsRevision.checked = false;
          if (warnIsCancel) warnIsCancel.checked = false;
          syncWarnRevisionDefault();
          syncWarnCancelUi();
          try {
            localStorage.removeItem(WARN_DRAFT_KEY);
          } catch {
            /* ignore */
          }
        }

        function clearPeriodForecastContent() {
          if (!periodForecastBodiesCache) periodForecastBodiesCache = emptyPeriodBodies();
          periodForecastBodiesCache = emptyPeriodBodies();
          renderPeriodForecastEditorPanel();
          persistPeriodForecastDraft();
        }

        function clearWeatherBrushContent() {
          if (weatherBrushText) weatherBrushText.value = "";
          try {
            localStorage.removeItem(WEATHER_BRUSH_DRAFT_KEY);
          } catch {
            /* ignore */
          }
        }

        /** 精细化告警弹出独立浏览器窗口（可拖到其它物理屏幕，类似微信图片预览） */
        function openRefinedPopupWindow(kind, opts = {}) {
          const key = kind === "taf" ? "taf" : "metar";
          const existing = refinedPopupWindows[key];
          if (existing && !existing.closed) {
            existing.focus();
            return existing;
          }
          const url = new URL(window.location.href);
          url.searchParams.set("view", "monitor");
          url.searchParams.set("popup", key === "taf" ? "taf-refined" : "metar-refined");
          const w = Math.round(opts.width || Math.min(1280, window.screen.availWidth - 48));
          const h = Math.round(opts.height || Math.min(920, window.screen.availHeight - 48));
          const left = Math.round(
            opts.left ?? Math.max(0, window.screen.availLeft + (window.screen.availWidth - w) / 2),
          );
          const top = Math.round(
            opts.top ?? Math.max(0, window.screen.availTop + (window.screen.availHeight - h) / 2),
          );
          const features = [
            "popup=yes",
            `width=${w}`,
            `height=${h}`,
            `left=${left}`,
            `top=${top}`,
            "menubar=no",
            "toolbar=no",
            "location=no",
            "status=no",
            "scrollbars=yes",
            "resizable=yes",
          ].join(",");
          const win = window.open(url.toString(), `refined-${key}-popup`, features);
          refinedPopupWindows[key] = win;
          return win;
        }

        function popRefinedToExternalWindow(kind, screenX, screenY) {
          openRefinedPopupWindow(kind, {
            left: Math.max(0, (screenX || window.screen.availLeft + 80) - 120),
            top: Math.max(0, (screenY || window.screen.availTop + 80) - 36),
          });
          if (kind === "taf") closeTafRefinedModal();
          else closeMetarRefinedModal();
        }

        function initRefinedModalPopoutDrag(backdrop, kind) {
          const modal = backdrop?.querySelector(".metar-refined-modal");
          const handle = modal?.querySelector(".refined-modal-drag-handle");
          if (!backdrop || !modal || !handle || document.body.classList.contains("refined-popup-window")) return;
          let dragging = false;
          let startX = 0;
          let startY = 0;
          let popped = false;
          handle.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            if (/** @type {HTMLElement} */ (e.target).closest("button")) return;
            dragging = true;
            popped = false;
            startX = e.clientX;
            startY = e.clientY;
            handle.classList.add("is-dragging");
            document.body.style.userSelect = "none";
            e.preventDefault();
          });
          window.addEventListener("mousemove", (e) => {
            if (!dragging || popped) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (dx * dx + dy * dy < 64) return;
            popped = true;
            popRefinedToExternalWindow(kind, e.screenX, e.screenY);
          });
          window.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove("is-dragging");
            document.body.style.userSelect = "";
          });
        }

        async function initPopupFromUrl() {
          const params = new URLSearchParams(window.location.search);
          const popup = (params.get("popup") || "").trim().toLowerCase();
          if (popup !== "metar-refined" && popup !== "taf-refined") return;
          document.body.classList.add("refined-popup-window");
          if (getView() !== "monitor") applyView("monitor");
          await loadFlightMonitorAirports();
          if (popup === "metar-refined") {
            await loadMessages({ silent: true });
            await ensureMetarRefinedReady();
            openMetarRefinedModal();
          } else {
            await loadTafMessages({ silent: true });
            await ensureTafRefinedReady();
            openTafRefinedModal();
          }
        }

        function warningLineHtml(w) {
          const station = escapeHtml(w.station || "");
          const label = escapeHtml(warningPhenomenaLabel(w));
          const prefix = w.isRevision ? "更新" : "";
          return `${prefix}【${label}】${station}天气警报：${escapeHtml(w.text)}`;
        }

        function syncWarningMarqueePause() {
          if (!warningTickerZone) return;
          if (warningMarqueePausedByModal || warningMarqueePausedByHover) {
            warningTickerZone.classList.add("marquee-paused");
          } else {
            warningTickerZone.classList.remove("marquee-paused");
          }
        }

        function warningsForStation(station) {
          const code = String(station || "").trim().toUpperCase();
          return warningPool.filter((w) => String(w.station || "").toUpperCase() === code);
        }

        /** 按预警正文关键词着色（多类并存时取优先级最高） */
        const WARNING_PHENOMENON_RULES = [
          { id: "red", rank: 1, label: "雷暴/冻降水/冰粒", keywords: ["雷暴", "冻降水", "冻雨", "冰粒", "冰雹", "小雹", "霰", "热带气旋", "火山灰", "雷雨"] },
          {
            id: "brown",
            rank: 2,
            label: "强地面风/阵风/沙暴/尘暴",
            keywords: ["强地面风", "阵风", "沙暴", "尘暴", "沙尘", "大风"],
          },
          { id: "orange", rank: 3, label: "低云", keywords: ["低云"] },
          { id: "yellow", rank: 4, label: "低能见度", keywords: ["低能见度", "低能见"] },
          { id: "gray", rank: 5, label: "雪/雨夹雪", keywords: ["雨夹雪", "米雪", "冰晶", "大雪", "中雪", "小雪", "阵雪", "降雪", "雪"] },
          { id: "green", rank: 6, label: "强降水", keywords: ["强降水"] },
        ];

        function matchWarningPhenomenonCategory(text) {
          const blob = String(text || "");
          let best = null;
          for (const rule of WARNING_PHENOMENON_RULES) {
            if (rule.keywords.some((kw) => blob.includes(kw))) {
              if (!best || rule.rank < best.rank) best = rule;
            }
          }
          return best;
        }

        function warningTextBlob(w) {
          return `${warningPhenomenaLabel(w)}${w.text || ""}`;
        }

        function colorIdForPhenomenon(name) {
          const p = String(name || "");
          if (PHENOMENON_COLOR_ID[p]) return PHENOMENON_COLOR_ID[p];
          return matchWarningPhenomenonCategory(p)?.id || null;
        }

        function bestColorIdForPhenomena(phenomena) {
          let bestId = "";
          let bestRank = 999;
          for (const p of phenomena) {
            const colorId = colorIdForPhenomenon(p);
            if (!colorId) continue;
            const rule = WARNING_PHENOMENON_RULES.find((r) => r.id === colorId);
            const rank = rule ? rule.rank : 99;
            if (rank < bestRank) {
              bestRank = rank;
              bestId = colorId;
            }
          }
          return bestId;
        }

        function warningItemClass(w) {
          const colorId = bestColorIdForPhenomena(warningPhenomenaList(w)) || matchWarningPhenomenonCategory(warningTextBlob(w))?.id;
          return colorId ? `wx-cat-${colorId}` : "wx-cat-default";
        }

        function airportItemClass(station) {
          const all = [];
          for (const w of warningsForStation(station)) all.push(...warningPhenomenaList(w));
          const colorId = bestColorIdForPhenomena(all);
          return colorId ? `wx-cat-${colorId}` : "wx-cat-default";
        }

        function latestMetarForStation(icao) {
          const code = String(icao || "").trim().toUpperCase();
          return lastMessages.find((m) => String(m.station || "").toUpperCase() === code) || null;
        }

        function latestTafForStation(icao) {
          const code = String(icao || "").trim().toUpperCase();
          return lastTafMessages.find((m) => String(m.station || "").toUpperCase() === code) || null;
        }

        function renderWarningAirportList() {
          if (!warningAirportList) return;
          const stations = [...new Set(warningPool.map((w) => String(w.station || "").toUpperCase()).filter(Boolean))].sort();
          if (!stations.length) {
            warningAirportList.innerHTML = '<div class="hint" style="grid-column:1/-1;padding:8px 4px;font-size:12px">暂无生效预警机场</div>';
            return;
          }
          warningAirportList.innerHTML = stations
            .map((icao) => {
              const sample = warningsForStation(icao)[0];
              const name = sample?.airportName || icao;
              const headlines = warningsForStation(icao).map((w) => `【${warningPhenomenaLabel(w)}】`).join("");
              const typeHint = headlines ? ` · ${headlines}` : "";
              return `<button type="button" class="airport-item ${airportItemClass(icao)}" data-station="${escapeHtml(icao)}" title="${escapeHtml(name)}${escapeHtml(typeHint)}">${escapeHtml(icao)}</button>`;
            })
            .join("");
        }

        function renderWarningAirportModalBody(station, opts) {
          if (!warningAirportModalBody) return;
          const code = String(station || "").trim().toUpperCase();
          const items = warningsForStation(code);
          const sample = items[0];
          const name = sample?.airportName || code;
          const loading = Boolean(opts?.loading);
          const fetchError = opts?.fetchError ? String(opts.fetchError) : "";
          const partialError = opts?.partialError ? String(opts.partialError) : "";
          let metar = opts?.metar !== undefined ? opts.metar : null;
          let taf = opts?.taf !== undefined ? opts.taf : null;
          if (loading) {
            metar = null;
            taf = null;
          }
          const sfFocMsgMeta = (row, kind) => {
            if (!row || row.source !== "sf-foc") return "";
            const label = kind === "taf" ? "预报" : "观测";
            return `${label} ${escapeHtml(row.time || "—")}${row.receivedAt ? " · 入库 " + escapeHtml(row.receivedAt) : ""} · 公司 FOC`;
          };
          const sfFocMissMeta = () => escapeHtml(fetchError || partialError || sfFocAccessHint());
          if (warningAirportModalTitle) {
            warningAirportModalTitle.textContent = `${code} · ${name}`;
          }
          const listScrollClass = items.length > 3 ? " warning-modal-list--scroll" : "";
          const alertsHtml = items.length
            ? items
                .map(
                  (w) => `
              <div class="warning-pop-row">
                <div class="warning-pop-text">${warningLineHtml(w)}</div>
                <div class="warning-pop-time">发布时间：${escapeHtml(w.time)}</div>
              </div>
            `
                )
                .join("")
            : '<p class="hint" style="margin:0">该机场当前无生效警报。</p>';
          const metarBody = loading
            ? "正在从公司气象接口拉取 METAR…"
            : metar
              ? escapeHtml(metar.raw)
              : fetchError
                ? `暂无 METAR（${escapeHtml(fetchError)}）`
                : "暂无最新 METAR";
          const tafBody = loading
            ? "正在从公司气象接口拉取 TAF…"
            : taf
              ? escapeHtml(taf.raw)
              : fetchError
                ? `暂无 TAF（${escapeHtml(fetchError)}）`
                : "暂无最新 TAF";
          const metarMeta = loading ? "正在拉取公司 FOC 实况…" : sfFocMsgMeta(metar, "metar") || sfFocMissMeta();
          const tafMeta = loading ? "正在拉取公司 FOC 预报…" : sfFocMsgMeta(taf, "taf") || sfFocMissMeta();
          warningAirportModalBody.innerHTML = `
            <div class="warning-airport-split">
              <div class="warning-airport-msg-pane">
                <div class="warning-pop-title">最新报文</div>
                <div class="warning-airport-msg-block">
                  <div class="warning-airport-msg-label">METAR</div>
                  <pre class="warning-airport-msg-raw">${metarBody}</pre>
                  <div class="warning-airport-msg-meta">${metarMeta}</div>
                </div>
                <div class="warning-airport-msg-block">
                  <div class="warning-airport-msg-label">TAF</div>
                  <pre class="warning-airport-msg-raw">${tafBody}</pre>
                  <div class="warning-airport-msg-meta">${tafMeta}</div>
                </div>
              </div>
              <div class="warning-airport-alert-pane">
                <div class="warning-pop-title">生效警报${items.length ? `（${items.length}条）` : ""}</div>
                <div class="warning-modal-list${listScrollClass}">${alertsHtml}</div>
              </div>
            </div>
          `;
        }

        async function openWarningAirportModal(station) {
          const code = String(station || "").trim().toUpperCase();
          renderWarningAirportModalBody(code, { loading: true });
          warningAirportBackdrop?.classList.add("is-open");
          warningAirportBackdrop?.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          warningMarqueePausedByModal = true;
          syncWarningMarqueePause();
          try {
            const { metar, taf, partialError } = await fetchSfFocLatestForAirport(code);
            renderWarningAirportModalBody(code, { metar, taf, partialError });
          } catch (e) {
            renderWarningAirportModalBody(code, {
              metar: null,
              taf: null,
              fetchError: formatSfFocFetchError(e),
            });
          }
        }

        function closeWarningAirportModal() {
          warningAirportBackdrop?.classList.remove("is-open");
          warningAirportBackdrop?.setAttribute("aria-hidden", "true");
          if (!warningModalBackdrop?.classList.contains("is-open")) {
            document.body.style.overflow = "";
            warningMarqueePausedByModal = false;
            syncWarningMarqueePause();
          }
        }

        function renderWarningModalBody() {
          if (!warningModalBody) return;
          const n = warningPool.length;
          if (warningModalTitle) warningModalTitle.textContent = `全部生效预警（${n}条）`;
          const listScrollClass = n > 5 ? " warning-modal-list--scroll" : "";
          warningModalBody.innerHTML = `
            <div class="warning-pop-title">以下为当前生效的预警全文</div>
            <div class="warning-modal-list${listScrollClass}">
            ${warningPool
              .map(
                (w) => `
              <div class="warning-pop-row">
                <div class="warning-pop-text">${warningLineHtml(w)}（发布时间：${escapeHtml(w.time)}）</div>
              </div>
            `
              )
              .join("")}
            </div>
          `;
        }

        function openWarningModal() {
          renderWarningModalBody();
          warningModalBackdrop?.classList.add("is-open");
          warningModalBackdrop?.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          warningMarqueePausedByModal = true;
          syncWarningMarqueePause();
        }

        function closeWarningModal() {
          warningModalBackdrop?.classList.remove("is-open");
          warningModalBackdrop?.setAttribute("aria-hidden", "true");
          warningMarqueePausedByModal = false;
          syncWarningMarqueePause();
          if (!warningAirportBackdrop?.classList.contains("is-open")) {
            document.body.style.overflow = "";
          }
        }

        function syncWarningMarqueeMotion() {
          if (!warningMarqueeTrack || !warningMarqueeViewport) return;
          const measure = () => {
            const viewH = warningMarqueeViewport.clientHeight;
            const trackH = warningMarqueeTrack.scrollHeight;
            const n = warningPool.length;
            const duplicated = n > 0 && warningMarqueeTrack.dataset.marqueeDup === "1";
            const contentH = duplicated ? trackH / 2 : trackH;
            if (n === 0 || contentH <= 4) {
              warningMarqueeTrack.classList.add("marquee-static");
              warningMarqueeTrack.style.animation = "none";
              warningMarqueeTrack.style.removeProperty("--marquee-end");
              return;
            }
            if (contentH <= viewH + 2) {
              warningMarqueeTrack.classList.add("marquee-static");
              warningMarqueeTrack.style.animation = "none";
              warningMarqueeTrack.style.removeProperty("--marquee-end");
              return;
            }
            if (!duplicated) {
              warningMarqueeTrack.innerHTML = warningMarqueeTrack.innerHTML + warningMarqueeTrack.innerHTML;
              warningMarqueeTrack.dataset.marqueeDup = "1";
              requestAnimationFrame(measure);
              return;
            }
            warningMarqueeTrack.classList.remove("marquee-static");
            warningMarqueeTrack.style.setProperty("--marquee-end", `${-contentH}px`);
            const sec = Math.max(12, Math.round((contentH / Math.max(viewH, 1)) * 4.5));
            warningMarqueeTrack.style.setProperty("--marquee-duration", `${sec}s`);
            warningMarqueeTrack.style.animation = "";
          };
          requestAnimationFrame(() => requestAnimationFrame(measure));
        }

        function renderWarningPanel() {
          if (!warningMarqueeTrack) return;
          renderWarningAirportList();
          const blocks = warningPool
            .map(
              (w) => `
                <div class="warning-item">
                  <div class="text">${warningLineHtml(w)}（发布时间：${escapeHtml(w.time)}）</div>
                </div>
              `
            )
            .join("");
          const n = warningPool.length;
          warningMarqueeTrack.dataset.marqueeDup = "0";
          if (!n) {
            warningMarqueeTrack.innerHTML = `<div class="hint" style="padding:12px;text-align:center">暂无生效预警</div>`;
            warningMarqueeTrack.classList.add("marquee-static");
            warningMarqueeTrack.style.animation = "none";
            if (isWarningMapOpen()) renderWarningMap().catch(() => {});
            return;
          }
          warningMarqueeTrack.innerHTML = blocks;
          syncWarningMarqueeMotion();
          if (isWarningMapOpen()) renderWarningMap().catch(() => {});
        }

        function addShortWarningFromApproved(item) {
          if (item.publishType !== "weather") return;
          const station = String(item.station || "ZBAA").trim().toUpperCase();
          const phenomena = Array.isArray(item.phenomena)
            ? item.phenomena
            : String(item.phenomenon || item.type || "天气预警")
                .split("、")
                .map((s) => s.trim())
                .filter(Boolean);
          upsertWarningRecord({
            station,
            airportName: item.airportName || resolveAirportDisplayName(station),
            phenomena,
            text: `${item.text}${item.receiver && item.receiver !== "—" ? `（接收对象：${item.receiver}）` : ""}`,
            time: nowHHMM(),
            publishedAt: new Date().toISOString(),
            publishedBy: getAccountDisplayName(),
          });
          persistWarningPool().then(() => renderWarningPanel());
        }

        function approveItem(id) {
          const idx = reviewItems.findIndex((x) => x.id === id && x.status === "pending");
          if (idx === -1) return;
          reviewItems[idx].status = "approved";
          addShortWarningFromApproved(reviewItems[idx]);
          renderPending();
        }

        function rejectItem(id) {
          const idx = reviewItems.findIndex((x) => x.id === id && x.status === "pending");
          if (idx === -1) return;
          reviewItems[idx].status = "rejected";
          renderPending();
        }

        // ----- Interactions -----
        accountSelect?.addEventListener("change", () => {
          renderWeatherNav();
          showToast("账号已切换", `当前：${accountSelect.options[accountSelect.selectedIndex]?.textContent || getAccount()}`);
        });

        wxNavAddBtn?.addEventListener("click", () => {
          wxNavAddForm?.classList.toggle("is-open");
        });
        cancelFavBtn?.addEventListener("click", () => {
          wxNavAddForm?.classList.remove("is-open");
        });
        saveFavBtn?.addEventListener("click", () => {
          const name = favName?.value?.trim();
          const url = favUrl?.value?.trim();
          if (!name || !url) {
            showToast("未保存", "请填写站点名称与 URL。");
            return;
          }
          const list = loadFavs();
          list.unshift({ name, url });
          saveFavs(list);
          if (favName) favName.value = "";
          if (favUrl) favUrl.value = "";
          wxNavAddForm?.classList.remove("is-open");
          wxNavActiveCat = "favorites";
          renderWeatherNav();
          showToast("收藏已添加", name);
        });
        resetFavBtn?.addEventListener("click", () => {
          saveFavs([]);
          renderWeatherNav();
          showToast("收藏已重置", "仅影响当前账号。");
        });

        wxNavSearch?.addEventListener("input", () => renderWeatherNav());
        wxNavCats?.addEventListener("click", (e) => {
          const btn = /** @type {HTMLElement | null} */ (e.target.closest("[data-wx-cat]"));
          if (!btn) return;
          wxNavActiveCat = btn.getAttribute("data-wx-cat") || "pinned";
          renderWeatherNav();
        });
        wxNavGrid?.addEventListener("click", (e) => {
          const star = /** @type {HTMLElement | null} */ (e.target.closest("[data-wx-star]"));
          if (star) {
            e.stopPropagation();
            const url = star.getAttribute("data-wx-star") || "";
            const card = star.closest("[data-wx-name]");
            const name = card?.getAttribute("data-wx-name") || "";
            addWxNavFavorite(url, name);
            return;
          }
          const card = /** @type {HTMLElement | null} */ (e.target.closest("[data-wx-open]"));
          if (!card) return;
          openWxNavSite(card.getAttribute("data-wx-open") || "", card.getAttribute("data-wx-name") || "");
        });
        wxNavGrid?.addEventListener("keydown", (e) => {
          const card = /** @type {HTMLElement | null} */ (e.target.closest("[data-wx-open]"));
          if (!card || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          openWxNavSite(card.getAttribute("data-wx-open") || "", card.getAttribute("data-wx-name") || "");
        });

        function openSiteNewTab(url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }

        openHomeViewBtn?.addEventListener("click", () => navigateToView("home"));
        openMonitorViewBtn?.addEventListener("click", () => openScreenInNewTab("monitor"));
        openActionViewBtn?.addEventListener("click", () => openScreenInNewTab("action"));
        openAnalysisViewBtn?.addEventListener("click", () => openScreenInNewTab("analysis"));
        window.addEventListener("popstate", () => setViewFromUrl());
        window.addEventListener("hashchange", () => setViewFromUrl());
        launchMonitorBtn?.addEventListener("click", () => navigateToScreen("monitor"));
        launchActionBtn?.addEventListener("click", () => navigateToScreen("action"));
        launchAnalysisBtn?.addEventListener("click", () => navigateToScreen("analysis"));
        logoutBtn?.addEventListener("click", () => {
          localStorage.removeItem("wx_auth_user");
          window.location.href = "./login.html";
        });

        // Role switch toggles audit buttons
        roleSelect?.addEventListener("change", () => {
          setRoleHint(roleSelect.value);
        });

        submitForReviewBtn?.addEventListener("click", () => publishWarningNow());

        // Chat: placeholder send (append message only)
        function sendChat() {
          const v = chatInput.value.trim();
          if (!v) return;
          const userMsg = document.createElement("div");
          userMsg.className = "msg user";
          userMsg.textContent = v;
          chatLog.appendChild(userMsg);

          const aiMsg = document.createElement("div");
          aiMsg.className = "msg ai";
          aiMsg.textContent = "AI：占位回复（此处可接入实际模型/业务接口）。";
          chatLog.appendChild(aiMsg);

          chatInput.value = "";
          chatLog.scrollTop = chatLog.scrollHeight;
        }
        sendBtn?.addEventListener("click", sendChat);
        chatInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") sendChat();
        });

        function randomPick(arr) {
          return arr[Math.floor(Math.random() * arr.length)];
        }

        const ELEM_AIRPORT_NAMES = {
          ZBAA: "北京首都",
          ZBTJ: "天津滨海",
          ZBSJ: "石家庄",
          ZBHH: "呼和浩特",
          ZBYN: "太原",
          ZLXY: "西安咸阳",
          ZUUU: "成都天府",
          ZSPD: "上海浦东",
          ZGGG: "广州白云",
        };

        function seedFromIcao(s) {
          let h = 0;
          for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
          return Math.abs(h) || 1;
        }

        function seededNoise(seed, i) {
          const x = Math.sin((seed * 0.017 + i) * 12.9898) * 43758.5453;
          return x - Math.floor(x);
        }

        /** 预报时长（小时），步长见 FORECAST_STEP_HOURS；接入模式数据后保持与 pts 一致即可 */
        const FORECAST_MAX_HOURS = 120;
        const FORECAST_STEP_HOURS = 2;

        /** 是否请求 Open-Meteo（免费、免密钥） https://open-meteo.com/en/docs */
        const USE_OPEN_METEO = true;
        /** 未命中自建表/本地 JSON 时，用 Open-Meteo 地理编码按 ICAO 查机场（多数四字码可直接命中） */
        const USE_OPEN_METEO_GEOCODE = true;
        const OPEN_METEO_FORECAST_HOURS = 144;
        const OPEN_METEO_GEO_CACHE_KEY = "wm_openmeteo_icao_geo_v1";

        /**
         * 自建 ICAO→经纬度（优先级最高，可覆盖地理编码格点）
         * 亦可维护同目录 icao-airport-overrides.json（可用 tools/build_icao_overrides.py 从 OurAirports 生成）
         */
        const AIRPORT_COORDS = {
          ZBAA: [40.0801, 116.5846],
          ZBTJ: [39.1244, 117.3464],
          ZBSJ: [38.2807, 114.6973],
          ZBHH: [40.8514, 111.8241],
          ZBYN: [37.7469, 112.6284],
          ZLXY: [34.4471, 108.7516],
          ZUUU: [30.5785, 103.9471],
          ZSPD: [31.1443, 121.8083],
          ZGGG: [23.3924, 113.2988],
        };

        /** @type {Map<string, { lat: number, lon: number }>} */
        const icaoGeoMemoryCache = new Map();

        /** @type {Promise<Record<string, [number, number] | { lat: number; lon: number }>> | null} */
        let icaoFileOverridesPromise = null;

        function loadIcaoFileOverrides() {
          if (!icaoFileOverridesPromise) {
            icaoFileOverridesPromise = fetch(new URL("icao-airport-overrides.json", window.location.href), {
              cache: "no-store",
            })
              .then((r) => (r.ok ? r.json() : {}))
              .catch(() => ({}));
          }
          return icaoFileOverridesPromise;
        }

        function readGeoCache() {
          try {
            const raw = sessionStorage.getItem(OPEN_METEO_GEO_CACHE_KEY);
            if (!raw) return {};
            const o = JSON.parse(raw);
            return typeof o === "object" && o ? o : {};
          } catch {
            return {};
          }
        }

        function writeGeoCacheEntry(icao, lat, lon) {
          try {
            const o = readGeoCache();
            o[icao] = { lat, lon, t: Date.now() };
            sessionStorage.setItem(OPEN_METEO_GEO_CACHE_KEY, JSON.stringify(o));
          } catch {
            /* 隐私模式等 */
          }
        }

        function normalizeOverrideEntry(v) {
          if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
            return { lat: v[0], lon: v[1] };
          }
          if (v && typeof v === "object" && Number.isFinite(v.lat) && Number.isFinite(v.lon)) {
            return { lat: v.lat, lon: v.lon };
          }
          return null;
        }

        /**
         * 解析 ICAO → 经纬度：自建表 → icao-airport-overrides.json → sessionStorage/内存缓存 → Open-Meteo Geocoding
         * 地理编码文档：https://open-meteo.com/en/docs/geocoding-api
         * @returns {Promise<{ lat: number, lon: number, coordSource: "local"|"cache"|"online" } | null>}
         */
        async function resolveAirportLatLon(icao) {
          const table = AIRPORT_COORDS[icao];
          if (table) {
            const n = normalizeOverrideEntry(table);
            if (n) return { ...n, coordSource: "local" };
          }

          const sf = sfApprovedAirportsMap.get(icao);
          if (sf && Number.isFinite(sf.lat) && Number.isFinite(sf.lon)) {
            const n = { lat: sf.lat, lon: sf.lon };
            icaoGeoMemoryCache.set(icao, n);
            return { ...n, coordSource: "local" };
          }

          const fileMap = await loadIcaoFileOverrides();
          const fromFile = fileMap && fileMap[icao] != null ? normalizeOverrideEntry(fileMap[icao]) : null;
          if (fromFile) {
            icaoGeoMemoryCache.set(icao, fromFile);
            return { ...fromFile, coordSource: "local" };
          }

          const cached = readGeoCache()[icao];
          if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
            const c = { lat: cached.lat, lon: cached.lon };
            icaoGeoMemoryCache.set(icao, c);
            return { ...c, coordSource: "cache" };
          }

          const mem = icaoGeoMemoryCache.get(icao);
          if (mem) return { ...mem, coordSource: "cache" };

          if (!USE_OPEN_METEO_GEOCODE) return null;

          const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
          geoUrl.searchParams.set("name", icao);
          geoUrl.searchParams.set("count", "10");
          const geoRes = await fetch(geoUrl.toString(), { cache: "no-store" });
          if (!geoRes.ok) return null;
          const geoData = await geoRes.json();
          const results = Array.isArray(geoData.results) ? geoData.results : [];
          const airp = results.find((r) => r.feature_code === "AIRP");
          const pick = airp || results[0];
          if (!pick || !Number.isFinite(pick.latitude) || !Number.isFinite(pick.longitude)) return null;
          const out = { lat: pick.latitude, lon: pick.longitude };
          icaoGeoMemoryCache.set(icao, out);
          writeGeoCacheEntry(icao, out.lat, out.lon);
          return { ...out, coordSource: "online" };
        }

        /** @type {typeof resolveAirportLatLon} */
        const resolveIcaoCoord = resolveAirportLatLon;

        /**
         * @returns {Promise<{ pts: Array<{h:number,temp:number,wind:number,gust:number,precip:number,cloud:number,pressure:number,windDir:number}>, startUtcMs: number } | null>}
         */
        async function fetchOpenMeteoForecast(latitude, longitude, model = "auto") {
          const hourly = [
            "temperature_2m",
            "precipitation",
            "cloud_cover",
            "pressure_msl",
            "wind_speed_10m",
            "wind_direction_10m",
            "wind_gusts_10m",
          ].join(",");
          const url = new URL("https://api.open-meteo.com/v1/forecast");
          url.searchParams.set("latitude", String(latitude));
          url.searchParams.set("longitude", String(longitude));
          url.searchParams.set("hourly", hourly);
          url.searchParams.set("wind_speed_unit", "ms");
          url.searchParams.set("forecast_hours", String(OPEN_METEO_FORECAST_HOURS));
          url.searchParams.set("timezone", "auto");
          if (model === "gfs") url.searchParams.set("models", "gfs_seamless");
          if (model === "ecmwf") url.searchParams.set("models", "ecmwf_ifs04");
          const res = await fetch(url.toString(), { cache: "no-store" });
          if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
          const data = await res.json();
          const H = data.hourly;
          if (!H?.time?.length) return null;
          const t0 = new Date(H.time[0]).getTime();
          if (!Number.isFinite(t0)) return null;
          const pts = [];
          const n = H.time.length;
          const maxH = Math.min(FORECAST_MAX_HOURS, n - 1);
          for (let h = 0; h <= maxH; h += FORECAST_STEP_HOURS) {
            const i = h;
            const temp = H.temperature_2m[i];
            const wind = H.wind_speed_10m[i] ?? 0;
            let gust = H.wind_gusts_10m[i];
            if (gust == null || Number.isNaN(gust)) gust = wind * 1.15;
            const precip = H.precipitation[i] ?? 0;
            const cloud = H.cloud_cover[i] ?? 0;
            const pressure = H.pressure_msl[i] ?? 1013;
            const windDir = H.wind_direction_10m[i] ?? 0;
            if (temp == null) continue;
            pts.push({
              h,
              temp: Number(temp),
              wind: Math.max(0, Number(wind)),
              gust: Math.max(0, Number(gust)),
              precip: Math.max(0, Number(precip)),
              cloud: Math.min(100, Math.max(0, Number(cloud))),
              pressure: Number(pressure),
              windDir: ((Number(windDir) % 360) + 360) % 360,
            });
          }
          return pts.length >= 2 ? { pts, startUtcMs: t0 } : null;
        }

        /** 模拟多要素序列（Open-Meteo 失败或未配置机场时回退） */
        function mockForecastSeries(icao) {
          const seed = seedFromIcao(icao);
          const pts = [];
          for (let h = 0; h <= FORECAST_MAX_HOURS; h += FORECAST_STEP_HOURS) {
            const n1 = seededNoise(seed, h);
            const n2 = seededNoise(seed, h + 19);
            const n3 = seededNoise(seed, h + 37);
            const base = 14 + 9 * Math.sin(h / 28) + (n1 - 0.5) * 4;
            const wind = Math.max(0, 2 + 8 * Math.abs(Math.sin(h / 20)) + n2 * 2.5);
            const gust = wind + 2 + n3 * 4;
            const precip = n2 > 0.85 ? Math.max(0, n3 * n3 * 12) : 0;
            const cloud = Math.max(0, Math.min(100, 35 + 45 * Math.sin(h / 18) + (n1 - 0.5) * 22));
            const pressure = 1012 + 0.45 * Math.sin(h / 32) + (n2 - 0.5) * 3;
            const windDir = ((h * 17 + seed) % 360 + 360) % 360;
            pts.push({ h, temp: base, wind, gust, precip, cloud, pressure, windDir });
          }
          return pts;
        }

        /** @type {"simple"|"full"} */
        let windyElementMode = "simple";
        /** @type {"auto"|"gfs"|"ecmwf"} */
        let openMeteoModel = "auto";
        /** @type {{ code: string, name: string, pts: any[], source: "open-meteo"|"mock", forecastAnchorUtcMs: number, model: "auto"|"gfs"|"ecmwf", coordSource: "local"|"cache"|"online"|"none" } | null} */
        let lastWindyForecast = null;
        let elemForecastHoverPts = null;
        /** @type {{ W: number, H: number, padL: number, padT: number, padB: number, x0: number, plotW: number, maxHour: number, full: boolean, anchorUtcMs: number } | null} */
        let elemForecastHoverLayout = null;
        let elemForecastDragging = false;

        function utcHourStartMs() {
          return Math.floor(Date.now() / 3600000) * 3600000;
        }

        const UTC_WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

        /** @param {number} ms */
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

        /** 横轴主刻度（6h）：中文星期 + 月-日 / 时:分 两行 */
        /** @param {number} ms */
        function formatUtcAxisZhTwoLine(ms) {
          const d = new Date(ms);
          const wdz = UTC_WEEKDAY_ZH[d.getUTCDay()];
          const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
          const day = String(d.getUTCDate()).padStart(2, "0");
          const hh = d.getUTCHours();
          return { line1: `周${wdz} ${mo}-${day}`, line2: `${hh}` };
        }

        /** 横轴辅刻度（3h 但非 6h）：仅时:分，减轻拥挤 */
        /** @param {number} ms */
        function formatUtcAxisZhTimeOnly(ms) {
          const d = new Date(ms);
          return `${d.getUTCHours()}`;
        }

        /**
         * 二次贝塞尔平滑（相比普通折线更柔和，且较少过冲）
         * @param {{x:number,y:number}[]} pts
         */
        function smoothCatmullPathD(pts) {
          const n = pts.length;
          if (n < 2) return "";
          if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
          let d = `M ${pts[0].x} ${pts[0].y}`;
          for (let i = 1; i < n - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            d += ` Q ${pts[i].x} ${pts[i].y}, ${midX} ${midY}`;
          }
          d += ` Q ${pts[n - 1].x} ${pts[n - 1].y}, ${pts[n - 1].x} ${pts[n - 1].y}`;
          return d;
        }


        function hideElemForecastTooltip() {
          const tip = document.getElementById("elemForecastTooltip");
          if (tip) {
            tip.classList.remove("is-visible");
            tip.innerHTML = "";
            tip.style.borderColor = "";
            tip.style.boxShadow = "";
          }
          document.getElementById("elemForecastVLine")?.setAttribute("visibility", "hidden");
        }

        function bindElemForecastHover() {
          const hit = document.getElementById("elemForecastHitLayer");
          const svg = document.getElementById("elemForecastSvg");
          const tip = document.getElementById("elemForecastTooltip");
          const wrap = document.getElementById("elemForecastChartWrap");
          if (!hit || !svg || !tip || !wrap) return;
          if (!wrap.dataset.dragPanBound) {
            wrap.dataset.dragPanBound = "1";
            let startX = 0;
            let startScrollLeft = 0;
            const stopDrag = () => {
              if (!elemForecastDragging) return;
              elemForecastDragging = false;
              wrap.classList.remove("is-dragging");
            };
            wrap.addEventListener("mousedown", (e) => {
              if (e.button !== 0) return;
              elemForecastDragging = true;
              startX = e.clientX;
              startScrollLeft = wrap.scrollLeft;
              wrap.classList.add("is-dragging");
              hideElemForecastTooltip();
              e.preventDefault();
            });
            window.addEventListener("mousemove", (e) => {
              if (!elemForecastDragging) return;
              const dx = e.clientX - startX;
              wrap.scrollLeft = startScrollLeft - dx;
            });
            window.addEventListener("mouseup", stopDrag);
            wrap.addEventListener("mouseleave", () => {
              if (!elemForecastDragging) return;
              hideElemForecastTooltip();
            });
          }
          hit.onmousemove = (e) => {
            if (elemForecastDragging) return;
            const L = elemForecastHoverLayout;
            const pts = elemForecastHoverPts;
            if (!L || !pts?.length || L.maxHour <= 0) return;
            const rect = svg.getBoundingClientRect();
            const vx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * L.W;
            const mx = Math.max(L.x0, Math.min(L.x0 + L.plotW, vx));
            let bi = 0;
            let bd = Infinity;
            for (let i = 0; i < pts.length; i++) {
              const px = L.x0 + (pts[i].h / L.maxHour) * L.plotW;
              const d = Math.abs(px - mx);
              if (d < bd) {
                bd = d;
                bi = i;
              }
            }
            const p = pts[bi];
            const snapX = L.x0 + (p.h / L.maxHour) * L.plotW;
            const vline = document.getElementById("elemForecastVLine");
            if (vline) {
              vline.setAttribute("x1", String(snapX));
              vline.setAttribute("x2", String(snapX));
              vline.setAttribute("visibility", "visible");
            }
            const anchor = typeof L.anchorUtcMs === "number" ? L.anchorUtcMs : utcHourStartMs();
            const utcAtPoint = anchor + p.h * 3600000;
            const precipTxt = p.precip < 0.05 ? "0" : p.precip.toFixed(1);
            const windColor = windColorForSpeed(p.wind);
            let rows = `<div class="elem-forecast-tooltip-hd">T+${p.h} h · ${formatUtcWeekdayTime(utcAtPoint)}</div>`;
            rows += `<div class="elem-forecast-tooltip-row"><span>气温</span><strong>${p.temp.toFixed(1)} ℃</strong></div>`;
            rows += `<div class="elem-forecast-tooltip-row"><span>风速</span><strong style="color:${windColor}">${p.wind.toFixed(1)} m/s</strong></div>`;
            rows += `<div class="elem-forecast-tooltip-row"><span>风向(来向)</span><strong>${Math.round(p.windDir)}°</strong></div>`;
            rows += `<div class="elem-forecast-tooltip-row"><span>阵风</span><strong style="color:${windColor}">${p.gust.toFixed(1)} m/s</strong></div>`;
            rows += `<div class="elem-forecast-tooltip-row"><span>降水(步长内)</span><strong>${precipTxt} mm</strong></div>`;
            if (L.full) {
              rows += `<div class="elem-forecast-tooltip-row"><span>云量</span><strong>${Math.round(p.cloud)} %</strong></div>`;
              rows += `<div class="elem-forecast-tooltip-row"><span>气压</span><strong>${p.pressure.toFixed(1)} hPa</strong></div>`;
            }
            tip.innerHTML = rows;
            tip.style.borderColor = `${windColor}66`;
            tip.style.boxShadow = `0 12px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px ${windColor}33 inset`;
            tip.classList.add("is-visible");
            const wr = wrap.getBoundingClientRect();
            let left = e.clientX - wr.left + 12;
            let top = e.clientY - wr.top + 12;
            tip.style.left = "0px";
            tip.style.top = "0px";
            const tw = tip.offsetWidth || 180;
            const th = tip.offsetHeight || 140;
            if (left + tw > wr.width - 8) left = e.clientX - wr.left - tw - 12;
            if (top + th > wr.height - 8) top = e.clientY - wr.top - th - 12;
            tip.style.left = `${Math.max(8, left)}px`;
            tip.style.top = `${Math.max(8, top)}px`;
          };
          hit.onmouseleave = () => hideElemForecastTooltip();
        }

        function windModeLabel(mode) {
          return mode === "full" ? "全部要素" : "简单要素";
        }

        function meteoModelLabel(m) {
          if (m === "gfs") return "GFS";
          if (m === "ecmwf") return "ECMWF";
          return "AUTO";
        }

        function coordSourceLabel(s) {
          if (s === "local") return "本地坐标";
          if (s === "cache") return "缓存坐标";
          if (s === "online") return "在线解析";
          return "未解析";
        }

        function setCoordSourceTag(s) {
          if (!elemCoordSourceTag) return;
          elemCoordSourceTag.textContent = `坐标来源：${coordSourceLabel(s)}`;
        }

        /** 按风速返回更接近 Windy 的冷色梯度 */
        function windColorForSpeed(speed) {
          if (speed >= 20) return "#53f2ff";
          if (speed >= 14) return "#4fd0ff";
          if (speed >= 9) return "#77b9ff";
          if (speed >= 5) return "#9ab0ff";
          return "#b7bfff";
        }

        /** 降水分级色（弱/中/强） */
        function precipColorForAmount(mm) {
          if (mm >= 8) return "rgba(72, 226, 255, 0.95)";
          if (mm >= 3) return "rgba(84, 168, 255, 0.92)";
          if (mm >= 0.5) return "rgba(116, 142, 255, 0.88)";
          return "rgba(146, 158, 255, 0.82)";
        }

        /** 要素分析弹窗内图表区高度（弹窗打开后按容器实测，否则用默认值） */
        function measureElemForecastChartHeight(full) {
          const wrap = document.getElementById("elemForecastChartWrap");
          const open = elemForecastBackdrop?.classList.contains("is-open");
          if (open && wrap) {
            const h = wrap.clientHeight;
            if (h > 80) return Math.round(Math.max(full ? 300 : 220, h));
          }
          return full ? 392 : 258;
        }

        /** 要素分析弹窗内图表区宽度：数据所需宽度与可视区约 90% 取较大值，避免横向缩在左侧 */
        function measureElemForecastChartWidth(maxHour) {
          const wrap = document.getElementById("elemForecastChartWrap");
          const wrapW = Math.max(wrap?.clientWidth || 0, 960);
          const pointCount = Math.round(maxHour / FORECAST_STEP_HOURS) + 1;
          const dataW = Math.max(1100, pointCount * 28 + 80);
          const open = elemForecastBackdrop?.classList.contains("is-open");
          if (!open || wrapW < 400) return dataW;
          const comfyW = Math.round(wrapW * 0.9);
          return Math.max(dataW, comfyW);
        }

        let elemForecastResizeTimer = null;
        function setupElemForecastChartResize() {
          const wrap = document.getElementById("elemForecastChartWrap");
          if (!wrap || wrap.dataset.resizeBound) return;
          wrap.dataset.resizeBound = "1";
          const ro = new ResizeObserver(() => {
            if (!elemForecastBackdrop?.classList.contains("is-open") || !lastWindyForecast) return;
            clearTimeout(elemForecastResizeTimer);
            elemForecastResizeTimer = setTimeout(() => {
              renderWindyForecastSvg(
                lastWindyForecast.code,
                lastWindyForecast.name,
                lastWindyForecast.pts,
                windyElementMode,
                lastWindyForecast.forecastAnchorUtcMs,
                lastWindyForecast.source,
                lastWindyForecast.model
              );
            }, 80);
          });
          ro.observe(wrap);
        }

        function renderWindyForecastSvg(
          icao,
          airportName,
          pts,
          mode = "simple",
          anchorUtcMs = utcHourStartMs(),
          source = "mock",
          model = "auto"
        ) {
          const svgEl = document.getElementById("elemForecastSvg");
          if (!svgEl || pts.length < 2) return;
          const full = mode === "full";
          const maxHour = Math.max(pts[pts.length - 1]?.h ?? 1, 1);
          const W = measureElemForecastChartWidth(maxHour);
          const H = measureElemForecastChartHeight(full);
          const bands = full ? 5 : 3;
          const padL = 56;
          const padR = 8;
          const padT = 22;
          const padB = 40;
          const AXIS_TICK_H = FORECAST_STEP_HOURS;
          const AXIS_LABEL_H = FORECAST_STEP_HOURS;
          const bandH = (H - padT - padB) / bands;
          const x0 = padL;
          const x1 = W - padR;
          const plotW = x1 - x0;
          const hx = (hour) => x0 + (hour / maxHour) * plotW;
          const bandTop = (i) => padT + i * bandH;
          const bandBot = (i) => padT + (i + 1) * bandH;
          const inner = 5;
          const tempGlowW = full ? 4.8 : 4.1;
          const tempMainW = full ? 2.05 : 2.2;
          const windMainW = full ? 1.9 : 2.0;
          const gustW = full ? 1.25 : 1.3;

          const yBand = (i, vmin, vmax, v) => {
            const top = bandTop(i) + inner;
            const bot = bandBot(i) - inner;
            if (vmax === vmin) return (top + bot) / 2;
            return top + (1 - (v - vmin) / (vmax - vmin)) * (bot - top);
          };

          const temps = pts.map((p) => p.temp);
          const tMin = Math.min(...temps) - 1;
          const tMax = Math.max(...temps) + 1;
          const wMax = Math.max(...pts.map((p) => p.wind), ...pts.map((p) => p.gust)) * 1.12;
          const pMax = Math.max(0.5, ...pts.map((p) => p.precip)) * 1.1;
          const prMin = Math.min(...pts.map((p) => p.pressure)) - 0.8;
          const prMax = Math.max(...pts.map((p) => p.pressure)) + 0.8;

          const grid = [];
          for (let g = 0; g <= maxHour; g += AXIS_TICK_H) {
            const major = g % 12 === 0;
            const dayMajor = g % 24 === 0;
            grid.push(
              `<line x1="${hx(g)}" y1="${padT}" x2="${hx(g)}" y2="${H - padB}" stroke="${
                dayMajor ? "rgba(190,210,255,0.26)" : major ? "rgba(157,181,255,0.15)" : "rgba(157,181,255,0.08)"
              }" stroke-width="${dayMajor ? "1.2" : major ? "1" : "0.75"}" ${dayMajor ? 'stroke-dasharray="2 2"' : ""}/>`
            );
          }

          const bandLines = [];
          for (let i = 0; i < bands; i++) {
            bandLines.push(
              `<line x1="${x0}" y1="${bandBot(i)}" x2="${x1}" y2="${bandBot(i)}" stroke="rgba(157,181,255,0.18)" stroke-width="1"/>`
            );
          }

          const tempPts = pts.map((p) => ({ x: hx(p.h), y: yBand(0, tMin, tMax, p.temp) }));
          const windPts = pts.map((p) => ({ x: hx(p.h), y: yBand(1, 0, wMax, p.wind) }));
          const gustPts = pts.map((p) => ({ x: hx(p.h), y: yBand(1, 0, wMax, p.gust) }));
          const dTemp = smoothCatmullPathD(tempPts);
          const dWind = smoothCatmullPathD(windPts);
          const dGust = smoothCatmullPathD(gustPts);

          const barW = (plotW / (pts.length - 1)) * 0.45;
          const prParts = [];
          pts.forEach((p) => {
            if (p.precip <= 0) return;
            const cx = hx(p.h);
            const yTop = yBand(2, 0, pMax, p.precip);
            const yBot = bandBot(2) - inner;
            const pFill = precipColorForAmount(p.precip);
            prParts.push(
              `<rect x="${cx - barW / 2}" y="${yTop}" width="${barW}" height="${Math.max(0.5, yBot - yTop)}" rx="2.2" fill="${pFill}" opacity="0.96"/>`
            );
          });

          let cloudFill = "";
          let dPr = "";
          if (full) {
            const yCloudBot = bandBot(3) - inner;
            const cloudTopPts = pts.map((p) => ({ x: hx(p.h), y: yBand(3, 0, 100, p.cloud) }));
            const smoothTop = smoothCatmullPathD(cloudTopPts);
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
            const prLinePts = pts.map((p) => ({ x: hx(p.h), y: yBand(4, prMin, prMax, p.pressure) }));
            dPr = smoothCatmullPathD(prLinePts);
          }

          const arrows = [];
          pts.forEach((p, i) => {
            if (i % 3 !== 0) return;
            const cx = hx(p.h);
            const cy = (bandTop(1) + bandBot(1)) / 2;
            const scale = Math.max(0.8, Math.min(1.6, 0.75 + p.wind / 12));
            const arrowColor = windColorForSpeed(p.wind);
            // windDir 为气象来向(°)；箭头几何默认朝北。rotate(来向)会错指来向一侧；应朝去向(来向+180°)，即“从来向一侧指向对侧”。
            const windArrowDeg = ((p.windDir + 180) % 360 + 360) % 360;
            arrows.push(
              `<g transform="translate(${cx},${cy}) rotate(${windArrowDeg}) scale(${scale})">
                 <line x1="0" y1="7.5" x2="0" y2="-5.8" stroke="${arrowColor}" stroke-width="1.6" stroke-linecap="round" opacity="0.92"/>
                 <polygon points="0,-11 -4.6,-3.2 4.6,-3.2" fill="${arrowColor}" opacity="0.95"/>
               </g>`
            );
          });

          const bandLabelFull = [
            ["气温", "℃"],
            ["风速", "m/s"],
            ["降水", "mm"],
            ["云量", "%"],
            ["气压", "hPa"],
          ];
          const bandLabelSimple = [
            ["气温", "℃"],
            ["风速", "m/s"],
            ["降水", "mm"],
          ];
          const bandLabel = full ? bandLabelFull : bandLabelSimple;
          const labels = [];
          for (let i = 0; i < bands; i++) {
            const ly = bandTop(i) + 6;
            labels.push(
              `<g>
                <rect x="4" y="${ly - 8}" width="46" height="12" rx="6" fill="rgba(102,124,178,0.24)" stroke="rgba(182,204,255,0.28)" stroke-width="0.6"/>
                <text x="9" y="${ly}" fill="rgba(242,247,255,0.96)" font-size="7.6" font-weight="600">${bandLabel[i][0]} ${bandLabel[i][1]}</text>
              </g>`
            );
          }

          const msPerH = 3600000;
          const xLabels = [];
          const axisBaseY = H - 6;
          for (let g = 0; g <= maxHour; g += AXIS_TICK_H) {
            const tms = anchorUtcMs + g * msPerH;
            const cx = hx(g);
            const showWeekday = g % 12 === 0;
            if (showWeekday) {
              const { line1, line2 } = formatUtcAxisZhTwoLine(tms);
              const utcHour = new Date(tms).getUTCHours();
              const isNight = utcHour < 6 || utcHour >= 18;
              const tickFill = isNight ? "rgba(22,32,62,0.62)" : "rgba(38,54,96,0.52)";
              const tickStroke = isNight ? "rgba(130,156,224,0.26)" : "rgba(188,210,255,0.3)";
              xLabels.push(
                `<g>
                  <rect x="${cx - 28}" y="${axisBaseY - 24}" width="56" height="16" rx="8" fill="${tickFill}" stroke="${tickStroke}" stroke-width="0.6"/>
                  <text x="${cx}" y="${axisBaseY - 16}" text-anchor="middle" fill="rgba(235,242,255,0.62)" font-size="8" font-family="system-ui, 'Segoe UI', sans-serif">
                    <tspan x="${cx}" dy="0">${escapeHtml(line1)}</tspan>
                    <tspan x="${cx}" dy="10">${escapeHtml(line2)}</tspan>
                  </text>
                </g>`
              );
            } else if (g % AXIS_LABEL_H === 0) {
              const t = formatUtcAxisZhTimeOnly(tms);
              xLabels.push(
                `<text x="${cx}" y="${axisBaseY - 4}" text-anchor="middle" fill="rgba(235,242,255,0.54)" font-size="7.5" font-family="system-ui, 'Segoe UI', sans-serif">${escapeHtml(t)}</text>`
              );
            }
          }
          xLabels.push(
            `<text x="${W / 2}" y="${H - 1}" text-anchor="middle" fill="rgba(170,190,236,0.62)" font-size="7">横轴：世界时 UTC · 每 2h 网格/时间标签（每 12h 显示星期/日期）</text>`
          );

          const nowHour = (Date.now() - anchorUtcMs) / 3600000;
          const nowVisible = nowHour >= 0 && nowHour <= maxHour;
          const nowX = nowVisible ? hx(nowHour) : 0;
          const nowBlock = nowVisible
            ? `
              <line x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${H - padB}" stroke="url(#elemNowLineGrad)" stroke-width="1.4"/>
              <circle cx="${nowX}" cy="${padT + 2}" r="2.8" fill="#ffd36a" />
              <circle cx="${nowX}" cy="${padT + 2}" r="4.2" fill="rgba(255,211,106,0.18)">
                <animate attributeName="r" values="3.8;7.8;3.8" dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.38;0.06;0.38" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <text x="${Math.min(x1 - 22, Math.max(x0 + 22, nowX))}" y="${padT - 6}" text-anchor="middle" fill="rgba(255,220,130,0.95)" font-size="8.5">现在</text>
            `
            : "";

          const srcTag = source === "open-meteo" ? `Open-Meteo/${meteoModelLabel(model)}` : "演示模拟";
          const stationTitle = airportName === icao ? icao : `${icao} · ${airportName}`;
          const titleTxt = `${stationTitle} · 未来${maxHour}h（${srcTag}）· 时间 UTC · ${windModeLabel(mode)}`;

          const cloudBlock = full
            ? `<path d="${cloudFill}" fill="url(#elemCloudGrad)" stroke="none" shape-rendering="geometricPrecision"/>`
            : "";
          const pressureBlock = full
            ? `<path d="${dPr}" fill="none" stroke="#5ed6a8" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
            : "";
          const cloudGradY1 = bandTop(3) + inner;
          const cloudGradY2 = bandBot(3) - inner;
          const defsBlock = full
            ? `<defs>
              <linearGradient id="elemCloudGrad" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${cloudGradY1}" x2="${x0}" y2="${cloudGradY2}">
                <stop offset="0%" stop-color="rgb(150,175,210)" stop-opacity="0.44"/>
                <stop offset="100%" stop-color="rgb(140,160,190)" stop-opacity="0.14"/>
              </linearGradient>
              <linearGradient id="elemTempStrokeGrad" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#e9ac90"/>
                <stop offset="35%" stop-color="#e79b80"/>
                <stop offset="70%" stop-color="#e68e7f"/>
                <stop offset="100%" stop-color="#e3817f"/>
              </linearGradient>
              <linearGradient id="elemWindStrokeGrad" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="rgb(132,196,235)" stop-opacity="0.22"/>
                <stop offset="18%" stop-color="rgb(132,196,235)" stop-opacity="0.78"/>
                <stop offset="82%" stop-color="rgb(146,206,242)" stop-opacity="0.86"/>
                <stop offset="100%" stop-color="rgb(146,206,242)" stop-opacity="0.32"/>
              </linearGradient>
              <linearGradient id="elemNowLineGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${padT}" x2="0" y2="${H - padB}">
                <stop offset="0%" stop-color="rgb(255,220,130)" stop-opacity="0.95"/>
                <stop offset="100%" stop-color="rgb(255,220,130)" stop-opacity="0.35"/>
              </linearGradient>
              <linearGradient id="elemLeftShade" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${padT}" x2="${x0 + 22}" y2="${padT}">
                <stop offset="0%" stop-color="rgb(9,14,28)" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="rgb(9,14,28)" stop-opacity="0"/>
              </linearGradient>
            </defs>`
            : `<defs>
              <linearGradient id="elemTempStrokeGrad" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#e9ac90"/>
                <stop offset="35%" stop-color="#e79b80"/>
                <stop offset="70%" stop-color="#e68e7f"/>
                <stop offset="100%" stop-color="#e3817f"/>
              </linearGradient>
              <linearGradient id="elemWindStrokeGrad" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="rgb(132,196,235)" stop-opacity="0.22"/>
                <stop offset="18%" stop-color="rgb(132,196,235)" stop-opacity="0.78"/>
                <stop offset="82%" stop-color="rgb(146,206,242)" stop-opacity="0.86"/>
                <stop offset="100%" stop-color="rgb(146,206,242)" stop-opacity="0.32"/>
              </linearGradient>
              <linearGradient id="elemNowLineGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${padT}" x2="0" y2="${H - padB}">
                <stop offset="0%" stop-color="rgb(255,220,130)" stop-opacity="0.95"/>
                <stop offset="100%" stop-color="rgb(255,220,130)" stop-opacity="0.35"/>
              </linearGradient>
              <linearGradient id="elemLeftShade" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${padT}" x2="${x0 + 22}" y2="${padT}">
                <stop offset="0%" stop-color="rgb(9,14,28)" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="rgb(9,14,28)" stop-opacity="0"/>
              </linearGradient>
            </defs>`;

          svgEl.style.width = `${W}px`;
          svgEl.style.height = `${H}px`;
          svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
          svgEl.setAttribute("preserveAspectRatio", "xMinYMin meet");
          svgEl.setAttribute("shape-rendering", "geometricPrecision");
          svgEl.setAttribute("text-rendering", "geometricPrecision");
          svgEl.innerHTML = `
            ${defsBlock}
            <text x="${W / 2}" y="16" text-anchor="middle" fill="rgba(235,242,255,0.58)" font-size="11">${escapeHtml(titleTxt)}</text>
            <line x1="${x0}" y1="${H - padB}" x2="${x1}" y2="${H - padB}" stroke="rgba(190,210,255,0.26)" stroke-width="1.1"/>
            ${grid.join("")}
            ${bandLines.join("")}
            <rect x="${x0}" y="${padT}" width="22" height="${H - padT - padB}" fill="url(#elemLeftShade)"/>
            ${labels.join("")}
            ${cloudBlock}
            <path d="${dTemp}" fill="none" stroke="rgba(233,151,125,0.16)" stroke-width="${tempGlowW}" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${dTemp}" fill="none" stroke="url(#elemTempStrokeGrad)" stroke-width="${tempMainW}" stroke-linecap="round" stroke-linejoin="round" opacity="0.99"/>
            <path d="${dWind}" fill="none" stroke="url(#elemWindStrokeGrad)" stroke-width="${windMainW}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 4"/>
            <path d="${dGust}" fill="none" stroke="rgba(145,188,226,0.34)" stroke-width="${gustW}" stroke-linecap="round" stroke-linejoin="round"/>
            ${prParts.join("")}
            ${arrows.join("")}
            ${pressureBlock}
            ${nowBlock}
            ${xLabels.join("")}
            <line id="elemForecastVLine" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="rgba(200,215,255,0.35)" stroke-width="1" stroke-dasharray="5 4" visibility="hidden" pointer-events="none"/>
            <rect id="elemForecastHitLayer" x="${x0}" y="${padT}" width="${plotW}" height="${H - padT - padB}" fill="transparent" style="cursor:crosshair"/>
          `;

          elemForecastHoverPts = pts;
          elemForecastHoverLayout = { W, H, padL, padT, padB, x0, plotW, maxHour, full, anchorUtcMs };
          bindElemForecastHover();

          document.getElementById("elemForecastChartWrap")?.classList.toggle("windy-chart-wrap--compact", !full);
        }

        function syncElemForecastModeButtons() {
          elemForecastBackdrop?.querySelectorAll(".elem-mode-btn[data-mode]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.mode === windyElementMode);
          });
        }

        function syncElemForecastModelButtons() {
          elemForecastBackdrop?.querySelectorAll(".elem-mode-btn[data-model]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.model === openMeteoModel);
          });
        }

        function normalizeStationCode(raw) {
          let code = (raw || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
          if (code.length < 4) return null;
          return code.slice(0, 4);
        }

        function syncStationInputs(code) {
          if (stationInput) stationInput.value = code;
          if (elemModalStationInput) elemModalStationInput.value = code;
        }

        function openElemForecastModal() {
          if (elemModalStationInput && lastWindyForecast?.code) {
            elemModalStationInput.value = lastWindyForecast.code;
          } else if (elemModalStationInput && stationInput?.value) {
            elemModalStationInput.value = stationInput.value.trim().toUpperCase();
          }
          elemForecastBackdrop?.classList.add("is-open");
          elemForecastBackdrop?.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          setupElemForecastChartResize();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!lastWindyForecast) return;
              renderWindyForecastSvg(
                lastWindyForecast.code,
                lastWindyForecast.name,
                lastWindyForecast.pts,
                windyElementMode,
                lastWindyForecast.forecastAnchorUtcMs,
                lastWindyForecast.source,
                lastWindyForecast.model
              );
            });
          });
        }

        function closeElemForecastModal() {
          hideElemForecastTooltip();
          elemForecastBackdrop?.classList.remove("is-open");
          elemForecastBackdrop?.setAttribute("aria-hidden", "true");
          document.body.style.overflow = "";
        }

        function applyWindyMode(mode) {
          if (mode !== "simple" && mode !== "full") return;
          windyElementMode = mode;
          elemForecastBackdrop?.querySelectorAll(".elem-mode-btn").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.mode === mode);
          });
          if (lastWindyForecast) {
            renderWindyForecastSvg(
              lastWindyForecast.code,
              lastWindyForecast.name,
              lastWindyForecast.pts,
              mode,
              lastWindyForecast.forecastAnchorUtcMs,
              lastWindyForecast.source,
              lastWindyForecast.model
            );
            if (elemForecastMetaLine) {
              const src =
                lastWindyForecast.source === "open-meteo"
                  ? `Open-Meteo · ${meteoModelLabel(lastWindyForecast.model)}`
                  : "演示 · 模拟";
              elemForecastMetaLine.textContent = `步长 ${FORECAST_STEP_HOURS}h · 约 ${FORECAST_MAX_HOURS}h · 共 ${lastWindyForecast.pts.length} 点 · ${windModeLabel(mode)} · ${src}`;
            }
            setCoordSourceTag(lastWindyForecast.coordSource);
          }
        }

        async function loadWindyForecast(openModal = true, rawCode = null) {
          const code = normalizeStationCode(rawCode != null ? rawCode : stationInput?.value || "");
          if (!code) {
            showToast("提示", "请输入四位 ICAO 字母码（例如 ZBAA），再按 Enter。");
            return;
          }
          syncStationInputs(code);
          const name = ELEM_AIRPORT_NAMES[code] || code;
          let pts = null;
          /** @type {"open-meteo"|"mock"} */
          let source = "mock";
          /** @type {number} */
          let forecastAnchorUtcMs = utcHourStartMs();
          /** @type {"local"|"cache"|"online"|"none"} */
          let coordSource = "none";
          /** @type {{ lat: number, lon: number, coordSource: "local"|"cache"|"online" } | null} */
          let resolvedLl = null;
          let resolveThrew = false;
          let forecastApiFailed = false;
          if (USE_OPEN_METEO) {
            try {
              resolvedLl = await resolveAirportLatLon(code);
              if (resolvedLl?.coordSource) coordSource = resolvedLl.coordSource;
            } catch {
              resolveThrew = true;
            }
            if (resolvedLl) {
              try {
                let om = await fetchOpenMeteoForecast(resolvedLl.lat, resolvedLl.lon, openMeteoModel);
                if (!om && openMeteoModel !== "auto") {
                  // 指定模式失败时自动回退，避免空图
                  om = await fetchOpenMeteoForecast(resolvedLl.lat, resolvedLl.lon, "auto");
                }
                if (om) {
                  pts = om.pts;
                  forecastAnchorUtcMs = om.startUtcMs;
                  source = "open-meteo";
                } else {
                  forecastApiFailed = true;
                }
              } catch {
                forecastApiFailed = true;
              }
            }
          }
          if (!pts) {
            pts = mockForecastSeries(code);
            source = "mock";
            forecastAnchorUtcMs = utcHourStartMs();
            if (USE_OPEN_METEO) {
              if (resolveThrew) {
                showToast("提示", "地理编码或网络异常，已使用模拟预报。");
              } else if (!resolvedLl) {
                showToast("提示", `${code} 未在自建库/地理编码中解析到坐标，已使用模拟预报。`);
              } else if (forecastApiFailed) {
                showToast("提示", "Open-Meteo 预报接口暂不可用，已使用模拟预报。");
              }
            }
          }
          lastWindyForecast = { code, name, pts, source, forecastAnchorUtcMs, model: openMeteoModel, coordSource };
          renderWindyForecastSvg(code, name, pts, windyElementMode, forecastAnchorUtcMs, source, openMeteoModel);
          if (elemForecastModalTitle) {
            const stationTitle = name === code ? code : `${code} · ${name}`;
            elemForecastModalTitle.textContent = `要素分析 · ${stationTitle}`;
          }
          const metaSrc = source === "open-meteo" ? `Open-Meteo · ${meteoModelLabel(openMeteoModel)}` : "演示 · 模拟";
          if (elemForecastMetaLine) {
            elemForecastMetaLine.textContent = `步长 ${FORECAST_STEP_HOURS}h · 约 ${FORECAST_MAX_HOURS}h · 共 ${pts.length} 点 · ${windModeLabel(windyElementMode)} · ${metaSrc}`;
          }
          if (windyDataSource) {
            windyDataSource.textContent =
              source === "open-meteo" ? `Open-Meteo · ${meteoModelLabel(openMeteoModel)} 预报` : "演示 · 模拟预报";
          }
          setCoordSourceTag(coordSource);
          syncElemForecastModeButtons();
          syncElemForecastModelButtons();
          if (openModal) openElemForecastModal();
        }

        function normalizeLevel(text) {
          const t = (text || "").toUpperCase();
          if (t.includes("SIGMET") || t.includes("雷暴") || t.includes("TS")) return "high";
          if (t.includes("AIRMET") || t.includes("低能见度") || t.includes("BR")) return "mid";
          return "low";
        }

        function levelLabel(level) {
          if (level === "high") return "高";
          if (level === "mid") return "中";
          return "低";
        }

        function flightCategoryToLevel(fc) {
          const c = (fc || "").toUpperCase();
          if (c === "LIFR" || c === "IFR") return "high";
          if (c === "MVFR") return "mid";
          return "low";
        }

        function flightCatClass(fc) {
          const c = (fc || "").toUpperCase();
          if (c === "VFR") return "cat-vfr";
          if (c === "MVFR") return "cat-mvfr";
          if (c === "IFR") return "cat-ifr";
          if (c === "LIFR") return "cat-lifr";
          return "cat-unk";
        }

        function metarCategoryColor(fc) {
          const c = (fc || "").toUpperCase();
          if (c === "VFR") return "#3dd68c";
          if (c === "MVFR") return "#5eb3ff";
          if (c === "IFR") return "#ffb347";
          if (c === "LIFR") return "#ff5c7a";
          return "#a8b0c4";
        }

        /** @param {string|undefined} sev */
        function metarSeverityColor(sev) {
          const s = String(sev || "none").toLowerCase();
          if (s === "critical") return "#ff4757";
          if (s === "warning") return "#e6c94c";
          if (s === "caution") return "#3dd68c";
          return "#6bcf7a";
        }

        /** @param {string|undefined} sev */
        function severityLabelZh(sev) {
          const s = String(sev || "none").toLowerCase();
          if (s === "critical") return "红色";
          if (s === "warning") return "黄色";
          if (s === "caution") return "绿色";
          return "正常";
        }

        /**
         * 报文监控分级：公司运行控制系统标准（docs/天气标准 → data/weather-standards.json）
         * 全局要素：能见度/跑道视程/云底高/风速/温度 → 红(R)/黄(Y)/绿(G) 阈值
         * 天气现象：天气现象基础表 → 等级 R/Y/G + 是否恶劣天气 Y/N
         */
        let weatherStandards = null;
        let PHENOMENON_LEXICON_SORTED = [];
        let REPORT_WEATHER_LEXICON = [];
        let REPORT_LEXICON_SORTED = [];

        const VIS_PARSE = { treatNumericAsMetersWhenAbove: 50 };
        const LEGACY_METAR_RULES = {
          visibility: { criticalBelowM: 800, warningBelowM: 1600, cautionBelowM: 2000 },
          rvr: { criticalBelowM: 550, warningBelowM: 1000, cautionBelowM: 2000 },
          cloudBase30m: { criticalBelow: 2, warningBelow: 5, cautionBelow: 10 },
          wind: { cautionKts: 10, warningKts: 16, criticalKts: 24 },
          gust: { cautionKts: 20, warningKts: 26, criticalKts: 34 },
          flightCategory: { lifrRank: 3, ifrRank: 2, mvfrRank: 1 },
        };

        const REPORT_LEXICON_SUPPLEMENT = [
          { match: "CAVOK", zh: "净空良好", severity: "none", badWeather: false },
          { match: "NSC", zh: "无显著云", severity: "none", badWeather: false },
          { match: "SKC", zh: "晴空", severity: "none", badWeather: false },
          { match: "CLR", zh: "晴空", severity: "none", badWeather: false },
          { match: "NCD", zh: "无云探测", severity: "none", badWeather: false },
          { match: "NSW", zh: "无显著天气", severity: "none", badWeather: false },
          { match: "NOSIG", zh: "无重要变化", severity: "none", badWeather: false },
          { match: "FEW", zh: "少云", severity: "none", badWeather: false },
          { match: "SCT", zh: "疏云", severity: "none", badWeather: false },
          { match: "BKN", zh: "多云/碎云", severity: "none", badWeather: false },
          { match: "OVC", zh: "阴天", severity: "none", badWeather: false },
          { match: "VV", zh: "垂直能见度", severity: "none", badWeather: false },
          { match: "CB", zh: "积雨云", severity: "none", badWeather: false },
          { match: "TCU", zh: "浓积云", severity: "none", badWeather: false },
          { match: "BECMG", zh: "逐渐变为", severity: "none", badWeather: false },
          { match: "TEMPO", zh: "短时", severity: "none", badWeather: false },
          { match: "PROB30", zh: "概率30%", severity: "none", badWeather: false },
          { match: "PROB40", zh: "概率40%", severity: "none", badWeather: false },
          { match: "FM", zh: "从…时起", severity: "none", badWeather: false },
          { match: "TL", zh: "直至", severity: "none", badWeather: false },
          { match: "AT", zh: "在…时", severity: "none", badWeather: false },
          { match: "METAR", zh: "例行天气报告", severity: "none", badWeather: false },
          { match: "SPECI", zh: "特殊天气报告", severity: "none", badWeather: false },
          { match: "TAF", zh: "航站预报", severity: "none", badWeather: false },
          { match: "AMD", zh: "修订", severity: "none", badWeather: false },
          { match: "NIL", zh: "无报文", severity: "none", badWeather: false },
          { match: "RMK", zh: "备注", severity: "none", badWeather: false },
          { match: "AUTO", zh: "自动观测", severity: "none", badWeather: false },
          { match: "COR", zh: "更正报", severity: "none", badWeather: false },
        ];

        function parseSfFocRyg(ryg) {
          const s = String(ryg || "").trim();
          if (!/^\d{10,24}$/.test(s)) return null;
          let maxDigit = 0;
          for (const ch of s) {
            const n = Number(ch);
            if (Number.isFinite(n) && n > maxDigit) maxDigit = n;
          }
          if (maxDigit <= 0) {
            return { rank: 0, companyLevel: "G", severity: "none", source: "sf-foc-ryg" };
          }
          if (maxDigit === 1) {
            return { rank: 1, companyLevel: "G", severity: "caution", source: "sf-foc-ryg" };
          }
          if (maxDigit === 2) {
            return { rank: 2, companyLevel: "Y", severity: "warning", source: "sf-foc-ryg" };
          }
          return { rank: 3, companyLevel: "R", severity: "critical", source: "sf-foc-ryg" };
        }

        /** 同时看 ryg / weatherryg，取判色更高者（避免空 ryg 盖住有效 weatherryg） */
        function resolveSfFocRyg(row) {
          const codes = [row?.weatherryg, row?.sfFocRyg, row?.ryg].filter((c) => String(c || "").trim());
          let best = null;
          let bestCode = "";
          for (const code of codes) {
            const parsed = parseSfFocRyg(code);
            if (!parsed) continue;
            if (!best || parsed.rank > best.rank) {
              best = parsed;
              bestCode = String(code);
            }
          }
          return { fromRyg: best, rygCode: bestCode };
        }

        function companyLevelToRank(level) {
          const l = String(level || "").toUpperCase();
          if (l === "R") return 3;
          if (l === "Y") return 2;
          if (l === "G") return 1;
          return 0;
        }

        function rankToCompanyLevel(rank) {
          if (rank >= 3) return "R";
          if (rank >= 2) return "Y";
          if (rank >= 1) return "G";
          return "";
        }

        function rankToSeverity(rank) {
          if (rank >= 3) return "critical";
          if (rank >= 2) return "warning";
          if (rank >= 1) return "caution";
          return "none";
        }

        function levelToSeverity(level) {
          return rankToSeverity(companyLevelToRank(level));
        }

        function rebuildReportLexicon() {
          REPORT_LEXICON_SORTED = [...REPORT_WEATHER_LEXICON].sort((a, b) => b.match.length - a.match.length);
        }

        function applyWeatherStandards(std) {
          weatherStandards = std;
          if (std?.phenomena?.length) {
            const fromStd = std.phenomena.map((p) => ({
              match: String(p.code || "").toUpperCase(),
              zh: p.label || p.code,
              severity: levelToSeverity(p.level),
              companyLevel: String(p.level || "G").toUpperCase(),
              badWeather: Boolean(p.badWeather),
            }));
            PHENOMENON_LEXICON_SORTED = [...fromStd].sort((a, b) => b.match.length - a.match.length);
            REPORT_WEATHER_LEXICON = [...fromStd, ...REPORT_LEXICON_SUPPLEMENT];
          } else {
            PHENOMENON_LEXICON_SORTED = [];
            REPORT_WEATHER_LEXICON = [...REPORT_LEXICON_SUPPLEMENT];
          }
          rebuildReportLexicon();
        }

        async function loadWeatherStandards() {
          try {
            const r = await fetchWithTimeout(resolveAppAssetUrl("data/weather-standards.json"), { cache: "no-store" }, 6000);
            if (r.ok) {
              applyWeatherStandards(await r.json());
              return;
            }
          } catch (_) {}
          applyWeatherStandards(null);
        }

        function reapplyMessageSeverity() {
          if (lastMessages.length) lastMessages = lastMessages.map((row) => enrichMessageSeverity(row));
          if (lastTafMessages.length) lastTafMessages = lastTafMessages.map((row) => enrichMessageSeverity(row));
        }

        function enrichMessageSeverity(row) {
          const stdEv = evaluateMetarSeverity(row);
          const { fromRyg, rygCode } = resolveSfFocRyg(row);
          const rank = Math.max(stdEv.rank, fromRyg?.rank ?? 0);
          const severity = rankToSeverity(rank);
          const companyLevel = rankToCompanyLevel(rank);
          const alertReasons =
            stdEv.reasons.length > 0
              ? stdEv.reasons
              : fromRyg && fromRyg.rank > 0
                ? [`公司 FOC 判色（ryg=${String(rygCode).slice(0, 12)}…）`]
                : [];
          const gradeSource =
            fromRyg && fromRyg.rank > stdEv.rank
              ? "sf-foc-ryg"
              : stdEv.rank > 0
                ? "standards"
                : fromRyg?.rank > 0
                  ? "sf-foc-ryg"
                  : "standards";
          return {
            ...row,
            severity,
            alertReasons,
            severityRank: rank,
            companyLevel,
            badWeather: stdEv.badWeather || (fromRyg?.rank ?? 0) >= 2,
            matchedWxCodes: stdEv.matchedWxCodes,
            gradeSource,
          };
        }

        const SM_TO_M = 1609.344;

        /**
         * AWC `visib`：海里（SM）数值或 "6+" / "10+" 等
         * @param {unknown} v
         * @returns {number|null}
         */
        function parseVisStatuteMiles(v) {
          if (v == null) return null;
          if (typeof v === "number" && Number.isFinite(v)) {
            if (v > 30) return null;
            return v;
          }
          const s = String(v).trim();
          if (!s) return null;
          if (/^10\+$/i.test(s) || /^p6/i.test(s)) return 10;
          if (/^6\+$/i.test(s)) return 6;
          const n = parseFloat(s);
          if (!Number.isFinite(n)) return null;
          if (n > 30) return null;
          return n;
        }

        /**
         * 统一为「米」的能见度；无法解析时返回 null
         * @param {Record<string, any>} m
         * @returns {number|null}
         */
        function getVisibilityMeters(m) {
          const cfg = VIS_PARSE;
          const v = m.visib;
          if (v == null) return null;
          if (typeof v === "number" && Number.isFinite(v)) {
            if (v > cfg.treatNumericAsMetersWhenAbove && v < 1e6) return v;
            if (v > 30) return null;
            return v * SM_TO_M;
          }
          const sm = parseVisStatuteMiles(v);
          if (sm == null) return null;
          return sm * SM_TO_M;
        }

        function parseMinVisibilityMetersFromRaw(raw) {
          const parts = String(raw || "")
            .trim()
            .replace(/=\s*$/, "")
            .split(/\s+/)
            .filter(Boolean);
          const found = [];
          for (const tok of parts) {
            const t = String(tok || "").trim();
            const up = t.toUpperCase();
            if (/^[QA]\d{4}$/.test(up)) continue;
            if (/^TX|^TN|^TEMPO|^BECMG|^PROB|^FM/i.test(up)) continue;
            if (up === "CAVOK") {
              found.push(9999);
              continue;
            }
            if (/^\d{4}$/.test(t)) {
              const v = parseInt(t, 10);
              if (Number.isFinite(v)) found.push(v);
              continue;
            }
            if (/^P?\d+SM$/i.test(t) || /^M?\d\/\d{1,2}SM?$/i.test(t)) {
              const sm = parseVisStatuteMiles(t.replace(/SM$/i, ""));
              if (sm != null) found.push(Math.round(sm * SM_TO_M));
            }
          }
          if (!found.length) return null;
          return Math.min(...found);
        }

        function resolveVisibilityMetersForMessage(m) {
          const fromField = getVisibilityMeters(m);
          const fromRaw = parseMinVisibilityMetersFromRaw(m?.raw);
          if (fromField == null) return fromRaw;
          if (fromRaw == null) return fromField;
          return Math.min(fromField, fromRaw);
        }

        function evaluateLowerIsWorse(value, cfg, label, unit) {
          const reasons = [];
          let rank = 0;
          if (value == null || !cfg) return { rank, reasons };
          const bump = (r, msg) => {
            if (r > rank) rank = r;
            if (msg) reasons.push(msg);
          };
          if (value <= cfg.red) bump(3, `${label}达红色标准（≤${cfg.red}${unit}，约 ${Math.round(value)}${unit}）`);
          else if (value <= cfg.yellow) bump(2, `${label}达黄色标准（≤${cfg.yellow}${unit}，约 ${Math.round(value)}${unit}）`);
          else if (value <= cfg.green) bump(1, `${label}达绿色标准（≤${cfg.green}${unit}，约 ${Math.round(value)}${unit}）`);
          return { rank, reasons };
        }

        function evaluateHigherIsWorse(value, cfg, label, unit) {
          const reasons = [];
          let rank = 0;
          if (value == null || !cfg) return { rank, reasons };
          const bump = (r, msg) => {
            if (r > rank) rank = r;
            if (msg) reasons.push(msg);
          };
          if (value >= cfg.red) bump(3, `${label}达红色标准（≥${cfg.red}${unit}，约 ${Math.round(value)}${unit}）`);
          else if (value >= cfg.yellow) bump(2, `${label}达黄色标准（≥${cfg.yellow}${unit}，约 ${Math.round(value)}${unit}）`);
          else if (value >= cfg.green) bump(1, `${label}达绿色标准（≥${cfg.green}${unit}，约 ${Math.round(value)}${unit}）`);
          return { rank, reasons };
        }

        function parseMinRvrMeters(raw) {
          const s = String(raw || "").toUpperCase();
          const found = [];
          const re = /R\d{2}[LCR]?\/(\d{3,4})/g;
          let m;
          while ((m = re.exec(s))) {
            const v = parseInt(m[1], 10);
            if (Number.isFinite(v)) found.push(v);
          }
          return found.length ? Math.min(...found) : null;
        }

        function parseCloudLayer30m(token) {
          const m = String(token || "").match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)/i);
          if (!m || m[2] === "///") return null;
          return parseInt(m[2], 10);
        }

        /** 国内 TAF/METAR 云高为 ×30m；国际 TAF 为 ×100ft，统一换算为 ×30m 供阈值比较 */
        function parseCloudLayerForStation(token, station) {
          const m = String(token || "").match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/i);
          if (!m || m[2] === "///") return null;
          const n = parseInt(m[2], 10);
          const isDomestic = /^Z[A-Z0-9]{3}$/.test(String(station || "").trim().toUpperCase());
          if (isDomestic) return n;
          return Math.round((n * 100 * 0.3048) / 30);
        }

        function parseMinCloudBase30m(raw) {
          const s = String(raw || "").toUpperCase();
          const heights = [];
          const re = /(?:FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)/g;
          let m;
          while ((m = re.exec(s))) {
            if (m[1] === "///") continue;
            heights.push(parseInt(m[1], 10));
          }
          return heights.length ? Math.min(...heights) : null;
        }

        function decodeMetarTempToken(x) {
          return String(x).startsWith("M") ? -parseInt(String(x).slice(1), 10) : parseInt(String(x), 10);
        }

        function parseTempC(m) {
          if (m.temp != null && Number.isFinite(Number(m.temp))) return Number(m.temp);
          const raw = String(m.raw || "");
          const tm = raw.match(/\s(M?\d{2})\/(M?\d{2})\s/);
          if (!tm) return null;
          return decodeMetarTempToken(tm[1]);
        }

        /** METAR 温度/露点 + TAF 的 TX/TN 极值 */
        function parseTempExtremesC(m) {
          const raw = String(m.raw || "");
          const highs = [];
          const lows = [];
          if (m.temp != null && Number.isFinite(Number(m.temp))) highs.push(Number(m.temp));
          const tm = raw.match(/\s(M?\d{2})\/(M?\d{2})\s/);
          if (tm) {
            highs.push(decodeMetarTempToken(tm[1]));
            lows.push(decodeMetarTempToken(tm[2]));
          }
          for (const hit of raw.matchAll(/\bTX(M?\d{2})\/\d{4}Z\b/gi)) {
            highs.push(decodeMetarTempToken(hit[1]));
          }
          for (const hit of raw.matchAll(/\bTN(M?\d{2})\/\d{4}Z\b/gi)) {
            lows.push(decodeMetarTempToken(hit[1]));
          }
          return {
            maxC: highs.length ? Math.max(...highs.filter(Number.isFinite)) : null,
            minC: lows.length ? Math.min(...lows.filter(Number.isFinite)) : null,
          };
        }

        /** 从 METAR/TAF 原文解析主预报组首个风组（不含 TEMPO/BECMG 等趋势段）；仅保留报文原单位 */
        function parseReportMainWind(raw) {
          const parts = String(raw || "")
            .trim()
            .replace(/=\s*$/, "")
            .split(/\s+/)
            .filter(Boolean);
          let i = 0;
          if (/^(METAR|SPECI|TAF)$/i.test(parts[i])) i++;
          if (/^(AMD|COR)$/i.test(parts[i])) i++;
          if (parts[i] && /^[A-Z0-9]{4}$/.test(parts[i])) i++;
          if (parts[i] && /^\d{6}Z$/i.test(parts[i])) i++;
          if (
            parts[i] &&
            (/^\d{4}\/\d{4}$/.test(parts[i]) ||
              /^\d{6}\/\d{6}$/.test(parts[i]) ||
              /^\d{8}\/\d{8}$/.test(parts[i]))
          ) {
            i++;
          }
          const stopTrend = (tok) =>
            /^(TEMPO|BECMG|INTER|RMK|NOSIG|PROB\d{2}|FM\d{4,6})$/i.test(String(tok || "").trim());
          for (; i < parts.length; i++) {
            const tok = parts[i];
            if (stopTrend(tok)) break;
            const m = String(tok).match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/i);
            if (m) {
              return {
                unit: (m[5] || "KT").toUpperCase(),
                windSpd: Number(m[2]),
                gustSpd: m[4] ? Number(m[4]) : null,
              };
            }
          }
          return null;
        }

        /** 按报文原单位评估风/阵风（KT 只比 kt 阈值，MPS 只比 m/s 阈值） */
        function evaluateMainWindSeverity(mainWind, g, bump) {
          if (!mainWind || !g) return { rank: 0 };
          let rank = 0;
          const u = mainWind.unit;
          if (u === "MPS") {
            const avg = evaluateHigherIsWorse(mainWind.windSpd, g.windAvgMps, "平均风速", "m/s");
            for (const msg of avg.reasons) bump(avg.rank, msg);
            rank = Math.max(rank, avg.rank);
            if (mainWind.gustSpd != null) {
              const gust = evaluateHigherIsWorse(mainWind.gustSpd, g.gustMps, "阵风", "m/s");
              for (const msg of gust.reasons) bump(gust.rank, msg);
              rank = Math.max(rank, gust.rank);
            }
          } else {
            let windKt = mainWind.windSpd;
            let gustKt = mainWind.gustSpd;
            if (u === "KMH") {
              windKt = Math.round(windKt / 1.852);
              if (gustKt != null) gustKt = Math.round(gustKt / 1.852);
            }
            const avg = evaluateHigherIsWorse(windKt, g.windAvgKt, "平均风速", "kt");
            for (const msg of avg.reasons) bump(avg.rank, msg);
            rank = Math.max(rank, avg.rank);
            if (gustKt != null) {
              const gust = evaluateHigherIsWorse(gustKt, g.gustKt, "阵风", "kt");
              for (const msg of gust.reasons) bump(gust.rank, msg);
              rank = Math.max(rank, gust.rank);
            }
          }
          return { rank };
        }

        /** 扫描报文全文所有风组（含 TEMPO/BECMG/FM 趋势段），取最高告警等级 */
        function evaluateAllWindsInRaw(raw, g, bump) {
          let rank = 0;
          if (!g) return { rank };
          const re = /\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)\b/gi;
          let m;
          while ((m = re.exec(String(raw || "")))) {
            const mainWind = {
              unit: (m[5] || "KT").toUpperCase(),
              windSpd: Number(m[2]),
              gustSpd: m[4] ? Number(m[4]) : null,
            };
            const ev = evaluateMainWindSeverity(mainWind, g, bump);
            rank = Math.max(rank, ev.rank);
          }
          return { rank };
        }

        function maxWindPeakKtFromRaw(raw) {
          let peak = 0;
          const re = /\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)\b/gi;
          let m;
          while ((m = re.exec(String(raw || "")))) {
            const spd = Number(m[2]);
            const gst = m[4] ? Number(m[4]) : 0;
            const unit = (m[5] || "KT").toUpperCase();
            let wKt = spd;
            let gKt = gst;
            if (unit === "MPS") {
              wKt = Math.round(spd / 0.514444);
              gKt = gst ? Math.round(gst / 0.514444) : 0;
            } else if (unit === "KMH") {
              wKt = Math.round(spd / 1.852);
              gKt = gst ? Math.round(gst / 1.852) : 0;
            }
            peak = Math.max(peak, wKt, gKt);
          }
          return peak;
        }

        function evaluateWindFromMessage(m, g, bump) {
          let rank = 0;
          if (g && m.raw) {
            rank = Math.max(rank, evaluateAllWindsInRaw(m.raw, g, bump).rank);
          }
          if (rank > 0) return { rank };
          const mainWind = parseReportMainWind(m.raw);
          if (mainWind && g) {
            return evaluateMainWindSeverity(mainWind, g, bump);
          }
          const wspd = Number(m.wspd);
          const wgst = Number(m.wgst);
          if (Number.isFinite(wspd)) {
            const avg = evaluateHigherIsWorse(wspd, g.windAvgKt, "平均风速", "kt");
            for (const msg of avg.reasons) bump(avg.rank, msg);
            rank = Math.max(rank, avg.rank);
          }
          if (Number.isFinite(wgst) && wgst > 0) {
            const gust = evaluateHigherIsWorse(wgst, g.gustKt, "阵风", "kt");
            for (const msg of gust.reasons) bump(gust.rank, msg);
            rank = Math.max(rank, gust.rank);
          }
          return { rank };
        }

        /** @deprecated 单 token 解析；趋势段请用 parseReportMainWind 或逐 token 原生单位评估 */
        function parseWindGustFromRaw(raw) {
          const re = /\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)\b/gi;
          const result = { windKt: null, gustKt: null, windMps: null, gustMps: null };
          let m;
          while ((m = re.exec(String(raw || "")))) {
            const spd = Number(m[2]);
            const gst = m[4] ? Number(m[4]) : NaN;
            const unit = (m[5] || "KT").toUpperCase();
            if (unit === "MPS") {
              result.windMps = spd;
              if (Number.isFinite(gst)) result.gustMps = gst;
              result.windKt = Math.round(spd / 0.514444);
              if (Number.isFinite(gst)) result.gustKt = Math.round(gst / 0.514444);
            } else if (unit === "KMH") {
              result.windKt = Math.round(spd / 1.852);
              if (Number.isFinite(gst)) result.gustKt = Math.round(gst / 1.852);
              result.windMps = spd / 3.6;
              if (Number.isFinite(gst)) result.gustMps = gst / 3.6;
            } else {
              result.windKt = spd;
              if (Number.isFinite(gst)) result.gustKt = gst;
              result.windMps = spd * 0.514444;
              if (Number.isFinite(gst)) result.gustMps = gst * 0.514444;
            }
          }
          return result;
        }

        function matchPhenomenaInRaw(raw) {
          const blob = String(raw || "").toUpperCase();
          const found = [];
          const used = new Array(blob.length).fill(false);
          for (const p of PHENOMENON_LEXICON_SORTED) {
            const code = String(p.match || "").toUpperCase();
            if (!code) continue;
            const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(^|[^A-Z])${escaped}(?=[^A-Z]|$)`, "g");
            let m;
            while ((m = re.exec(blob))) {
              const start = m.index + m[1].length;
              const end = start + code.length;
              if (used.slice(start, end).some(Boolean)) continue;
              for (let i = start; i < end; i++) used[i] = true;
              found.push(p);
              break;
            }
          }
          return found;
        }

        /** 报文 token 规范化：去掉末尾 = 等分隔符，便于全文扫描匹配 */
        function normalizeReportToken(tok) {
          return String(tok || "")
            .trim()
            .replace(/=+$/, "");
        }

        /** 单 token 精确匹配现象码（含 -SHRA / +RA，不做强度前缀剥离） */
        function lookupWeatherPhenomenonCode(token) {
          const t = normalizeReportToken(token).toUpperCase();
          if (!t) return null;
          for (const p of PHENOMENON_LEXICON_SORTED) {
            if (String(p.match || "").toUpperCase() === t) return p;
          }
          const reStripped = t.replace(/^(RE|RECENT)/, "");
          if (reStripped !== t) {
            for (const p of PHENOMENON_LEXICON_SORTED) {
              if (String(p.match || "").toUpperCase() === reStripped) return p;
            }
          }
          return null;
        }

        function evaluateMetarSeverityLegacy(m) {
          const reasons = [];
          let rank = 0;
          const visCfg = LEGACY_METAR_RULES.visibility;
          const windCfg = LEGACY_METAR_RULES.wind;
          const fcCfg = LEGACY_METAR_RULES.flightCategory;
          const bump = (r, msg) => {
            if (r > rank) rank = r;
            if (msg) reasons.push(msg);
          };
          const fc = String(m.flight_category || m.fltCat || "").toUpperCase();
          if (fc === "LIFR") bump(fcCfg.lifrRank, "飞行规则 LIFR");
          else if (fc === "IFR") bump(fcCfg.ifrRank, "飞行规则 IFR");
          else if (fc === "MVFR") bump(fcCfg.mvfrRank, "飞行规则 MVFR");
          const visM = resolveVisibilityMetersForMessage(m);
          if (visM != null) {
            if (visM <= visCfg.criticalBelowM) bump(3, `能见度达红色标准（≤${visCfg.criticalBelowM}m）`);
            else if (visM <= visCfg.warningBelowM) bump(2, `能见度达黄色标准（≤${visCfg.warningBelowM}m）`);
            else if (visM <= visCfg.cautionBelowM) bump(1, `能见度达绿色标准（≤${visCfg.cautionBelowM}m）`);
          }
          let windPeak = maxWindPeakKtFromRaw(m.raw);
          if (windPeak <= 0) {
            const mainWind = parseReportMainWind(m.raw);
            if (mainWind) {
              if (mainWind.unit === "MPS") {
                windPeak = Math.max(mainWind.windSpd, mainWind.gustSpd ?? 0) / 0.514444;
              } else {
                let w = mainWind.windSpd;
                let g = mainWind.gustSpd ?? 0;
                if (mainWind.unit === "KMH") {
                  w = Math.round(w / 1.852);
                  g = Math.round(g / 1.852);
                }
                windPeak = Math.max(w, g);
              }
            } else {
              windPeak = Math.max(
                Number.isFinite(Number(m.wspd)) ? Number(m.wspd) : 0,
                Number.isFinite(Number(m.wgst)) ? Number(m.wgst) : 0,
              );
            }
          }
          if (windPeak >= windCfg.criticalKts) bump(3, `阵风/风速 ${Math.round(windPeak)} kt`);
          else if (windPeak >= windCfg.warningKts) bump(2, `阵风/风速 ${Math.round(windPeak)} kt`);
          else if (windPeak >= windCfg.cautionKts) bump(1, `阵风/风速 ${Math.round(windPeak)} kt`);
          const { maxC, minC } = parseTempExtremesC(m);
          const tempHigh = maxC ?? parseTempC(m);
          const tempLow = minC ?? parseTempC(m);
          if (tempHigh != null) {
            if (tempHigh >= 40) bump(3, `高温 ${tempHigh}℃`);
            else if (tempHigh >= 35) bump(2, `高温 ${tempHigh}℃`);
            else if (tempHigh >= 32) bump(1, `高温 ${tempHigh}℃`);
          }
          if (tempLow != null) {
            if (tempLow <= -30) bump(3, `低温 ${tempLow}℃`);
            else if (tempLow <= -27) bump(2, `低温 ${tempLow}℃`);
            else if (tempLow <= -25) bump(1, `低温 ${tempLow}℃`);
          }
          const cloud30m = parseMinCloudBase30m(m.raw);
          if (cloud30m != null) {
            if (cloud30m <= 2) bump(3, `云底高 ${cloud30m}×30m`);
            else if (cloud30m <= 5) bump(2, `云底高 ${cloud30m}×30m`);
            else if (cloud30m <= 10) bump(1, `云底高 ${cloud30m}×30m`);
          }
          for (const p of matchPhenomenaInRaw(String(m.raw || ""))) {
            const pr = companyLevelToRank(p.companyLevel);
            bump(pr, `天气现象 ${p.match}`);
          }
          const uniq = [...new Set(reasons)];
          const severity = rankToSeverity(rank);
          return {
            severity,
            reasons: uniq,
            rank,
            companyLevel: rankToCompanyLevel(rank),
            badWeather: rank >= 2,
            matchedWxCodes: [],
          };
        }

        /**
         * @param {Record<string, any>} m
         * @returns {{ severity: string, reasons: string[], rank: number, companyLevel: string, badWeather: boolean, matchedWxCodes: string[] }}
         */
        function evaluateMetarSeverity(m) {
          if (!weatherStandards?.global) return evaluateMetarSeverityLegacy(m);

          const g = weatherStandards.global;
          const reasons = [];
          let rank = 0;
          let badWeather = false;
          const matchedWxCodes = [];
          const bump = (r, msg) => {
            if (r > rank) rank = r;
            if (msg) reasons.push(msg);
          };

          const visM = resolveVisibilityMetersForMessage(m);
          const visEv = evaluateLowerIsWorse(visM, g.visibilityM, "能见度", "m");
          for (const msg of visEv.reasons) bump(visEv.rank, msg);
          if (visEv.rank >= 2) badWeather = true;

          const rvrM = parseMinRvrMeters(m.raw);
          const rvrEv = evaluateLowerIsWorse(rvrM, g.rvrM, "跑道视程", "m");
          for (const msg of rvrEv.reasons) bump(rvrEv.rank, msg);
          if (rvrEv.rank >= 2) badWeather = true;

          const cloud30m = parseMinCloudBase30m(m.raw);
          const cloudEv = evaluateLowerIsWorse(cloud30m, g.cloudBase30m, "云底高", "×30m");
          for (const msg of cloudEv.reasons) bump(cloudEv.rank, msg);
          if (cloudEv.rank >= 2) badWeather = true;

          const windEv = evaluateWindFromMessage(m, g, bump);
          if (windEv.rank >= 2) badWeather = true;

          const { maxC, minC } = parseTempExtremesC(m);
          const tempHigh = maxC ?? parseTempC(m);
          const tempLow = minC ?? parseTempC(m);
          const hiEv = evaluateHigherIsWorse(tempHigh, g.tempHighC, "温度（高）", "℃");
          for (const msg of hiEv.reasons) bump(hiEv.rank, msg);
          const loEv = evaluateLowerIsWorse(tempLow, g.tempLowC, "温度（低）", "℃");
          for (const msg of loEv.reasons) bump(loEv.rank, msg);
          if (hiEv.rank >= 2 || loEv.rank >= 2) badWeather = true;

          for (const p of matchPhenomenaInRaw(`${m.wxString || ""} ${m.raw || ""}`)) {
            const pr = companyLevelToRank(p.companyLevel);
            bump(pr, `天气现象 ${p.match}（${p.zh}·${p.companyLevel || "G"}）`);
            matchedWxCodes.push(p.match);
            if (p.badWeather) badWeather = true;
          }

          const uniq = [...new Set(reasons)];
          return {
            severity: rankToSeverity(rank),
            reasons: uniq,
            rank,
            companyLevel: rankToCompanyLevel(rank),
            badWeather,
            matchedWxCodes: [...new Set(matchedWxCodes)],
          };
        }

        function formatMetarTimeUtc(iso) {
          if (!iso) return nowHHMM();
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
          return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}Z`;
        }

        function parseMetarArray(data) {
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.data)) return data.data;
          return [];
        }

        function dedupeMetarLatest(rows) {
          const map = new Map();
          for (const m of rows) {
            const icao = String(m.icaoId || "").toUpperCase();
            if (!icao) continue;
            const obs = Number(m.obsTime) || 0;
            const prev = map.get(icao);
            if (!prev || obs > (Number(prev.obsTime) || 0)) map.set(icao, m);
          }
          return [...map.values()];
        }

        function dedupeTafLatest(rows) {
          const map = new Map();
          for (const m of rows) {
            const icao = String(m.icaoId || m.station || "").toUpperCase();
            if (!icao) continue;
            const issueIso = m.issueTime || m.bulletinTime || "";
            const obs = Number(m.obsTime) || (issueIso ? new Date(issueIso).getTime() : 0);
            const prev = map.get(icao);
            const prevObs = prev
              ? Number(prev.obsTime) ||
                (prev.issueTime || prev.bulletinTime
                  ? new Date(String(prev.issueTime || prev.bulletinTime)).getTime()
                  : 0)
              : -1;
            if (!prev || obs > prevObs) map.set(icao, m);
          }
          return [...map.values()];
        }

        function normalizeAwcRecord(m, idx) {
          const icao = String(m.icaoId || "").toUpperCase();
          const fc = String(m.flight_category || m.fltCat || "UNK").toUpperCase();
          const lat = typeof m.lat === "number" ? m.lat : parseFloat(m.lat);
          const lon = typeof m.lon === "number" ? m.lon : parseFloat(m.lon);
          const wspd = Number(m.wspd);
          const wgst = m.wgst != null ? Number(m.wgst) : NaN;
          return {
            id: `awc-${m.metar_id != null ? m.metar_id : icao}-${idx}`,
            type: "METAR",
            station: icao,
            time: formatMetarTimeUtc(m.reportTime || ""),
            raw: m.rawOb != null ? String(m.rawOb) : "",
            level: flightCategoryToLevel(fc),
            receivedAt: m.receiptTime ? formatMetarTimeUtc(String(m.receiptTime)) : "",
            source: "AWC",
            lat: Number.isFinite(lat) ? lat : undefined,
            lon: Number.isFinite(lon) ? lon : undefined,
            flight_category: fc,
            temp: m.temp,
            name: m.name != null ? String(m.name) : "",
            obsTime: Number(m.obsTime) || 0,
            visib: m.visib,
            wspd: Number.isFinite(wspd) ? wspd : undefined,
            wgst: Number.isFinite(wgst) ? wgst : undefined,
            wxString: m.wxString != null ? String(m.wxString) : "",
          };
        }

        function normalizeAwcTafRecord(m, idx) {
          const icao = String(m.icaoId || m.station || "").toUpperCase();
          const fc = String(m.flight_category || m.fltCat || "UNK").toUpperCase();
          const issueIso = m.issueTime || m.bulletinTime || m.reportTime || "";
          const issueMs = issueIso ? new Date(issueIso).getTime() : 0;
          const lat = typeof m.lat === "number" ? m.lat : parseFloat(m.lat);
          const lon = typeof m.lon === "number" ? m.lon : parseFloat(m.lon);
          const wspd = Number(m.wspd);
          const wgst = m.wgst != null ? Number(m.wgst) : NaN;
          return {
            id: `awc-taf-${m.taf_id != null ? m.taf_id : icao}-${idx}`,
            type: "TAF",
            station: icao,
            time: formatMetarTimeUtc(issueIso),
            raw: m.rawOb != null ? String(m.rawOb) : "",
            level: flightCategoryToLevel(fc),
            receivedAt: m.bulletinTime ? formatMetarTimeUtc(String(m.bulletinTime)) : "",
            source: "AWC",
            lat: Number.isFinite(lat) ? lat : undefined,
            lon: Number.isFinite(lon) ? lon : undefined,
            flight_category: fc,
            name: m.name != null ? String(m.name) : "",
            obsTime: Number(m.obsTime) || issueMs || 0,
            visib: m.visib,
            wspd: Number.isFinite(wspd) ? wspd : undefined,
            wgst: Number.isFinite(wgst) ? wgst : undefined,
            wxString: m.wxString != null ? String(m.wxString) : "",
          };
        }

        function mockMetarDemoData() {
          const iso = new Date().toISOString();
          const obsBase = Math.floor(Date.now() / 1000);
          const mk = (i, o) => ({
            receiptTime: iso,
            obsTime: obsBase - i * 30,
            reportTime: iso,
            temp: 20,
            fltCat: "VFR",
            ...o,
          });
          return [
            mk(0, {
              metar_id: 9001,
              icaoId: "ZBAA",
              temp: 5,
              rawOb: "METAR ZBAA 240600Z 36005KT 9999 FEW030 05/02 Q1013 NOSIG",
              fltCat: "VFR",
              lat: 40.08,
              lon: 116.58,
              name: "Beijing/Capital, CN",
            }),
            mk(1, {
              metar_id: 9002,
              icaoId: "ZSPD",
              temp: 18,
              rawOb: "METAR ZSPD 240600Z 27008KT 9999 FEW025 18/12 Q1013 NOSIG",
              fltCat: "MVFR",
              lat: 31.15,
              lon: 121.8,
              name: "Shanghai/Pudong, CN",
            }),
            mk(2, {
              metar_id: 9003,
              icaoId: "ZGGG",
              temp: 24,
              rawOb: "METAR ZGGG 240600Z 02005KT 8000 FEW030 24/20 Q1008 NOSIG",
              fltCat: "IFR",
              lat: 23.39,
              lon: 113.31,
              name: "Guangzhou/Baiyun, CN",
            }),
            mk(3, {
              metar_id: 9004,
              icaoId: "ZGSZ",
              temp: 26,
              rawOb: "METAR ZGSZ 240600Z 02008KT 9999 SCT030 26/22 Q1008 NOSIG",
              fltCat: "VFR",
              lat: 22.639,
              lon: 113.812,
              name: "Shenzhen/Bao'an, CN",
            }),
            mk(4, {
              metar_id: 9005,
              icaoId: "ZSHC",
              temp: 16,
              rawOb: "METAR ZSHC 240600Z 32006KT 9999 FEW025 16/10 Q1013 NOSIG",
              fltCat: "MVFR",
              lat: 30.236,
              lon: 120.434,
              name: "Hangzhou/Xiaoshan, CN",
            }),
            mk(5, {
              metar_id: 9006,
              icaoId: "ZUUU",
              temp: 14,
              rawOb: "METAR ZUUU 240600Z 31004KT 9999 FEW040 14/08 Q1020 NOSIG",
              fltCat: "VFR",
              lat: 30.58,
              lon: 103.95,
              name: "Chengdu/Shuangliu, CN",
            }),
            mk(6, {
              metar_id: 9007,
              icaoId: "ZLXY",
              temp: 12,
              rawOb: "METAR ZLXY 240600Z 29005KT 9999 SCT025 12/04 Q1018 NOSIG",
              fltCat: "VFR",
              lat: 34.44,
              lon: 108.75,
              name: "Xi'an/Xianyang, CN",
            }),
            mk(7, {
              metar_id: 9008,
              icaoId: "ZHEC",
              temp: 18,
              rawOb: "METAR ZHEC 240600Z 04005KT 9999 FEW030 18/12 Q1012 NOSIG",
              fltCat: "VFR",
              lat: 30.323,
              lon: 114.773,
              name: "Ezhou/Huahu, CN",
            }),
            mk(8, {
              metar_id: 9009,
              icaoId: "RJTT",
              temp: 14,
              rawOb: "METAR RJTT 240600Z 32012KT 9999 SCT020 14/08 Q1015 NOSIG",
              fltCat: "VFR",
              lat: 35.68,
              lon: 139.78,
              name: "Tokyo/Haneda, JP",
            }),
            mk(9, {
              metar_id: 9010,
              icaoId: "RJFF",
              temp: 12,
              rawOb: "METAR RJFF 240600Z 28010KT 9999 FEW025 12/06 Q1012 NOSIG",
              fltCat: "VFR",
              lat: 33.58,
              lon: 130.45,
              name: "Fukuoka, JP",
            }),
            mk(10, {
              metar_id: 9011,
              icaoId: "RKSI",
              temp: 8,
              rawOb: "METAR RKSI 240600Z 32008KT 9999 BKN040 08/02 Q1025 NOSIG",
              fltCat: "MVFR",
              lat: 37.46,
              lon: 126.45,
              name: "Seoul/Incheon, KR",
            }),
            mk(11, {
              metar_id: 9012,
              icaoId: "VHHH",
              temp: 22,
              rawOb: "METAR VHHH 240600Z 09010KT 9999 FEW030 22/18 Q1010 NOSIG",
              fltCat: "VFR",
              lat: 22.31,
              lon: 113.92,
              name: "Hong Kong Intl, HK",
            }),
            mk(12, {
              metar_id: 9013,
              icaoId: "RCTP",
              temp: 19,
              rawOb: "METAR RCTP 240600Z 06006KT 9999 FEW035 19/14 Q1011 NOSIG",
              fltCat: "VFR",
              lat: 25.08,
              lon: 121.23,
              name: "Taipei/Taoyuan, TW",
            }),
            mk(13, {
              metar_id: 9014,
              icaoId: "WSSS",
              temp: 28,
              rawOb: "METAR WSSS 240600Z 04008KT 9999 FEW030 28/24 Q1009 NOSIG",
              fltCat: "VFR",
              lat: 1.35,
              lon: 103.99,
              name: "Singapore/Changi, SG",
            }),
            mk(14, {
              metar_id: 9015,
              icaoId: "WMKK",
              temp: 27,
              rawOb: "METAR WMKK 240600Z 02006KT 9999 SCT030 27/23 Q1008 NOSIG",
              fltCat: "VFR",
              lat: 2.75,
              lon: 101.71,
              name: "Kuala Lumpur Intl, MY",
            }),
            mk(15, {
              metar_id: 9016,
              icaoId: "VTBS",
              temp: 30,
              rawOb: "METAR VTBS 240600Z 09008KT 9999 FEW040 30/24 Q1007 NOSIG",
              fltCat: "VFR",
              lat: 13.69,
              lon: 100.75,
              name: "Bangkok/Suvarnabhumi, TH",
            }),
            mk(16, {
              metar_id: 9017,
              icaoId: "VIDP",
              temp: 28,
              rawOb: "METAR VIDP 240600Z 27005KT 4000 BR FEW030 28/18 Q1005 NOSIG",
              fltCat: "IFR",
              lat: 28.56,
              lon: 77.1,
              name: "Delhi/Indira Gandhi, IN",
            }),
            mk(17, {
              metar_id: 9018,
              icaoId: "KJFK",
              temp: 8,
              rawOb: "METAR KJFK 240600Z 28038G45KT 9999 FEW030 08/02 Q1015 NOSIG",
              fltCat: "VFR",
              wspd: 38,
              wgst: 45,
              visib: 10,
              lat: 40.64,
              lon: -73.78,
              name: "New York/Kennedy, US",
            }),
          ];
        }

        function mockTafDemoData() {
          const iso = new Date().toISOString();
          const obsBase = Math.floor(Date.now() / 1000);
          const mk = (i, o) => ({
            bulletinTime: iso,
            issueTime: iso,
            obsTime: obsBase - i * 120,
            ...o,
          });
          return [
            mk(0, {
              taf_id: 8001,
              icaoId: "ZBAA",
              fltCat: "VFR",
              rawOb:
                "TAF ZBAA 240600Z 2406/2512 36005KT 9999 FEW030 BECMG 2412/2414 BKN040 PROB40 TEMPO 2503/2506 4000 RA",
              name: "Beijing/Capital, CN",
            }),
            mk(1, {
              taf_id: 8002,
              icaoId: "ZGGG",
              fltCat: "IFR",
              rawOb:
                "TAF ZGGG 240600Z 2406/2512 02005KT 3000 BR FEW008 BKN020 BECMG 2410/2412 5000 NSW",
              name: "Guangzhou/Baiyun, CN",
            }),
            mk(2, {
              taf_id: 8003,
              icaoId: "KJFK",
              fltCat: "MVFR",
              rawOb:
                "TAF KJFK 240600Z 2406/2512 28025G38KT 9999 FEW030 TEMPO 2408/2412 TSRA",
              name: "New York/Kennedy, US",
            }),
            mk(3, {
              taf_id: 8004,
              icaoId: "ZSPD",
              fltCat: "IFR",
              rawOb:
                "TAF ZSPD 240600Z 2406/2512 27012KT 1800 BR BKN004 BECMG 2412/2414 3000 NSW",
              name: "Shanghai/Pudong, CN",
            }),
            mk(4, {
              taf_id: 8005,
              icaoId: "RKSI",
              fltCat: "LIFR",
              rawOb:
                "TAF RKSI 240600Z 2406/2512 32008KT 0400 FG VV002 BECMG 2408/2410 0800 BKN008",
              name: "Seoul/Incheon, KR",
            }),
          ];
        }

        function chunkIcaoList(arr, size) {
          const out = [];
          for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
          return out;
        }

        /** 公司 FOC 气象接口（经本地 dev-server 代理 /api/sf-foc/*，密钥不入前端） */
        const SF_FOC_API = {
          metTop: "/api/sf-foc/met/top",
          metarList: "/api/sf-foc/metar/list",
          tafList: "/api/sf-foc/taf/list",
          flightSchedule: "/api/sf-foc/flight/schedule",
        };
        /** metar/list 的 observationTime（文档示例为当前前 2h；UAT 常因此返回空 obj 而误回退 AWC） */
        const SF_FOC_METAR_LOOKBACK_MS = 12 * 60 * 60 * 1000;
        const SF_FOC_TAF_LOOKBACK_MS = 14 * 60 * 60 * 1000;

        function sfFocAccessHint() {
          if (typeof location !== "undefined" && location.protocol === "file:") {
            return "不能直接打开本地 HTML 文件。请在项目目录运行 npm start，用 http://localhost:8787/index.html 打开";
          }
          return "请运行 npm start；配置 data/sf-foc-config.local.json（systemKey/accessKey）；丰声扫码后写入 token（cas_login.py 或 node tools/sf-foc-set-token.cjs）";
        }

        function formatSfFocFetchError(err) {
          const msg = String(err?.message || err || "接口不可用");
          if (typeof location !== "undefined" && location.protocol === "file:") {
            return sfFocAccessHint();
          }
          if (/^无法连接公司气象服务器/.test(msg)) return msg;
          if (/缺少 CAS token/i.test(msg)) {
            return "缺少丰声登录 token：运行 cas_login.py 扫码，或 node tools/sf-foc-set-token.cjs <token>";
          }
          if (/SF FOC 未配置|503/.test(msg)) {
            return "公司接口未配置完整：" + sfFocAccessHint();
          }
          if (/ENOTFOUND.*sfcloud|getaddrinfo ENOTFOUND/i.test(msg)) {
            return (
              "无法连接公司气象服务器：本机 DNS 无法解析配置中的 baseUrl 域名（见 docs/it-foc/README.md，UAT 网关 *.int-inn.sfcloud.local:1080）。" +
              "域名:端口写法正确，需本机网络能解析该域名；运行 node tools/sf-foc-ping.cjs 可自检。"
            );
          }
          if (/Proxy error|ECONNREFUSED|ENOTFOUND|getaddrinfo|ETIMEDOUT|socket hang up/i.test(msg)) {
            const detail = msg.replace(/^Proxy error:\s*/i, "");
            return `无法连接公司气象服务器：${detail}`;
          }
          return msg;
        }

        function getMessageMonitorIcaoList() {
          let base;
          if (flightMonitorIcao.size) base = [...flightMonitorIcao];
          else if (airportWhitelistIcao.size) base = [...airportWhitelistIcao];
          else base = [...METAR_MAJOR_ICAO];
          return [...new Set(base.map((x) => String(x).trim().toUpperCase()).filter((x) => x.length === 4))];
        }

        function updateMsgPoolTag() {
          const el = document.getElementById("msgPoolTag");
          if (!el) return;
          if (flightMonitorMeta.source === "flight" && flightMonitorMeta.count > 0) {
            el.textContent = `航班计划 ${flightMonitorMeta.count} 站`;
            el.title = `${flightMonitorMeta.flightCount} 个航班 · ${flightMonitorMeta.updated || ""}`;
            return;
          }
          if (airportWhitelistMeta.count > 0) {
            el.textContent = `白名单 ${airportWhitelistMeta.count} 站`;
            el.title = flightMonitorMeta.error || "航班计划不可用，使用静态白名单";
            return;
          }
          el.textContent = `枢纽 ${METAR_MAJOR_ICAO.length} 站`;
          el.title = "未接入航班计划与白名单，使用内置主要枢纽列表";
        }

        async function loadFlightMonitorConfig() {
          try {
            const res = await fetch(FLIGHT_MONITOR_CONFIG_STATIC, { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data.carriers)) flightMonitorConfig.carriers = data.carriers.map(String);
            if (Number(data.hoursBack) > 0) flightMonitorConfig.hoursBack = Number(data.hoursBack);
            if (Number(data.hoursAhead) > 0) flightMonitorConfig.hoursAhead = Number(data.hoursAhead);
            if (Number(data.refreshMinutes) > 0) flightMonitorConfig.refreshMinutes = Number(data.refreshMinutes);
          } catch (_) {}
        }

        function airportsFromFlights(flights) {
          const carriers = flightMonitorConfig.carriers;
          const carrierSet =
            Array.isArray(carriers) && carriers.length
              ? new Set(carriers.map((c) => String(c).trim().toUpperCase()).filter(Boolean))
              : null;
          const out = new Set();
          for (const f of flights) {
            if (!f || typeof f !== "object") continue;
            if (carrierSet && !carrierSet.has(String(f.carrier || "").trim().toUpperCase())) continue;
            for (const key of ["departureAirport", "arrivalAirport"]) {
              const code = String(f[key] || "")
                .trim()
                .toUpperCase();
              if (code.length === 4) out.add(code);
            }
          }
          return out;
        }

        async function fetchSfFocFlightSchedule() {
          const now = Date.now();
          return sfFocPostJson(SF_FOC_API.flightSchedule, {
            startTime: now - flightMonitorConfig.hoursBack * 60 * 60 * 1000,
            endTime: now + flightMonitorConfig.hoursAhead * 60 * 60 * 1000,
            excludeCancel: true,
            excludeHaveAta: true,
          });
        }

        function canUseLocalWorkbenchBackend() {
          const host = String(location.hostname || "").toLowerCase();
          return host === "localhost" || host === "127.0.0.1";
        }

        function isStaticHuiDeploy() {
          return !canUseLocalWorkbenchBackend();
        }

        async function fetchWithTimeout(url, options = {}, ms = 6000) {
          const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
          try {
            return await fetch(url, ctrl ? { ...options, signal: ctrl.signal } : options);
          } finally {
            if (timer) clearTimeout(timer);
          }
        }

        /** 慧应用 iframe 下用 script 基准路径解析 data/、assets/ */
        function resolveAppAssetUrl(relativePath) {
          const rel = String(relativePath || "").replace(/^\//, "");
          try {
            for (const node of document.querySelectorAll("script[src]")) {
              const src = node.getAttribute("src") || "";
              if (/assets\/(app|bootstrap|head-boot)\.js/i.test(src)) {
                return new URL(rel, src).href;
              }
            }
          } catch (_) {}
          try {
            return new URL(rel, window.location.href).href;
          } catch (_) {
            return rel;
          }
        }

        async function loadFlightMonitorAirports() {
          if (!canUseLocalWorkbenchBackend()) {
            flightMonitorIcao = new Set();
            flightMonitorMeta = {
              source: "none",
              count: 0,
              flightCount: 0,
              updated: null,
              error: "慧应用静态托管，未接入航班计划",
            };
            updateMsgPoolTag();
            return;
          }
          try {
            const flights = await fetchSfFocFlightSchedule();
            const set = airportsFromFlights(flights);
            if (!set.size) {
              flightMonitorIcao = new Set();
              flightMonitorMeta = {
                source: "none",
                count: 0,
                flightCount: flights.length,
                updated: null,
                error: "航班列表为空或承运人过滤后无机场",
              };
            } else {
              flightMonitorIcao = set;
              flightMonitorMeta = {
                source: "flight",
                count: set.size,
                flightCount: flights.length,
                updated: new Date().toLocaleString("zh-CN", { hour12: false }),
                error: "",
              };
            }
          } catch (e) {
            flightMonitorIcao = new Set();
            flightMonitorMeta = {
              source: "none",
              count: 0,
              flightCount: 0,
              updated: null,
              error: formatSfFocFetchError(e),
            };
          }
          updateMsgPoolTag();
          updatePlatformHealthClientHints();
          return flightMonitorMeta.source === "flight";
        }

        function scheduleFlightMonitorRefresh() {
          if (flightMonitorTimer) clearInterval(flightMonitorTimer);
          const ms = Math.max(5, flightMonitorConfig.refreshMinutes) * 60 * 1000;
          flightMonitorTimer = setInterval(async () => {
            const ok = await loadFlightMonitorAirports();
            if (!ok) return;
            await Promise.all([loadMessages({ silent: true }), loadTafMessages({ silent: true })]).catch(() => {});
          }, ms);
        }

        async function fetchSfFocMetarBatch(codes) {
          const uniq = [...new Set(codes.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
          if (!uniq.length) return [];
          const now = Date.now();
          const chunks = chunkIcaoList(uniq, 40);
          const parts = await Promise.all(
            chunks.map((chunk) =>
              sfFocPostJson(SF_FOC_API.metarList, {
                airport4Codes: chunk,
                observationTime: now - SF_FOC_METAR_LOOKBACK_MS,
              }),
            ),
          );
          return parts.flat();
        }

        async function fetchSfFocTafBatch(codes) {
          const uniq = [...new Set(codes.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
          if (!uniq.length) return [];
          const now = Date.now();
          const chunks = chunkIcaoList(uniq, 40);
          const parts = await Promise.all(
            chunks.map((chunk) =>
              sfFocPostJson(SF_FOC_API.tafList, {
                airport4Codes: chunk,
                observationTime: now - SF_FOC_TAF_LOOKBACK_MS,
              }),
            ),
          );
          return parts.flat();
        }

        function normalizeSfFocMetarForList(row, idx) {
          const icao = String(row.airport4Code || "").toUpperCase();
          return {
            id: `sfoc-metar-${row.sqc != null ? row.sqc : icao}-${idx}`,
            type: "METAR",
            station: icao,
            time: formatSfTimestampMs(row.observationTime || row.receiveTime),
            raw: String(row.content || ""),
            level: "low",
            receivedAt: row.receiveTime ? formatSfTimestampMs(row.receiveTime) : "",
            source: "公司 FOC",
            obsTime: Number(row.observationTime) || Number(row.receiveTime) || 0,
            flight_category: "UNK",
            sfFocRyg: row.ryg != null ? String(row.ryg) : "",
            weatherryg: row.weatherryg != null ? String(row.weatherryg) : "",
          };
        }

        function normalizeSfFocTafForList(row, idx) {
          const icao = String(row.airport4Code || "").toUpperCase();
          return {
            id: `sfoc-taf-${row.sqc != null ? row.sqc : icao}-${idx}`,
            type: "TAF",
            station: icao,
            time: formatSfTimestampMs(row.observationTime || row.receiveTime),
            raw: String(row.content || ""),
            level: "low",
            receivedAt: row.receiveTime ? formatSfTimestampMs(row.receiveTime) : "",
            source: "公司 FOC",
            obsTime: Number(row.observationTime) || Number(row.receiveTime) || 0,
            flight_category: "UNK",
            sfFocRyg: row.ryg != null ? String(row.ryg) : "",
            weatherryg: row.weatherryg != null ? String(row.weatherryg) : "",
          };
        }

        function mapSfFocMetarRows(rows) {
          const map = new Map();
          for (const row of rows) {
            const icao = String(row.airport4Code || "").toUpperCase();
            if (!icao) continue;
            const obs = Number(row.observationTime) || Number(row.receiveTime) || 0;
            const prev = map.get(icao);
            const prevObs = prev ? Number(prev.observationTime) || Number(prev.receiveTime) || 0 : -1;
            if (!prev || obs >= prevObs) map.set(icao, row);
          }
          return [...map.values()];
        }

        function mapSfFocTafRows(rows) {
          return mapSfFocMetarRows(rows);
        }

        function formatSfTimestampMs(ms) {
          const n = Number(ms);
          if (!n) return "—";
          const d = new Date(n);
          if (Number.isNaN(d.getTime())) return "—";
          const mo = (d.getUTCMonth() + 1).toString().padStart(2, "0");
          const da = d.getUTCDate().toString().padStart(2, "0");
          const h = d.getUTCHours().toString().padStart(2, "0");
          const mi = d.getUTCMinutes().toString().padStart(2, "0");
          return `${mo}-${da} ${h}:${mi}Z`;
        }

        async function sfFocPostJson(apiPath, body) {
          const r = await fetch(apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
          });
          let data = null;
          try {
            data = await r.json();
          } catch (_) {
            throw new Error(`HTTP ${r.status}`);
          }
          if (!r.ok || !data || data.success !== true) {
            throw new Error(String(data?.errorMessage || `HTTP ${r.status}`));
          }
          return Array.isArray(data.obj) ? data.obj : [];
        }

        function normalizeSfFocMetarRow(row) {
          if (!row) return null;
          const raw = String(row.content || "").trim();
          if (!raw) return null;
          return {
            raw,
            time: formatSfTimestampMs(row.observationTime || row.receiveTime),
            receivedAt: row.receiveTime ? formatSfTimestampMs(row.receiveTime) : "",
            source: "sf-foc",
          };
        }

        function normalizeSfFocTafRow(row) {
          if (!row) return null;
          const raw = String(row.content || "").trim();
          if (!raw) return null;
          return {
            raw,
            time: formatSfTimestampMs(row.observationTime || row.receiveTime),
            receivedAt: row.receiveTime ? formatSfTimestampMs(row.receiveTime) : "",
            source: "sf-foc",
          };
        }

        function pickLatestSfFocRow(rows, wtypes) {
          const want = new Set(wtypes.map((w) => String(w).toUpperCase()));
          return [...rows]
            .filter((r) => want.has(String(r.wtype || r.type || "").toUpperCase()))
            .sort((a, b) => (Number(b.receiveTime) || 0) - (Number(a.receiveTime) || 0))[0];
        }

        async function fetchSfFocLatestForAirport(icao) {
          const code = String(icao || "").trim().toUpperCase();
          if (!code) return { metar: null, taf: null };
          const errors = [];
          let metar = null;
          let taf = null;

          try {
            const qs = new URLSearchParams({ code4: code, metarOrTafTopNum: "1", wsOrWaTopNum: "0" });
            const rows = await sfFocPostJson(`${SF_FOC_API.metTop}?${qs.toString()}`, {});
            metar = normalizeSfFocMetarRow(pickLatestSfFocRow(rows, ["SA"]));
            taf = normalizeSfFocTafRow(pickLatestSfFocRow(rows, ["FT", "FC"]));
          } catch (e) {
            errors.push(String(e?.message || e));
          }

          if (!metar || !taf) {
            const now = Date.now();
            try {
              const tasks = [];
              if (!metar) {
                tasks.push(
                  sfFocPostJson(SF_FOC_API.metarList, {
                    airport4Codes: [code],
                    observationTime: now - SF_FOC_METAR_LOOKBACK_MS,
                  }).then((rows) => {
                    const row =
                      rows.find((r) => String(r.airport4Code || "").toUpperCase() === code) || rows[0] || null;
                    metar = normalizeSfFocMetarRow(row);
                  }),
                );
              }
              if (!taf) {
                tasks.push(
                  sfFocPostJson(SF_FOC_API.tafList, {
                    airport4Codes: [code],
                    observationTime: now - SF_FOC_TAF_LOOKBACK_MS,
                  }).then((rows) => {
                    const row =
                      rows.find((r) => String(r.airport4Code || "").toUpperCase() === code) || rows[0] || null;
                    taf = normalizeSfFocTafRow(row);
                  }),
                );
              }
              await Promise.all(tasks);
            } catch (e) {
              errors.push(String(e?.message || e));
            }
          }

          if (!metar && !taf) {
            throw new Error(formatSfFocFetchError(new Error(errors[0] || "公司接口未返回报文")));
          }
          return { metar, taf, partialError: errors.length ? formatSfFocFetchError(new Error(errors[0])) : "" };
        }

        async function fetchMetarJsonRaw() {
          const isLocalHost =
            typeof location !== "undefined" &&
            (location.hostname === "localhost" || location.hostname === "127.0.0.1");
          const uniq = [...new Set(METAR_MAJOR_ICAO.map((x) => String(x).trim().toUpperCase()))];
          const chunks = chunkIcaoList(uniq, 35);

          async function fetchOneChunk(chunk) {
            const qs = new URLSearchParams({
              ids: chunk.join(","),
              format: "json",
              taf: "false",
              hours: "2",
            });
            const qstr = qs.toString();
            const direct = `https://aviationweather.gov/api/data/metar?${qstr}`;
            const proxy = `/api/data/metar?${qstr}`;
            const urls = isLocalHost ? [proxy, direct] : [direct, proxy];
            for (const url of urls) {
              try {
                const r = await fetchWithTimeout(url, { cache: "no-store" }, 5000);
                if (!r.ok) continue;
                const data = await r.json();
                const rows = parseMetarArray(data);
                if (rows.length) return { rows, viaProxy: url.startsWith("/") };
              } catch (_) {}
            }
            return { rows: [], viaProxy: false };
          }

          const parts = await Promise.all(chunks.map((c) => fetchOneChunk(c)));
          const rows = parts.flatMap((p) => p.rows);
          const viaProxy = parts.some((p) => p.viaProxy);
          if (!rows.length) return null;
          return { rows, source: viaProxy ? "proxy" : "direct" };
        }

        async function fetchTafJsonRaw() {
          const isLocalHost =
            typeof location !== "undefined" &&
            (location.hostname === "localhost" || location.hostname === "127.0.0.1");
          const uniq = [...new Set(METAR_MAJOR_ICAO.map((x) => String(x).trim().toUpperCase()))];
          const chunks = chunkIcaoList(uniq, 35);

          async function fetchOneChunk(chunk) {
            const qs = new URLSearchParams({
              ids: chunk.join(","),
              format: "json",
            });
            const qstr = qs.toString();
            const direct = `https://aviationweather.gov/api/data/taf?${qstr}`;
            const proxy = `/api/data/taf?${qstr}`;
            const urls = isLocalHost ? [proxy, direct] : [direct, proxy];
            for (const url of urls) {
              try {
                const r = await fetchWithTimeout(url, { cache: "no-store" }, 5000);
                if (!r.ok) continue;
                const data = await r.json();
                const rows = parseMetarArray(data);
                if (rows.length) return { rows, viaProxy: url.startsWith("/") };
              } catch (_) {}
            }
            return { rows: [], viaProxy: false };
          }

          const parts = await Promise.all(chunks.map((c) => fetchOneChunk(c)));
          const rows = parts.flatMap((p) => p.rows);
          const viaProxy = parts.some((p) => p.viaProxy);
          if (!rows.length) return null;
          return { rows, source: viaProxy ? "proxy" : "direct" };
        }

        function normalizeWhitelistPayload(data) {
          const out = [];
          const pushIcao = (s) => {
            const x = String(s || "")
              .trim()
              .toUpperCase();
            if (x.length >= 3 && x.length <= 4) out.push(x);
          };
          if (!data) return { icao: [], version: null, updated: null };
          if (Array.isArray(data)) {
            data.forEach((x) => (typeof x === "string" ? pushIcao(x) : x && pushIcao(x.icao)));
            return { icao: [...new Set(out)], version: null, updated: null };
          }
          const version = data.version != null ? String(data.version) : null;
          const updated = data.updated != null ? String(data.updated) : null;
          if (Array.isArray(data.icao)) data.icao.forEach(pushIcao);
          if (Array.isArray(data.items)) {
            data.items.forEach((it) => {
              if (typeof it === "string") pushIcao(it);
              else if (it && it.icao) pushIcao(it.icao);
            });
          }
          if (Array.isArray(data.airports)) {
            data.airports.forEach((it) => {
              if (typeof it === "string") pushIcao(it);
              else if (it && it.icao) pushIcao(it.icao);
            });
          }
          return { icao: [...new Set(out)], version, updated };
        }

        function updateWhitelistTag() {
          if (!msgWhitelistTag) return;
          const { source, count, version, updated } = airportWhitelistMeta;
          const srcLabel =
            source === "api" ? "接口" : source === "static" ? "静态文件" : source === "fallback" ? "内置默认" : "未加载";
          const bits = [`白名单 ${count} 站`, srcLabel];
          if (version) bits.push(`v${version}`);
          if (updated) bits.push(updated);
          msgWhitelistTag.textContent = bits.join(" · ");
        }

        async function loadSfApprovedAirports() {
          try {
            const res = await fetchWithTimeout(resolveAppAssetUrl(SF_APPROVED_AIRPORTS_STATIC), { cache: "no-store" }, 8000);
            if (!res.ok) return;
            const data = await res.json();
            const items = Array.isArray(data?.items) ? data.items : [];
            const map = new Map();
            for (const it of items) {
              const icao = String(it?.icao || "")
                .trim()
                .toUpperCase();
              if (icao.length !== 4) continue;
              map.set(icao, {
                name: String(it.name || icao).trim(),
                iata: it.iata != null ? String(it.iata) : null,
                city: it.city != null ? String(it.city) : null,
                fir: it.fir != null ? String(it.fir) : null,
                lat: Number.isFinite(it.lat) ? it.lat : undefined,
                lon: Number.isFinite(it.lon) ? it.lon : undefined,
              });
            }
            if (map.size) sfApprovedAirportsMap = map;
            updatePlatformHealthClientHints();
          } catch (_) {}
        }

        function applyAlertPublishMode(raw) {
          const m = raw?.alertPublishMode != null ? String(raw.alertPublishMode) : "";
          if (m === "union" || m === "staticOnly" || m === "allowAllValidIcao") alertPublishMode = m;
        }

        async function loadAirportWhitelist() {
          const apply = (norm, /** @type {"api"|"static"|"fallback"} */ source, raw) => {
            airportWhitelistIcao = new Set(norm.icao);
            applyAlertPublishMode(raw);
            airportWhitelistMeta = {
              source,
              version: norm.version,
              updated: norm.updated,
              count: airportWhitelistIcao.size,
            };
            updateWhitelistTag();
            updateMsgPoolTag();
          };
          try {
            if (!isStaticHuiDeploy()) {
              const res = await fetchWithTimeout(AIRPORT_WHITELIST_API, { cache: "no-store" }, 4000);
              if (res.ok) {
                const data = await res.json();
                const norm = normalizeWhitelistPayload(data);
                if (norm.icao.length) {
                  apply(norm, "api", data);
                  return;
                }
              }
            }
          } catch (_) {}
          try {
            const res = await fetchWithTimeout(resolveAppAssetUrl(AIRPORT_WHITELIST_STATIC), { cache: "no-store" }, 6000);
            if (res.ok) {
              const data = await res.json();
              const norm = normalizeWhitelistPayload(data);
              if (norm.icao.length) {
                apply(norm, "static", data);
                return;
              }
            }
          } catch (_) {}
          apply(normalizeWhitelistPayload({ icao: DEFAULT_ICAO_WHITELIST }), "fallback", null);
        }

        function normalizeMessageItem(m, idx) {
          const raw = m.raw != null ? String(m.raw) : "";
          const type = (m.type && String(m.type)) || "METAR";
          const station = (m.station && String(m.station).toUpperCase()) || "----";
          const id = m.id != null ? String(m.id) : `msg-${idx}-${station}-${type}`;
          const fc = m.flight_category != null ? String(m.flight_category).toUpperCase() : "";
          const levelFromFc = fc && fc !== "UNK" ? flightCategoryToLevel(fc) : null;
          return {
            ...m,
            id,
            type,
            station,
            time: m.time != null ? String(m.time) : nowHHMM(),
            raw: raw || "（无正文）",
            level: m.level || levelFromFc || normalizeLevel(raw || type),
            receivedAt: m.receivedAt != null ? String(m.receivedAt) : "",
            source: m.source != null ? String(m.source) : "",
            flight_category: fc || m.flight_category,
          };
        }

        function syncMsgStatus() {
          if (!msgStatus) return;
          const parts = [];
          if (metarSourceLive) {
            parts.push(
              metarDataSource === "sf-foc"
                ? "METAR·公司FOC"
                : metarDataSource === "awc"
                  ? "METAR·AWC"
                  : metarDataSource === "demo"
                    ? "METAR·演示"
                    : "METAR"
            );
          } else if (metarDataSource === "demo") {
            parts.push("METAR·演示");
          }
          if (tafSourceLive) {
            parts.push(
              tafDataSource === "sf-foc"
                ? "TAF·公司FOC"
                : tafDataSource === "awc"
                  ? "TAF·AWC"
                  : tafDataSource === "demo"
                    ? "TAF·演示"
                    : "TAF"
            );
          } else if (tafDataSource === "demo") {
            parts.push("TAF·演示");
          }
          msgStatus.textContent = parts.length ? parts.join(" ") : "离线";
          updatePlatformHealthClientHints();
        }

        /** @type {{ metar?: string, taf?: string, airportPool?: string, approved?: string }} */
        let platformHealthClientHints = {};
        let platformHealthOpen = false;

        function updatePlatformHealthClientHints() {
          platformHealthClientHints.metar = metarDataSource || "—";
          platformHealthClientHints.taf = tafDataSource || "—";
          if (flightMonitorMeta.source === "flight" && flightMonitorMeta.count > 0) {
            platformHealthClientHints.airportPool = `航班计划 ${flightMonitorMeta.count} 站`;
          } else if (airportWhitelistMeta.count > 0) {
            platformHealthClientHints.airportPool = `批复/白名单 ${airportWhitelistMeta.count} 站`;
          } else {
            platformHealthClientHints.airportPool = `枢纽 ${METAR_MAJOR_ICAO.length} 站`;
          }
          platformHealthClientHints.approved =
            sfApprovedAirportsMap.size > 0 ? `${sfApprovedAirportsMap.size} 站已加载` : "未加载";
          renderPlatformHealthGrid(window.__platformHealthLast || null);
        }

        function renderPlatformHealthGrid(serverData) {
          const grid = document.getElementById("platformHealthGrid");
          if (!grid) return;
          const items = [];
          const localOk = location.protocol !== "file:" && (location.port === "8787" || !location.port);
          items.push({
            label: "本地服务",
            value: localOk ? "正常" : "异常",
            detail: localOk ? `:${location.port || "80"}` : "请用 start.bat 打开 8787",
            state: localOk ? "ok" : "bad",
          });

          const foc = serverData?.foc || {};
          items.push({
            label: "公司 FOC",
            value: foc.ready ? "就绪" : foc.configured ? "未就绪" : "未配置",
            detail: foc.ready
              ? foc.host || "DNS·token OK"
              : foc.hasToken
                ? foc.dns && typeof foc.dns === "string" && !foc.dns.includes("ENOTFOUND")
                  ? "接口待验证"
                  : "DNS/VPN"
                : "缺 token",
            state: foc.ready ? "ok" : foc.configured ? "warn" : "bad",
          });

          const metSrc = platformHealthClientHints.metar || "—";
          const tafSrc = platformHealthClientHints.taf || "—";
          const metDemo = metSrc === "demo";
          const tafDemo = tafSrc === "demo";
          items.push({
            label: "METAR 来源",
            value:
              metSrc === "sf-foc"
                ? "公司 FOC"
                : metSrc === "awc"
                  ? "AWC 公网"
                  : metSrc === "demo"
                    ? "演示数据"
                    : metSrc,
            detail: metDemo ? "不可用于运行" : "",
            state: metSrc === "sf-foc" ? "ok" : metSrc === "awc" ? "warn" : metDemo ? "bad" : "warn",
          });
          items.push({
            label: "TAF 来源",
            value:
              tafSrc === "sf-foc"
                ? "公司 FOC"
                : tafSrc === "awc"
                  ? "AWC 公网"
                  : tafSrc === "demo"
                    ? "演示数据"
                    : tafSrc,
            detail: tafDemo ? "不可用于运行" : "",
            state: tafSrc === "sf-foc" ? "ok" : tafSrc === "awc" ? "warn" : tafDemo ? "bad" : "warn",
          });

          items.push({
            label: "监控机场池",
            value: platformHealthClientHints.airportPool || "—",
            detail: flightMonitorMeta.error || "",
            state:
              flightMonitorMeta.source === "flight"
                ? "ok"
                : sfApprovedAirportsMap.size || airportWhitelistMeta.count
                  ? "warn"
                  : "bad",
          });

          items.push({
            label: "批复机场",
            value: platformHealthClientHints.approved || "—",
            detail: serverData?.approvedAirports?.sourceFile || "",
            state: sfApprovedAirportsMap.size > 0 ? "ok" : "warn",
          });

          const review = serverData?.review || {};
          items.push({
            label: "今日相关",
            value: review.ok ? "在线" : "离线",
            detail: review.semantic_enabled === false ? "语义模型未启用" : review.role === "client" ? "轻客户端" : "",
            state: review.ok ? "ok" : "warn",
          });

          grid.innerHTML = items
            .map(
              (it) => `<div class="platform-health-item is-${it.state}">
              <span class="ph-label">${escapeHtml(it.label)}</span>
              <span class="ph-value">${escapeHtml(it.value)}</span>
              ${it.detail ? `<span class="ph-detail">${escapeHtml(it.detail)}</span>` : ""}
            </div>`
            )
            .join("");

          const toggleBtn = document.getElementById("platformHealthToggleBtn");
          if (toggleBtn) {
            const hasBad = items.some((it) => it.state === "bad");
            const hasWarn = items.some((it) => it.state === "warn");
            toggleBtn.classList.toggle("is-bad", hasBad);
            toggleBtn.classList.toggle("is-warn", !hasBad && hasWarn);
          }
        }

        function setPlatformHealthOpen(open) {
          platformHealthOpen = open;
          const panel = document.getElementById("platformHealthPanel");
          const toggleBtn = document.getElementById("platformHealthToggleBtn");
          if (panel) {
            panel.hidden = !open;
            panel.classList.toggle("is-open", open);
            panel.setAttribute("aria-hidden", open ? "false" : "true");
          }
          if (toggleBtn) toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
          if (open) refreshPlatformHealth();
        }

        async function refreshPlatformHealth() {
          try {
            const res = await fetch("/api/platform/health", { cache: "no-store" });
            if (res.ok) {
              const data = await res.json();
              window.__platformHealthLast = data;
              renderPlatformHealthGrid(data);
              return data;
            }
          } catch (_) {}
          renderPlatformHealthGrid(null);
          return null;
        }

        function isMainlandChinaIcao(icao) {
          const c = String(icao || "").trim().toUpperCase();
          return c.length >= 1 && c[0] === "Z";
        }

        function msgPassesRegionFilter(station) {
          if (msgRegionMode === "all") return true;
          const dom = isMainlandChinaIcao(station);
          if (msgRegionMode === "domestic") return dom;
          if (msgRegionMode === "intl") return !dom;
          return true;
        }

        function messagesInScopeBase(messages) {
          const wlOnly = msgWhitelistOnly?.checked === true;
          return messages.filter((m) => {
            if (!msgPassesRegionFilter(m.station)) return false;
            if (wlOnly && airportWhitelistIcao.size > 0) {
              const st = String(m.station || "").toUpperCase();
              if (!airportWhitelistIcao.has(st)) return false;
            }
            return true;
          });
        }

        function countMessagesScopeTotal(messages) {
          return messagesInScopeBase(messages).length;
        }

        function syncMsgRegionButtons() {
          subMsgCard?.querySelectorAll("[data-msg-region]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-msg-region") === msgRegionMode);
          });
        }

        function messageCompanyLevel(m) {
          const lv = String(m?.companyLevel || "").toUpperCase();
          if (lv === "R" || lv === "Y" || lv === "G") return lv;
          const r = Number(m?.severityRank);
          if (Number.isFinite(r) && r > 0) return rankToCompanyLevel(r) || "";
          const sr = companyLevelToRank(m?.severity || "none");
          return rankToCompanyLevel(sr) || "";
        }

        function messagePassesColorFilter(m, filter) {
          if (!filter || filter === "all") return true;
          const lv = messageCompanyLevel(m);
          return lv === filter;
        }

        /** 列表行红/黄/绿徽章（与筛选、FOC 判色一致） */
        function messageListBadgeHtml(m) {
          const lv = messageCompanyLevel(m);
          if (lv === "R") {
            return { rowCls: "msg-row--sev-crit", badge: '<span class="msg-sev-badge crit">红</span>' };
          }
          if (lv === "Y") {
            return { rowCls: "msg-row--sev-warn", badge: '<span class="msg-sev-badge warn">黄</span>' };
          }
          if (lv === "G") {
            return { rowCls: "msg-row--sev-caution", badge: '<span class="msg-sev-badge caution">绿</span>' };
          }
          return { rowCls: "", badge: "" };
        }

        function syncMsgListColorFilterButtons() {
          subMsgCard?.querySelectorAll("[data-msg-metar-color]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-msg-metar-color") === msgMetarColorFilter);
          });
          subMsgCard?.querySelectorAll("[data-msg-taf-color]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-msg-taf-color") === msgTafColorFilter);
          });
        }

        function getFilteredMessages() {
          const wlOnly = msgWhitelistOnly?.checked === true;
          return lastMessages.filter((m) => {
            if (!msgPassesRegionFilter(m.station)) return false;
            if (wlOnly && airportWhitelistIcao.size > 0) {
              const st = String(m.station || "").toUpperCase();
              if (!airportWhitelistIcao.has(st)) return false;
            }
            if (!messagePassesColorFilter(m, msgMetarColorFilter)) return false;
            return true;
          });
        }

        function getFilteredTafMessages() {
          const wlOnly = msgWhitelistOnly?.checked === true;
          return lastTafMessages.filter((m) => {
            if (!msgPassesRegionFilter(m.station)) return false;
            if (wlOnly && airportWhitelistIcao.size > 0) {
              const st = String(m.station || "").toUpperCase();
              if (!airportWhitelistIcao.has(st)) return false;
            }
            if (!messagePassesColorFilter(m, msgTafColorFilter)) return false;
            return true;
          });
        }

        function extractBadWeatherCodesFromRaw(raw) {
          return matchPhenomenaInRaw(raw)
            .filter((p) => p.badWeather)
            .map((p) => p.match);
        }

        const METAR_REFINED_HEADERS = [
          "序号",
          "机场",
          "时间（世界时）",
          "自动报",
          "风向",
          "风向变化",
          "风速",
          "风速（KT）",
          "阵风",
          "阵风（KT）",
          "能见度（含趋势）",
          "跑道视程",
          "天气1",
          "天气2",
          "天气3",
          "云高1（含趋势）",
          "云高2",
          "云高3",
          "温度",
          "露点温度",
          "修正海压",
          "跑道状况",
          "风切变",
          "近时天气",
          "两小时趋势",
          "RMK项",
        ];

        const METAR_DUTY_REGION_PREFIX = {
          ZB: "华北",
          ZY: "东北",
          ZS: "华东",
          ZG: "中南",
          ZH: "中南",
          ZJ: "中南",
          ZL: "西北",
          ZU: "西南",
          ZP: "西南",
          ZW: "新疆",
        };

        function metarDutyRegion(icao) {
          const c = String(icao || "").trim().toUpperCase();
          if (!/^Z[A-Z0-9]{3}$/.test(c)) return "国际/地区";
          return METAR_DUTY_REGION_PREFIX[c.slice(0, 2)] || "中南";
        }

        function ktToMps(kt) {
          if (kt == null || !Number.isFinite(Number(kt))) return "";
          return (Number(kt) * 0.514444).toFixed(1);
        }

        function parseMetarTempToken(x) {
          const s = String(x || "");
          if (s.startsWith("M")) return -parseInt(s.slice(1), 10);
          return parseInt(s, 10);
        }

        function isWxToken(tok) {
          const t = normalizeReportToken(tok).toUpperCase();
          if (!t || t === "CAVOK" || t === "NOSIG" || t === "AUTO" || t === "COR") return false;
          if (/^Q\d{4}$/.test(t) || /^A\d{4}$/.test(t)) return false;
          if (/^(FEW|SCT|BKN|OVC|VV)/.test(t)) return false;
          if (/^R\d{2}/.test(t)) return false;
          if (/^\d{6}Z$/.test(t)) return false;
          if (/^(\d{3}|VRB)\d{2,3}/.test(t)) return false;
          if (/^\d{3}V\d{3}$/.test(t)) return false;
          if (/^M?\d{2}\/M?\d{2}$/.test(t)) return false;
          if (/^\d{4}$/.test(t)) return false;
          if (/^(BECMG|TEMPO|PROB\d{2}|FM\d{4}|TL\d{4}|AT\d{4}|RMK|NCD|NSC|SKC|CLR|NOSIG)$/i.test(t)) return false;
          return /^(\+|\-|±)?(VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?[A-Z0-9]{2,8}$/i.test(t) || Boolean(reportLexiconLookupToken(t));
        }

        /**
         * 分解 METAR 原文为精细化表格字段
         * @param {Record<string, any>} m
         */
        function decomposeMetarRefined(m) {
          const raw = String(m.raw || "").trim().replace(/=\s*$/, "");
          const parts = raw.split(/\s+/).filter(Boolean);
          let i = 0;
          if (/^(METAR|SPECI)$/i.test(parts[i])) i++;
          const stationFromRaw = parts[i] && /^[A-Z0-9]{4}$/.test(parts[i]) ? parts[i].toUpperCase() : "";
          if (stationFromRaw) i++;
          const timeUtc = parts[i] && /^\d{6}Z$/i.test(parts[i]) ? parts[i].toUpperCase() : String(m.time || "");
          if (/^\d{6}Z$/i.test(parts[i])) i++;

          const body = parts.slice(i);
          let auto = "";
          let windDir = "";
          let windVar = "";
          let windKt = "";
          let gustKt = "";
          let vis = "";
          let rvrParts = [];
          const wxTokens = [];
          const cloudTokens = [];
          let temp = "";
          let dew = "";
          let qnh = "";
          let rwyl = "";
          let ws = "";
          let recentWx = "";
          const trendParts = [];
          let rmk = "";
          let inRmk = false;
          let inTrend = false;

          const startsMetarTrend = (token) =>
            /^(BECMG|TEMPO|PROB\d{2}|FM\d{4})$/i.test(String(token || "").trim());

          for (const tok of body) {
            const t = String(tok || "").trim();
            if (!t) continue;
            const up = t.toUpperCase();
            if (inRmk) {
              rmk = rmk ? `${rmk} ${t}` : t;
              continue;
            }
            if (up === "RMK") {
              inRmk = true;
              inTrend = false;
              continue;
            }
            if (up === "NOSIG") {
              trendParts.push(t);
              inTrend = false;
              continue;
            }
            if (startsMetarTrend(t)) {
              inTrend = true;
              trendParts.push(t);
              continue;
            }
            if (inTrend) {
              trendParts.push(t);
              continue;
            }
            if (up === "AUTO" || up === "COR") {
              auto = up;
              continue;
            }
            const windM = t.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/i);
            if (windM && !windDir) {
              windDir = windM[1].toUpperCase();
              const unit = (windM[5] || "KT").toUpperCase();
              let spd = Number(windM[2]);
              let gst = windM[4] ? Number(windM[4]) : NaN;
              if (unit === "MPS") {
                spd = Math.round(spd / 0.514444);
                if (Number.isFinite(gst)) gst = Math.round(gst / 0.514444);
              } else if (unit === "KMH") {
                spd = Math.round(spd / 1.852);
                if (Number.isFinite(gst)) gst = Math.round(gst / 1.852);
              }
              windKt = String(spd);
              if (Number.isFinite(gst)) gustKt = String(gst);
              continue;
            }
            if (/^\d{3}V\d{3}$/i.test(t) && !windVar) {
              windVar = up;
              continue;
            }
            if (up === "CAVOK" && !vis) {
              vis = "CAVOK";
              continue;
            }
            if (/^R\d{2}[LCR]?\//i.test(t)) {
              rvrParts.push(t);
              continue;
            }
            if (/^\d{4}$/.test(t) && !vis) {
              vis = t;
              continue;
            }
            if ((/^\d+SM$/i.test(t) || /^M?\d\/\d{1,2}(SM)?$/i.test(t)) && !vis) {
              vis = t;
              continue;
            }
            if (/^(FEW|SCT|BKN|OVC|VV)/i.test(t)) {
              cloudTokens.push(t);
              continue;
            }
            if (/^M?\d{2}\/M?\d{2}$/.test(t)) {
              const tm = t.match(/^(M?\d{2})\/(M?\d{2})$/);
              if (tm) {
                temp = tm[1];
                dew = tm[2];
              }
              continue;
            }
            if (/^Q\d{4}$/i.test(t)) {
              qnh = up;
              continue;
            }
            if (/^A\d{4}$/.test(t) && !qnh) {
              qnh = up;
              continue;
            }
            if (/^RWY?(?:\d{2}[LCR]?|\d{2}\/\d{2})[A-Z]{1,3}$/i.test(t) || /^SNOCLO$/i.test(t)) {
              rwyl = rwyl ? `${rwyl} ${t}` : t;
              continue;
            }
            if (/^WS/i.test(t) || /WIND\s*SHEAR/i.test(t)) {
              ws = ws ? `${ws} ${t}` : t;
              continue;
            }
            if (/^(RE|RECENT)[A-Z0-9]+$/i.test(t)) {
              recentWx = recentWx ? `${recentWx} ${t}` : t;
              continue;
            }
            if (isWxToken(t)) {
              wxTokens.push(t);
              continue;
            }
          }

          if (!vis && m.visib != null) {
            const vm = getVisibilityMeters(m);
            if (vm != null) vis = `${Math.round(vm)}m`;
          }
          if (!windKt && Number.isFinite(Number(m.wspd))) windKt = String(Math.round(Number(m.wspd)));
          if (!gustKt && Number.isFinite(Number(m.wgst))) gustKt = String(Math.round(Number(m.wgst)));
          if (!temp && m.temp != null && Number.isFinite(Number(m.temp))) temp = String(Math.round(Number(m.temp)));

          return {
            station: String(m.station || stationFromRaw || "").toUpperCase(),
            timeUtc,
            auto,
            windDir,
            windVar,
            windMps: windKt ? ktToMps(windKt) : "",
            windKt,
            gustMps: gustKt ? ktToMps(gustKt) : "",
            gustKt,
            vis,
            rvr: rvrParts.join(" "),
            wx1: wxTokens[0] || "",
            wx2: wxTokens[1] || "",
            wx3: wxTokens[2] || "",
            cloud1: cloudTokens[0] || "",
            cloud2: cloudTokens[1] || "",
            cloud3: cloudTokens[2] || "",
            temp,
            dew,
            qnh,
            rwyl,
            ws,
            recentWx,
            trend2h: trendParts.join(" "),
            rmk,
            dutyRegion: metarDutyRegion(m.station || stationFromRaw),
          };
        }

        function refinedCellSeverityLegacy(kind, value, message) {
          const v = String(value || "").trim();
          const visCfg = LEGACY_METAR_RULES.visibility;
          const rvrCfg = LEGACY_METAR_RULES.rvr;
          const cloudCfg = LEGACY_METAR_RULES.cloudBase30m;
          const windCfg = LEGACY_METAR_RULES.wind;
          const gustCfg = LEGACY_METAR_RULES.gust;
          const bumpLegacy = (rank) => ({
            severity: rankToSeverity(rank),
            companyLevel: rankToCompanyLevel(rank),
          });

          if (kind === "windKt" || kind === "windMps") {
            const kt = kind === "windKt" ? Number(v) : Number(v) / 0.514444;
            if (Number.isFinite(kt)) {
              if (kt >= windCfg.criticalKts) return bumpLegacy(3);
              if (kt >= windCfg.warningKts) return bumpLegacy(2);
              if (kt >= windCfg.cautionKts) return bumpLegacy(1);
            }
          }
          if (kind === "gustKt" || kind === "gustMps") {
            const kt = kind === "gustKt" ? Number(v) : Number(v) / 0.514444;
            if (Number.isFinite(kt)) {
              if (kt >= gustCfg.criticalKts) return bumpLegacy(3);
              if (kt >= gustCfg.warningKts) return bumpLegacy(2);
              if (kt >= gustCfg.cautionKts) return bumpLegacy(1);
            }
          }
          if (kind === "vis") {
            if (/^CAVOK$/i.test(v)) return { severity: "none", companyLevel: "" };
            let meters = null;
            const num = parseInt(v, 10);
            if (/^\d{4}$/.test(v) && Number.isFinite(num)) meters = num >= 9999 ? 10000 : num;
            else meters = getVisibilityMeters(message);
            if (meters != null) {
              if (meters <= visCfg.criticalBelowM) return bumpLegacy(3);
              if (meters <= visCfg.warningBelowM) return bumpLegacy(2);
              if (meters <= visCfg.cautionBelowM) return bumpLegacy(1);
            }
          }
          if (kind === "rvr") {
            const meters = parseMinRvrMeters(v);
            if (meters != null) {
              if (meters <= rvrCfg.criticalBelowM) return bumpLegacy(3);
              if (meters <= rvrCfg.warningBelowM) return bumpLegacy(2);
              if (meters <= rvrCfg.cautionBelowM) return bumpLegacy(1);
            }
          }
          if (kind === "cloud") {
            const cloud30m = parseCloudLayer30m(v);
            if (cloud30m != null) {
              if (cloud30m <= cloudCfg.criticalBelow) return bumpLegacy(3);
              if (cloud30m <= cloudCfg.warningBelow) return bumpLegacy(2);
              if (cloud30m <= cloudCfg.cautionBelow) return bumpLegacy(1);
            }
          }
          if (kind === "wx") {
            const ph = lookupWeatherPhenomenonCode(v);
            if (ph && ph.severity && ph.severity !== "none") {
              return {
                severity: ph.severity,
                companyLevel: ph.companyLevel || rankToCompanyLevel(companyLevelToRank(ph.severity)),
              };
            }
          }
          if (kind === "temp") {
            const n = parseMetarTempToken(v);
            if (Number.isFinite(n)) {
              if (n >= 40 || n <= -30) return bumpLegacy(3);
              if (n >= 35 || n <= -27) return bumpLegacy(2);
              if (n >= 32 || n <= -25) return bumpLegacy(1);
            }
          }
          return { severity: "none", companyLevel: "" };
        }

        function refinedCellSeverity(kind, value, message) {
          const v = String(value || "").trim();
          if (!v) return { severity: "none", companyLevel: "" };
          if (kind === "segment") {
            return tafTrendSegmentSeverity(v, message);
          }
          const g = weatherStandards?.global;
          let rank = 0;

          if (g) {
            if (kind === "windKt") {
              const n = Number(v);
              if (Number.isFinite(n)) rank = Math.max(rank, evaluateHigherIsWorse(n, g.windAvgKt, "平均风速", "kt").rank);
            }
            if (kind === "windMps") {
              const n = Number(v);
              if (Number.isFinite(n)) rank = Math.max(rank, evaluateHigherIsWorse(n, g.windAvgMps, "平均风速", "m/s").rank);
            }
            if (kind === "gustKt") {
              const n = Number(v);
              if (Number.isFinite(n)) rank = Math.max(rank, evaluateHigherIsWorse(n, g.gustKt, "阵风", "kt").rank);
            }
            if (kind === "gustMps") {
              const n = Number(v);
              if (Number.isFinite(n)) rank = Math.max(rank, evaluateHigherIsWorse(n, g.gustMps, "阵风", "m/s").rank);
            }
            if (kind === "vis") {
              if (!/^CAVOK$/i.test(v)) {
                let meters = null;
                const num = parseInt(v, 10);
                if (/^\d{4}$/.test(v) && Number.isFinite(num)) meters = num >= 9999 ? 10000 : num;
                else meters = getVisibilityMeters(message);
                rank = Math.max(rank, evaluateLowerIsWorse(meters, g.visibilityM, "能见度", "m").rank);
              }
            }
            if (kind === "rvr") {
              rank = Math.max(rank, evaluateLowerIsWorse(parseMinRvrMeters(v), g.rvrM, "跑道视程", "m").rank);
            }
            if (kind === "cloud") {
              const cloud30m = parseCloudLayer30m(v);
              if (cloud30m != null) {
                rank = Math.max(rank, evaluateLowerIsWorse(cloud30m, g.cloudBase30m, "云底高", "×30m").rank);
              }
            }
            if (kind === "wx") {
              const ph = lookupWeatherPhenomenonCode(v);
              if (ph) {
                rank = Math.max(
                  rank,
                  companyLevelToRank(ph.companyLevel || rankToCompanyLevel(companyLevelToRank(ph.severity))),
                );
              }
            }
            if (kind === "temp") {
              const n = parseMetarTempToken(v);
              if (Number.isFinite(n)) {
                rank = Math.max(rank, evaluateHigherIsWorse(n, g.tempHighC, "温度（高）", "℃").rank);
                rank = Math.max(rank, evaluateLowerIsWorse(n, g.tempLowC, "温度（低）", "℃").rank);
              }
            }
            if (rank > 0) {
              return { severity: rankToSeverity(rank), companyLevel: rankToCompanyLevel(rank) };
            }
          }

          return refinedCellSeverityLegacy(kind, v, message);
        }

        function refinedRowCells(row, message) {
          const values = [
            "",
            row.station,
            row.timeUtc,
            row.auto,
            row.windDir,
            row.windVar,
            row.windMps,
            row.windKt,
            row.gustMps,
            row.gustKt,
            row.vis,
            row.rvr,
            row.wx1,
            row.wx2,
            row.wx3,
            row.cloud1,
            row.cloud2,
            row.cloud3,
            row.temp,
            row.dew,
            row.qnh,
            row.rwyl,
            row.ws,
            row.recentWx,
            row.trend2h,
            row.rmk,
          ];
          const kinds = [
            null,
            null,
            null,
            null,
            null,
            null,
            "windMps",
            "windKt",
            "gustMps",
            "gustKt",
            "vis",
            "rvr",
            "wx",
            "wx",
            "wx",
            "cloud",
            "cloud",
            "cloud",
            "temp",
            null,
            null,
            null,
            "wx",
            "wx",
            "segment",
            null,
          ];
          return values.map((val, idx) => {
            const kind = kinds[idx];
            const ev = kind ? refinedCellSeverity(kind, val, message) : { severity: "none", companyLevel: "" };
            return { value: val, severity: ev.severity, companyLevel: ev.companyLevel || "", kind: kind || "" };
          });
        }

        function refinedRowMaxLevel(cells, message) {
          let rank = 0;
          for (const c of cells) {
            const r = companyLevelToRank(c.companyLevel || rankToCompanyLevel(companyLevelToRank(String(c.severity || "none"))));
            if (r > rank) rank = r;
          }
          const msgRank = companyLevelToRank(message?.companyLevel || "") || Number(message?.severityRank) || 0;
          if (msgRank > rank) rank = msgRank;
          return rankToCompanyLevel(rank) || "none";
        }

        function syncMetarRefinedFilterButtons() {
          metarRefinedBackdrop?.querySelectorAll("[data-metar-refined-region]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-metar-refined-region") === metarRefinedRegionFilter);
          });
          metarRefinedBackdrop?.querySelectorAll("[data-metar-refined-color]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-metar-refined-color") === metarRefinedColorFilter);
          });
        }

        function isMetarRefinedModalOpen() {
          return metarRefinedBackdrop?.classList.contains("is-open") === true;
        }

        function metarRefinedCellInnerHtml(display, cell, message) {
          if (cell?.kind === "segment") {
            return tafRefinedSegmentCellInnerHtml(display, message);
          }
          return alertHitInnerHtml(display, cell?.severity);
        }

        function tafRefinedSegmentCellInnerHtml(segmentText, message) {
          const s = String(segmentText || "").trim();
          if (!s || s === "—") return escapeHtml("—");
          return String(segmentText)
            .split(/(\s+)/)
            .map((part) => {
              if (/^\s+$/.test(part)) return escapeHtml(part);
              if (!part.trim()) return escapeHtml(part);
              const ev = tafTrendTokenSeverity(part, message);
              return alertHitInnerHtml(part, ev.severity);
            })
            .join("");
        }

        function tafRefinedCellInnerHtml(display, cell, message) {
          if (cell?.kind === "segment") {
            return tafRefinedSegmentCellInnerHtml(display, message);
          }
          return alertHitInnerHtml(display, cell?.severity);
        }

        function renderMetarRefinedTable() {
          if (!metarRefinedWrap || !isMetarRefinedModalOpen()) return;
          const rows = getMetarRefinedRows();
          if (metarRefinedCountTag) {
            metarRefinedCountTag.textContent = rows.length ? `${rows.length} 站` : "0 站";
          }
          if (!rows.length) {
            let hint = "暂无精细化告警数据，可调整筛选或返回主界面刷新实况。";
            if (!lastMessages.length) hint = "暂无 METAR 数据，请先刷新实况。";
            else if (metarRefinedRegionFilter !== "all" || metarRefinedColorFilter !== "all") {
              hint = "当前区域/告警色筛选下无匹配站点，可切换为「全部」。";
            } else if (msgFilterAnomalyOnly?.checked !== false) {
              hint = "当前数据中暂无达阈值的要素，可取消「仅显示异常」查看全部站点。";
            }
            metarRefinedWrap.innerHTML = `<div class="metar-refined-empty">${escapeHtml(hint)}</div>`;
            return;
          }
          const head = METAR_REFINED_HEADERS.map((h, i) => {
            const cls = i === 0 ? "col-idx" : i === 1 ? "col-station" : "";
            return `<th scope="col"${cls ? ` class="${cls}"` : ""}>${escapeHtml(h)}</th>`;
          }).join("");
          const body = rows
            .map(({ message, cells }, rowIdx) => {
              const tds = cells
                .map((cell, colIdx) => {
                  const display = colIdx === 0 ? String(rowIdx + 1) : cell.value || "—";
                  const colCls =
                    colIdx === 0 ? "col-idx" : colIdx === 1 ? "col-station metar-refined-station" : "";
                  const clsAttr = colCls ? ` class="metar-refined-cell--none ${colCls}"` : ` class="metar-refined-cell--none"`;
                  if (colIdx === 1) {
                    return `<td${clsAttr} data-msg-id="${escapeHtml(message.id)}" title="单击查看报文详情">${escapeHtml(display)}</td>`;
                  }
                  return `<td${clsAttr}>${metarRefinedCellInnerHtml(display, cell, message)}</td>`;
                })
                .join("");
              return `<tr data-msg-id="${escapeHtml(message.id)}">${tds}</tr>`;
            })
            .join("");
          metarRefinedWrap.innerHTML = `<table class="metar-refined-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
          metarRefinedWrap.scrollLeft = 0;
        }

        function openMetarRefinedModal() {
          if (!metarRefinedBackdrop) return;
          syncMetarRefinedFilterButtons();
          renderMetarRefinedTable();
          metarRefinedBackdrop.classList.add("is-open");
          metarRefinedBackdrop.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        async function ensureMetarRefinedReady() {
          await loadWeatherStandards();
          reapplyMessageSeverity();
        }

        async function openMetarRefinedModalFresh() {
          openMetarRefinedModal();
          await refreshMetarRefinedTableData();
        }

        async function refreshMetarRefinedTableData() {
          if (metarRefinedRefreshBtn) {
            metarRefinedRefreshBtn.disabled = true;
            metarRefinedRefreshBtn.textContent = "刷新中…";
          }
          try {
            await loadFlightMonitorAirports();
            await loadMessages({ silent: true });
            await ensureMetarRefinedReady();
            if (isMetarRefinedModalOpen()) renderMetarRefinedTable();
          } finally {
            if (metarRefinedRefreshBtn) {
              metarRefinedRefreshBtn.disabled = false;
              metarRefinedRefreshBtn.textContent = "刷新实况";
            }
          }
        }

        function closeMetarRefinedModal() {
          if (document.body.classList.contains("refined-popup-window")) {
            window.close();
            return;
          }
          if (msgDetailBackdrop?.classList.contains("is-open") && msgDetailBackdrop?.classList.contains("is-over-refined")) {
            msgDetailReopenRefinedKind = null;
            closeMsgDetail();
          }
          metarRefinedBackdrop?.classList.remove("is-open");
          metarRefinedBackdrop?.setAttribute("aria-hidden", "true");
          if (metarRefinedWrap) metarRefinedWrap.innerHTML = "";
          if (
            !msgDetailBackdrop?.classList.contains("is-open") &&
            !msgListExpandBackdrop?.classList.contains("is-open") &&
            !isTafRefinedModalOpen()
          ) {
            document.body.style.overflow = "";
          }
        }

        function getMetarRefinedRows() {
          const anomalyOnly = msgFilterAnomalyOnly?.checked !== false;
          const wlOnly = msgWhitelistOnly?.checked === true;
          const rows = [];
          const sorted = sortMsgAlerts(lastMessages);
          for (const m of sorted) {
            if (!msgPassesRegionFilter(m.station)) continue;
            if (wlOnly && airportWhitelistIcao.size > 0 && !airportWhitelistIcao.has(String(m.station || "").toUpperCase())) {
              continue;
            }
            const decomposed = decomposeMetarRefined(m);
            if (metarRefinedRegionFilter !== "all" && decomposed.dutyRegion !== metarRefinedRegionFilter) continue;
            const cells = refinedRowCells(decomposed, m);
            const maxLevel = refinedRowMaxLevel(cells, m);
            if (anomalyOnly && maxLevel === "none" && String(m.severity || "none").toLowerCase() === "none") continue;
            if (metarRefinedColorFilter !== "all") {
              const want = metarRefinedColorFilter === "none" ? "none" : metarRefinedColorFilter;
              if (maxLevel !== want) continue;
            }
            rows.push({ message: m, decomposed, cells, maxLevel: maxLevel || "none" });
          }
          return rows;
        }

        const TAF_REFINED_HEADERS = [
          "序号",
          "机场",
          "时间（世界时）",
          "有效时间（世界时）",
          "风向",
          "风速",
          "风速（KT）",
          "阵风",
          "阵风（KT）",
          "能见度（含趋势）",
          "天气1",
          "天气2",
          "天气3",
          "云高1（含趋势）",
          "云高2",
          "云高3",
          "云高4（附加组）",
          "高温1及时间",
          "高温2及时间",
          "低温1及时间",
          "低温2及时间",
          "概率（PROB）",
          "趋势1",
          "趋势2",
          "趋势3",
          "趋势4",
          "趋势5",
        ];

        function isTafValidityToken(tok) {
          const t = String(tok || "").trim().toUpperCase();
          return /^\d{4}\/\d{4}$/.test(t) || /^\d{6}\/\d{6}$/.test(t) || /^\d{8}\/\d{8}$/.test(t);
        }

        function isTafTimeRangeToken(tok) {
          const t = String(tok || "").trim().toUpperCase();
          return isTafValidityToken(t) || /^TL\d{4}$/.test(t) || /^AT\d{4}$/.test(t);
        }

        function isTafTempToken(tok) {
          return /^(TX|TN)M?\d{2}\/\d{4}Z?$/i.test(String(tok || "").trim());
        }

        function getTafChangeGroupType(token, prevToken) {
          const t = String(token || "").trim().toUpperCase();
          const prev = String(prevToken || "").trim().toUpperCase();
          if (/^FM\d{4,6}$/.test(t)) return "FM";
          if (t === "BECMG") return "BECMG";
          if (t === "INTER") return "INTER";
          if (/^PROB\d{2}$/.test(t)) return "PROB";
          if (t === "TEMPO" && !/^PROB\d{2}$/.test(prev)) return "TEMPO";
          return null;
        }

        function splitTafIntoSegments(bodyTokens) {
          const segments = [];
          let i = 0;
          while (i < bodyTokens.length) {
            const prevTok = i > 0 ? bodyTokens[i - 1] : "";
            const gType = getTafChangeGroupType(bodyTokens[i], prevTok);
            if (!gType) {
              const main = [];
              while (i < bodyTokens.length) {
                const p = i > 0 ? bodyTokens[i - 1] : "";
                if (getTafChangeGroupType(bodyTokens[i], p)) break;
                main.push(bodyTokens[i++]);
              }
              if (main.length) segments.push({ type: "main", tokens: main });
              continue;
            }
            const type = gType;
            const tokens = [bodyTokens[i++]];
            while (i < bodyTokens.length) {
              const p = bodyTokens[i - 1];
              if (getTafChangeGroupType(bodyTokens[i], p)) break;
              tokens.push(bodyTokens[i++]);
            }
            segments.push({ type, tokens });
          }
          return segments;
        }

        function extractTafGroupFields(tokens, station) {
          let windDir = "";
          let windVar = "";
          let windKt = "";
          let gustKt = "";
          let vis = "";
          const wxTokens = [];
          const cloudTokens = [];
          for (const tok of tokens) {
            const t = String(tok || "").trim();
            if (!t) continue;
            const up = t.toUpperCase();
            if (isTafTimeRangeToken(up) || isTafTempToken(up)) continue;
            if (up === "RMK") break;
            const windM = t.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/i);
            if (windM && !windDir) {
              windDir = windM[1].toUpperCase();
              const unit = (windM[5] || "KT").toUpperCase();
              let spd = Number(windM[2]);
              let gst = windM[4] ? Number(windM[4]) : NaN;
              if (unit === "MPS") {
                spd = Math.round(spd / 0.514444);
                if (Number.isFinite(gst)) gst = Math.round(gst / 0.514444);
              } else if (unit === "KMH") {
                spd = Math.round(spd / 1.852);
                if (Number.isFinite(gst)) gst = Math.round(gst / 1.852);
              }
              windKt = String(spd);
              if (Number.isFinite(gst)) gustKt = String(gst);
              continue;
            }
            if (/^\d{3}V\d{3}$/i.test(t) && !windVar) {
              windVar = up;
              continue;
            }
            if (up === "CAVOK" && !vis) {
              vis = "CAVOK";
              continue;
            }
            if (/^\d{4}$/.test(t) && !vis) {
              vis = t;
              continue;
            }
            if ((/^\d+SM$/i.test(t) || /^M?\d\/\d{1,2}(SM)?$/i.test(t)) && !vis) {
              vis = t;
              continue;
            }
            if (/^(FEW|SCT|BKN|OVC|VV)/i.test(t)) {
              cloudTokens.push(t);
              continue;
            }
            if (/^WS\d/i.test(t) || /^WSC\d/i.test(t)) continue;
            if (isWxToken(t)) {
              wxTokens.push(t);
              continue;
            }
          }
          return { windDir, windVar, windKt, gustKt, vis, wxTokens, cloudTokens };
        }

        function extractTafTxTnAll(allTokens) {
          const highs = [];
          const lows = [];
          for (const tok of allTokens) {
            const tx = String(tok).match(/^TX(M?\d{2})\/(\d{4})Z?$/i);
            if (tx) {
              highs.push(`TX${tx[1]}/${tx[2]}Z`);
              continue;
            }
            const tn = String(tok).match(/^TN(M?\d{2})\/(\d{4})Z?$/i);
            if (tn) {
              lows.push(`TN${tn[1]}/${tn[2]}Z`);
            }
          }
          return { highs, lows };
        }

        /**
         * 分解 TAF 原文为精细化表格字段（列定义见 天气精细化告警预报.xlsx A1–AA1）
         * @param {Record<string, any>} m
         */
        function decomposeTafRefined(m) {
          const raw = String(m.raw || "").trim().replace(/=\s*$/, "");
          const parts = raw.split(/\s+/).filter(Boolean);
          let i = 0;
          if (/^TAF$/i.test(parts[i])) i++;
          let amd = "";
          if (/^(AMD|COR)$/i.test(parts[i])) {
            amd = parts[i].toUpperCase();
            i++;
          }
          const stationFromRaw = parts[i] && /^[A-Z0-9]{4}$/.test(parts[i]) ? parts[i].toUpperCase() : "";
          if (stationFromRaw) i++;
          const timeUtc =
            parts[i] && /^\d{6}Z$/i.test(parts[i]) ? parts[i].toUpperCase() : String(m.time || "").trim();
          if (/^\d{6}Z$/i.test(parts[i])) i++;
          let validPeriod = "";
          if (parts[i] && isTafValidityToken(parts[i])) {
            validPeriod = parts[i].toUpperCase();
            i++;
          }
          const bodyAll = parts.slice(i);
          const rmkIdx = bodyAll.findIndex((t) => String(t).toUpperCase() === "RMK");
          const bodyClean = rmkIdx >= 0 ? bodyAll.slice(0, rmkIdx) : bodyAll;
          const segments = splitTafIntoSegments(bodyClean);
          const mainSeg = segments.find((s) => s.type === "main") || { tokens: [] };
          const station = String(m.station || stationFromRaw || "").toUpperCase();
          const mainFields = extractTafGroupFields(mainSeg.tokens, station);
          const probParts = segments.filter((s) => s.type === "PROB").map((s) => s.tokens.join(" "));
          const trendSegs = segments.filter(
            (s) => s.type === "FM" || s.type === "BECMG" || s.type === "TEMPO" || s.type === "INTER",
          );
          const trendParts = trendSegs.map((s) => s.tokens.join(" "));
          const { highs, lows } = extractTafTxTnAll(bodyClean);

          let windKt = mainFields.windKt;
          let gustKt = mainFields.gustKt;
          if (!windKt && Number.isFinite(Number(m.wspd))) windKt = String(Math.round(Number(m.wspd)));
          if (!gustKt && Number.isFinite(Number(m.wgst))) gustKt = String(Math.round(Number(m.wgst)));

          return {
            station,
            timeUtc: amd ? `${timeUtc} ${amd}` : timeUtc,
            validPeriod,
            windDir: mainFields.windDir,
            windVar: mainFields.windVar,
            windMps: windKt ? ktToMps(windKt) : "",
            windKt,
            gustMps: gustKt ? ktToMps(gustKt) : "",
            gustKt,
            vis: mainFields.vis,
            wx1: mainFields.wxTokens[0] || "",
            wx2: mainFields.wxTokens[1] || "",
            wx3: mainFields.wxTokens[2] || "",
            cloud1: mainFields.cloudTokens[0] || "",
            cloud2: mainFields.cloudTokens[1] || "",
            cloud3: mainFields.cloudTokens[2] || "",
            cloud4: mainFields.cloudTokens[3] || "",
            high1: highs[0] || "",
            high2: highs[1] || "",
            low1: lows[0] || "",
            low2: lows[1] || "",
            prob: probParts.join(" · "),
            trend1: trendParts[0] || "",
            trend2: trendParts[1] || "",
            trend3: trendParts[2] || "",
            trend4: trendParts[3] || "",
            trend5: trendParts[4] || "",
            dutyRegion: metarDutyRegion(station),
          };
        }

        function parseTafTempColumn(value) {
          const m = String(value || "").match(/^T[XN](M?\d{2})\/\d{4}Z?$/i);
          if (!m) return null;
          return parseMetarTempToken(m[1]);
        }

        /** 趋势/概率组中的非要素 token（组型、时段、无天气等），不参与着色 */
        function isTafSegmentMetaToken(tok) {
          const up = String(tok || "").trim().toUpperCase();
          return (
            /^(BECMG|TEMPO|INTER|TL\d{4}|AT\d{4}|RMK)$/.test(up) ||
            /^FM\d{4,6}$/.test(up) ||
            /^PROB\d{2}$/.test(up) ||
            /^(NSW|CAVOK|NCD|NSC|SKC|CLR|NOSIG)$/.test(up)
          );
        }

        function parseWindTokenNative(tok) {
          const m = String(tok || "")
            .trim()
            .match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/i);
          if (!m) return null;
          return {
            unit: (m[5] || "KT").toUpperCase(),
            windSpd: Number(m[2]),
            gustSpd: m[4] ? Number(m[4]) : null,
          };
        }

        function parseTafWindKtGust(tok) {
          return parseWindTokenNative(tok);
        }

        function bumpSeverityRank(rank, ev) {
          return Math.max(
            rank,
            companyLevelToRank(ev.companyLevel || rankToCompanyLevel(companyLevelToRank(String(ev.severity || "none")))),
          );
        }

        /** 趋势/概率组内单个 token 的告警等级（按 token 类型识别，避免把 3000 当成风速） */
        function tafTrendTokenSeverity(tok, message) {
          const t = normalizeReportToken(tok);
          if (!t || isTafTimeRangeToken(t) || isTafTempToken(t) || isTafSegmentMetaToken(t)) {
            return { severity: "none", companyLevel: "" };
          }
          let rank = 0;
          const mainWind = parseWindTokenNative(t);
          if (mainWind && weatherStandards?.global) {
            evaluateMainWindSeverity(mainWind, weatherStandards.global, (r) => {
              if (r > rank) rank = r;
            });
            return { severity: rankToSeverity(rank), companyLevel: rankToCompanyLevel(rank) };
          }
          if (mainWind && !weatherStandards?.global) {
            const wcfg = LEGACY_METAR_RULES.wind;
            const gcfg = LEGACY_METAR_RULES.gust;
            let windKt = mainWind.windSpd;
            let gustKt = mainWind.gustSpd ?? 0;
            if (mainWind.unit === "MPS") {
              windKt = Math.round(windKt / 0.514444);
              if (mainWind.gustSpd != null) gustKt = Math.round(gustKt / 0.514444);
            } else if (mainWind.unit === "KMH") {
              windKt = Math.round(windKt / 1.852);
              if (mainWind.gustSpd != null) gustKt = Math.round(gustKt / 1.852);
            }
            const peak = Math.max(windKt, gustKt);
            if (peak >= gcfg.criticalKts || windKt >= wcfg.criticalKts) rank = 3;
            else if (peak >= gcfg.warningKts || windKt >= wcfg.warningKts) rank = 2;
            else if (peak >= gcfg.cautionKts || windKt >= wcfg.cautionKts) rank = 1;
            return { severity: rankToSeverity(rank), companyLevel: rankToCompanyLevel(rank) };
          }
          if (/^\d{4}$/.test(t) || /^\d+SM$/i.test(t) || /^M?\d\/\d{1,2}(SM)?$/i.test(t)) {
            return refinedCellSeverity("vis", t, message);
          }
          if (/^(FEW|SCT|BKN|OVC|VV)/i.test(t)) {
            return tafRefinedCellSeverity("cloud", t, message);
          }
          if (isWxToken(t)) {
            return refinedCellSeverity("wx", t, message);
          }
          return { severity: "none", companyLevel: "" };
        }

        function tafTrendSegmentSeverity(segmentText, message) {
          let rank = 0;
          for (const tok of String(segmentText || "").split(/\s+/).filter(Boolean)) {
            rank = bumpSeverityRank(rank, tafTrendTokenSeverity(tok, message));
          }
          return { severity: rankToSeverity(rank), companyLevel: rankToCompanyLevel(rank) };
        }

        function tafRefinedCellSeverity(kind, value, message) {
          const v = String(value || "").trim();
          if (!v) return { severity: "none", companyLevel: "" };
          if (kind === "cloud") {
            const cloud30m = parseCloudLayerForStation(v, message?.station);
            const g = weatherStandards?.global?.cloudBase30m;
            if (cloud30m != null && g) {
              const rank = evaluateLowerIsWorse(cloud30m, g, "云底高", "×30m").rank;
              if (rank > 0) return { severity: rankToSeverity(rank), companyLevel: rankToCompanyLevel(rank) };
            }
            const legacy = parseCloudLayer30m(v);
            if (legacy != null) return refinedCellSeverityLegacy("cloud", v, message);
            return { severity: "none", companyLevel: "" };
          }
          if (kind === "temp") {
            const n = parseTafTempColumn(v);
            if (Number.isFinite(n)) {
              const token = n < 0 ? `M${String(Math.abs(n)).padStart(2, "0")}` : String(n).padStart(2, "0");
              return refinedCellSeverity("temp", token, message);
            }
            return { severity: "none", companyLevel: "" };
          }
          if (kind === "segment") {
            return tafTrendSegmentSeverity(v, message);
          }
          return refinedCellSeverity(kind, v, message);
        }

        function tafRefinedRowCells(row, message) {
          const values = [
            "",
            row.station,
            row.timeUtc,
            row.validPeriod,
            row.windDir,
            row.windMps,
            row.windKt,
            row.gustMps,
            row.gustKt,
            row.vis,
            row.wx1,
            row.wx2,
            row.wx3,
            row.cloud1,
            row.cloud2,
            row.cloud3,
            row.cloud4,
            row.high1,
            row.high2,
            row.low1,
            row.low2,
            row.prob,
            row.trend1,
            row.trend2,
            row.trend3,
            row.trend4,
            row.trend5,
          ];
          const kinds = [
            null,
            null,
            null,
            null,
            null,
            "windMps",
            "windKt",
            "gustMps",
            "gustKt",
            "vis",
            "wx",
            "wx",
            "wx",
            "cloud",
            "cloud",
            "cloud",
            "cloud",
            "temp",
            "temp",
            "temp",
            "temp",
            "segment",
            "segment",
            "segment",
            "segment",
            "segment",
            "segment",
          ];
          return values.map((val, idx) => {
            const kind = kinds[idx];
            const ev = kind ? tafRefinedCellSeverity(kind, val, message) : { severity: "none", companyLevel: "" };
            return { value: val, severity: ev.severity, companyLevel: ev.companyLevel || "", kind: kind || "" };
          });
        }

        function syncTafRefinedFilterButtons() {
          tafRefinedBackdrop?.querySelectorAll("[data-taf-refined-region]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-taf-refined-region") === tafRefinedRegionFilter);
          });
          tafRefinedBackdrop?.querySelectorAll("[data-taf-refined-color]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-taf-refined-color") === tafRefinedColorFilter);
          });
        }

        function isTafRefinedModalOpen() {
          return tafRefinedBackdrop?.classList.contains("is-open") === true;
        }

        function renderTafRefinedTable() {
          if (!tafRefinedWrap || !isTafRefinedModalOpen()) return;
          const rows = getTafRefinedRows();
          if (tafRefinedCountTag) {
            tafRefinedCountTag.textContent = rows.length ? `${rows.length} 站` : "0 站";
          }
          if (!rows.length) {
            let hint = "暂无精细化告警数据，可调整筛选或返回主界面刷新预报。";
            if (!lastTafMessages.length) hint = "暂无 TAF 数据，请先刷新预报。";
            else if (tafRefinedRegionFilter !== "all" || tafRefinedColorFilter !== "all") {
              hint = "当前区域/告警色筛选下无匹配站点，可切换为「全部」。";
            } else if (msgFilterAnomalyOnly?.checked !== false) {
              hint = "当前数据中暂无达阈值的要素，可取消「仅显示异常」查看全部站点。";
            }
            tafRefinedWrap.innerHTML = `<div class="metar-refined-empty">${escapeHtml(hint)}</div>`;
            return;
          }
          const head = TAF_REFINED_HEADERS.map((h, i) => {
            const cls = i === 0 ? "col-idx" : i === 1 ? "col-station" : "";
            return `<th scope="col"${cls ? ` class="${cls}"` : ""}>${escapeHtml(h)}</th>`;
          }).join("");
          const body = rows
            .map(({ message, cells }, rowIdx) => {
              const tds = cells
                .map((cell, colIdx) => {
                  const display = colIdx === 0 ? String(rowIdx + 1) : cell.value || "—";
                  const colCls =
                    colIdx === 0 ? "col-idx" : colIdx === 1 ? "col-station metar-refined-station" : "";
                  const clsAttr = colCls ? ` class="metar-refined-cell--none ${colCls}"` : ` class="metar-refined-cell--none"`;
                  if (colIdx === 1) {
                    return `<td${clsAttr} data-msg-id="${escapeHtml(message.id)}" title="单击查看报文详情">${escapeHtml(display)}</td>`;
                  }
                  return `<td${clsAttr}>${tafRefinedCellInnerHtml(display, cell, message)}</td>`;
                })
                .join("");
              return `<tr data-msg-id="${escapeHtml(message.id)}">${tds}</tr>`;
            })
            .join("");
          tafRefinedWrap.innerHTML = `<table class="metar-refined-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
          tafRefinedWrap.scrollLeft = 0;
        }

        function openTafRefinedModal() {
          if (!tafRefinedBackdrop) return;
          syncTafRefinedFilterButtons();
          renderTafRefinedTable();
          tafRefinedBackdrop.classList.add("is-open");
          tafRefinedBackdrop.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        async function ensureTafRefinedReady() {
          await loadWeatherStandards();
          reapplyMessageSeverity();
        }

        async function openTafRefinedModalFresh() {
          openTafRefinedModal();
          await refreshTafRefinedTableData();
        }

        async function refreshTafRefinedTableData() {
          if (tafRefinedRefreshBtn) {
            tafRefinedRefreshBtn.disabled = true;
            tafRefinedRefreshBtn.textContent = "刷新中…";
          }
          try {
            await loadFlightMonitorAirports();
            await loadTafMessages({ silent: true });
            await ensureTafRefinedReady();
            if (isTafRefinedModalOpen()) renderTafRefinedTable();
          } finally {
            if (tafRefinedRefreshBtn) {
              tafRefinedRefreshBtn.disabled = false;
              tafRefinedRefreshBtn.textContent = "刷新预报";
            }
          }
        }

        function closeTafRefinedModal() {
          if (document.body.classList.contains("refined-popup-window")) {
            window.close();
            return;
          }
          if (msgDetailBackdrop?.classList.contains("is-open") && msgDetailBackdrop?.classList.contains("is-over-refined")) {
            msgDetailReopenRefinedKind = null;
            closeMsgDetail();
          }
          tafRefinedBackdrop?.classList.remove("is-open");
          tafRefinedBackdrop?.setAttribute("aria-hidden", "true");
          if (tafRefinedWrap) tafRefinedWrap.innerHTML = "";
          if (
            !msgDetailBackdrop?.classList.contains("is-open") &&
            !msgListExpandBackdrop?.classList.contains("is-open") &&
            !isMetarRefinedModalOpen()
          ) {
            document.body.style.overflow = "";
          }
        }

        function getTafRefinedRows() {
          const anomalyOnly = msgFilterAnomalyOnly?.checked !== false;
          const wlOnly = msgWhitelistOnly?.checked === true;
          const rows = [];
          const sorted = sortMsgAlerts(lastTafMessages);
          for (const m of sorted) {
            if (!msgPassesRegionFilter(m.station)) continue;
            if (wlOnly && airportWhitelistIcao.size > 0 && !airportWhitelistIcao.has(String(m.station || "").toUpperCase())) {
              continue;
            }
            const decomposed = decomposeTafRefined(m);
            if (tafRefinedRegionFilter !== "all" && decomposed.dutyRegion !== tafRefinedRegionFilter) continue;
            const cells = tafRefinedRowCells(decomposed, m);
            const maxLevel = refinedRowMaxLevel(cells, m);
            if (anomalyOnly && maxLevel === "none" && String(m.severity || "none").toLowerCase() === "none") continue;
            if (tafRefinedColorFilter !== "all") {
              const want = tafRefinedColorFilter === "none" ? "none" : tafRefinedColorFilter;
              if (maxLevel !== want) continue;
            }
            rows.push({ message: m, decomposed, cells, maxLevel: maxLevel || "none" });
          }
          return rows;
        }

        function reportLexiconLookupToken(token) {
          const t = normalizeReportToken(token);
          if (!t) return null;
          const ph = lookupWeatherPhenomenonCode(t);
          if (ph) return ph;
          const full = t.toUpperCase();
          for (const e of REPORT_LEXICON_SORTED) {
            if (full === e.match.toUpperCase()) return e;
          }
          return null;
        }

        function reportAnnotateWxToken(tok) {
          const core = normalizeReportToken(tok);
          if (!core) return null;
          const ph = lookupWeatherPhenomenonCode(core);
          if (ph) {
            const sev =
              ph.severity && ph.severity !== "none" ? ph.severity : levelToSeverity(ph.companyLevel || "G");
            return { zh: ph.zh || ph.match, severity: sev === "none" ? "none" : sev };
          }
          return null;
        }

        function reportAnnotateWindToken(tok) {
          const core = normalizeReportToken(tok);
          const m = core.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/i);
          if (!m) return null;
          const dir = m[1].toUpperCase() === "VRB" ? "风向不定" : `风向 ${m[1]}°`;
          const u = (m[5] || "KT").toUpperCase();
          const uUnit = u === "MPS" ? "m/s" : u === "KMH" ? "km/h" : "节";
          const gust = m[4] ? ` 阵风 ${m[4]} ${uUnit}` : "";
          const spd = Number(m[2]);
          const gst = m[4] ? Number(m[4]) : null;
          let rank = 0;
          const g = weatherStandards?.global;
          if (g) {
            const mainWind = { unit: u, windSpd: spd, gustSpd: gst };
            evaluateMainWindSeverity(mainWind, g, (r) => {
              if (r > rank) rank = r;
            });
          } else {
            const wcfg = LEGACY_METAR_RULES.wind;
            const gcfg = LEGACY_METAR_RULES.gust;
            let windKt = spd;
            let gustKt = gst ?? 0;
            if (u === "MPS") {
              windKt = Math.round(spd / 0.514444);
              if (gst != null) gustKt = Math.round(gst / 0.514444);
            } else if (u === "KMH") {
              windKt = Math.round(spd / 1.852);
              if (gst != null) gustKt = Math.round(gustKt / 1.852);
            }
            const peak = Math.max(windKt, gustKt);
            if (peak >= gcfg.criticalKts || windKt >= wcfg.criticalKts) rank = 3;
            else if (peak >= gcfg.warningKts || windKt >= wcfg.warningKts) rank = 2;
            else if (peak >= gcfg.cautionKts || windKt >= wcfg.cautionKts) rank = 1;
          }
          const severity = rankToSeverity(rank);
          return { zh: `${dir} 风速 ${m[2]} ${uUnit}${gust}`, severity: severity === "none" ? "none" : severity };
        }

        function reportAnnotateVisToken(tok) {
          const core = normalizeReportToken(tok);
          if (/^CAVOK$/i.test(core)) return reportLexiconLookupToken("CAVOK");
          if (/^\d{4}$/.test(core)) {
            const v = parseInt(core, 10);
            const zh =
              v >= 9999 || v === 9999
                ? "能见度 ≥10km（或北美 10SM+）"
                : v <= 50
                  ? `跑道视程 ${v}m`
                  : `能见度约 ${v}m`;
            const g = weatherStandards?.global?.visibilityM;
            let severity = "none";
            if (g) {
              severity = rankToSeverity(evaluateLowerIsWorse(v, g, "能见度", "m").rank);
            } else if (v <= 800) severity = "critical";
            else if (v <= 1600) severity = "warning";
            else if (v <= 2000) severity = "caution";
            return { zh, severity: severity === "none" ? "none" : severity };
          }
          if (/^M?\d\/\d{1,2}(SM)?$/i.test(tok) || /^\d+SM$/i.test(tok)) {
            return { zh: "能见度（海里）", severity: "none" };
          }
          return null;
        }

        function reportAnnotateCloudToken(tok) {
          const core = normalizeReportToken(tok);
          const m = core.match(/^(FEW|SCT|BKN|OVC|VV)(?:(\d{3})|(\/{3}))?$/i);
          if (!m) return null;
          const layer = reportLexiconLookupToken(m[1]);
          const h = m[2] ? ` 云底高 ${m[2]}×30m` : m[3] ? " 云底不明" : "";
          let severity = "none";
          if (m[2]) {
            const cloud30m = parseInt(m[2], 10);
            const g = weatherStandards?.global?.cloudBase30m;
            if (g) severity = rankToSeverity(evaluateLowerIsWorse(cloud30m, g, "云底高", "×30m").rank);
            else if (cloud30m <= 2) severity = "critical";
            else if (cloud30m <= 5) severity = "warning";
            else if (cloud30m <= 10) severity = "caution";
          }
          return { zh: `${layer ? layer.zh : m[1]}${h}`, severity: severity === "none" ? "none" : severity };
        }

        function reportAnnotateTempDewToken(tok) {
          const core = normalizeReportToken(tok);
          const m = core.match(/^(M?\d{2})\/(M?\d{2})$/);
          if (!m) return null;
          const decN = (x) => (x.startsWith("M") ? -parseInt(x.slice(1), 10) : parseInt(x, 10));
          const decS = (x) => (x.startsWith("M") ? `-${x.slice(1)}` : x);
          const tempC = decN(m[1]);
          const dewC = decN(m[2]);
          let rank = 0;
          const g = weatherStandards?.global;
          if (g) {
            rank = Math.max(
              evaluateHigherIsWorse(tempC, g.tempHighC, "气温", "℃").rank,
              evaluateLowerIsWorse(dewC, g.tempLowC, "露点", "℃").rank,
            );
          }
          const severity = rankToSeverity(rank);
          return {
            zh: `气温 ${decS(m[1])}°C · 露点 ${decS(m[2])}°C`,
            severity: severity === "none" ? "none" : severity,
          };
        }

        function reportAnnotateTafTempToken(tok) {
          const core = normalizeReportToken(tok);
          const tx = core.match(/^TX(M?\d{2})\/\d{4}Z?$/i);
          if (tx) {
            const tempC = decodeMetarTempToken(tx[1]);
            let rank = 0;
            const g = weatherStandards?.global?.tempHighC;
            if (g) rank = evaluateHigherIsWorse(tempC, g, "最高温", "℃").rank;
            const decS = tx[1].startsWith("M") ? `-${tx[1].slice(1)}` : tx[1];
            const severity = rankToSeverity(rank);
            return {
              zh: `最高温 ${decS}°C`,
              severity: severity === "none" ? "none" : severity,
            };
          }
          const tn = core.match(/^TN(M?\d{2})\/\d{4}Z?$/i);
          if (tn) {
            const tempC = decodeMetarTempToken(tn[1]);
            let rank = 0;
            const g = weatherStandards?.global?.tempLowC;
            if (g) rank = evaluateLowerIsWorse(tempC, g, "最低温", "℃").rank;
            const decS = tn[1].startsWith("M") ? `-${tn[1].slice(1)}` : tn[1];
            const severity = rankToSeverity(rank);
            return {
              zh: `最低温 ${decS}°C`,
              severity: severity === "none" ? "none" : severity,
            };
          }
          return null;
        }

        function reportAnnotateQnhToken(tok) {
          const core = normalizeReportToken(tok);
          const m = core.match(/^Q(\d{4})$/i);
          if (!m) return null;
          const hpa = Number(m[1]);
          return { zh: `修正海压 ${hpa} hPa`, severity: "none" };
        }

        function reportWrapAnn(tok, info) {
          const sev = info.severity || "none";
          const zh = escapeHtml(info.zh || "");
          const cls = `msg-ann msg-ann--${sev}`;
          return `<span class="${cls}"><span class="msg-ann-raw">${escapeHtml(tok)}</span><span class="msg-ann-inline-zh">（${zh}）</span></span>`;
        }

        /**
         * 将 METAR/TAF 原文分解为带翻译与等级色的 HTML（保留空格与换行）
         * @param {string} raw
         */
        function annotateReportText(raw) {
          const s = String(raw ?? "");
          if (!s) return "";
          const chunks = s.split(/(\s+|\n)/);
          return chunks
            .map((chunk) => {
              if (/^\s+$/.test(chunk) || chunk === "\n") return escapeHtml(chunk);
              if (!chunk.trim()) return escapeHtml(chunk);
              let info = reportAnnotateWindToken(chunk);
              if (!info) info = reportAnnotateVisToken(chunk);
              if (!info) info = reportAnnotateCloudToken(chunk);
              if (!info) info = reportAnnotateTempDewToken(chunk);
              if (!info) info = reportAnnotateTafTempToken(chunk);
              if (!info) info = reportAnnotateQnhToken(chunk);
              if (!info) info = reportAnnotateWxToken(chunk);
              if (!info) {
                const lex = reportLexiconLookupToken(chunk);
                if (lex) info = { zh: lex.zh, severity: lex.severity };
              }
              if (info) return reportWrapAnn(chunk, info);
              return escapeHtml(chunk);
            })
            .join("");
        }

        function buildReportAnalysisPanelHtml(raw) {
          const ann = annotateReportText(raw);
          return `<div class="msg-analysis-block">${ann}</div>`;
        }

        function sortMsgAlerts(arr) {
          return [...(arr || [])].sort((a, b) => {
            const rb = Number(b.severityRank) || 0;
            const ra = Number(a.severityRank) || 0;
            if (rb !== ra) return rb - ra;
            return (Number(b.obsTime) || 0) - (Number(a.obsTime) || 0);
          });
        }

        /**
         * @param {Record<string, unknown>} m
         * @param {"metar"|"taf"} kind
         * @param {{ annotatedBody?: boolean, expandListFullRaw?: boolean }} [opts]
         *   annotatedBody：true 时全文解析+着色（仅报文详情等场景按需使用）
         *   expandListFullRaw：展开全部弹窗内完整原报文，不截断、不解析
         */
        function msgAlertRowHtml(m, kind, opts) {
          const isTaf = kind === "taf";
          const fc = String(m.flight_category || "").trim();
          const fcPart =
            fc && fc !== "UNK" ? ` · <span class="msg-fc ${flightCatClass(fc)}">${escapeHtml(fc)}</span>` : "";
          const { rowCls: sevRow, badge: sevBadge } = messageListBadgeHtml(m);
          const rawStr = String(m.raw || "");
          const useAnn = opts?.annotatedBody === true;
          const expandFull = opts?.expandListFullRaw === true;
          let bodyInner;
          if (useAnn) {
            bodyInner = annotateReportText(rawStr);
          } else if (expandFull) {
            bodyInner = escapeHtml(rawStr);
          } else {
            bodyInner = rawStr.length > 160 ? `${escapeHtml(rawStr.slice(0, 160))}…` : escapeHtml(rawStr);
          }
          const bodyClass = useAnn ? "body body--annotated" : expandFull ? "body body--raw-expand" : "body";
          const subParts = [];
          if (m.receivedAt) subParts.push(`入库 ${escapeHtml(m.receivedAt)}`);
          if (m.source) subParts.push(`来源 ${escapeHtml(m.source)}`);
          const sub = subParts.length ? `<div class="sub">${subParts.join(" · ")}</div>` : "";
          const kindAttr = isTaf ? ' data-msg-kind="taf"' : "";
          const defaultType = isTaf ? "TAF" : "METAR";
          return `
                <div class="msg-row ${sevRow}" role="button" tabindex="0" data-msg-id="${escapeHtml(m.id)}"${kindAttr} title="单击打开详情">
                  <div class="top">
                    <span>${sevBadge} ${escapeHtml(m.type || defaultType)} · ${escapeHtml(m.station || "----")}${fcPart} · ${escapeHtml(m.time || nowHHMM())}</span>
                  </div>
                  <div class="${bodyClass}">${bodyInner}</div>
                  ${sub}
                </div>
              `;
        }

        function openMsgExpandModal(kind) {
          const modalKind = kind === "taf" ? "taf" : "metar";
          msgExpandModalKind = modalKind;
          const arr = modalKind === "taf" ? getFilteredTafMessages() : getFilteredMessages();
          const sorted = sortMsgAlerts(arr);
          const isMetar = modalKind === "metar";
          if (msgListExpandTitle) {
            msgListExpandTitle.textContent = isMetar
              ? `实况告警（METAR）· 共 ${sorted.length} 条`
              : `预报告警（TAF）· 共 ${sorted.length} 条`;
          }
          const inner = sorted.map((m) => msgAlertRowHtml(m, modalKind, { annotatedBody: false, expandListFullRaw: true })).join("");
          const scrollClass = sorted.length > 6 ? " warning-modal-list--scroll" : "";
          if (msgListExpandBody) {
            msgListExpandBody.innerHTML = `
            <p class="hint" style="margin:0 0 10px">以下为当前筛选条件下的全部条目。单击某行查看原文时，会先关闭本窗口再打开报文详情；关闭详情后将自动回到本列表。</p>
            <div class="warning-modal-list${scrollClass} msg-expand-modal-wrap">
              <div class="msg-list">${inner}</div>
            </div>`;
          }
          msgListExpandBackdrop?.classList.add("is-open");
          msgListExpandBackdrop?.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        function closeMsgExpandModal() {
          msgListExpandBackdrop?.classList.remove("is-open");
          msgListExpandBackdrop?.setAttribute("aria-hidden", "true");
          document.body.style.overflow = "";
          if (msgListExpandBody) msgListExpandBody.innerHTML = "";
        }

        function renderMessagesFromCache() {
          reapplyMessageSeverity();
          renderMessages(getFilteredMessages());
          if (isMetarRefinedModalOpen()) renderMetarRefinedTable();
        }

        function renderTafMessagesFromCache() {
          reapplyMessageSeverity();
          renderTafMessages(getFilteredTafMessages());
          if (isTafRefinedModalOpen()) renderTafRefinedTable();
        }

        function renderMessages(items) {
          if (!messageList) return;
          const arr = items || [];
          const sorted = sortMsgAlerts(arr);
          if (expandMetarMsgBtn) expandMetarMsgBtn.hidden = sorted.length === 0;
          if (!sorted.length) {
            if (expandMetarMsgBtn) expandMetarMsgBtn.hidden = true;
            if (!lastMessages.length) {
              messageList.innerHTML = `<div class="hint" style="padding:12px;text-align:center">${escapeHtml("暂无报文或无匹配项，可点击「刷新实况」或调整白名单")}</div>`;
              return;
            }
            const nPassRegion = lastMessages.filter((m) => msgPassesRegionFilter(m.station)).length;
            if (msgRegionMode !== "all" && nPassRegion === 0) {
              messageList.innerHTML = `<div class="hint" style="padding:12px;text-align:center">${escapeHtml("当前范围下无报文，可切换到「全部」或其他范围。")}</div>`;
              return;
            }
            const scopeBase = messagesInScopeBase(lastMessages);
            if (scopeBase.length === 0) {
              messageList.innerHTML = `<div class="hint" style="padding:12px;text-align:center">${escapeHtml("当前白名单与范围组合下无报文，请调整白名单或切换范围。")}</div>`;
              return;
            }
            const colorLabel = { R: "红", Y: "黄", G: "绿" }[msgMetarColorFilter] || msgMetarColorFilter;
            let hint = "暂无报文或无匹配项，可点击「刷新实况」或调整白名单";
            if (msgMetarColorFilter !== "all") {
              hint = `当前「${colorLabel}」筛选下无匹配站点，可切换为「全部」查看。`;
            }
            messageList.innerHTML = `<div class="hint" style="padding:12px;text-align:center">${escapeHtml(hint)}</div>`;
            return;
          }
          messageList.innerHTML = sorted.map((m) => msgAlertRowHtml(m, "metar")).join("");
        }

        function renderTafMessages(items) {
          if (!tafMessageList) return;
          const arr = items || [];
          const sorted = sortMsgAlerts(arr);
          if (expandTafMsgBtn) expandTafMsgBtn.hidden = sorted.length === 0;
          if (!sorted.length) {
            if (expandTafMsgBtn) expandTafMsgBtn.hidden = true;
            if (!lastTafMessages.length) {
              tafMessageList.innerHTML = `<div class="hint" style="padding:12px;text-align:left">${escapeHtml("暂无 TAF 或无匹配项，可点击「刷新预报」或调整白名单")}</div>`;
              return;
            }
            const nPassRegion = lastTafMessages.filter((m) => msgPassesRegionFilter(m.station)).length;
            if (msgRegionMode !== "all" && nPassRegion === 0) {
              tafMessageList.innerHTML = `<div class="hint" style="padding:12px;text-align:left">${escapeHtml("当前范围下无 TAF，可切换到「全部」或其他范围。")}</div>`;
              return;
            }
            const scopeBase = messagesInScopeBase(lastTafMessages);
            if (scopeBase.length === 0) {
              tafMessageList.innerHTML = `<div class="hint" style="padding:12px;text-align:left">${escapeHtml("当前白名单与范围组合下无 TAF，请调整白名单或切换范围。")}</div>`;
              return;
            }
            const colorLabel = { R: "红", Y: "黄", G: "绿" }[msgTafColorFilter] || msgTafColorFilter;
            let hint = "暂无 TAF 或无匹配项，可点击「刷新预报」或调整白名单";
            if (msgTafColorFilter !== "all") {
              hint = `当前「${colorLabel}」筛选下无匹配 TAF，可切换为「全部」查看。`;
            }
            tafMessageList.innerHTML = `<div class="hint" style="padding:12px;text-align:left">${escapeHtml(hint)}</div>`;
            return;
          }
          tafMessageList.innerHTML = sorted.map((m) => msgAlertRowHtml(m, "taf")).join("");
        }

        /**
         * @param {Record<string, any>} item
         * @param {{ reopenExpand?: "metar"|"taf", fromRefined?: boolean }} [opts]
         */
        function openMsgDetail(item, opts) {
          const fromRefined =
            opts?.fromRefined === true || isMetarRefinedModalOpen() || isTafRefinedModalOpen();
          const reopenKind = fromRefined ? null : opts?.reopenExpand ?? null;

          if (msgListExpandBackdrop?.classList.contains("is-open")) {
            closeMsgExpandModal();
          }

          if (fromRefined) {
            if (isTafRefinedModalOpen()) msgDetailReopenRefinedKind = "taf";
            else if (isMetarRefinedModalOpen()) msgDetailReopenRefinedKind = "metar";
          }

          currentMsgDetail = item;
          msgDetailReopenExpandKind = reopenKind;
          if (msgDetailTitle) msgDetailTitle.textContent = `${item.type || "报文"} · ${item.station || "-"}`;
          if (msgDetailMeta) {
            const bits = [`观测/报文时间 ${item.time || "-"}`];
            if (item.receivedAt) bits.push(`入库 ${item.receivedAt}`);
            if (item.source) bits.push(`来源 ${item.source}`);
            if (item.flight_category && String(item.flight_category).toUpperCase() !== "UNK") {
              bits.push(`飞行规则 ${String(item.flight_category).toUpperCase()}`);
            }
            bits.push(`严重度 ${severityLabelZh(item.severity)}`);
            if (item.temp != null && item.temp !== "") bits.push(`气温 ${item.temp}°C`);
            if (item.name) bits.push(String(item.name));
            msgDetailMeta.textContent = bits.join(" · ");
          }
          if (msgDetailAlerts) {
            const ar = Array.isArray(item.alertReasons) ? item.alertReasons.filter(Boolean) : [];
            if (ar.length) {
              msgDetailAlerts.textContent = `告警说明：${ar.join("；")}`;
              msgDetailAlerts.hidden = false;
            } else {
              msgDetailAlerts.textContent = "";
              msgDetailAlerts.hidden = true;
            }
          }
          if (msgDetailRaw) msgDetailRaw.textContent = item.raw || "";
          if (msgDetailAnalysis) {
            msgDetailAnalysis.innerHTML = buildReportAnalysisPanelHtml(String(item.raw || ""));
          }
          msgDetailBackdrop?.classList.toggle("is-over-refined", fromRefined);
          msgDetailBackdrop?.classList.add("is-open");
          msgDetailBackdrop?.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
        }

        function closeMsgDetail() {
          msgDetailBackdrop?.classList.remove("is-open");
          msgDetailBackdrop?.classList.remove("is-over-refined");
          msgDetailBackdrop?.setAttribute("aria-hidden", "true");
          if (msgDetailAlerts) {
            msgDetailAlerts.textContent = "";
            msgDetailAlerts.hidden = true;
          }
          if (msgDetailAnalysis) msgDetailAnalysis.innerHTML = "";
          currentMsgDetail = null;
          const reopen = msgDetailReopenExpandKind;
          const reopenRefinedKind = msgDetailReopenRefinedKind;
          msgDetailReopenExpandKind = null;
          msgDetailReopenRefinedKind = null;
          if (reopenRefinedKind === "metar") {
            if (!isMetarRefinedModalOpen()) openMetarRefinedModal();
            else renderMetarRefinedTable();
            document.body.style.overflow = "hidden";
            return;
          }
          if (reopenRefinedKind === "taf") {
            if (!isTafRefinedModalOpen()) openTafRefinedModal();
            else renderTafRefinedTable();
            document.body.style.overflow = "hidden";
            return;
          }
          if (reopen) {
            openMsgExpandModal(reopen);
            return;
          }
          document.body.style.overflow = "";
        }

        function findMessageById(id) {
          return lastMessages.find((m) => String(m.id) === String(id));
        }

        function findTafMessageById(id) {
          return lastTafMessages.find((m) => String(m.id) === String(id));
        }

        async function loadMessages(opts) {
          if (msgStatus && !opts?.silent) msgStatus.textContent = "拉取 METAR…";

          const codes = getMessageMonitorIcaoList();
          let usedLive = false;
          let source = "demo";
          let lastMessagesBuilt = [];

          try {
            if (canUseLocalWorkbenchBackend()) {
              const sfRows = mapSfFocMetarRows(await fetchSfFocMetarBatch(codes));
              if (sfRows.length) {
                lastMessagesBuilt = sfRows
                  .filter((m) => String(m.airport4Code || "").trim().length > 0)
                  .map((m, i) => normalizeMessageItem(normalizeSfFocMetarForList(m, i), i))
                  .map((row) => enrichMessageSeverity(row));
                usedLive = true;
                source = "sf-foc";
              }
            }
          } catch (_) {}

          if (!lastMessagesBuilt.length) {
            let rawRows = [];
            if (isStaticHuiDeploy()) {
              rawRows = mockMetarDemoData();
              source = "demo";
            } else {
              const fetched = await fetchMetarJsonRaw();
              if (fetched && fetched.rows && fetched.rows.length) {
                rawRows = dedupeMetarLatest(fetched.rows);
                usedLive = true;
                source = "awc";
              } else {
                rawRows = mockMetarDemoData();
                source = "demo";
              }
            }
            lastMessagesBuilt = rawRows
              .filter((m) => String(m.icaoId || "").trim().length > 0)
              .map((m, i) => normalizeMessageItem(normalizeAwcRecord(m, i), i))
              .map((row) => enrichMessageSeverity(row));
          }

          lastMessages = lastMessagesBuilt;
          lastMessages.sort((a, b) => (Number(b.obsTime) || 0) - (Number(a.obsTime) || 0));
          metarSourceLive = usedLive;
          metarDataSource = source;
          renderMessagesFromCache();
          syncMsgStatus();
        }

        async function loadTafMessages(opts) {
          if (msgStatus && !opts?.silent) msgStatus.textContent = "拉取 TAF…";

          const codes = getMessageMonitorIcaoList();
          let usedLive = false;
          let source = "demo";
          let lastTafBuilt = [];

          try {
            if (canUseLocalWorkbenchBackend()) {
              const sfRows = mapSfFocTafRows(await fetchSfFocTafBatch(codes));
              if (sfRows.length) {
                lastTafBuilt = sfRows
                  .filter((m) => String(m.airport4Code || "").trim().length > 0)
                  .map((m, i) => normalizeMessageItem(normalizeSfFocTafForList(m, i), i))
                  .map((row) => enrichMessageSeverity(row));
                usedLive = true;
                source = "sf-foc";
              }
            }
          } catch (_) {}

          if (!lastTafBuilt.length) {
            let rawRows = [];
            if (isStaticHuiDeploy()) {
              rawRows = mockTafDemoData();
              source = "demo";
            } else {
              const fetched = await fetchTafJsonRaw();
              if (fetched && fetched.rows && fetched.rows.length) {
                rawRows = dedupeTafLatest(fetched.rows);
                usedLive = true;
                source = "awc";
              } else {
                rawRows = mockTafDemoData();
                source = "demo";
              }
            }
            lastTafBuilt = rawRows
              .filter((m) => String(m.icaoId || m.station || "").trim().length > 0)
              .map((m, i) => normalizeMessageItem(normalizeAwcTafRecord(m, i), i))
              .map((row) => enrichMessageSeverity(row));
          }

          lastTafMessages = lastTafBuilt;
          lastTafMessages.sort((a, b) => (Number(b.obsTime) || 0) - (Number(a.obsTime) || 0));
          tafSourceLive = usedLive;
          tafDataSource = source;
          renderTafMessagesFromCache();
          syncMsgStatus();
        }

        reviewRecommendOpenBtn?.addEventListener("click", () => openReviewRecommendModal());
        reviewRecommendModalClose?.addEventListener("click", () => closeReviewRecommendModal());
        reviewRecommendBackdrop?.addEventListener("click", (e) => {
          if (e.target === reviewRecommendBackdrop) closeReviewRecommendModal();
        });
        reviewRecommendRefreshBtn?.addEventListener("click", () => refreshReviewRecommend(true));
        reviewSearchContext?.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-review-duty-region]");
          if (!btn) return;
          setReviewDutyRegionFilter(btn.getAttribute("data-review-duty-region"));
        });
        reviewSearchOpenBtn?.setAttribute("href", getReviewSearchUrl());
        if (reviewSearchHint) {
          if (location.protocol === "file:") {
            reviewSearchHint.textContent =
              "当前为双击 HTML 打开，功能受限。请先运行 start.bat，浏览器访问 http://localhost:8787/index.html 。";
          } else if (location.port && location.port !== "8787") {
            reviewSearchHint.textContent = `建议通过 http://localhost:8787/index.html 打开工作台（当前端口 ${location.port}）。`;
          }
        }

        stationQueryBtn?.addEventListener("click", () => loadWindyForecast());
        stationInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            loadWindyForecast();
          }
        });
        elemModalStationQueryBtn?.addEventListener("click", () => loadWindyForecast(true, elemModalStationInput?.value || ""));
        elemModalStationInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            loadWindyForecast(true, elemModalStationInput?.value || "");
          }
        });
        elemForecastBackdrop?.addEventListener("click", (e) => {
          const btn = /** @type {HTMLElement | null} */ (e.target.closest(".elem-mode-btn"));
          if (btn?.dataset?.mode) {
            applyWindyMode(/** @type {"simple"|"full"} */ (btn.dataset.mode));
            return;
          }
          if (btn?.dataset?.model) {
            const model = /** @type {"auto"|"gfs"|"ecmwf"} */ (btn.dataset.model);
            if (model !== openMeteoModel) {
              openMeteoModel = model;
              syncElemForecastModelButtons();
              if (lastWindyForecast) loadWindyForecast(false);
            }
            return;
          }
          if (e.target === elemForecastBackdrop) closeElemForecastModal();
        });
        elemForecastClose?.addEventListener("click", () => closeElemForecastModal());
        refreshMsgBtn?.addEventListener("click", async () => {
          await loadFlightMonitorAirports();
          loadMessages();
        });
        refreshTafBtn?.addEventListener("click", async () => {
          await loadFlightMonitorAirports();
          loadTafMessages();
        });
        expandMetarMsgBtn?.addEventListener("click", () => openMsgExpandModal("metar"));
        openMetarRefinedBtn?.addEventListener("click", () => {
          openMetarRefinedModalFresh();
        });
        metarRefinedPopoutBtn?.addEventListener("click", () => popRefinedToExternalWindow("metar"));
        openTafRefinedBtn?.addEventListener("click", () => {
          openTafRefinedModalFresh();
        });
        tafRefinedPopoutBtn?.addEventListener("click", () => popRefinedToExternalWindow("taf"));
        initRefinedModalPopoutDrag(metarRefinedBackdrop, "metar");
        initRefinedModalPopoutDrag(tafRefinedBackdrop, "taf");
        metarRefinedRefreshBtn?.addEventListener("click", () => {
          refreshMetarRefinedTableData();
        });
        tafRefinedRefreshBtn?.addEventListener("click", () => {
          refreshTafRefinedTableData();
        });
        metarRefinedModalClose?.addEventListener("click", () => closeMetarRefinedModal());
        tafRefinedModalClose?.addEventListener("click", () => closeTafRefinedModal());
        metarRefinedBackdrop?.addEventListener("click", (e) => {
          if (e.target === metarRefinedBackdrop) closeMetarRefinedModal();
        });
        tafRefinedBackdrop?.addEventListener("click", (e) => {
          if (e.target === tafRefinedBackdrop) closeTafRefinedModal();
        });
        tafRefinedBackdrop?.addEventListener("click", (e) => {
          const regionBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-taf-refined-region]"));
          if (regionBtn && tafRefinedBackdrop?.contains(regionBtn)) {
            const r = regionBtn.getAttribute("data-taf-refined-region");
            if (!r || tafRefinedRegionFilter === r) return;
            tafRefinedRegionFilter = r;
            syncTafRefinedFilterButtons();
            renderTafRefinedTable();
            return;
          }
          const colorBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-taf-refined-color]"));
          if (colorBtn && tafRefinedBackdrop?.contains(colorBtn)) {
            const c = colorBtn.getAttribute("data-taf-refined-color");
            if (!c || tafRefinedColorFilter === c) return;
            tafRefinedColorFilter = c;
            syncTafRefinedFilterButtons();
            renderTafRefinedTable();
          }
        });
        tafRefinedWrap?.addEventListener("click", (e) => {
          const cell = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-msg-id]"));
          if (!cell?.dataset?.msgId) return;
          const item = findTafMessageById(cell.dataset.msgId);
          if (item) openMsgDetail(item, { fromRefined: true });
        });
        metarRefinedBackdrop?.addEventListener("click", (e) => {
          const regionBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-metar-refined-region]"));
          if (regionBtn && metarRefinedBackdrop?.contains(regionBtn)) {
            const r = regionBtn.getAttribute("data-metar-refined-region");
            if (!r || metarRefinedRegionFilter === r) return;
            metarRefinedRegionFilter = r;
            syncMetarRefinedFilterButtons();
            renderMetarRefinedTable();
            return;
          }
          const colorBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-metar-refined-color]"));
          if (colorBtn && metarRefinedBackdrop?.contains(colorBtn)) {
            const c = colorBtn.getAttribute("data-metar-refined-color");
            if (!c || metarRefinedColorFilter === c) return;
            metarRefinedColorFilter = c;
            syncMetarRefinedFilterButtons();
            renderMetarRefinedTable();
          }
        });
        metarRefinedWrap?.addEventListener("click", (e) => {
          const cell = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-msg-id]"));
          if (!cell?.dataset?.msgId) return;
          const item = findMessageById(cell.dataset.msgId);
          if (item) openMsgDetail(item, { fromRefined: true });
        });
        expandTafMsgBtn?.addEventListener("click", () => openMsgExpandModal("taf"));
        msgListExpandClose?.addEventListener("click", () => closeMsgExpandModal());
        msgListExpandBackdrop?.addEventListener("click", (e) => {
          if (e.target === msgListExpandBackdrop) closeMsgExpandModal();
        });
        msgListExpandBody?.addEventListener("click", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const isTaf = row.getAttribute("data-msg-kind") === "taf";
          const item = isTaf ? findTafMessageById(row.dataset.msgId) : findMessageById(row.dataset.msgId);
          if (item) openMsgDetail(item, { reopenExpand: msgExpandModalKind });
        });
        msgListExpandBody?.addEventListener("keydown", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest?.(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const isTaf = row.getAttribute("data-msg-kind") === "taf";
          const item = isTaf ? findTafMessageById(row.dataset.msgId) : findMessageById(row.dataset.msgId);
          if (!item) return;
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            openMsgDetail(item, { reopenExpand: msgExpandModalKind });
            return;
          }
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          openMsgDetail(item, { reopenExpand: msgExpandModalKind });
        });
        msgWhitelistOnly?.addEventListener("change", () => {
          renderMessagesFromCache();
          renderTafMessagesFromCache();
          if (isMetarRefinedModalOpen()) renderMetarRefinedTable();
          if (isTafRefinedModalOpen()) renderTafRefinedTable();
        });
        msgFilterAnomalyOnly?.addEventListener("change", () => {
          renderMessagesFromCache();
          renderTafMessagesFromCache();
          if (isMetarRefinedModalOpen()) renderMetarRefinedTable();
          if (isTafRefinedModalOpen()) renderTafRefinedTable();
        });
        syncMsgRegionButtons();
        syncMetarRefinedFilterButtons();
        syncTafRefinedFilterButtons();
        syncMsgListColorFilterButtons();
        subMsgCard?.addEventListener("click", (e) => {
          const metarColorBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-msg-metar-color]"));
          if (metarColorBtn && subMsgCard?.contains(metarColorBtn)) {
            const c = metarColorBtn.getAttribute("data-msg-metar-color");
            if (!c || msgMetarColorFilter === c) return;
            msgMetarColorFilter = c;
            syncMsgListColorFilterButtons();
            renderMessagesFromCache();
            return;
          }
          const tafColorBtn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-msg-taf-color]"));
          if (tafColorBtn && subMsgCard?.contains(tafColorBtn)) {
            const c = tafColorBtn.getAttribute("data-msg-taf-color");
            if (!c || msgTafColorFilter === c) return;
            msgTafColorFilter = c;
            syncMsgListColorFilterButtons();
            renderTafMessagesFromCache();
            return;
          }
          const btn = /** @type {HTMLElement | null} */ (e.target.closest?.("[data-msg-region]"));
          if (!btn || !subMsgCard?.contains(btn)) return;
          const r = btn.getAttribute("data-msg-region");
          if (r !== "domestic" && r !== "intl" && r !== "all") return;
          if (msgRegionMode === r) return;
          msgRegionMode = r;
          syncMsgRegionButtons();
          renderMessagesFromCache();
          renderTafMessagesFromCache();
          if (isMetarRefinedModalOpen()) renderMetarRefinedTable();
          if (isTafRefinedModalOpen()) renderTafRefinedTable();
        });
        messageList?.addEventListener("click", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const item = findMessageById(row.dataset.msgId);
          if (item) openMsgDetail(item);
        });
        messageList?.addEventListener("dblclick", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const item = findMessageById(row.dataset.msgId);
          if (item) openMsgDetail(item);
        });
        messageList?.addEventListener("keydown", (e) => {
          const el = e.target;
          const node = el instanceof Element ? el : el?.parentElement;
          const row = node?.closest?.(".msg-row");
          if (!row?.dataset?.msgId) return;
          const item = findMessageById(row.dataset.msgId);
          if (!item) return;
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            openMsgDetail(item);
            return;
          }
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          openMsgDetail(item);
        });
        tafMessageList?.addEventListener("click", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const item = findTafMessageById(row.dataset.msgId);
          if (item) openMsgDetail(item);
        });
        tafMessageList?.addEventListener("dblclick", (e) => {
          const row = /** @type {HTMLElement | null} */ (e.target.closest(".msg-row"));
          if (!row?.dataset?.msgId) return;
          const item = findTafMessageById(row.dataset.msgId);
          if (item) openMsgDetail(item);
        });
        tafMessageList?.addEventListener("keydown", (e) => {
          const el = e.target;
          const node = el instanceof Element ? el : el?.parentElement;
          const row = node?.closest?.(".msg-row");
          if (!row?.dataset?.msgId) return;
          const item = findTafMessageById(row.dataset.msgId);
          if (!item) return;
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            openMsgDetail(item);
            return;
          }
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          openMsgDetail(item);
        });
        msgDetailClose?.addEventListener("click", closeMsgDetail);
        msgDetailBackdrop?.addEventListener("click", (e) => {
          if (e.target === msgDetailBackdrop) closeMsgDetail();
        });
        msgDetailCopyBtn?.addEventListener("click", async () => {
          const text = currentMsgDetail?.raw || msgDetailRaw?.textContent || "";
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            showToast("已复制", "报文全文已复制到剪贴板");
          } catch {
            showToast("复制失败", "浏览器不允许剪贴板写入，请手动选择复制");
          }
        });

        /* ========== 气象服务席检查单（三班次） ========== */
        const checklistTaskList = $("#checklistTaskList");
        const checklistTabs = $("#checklistTabs");
        const checklistAuditBody = $("#checklistAuditBody");
        const checklistAuditBackdrop = $("#checklistAuditBackdrop");
        const checklistAuditModalClose = $("#checklistAuditModalClose");
        const checklistAuditToggle = $("#checklistAuditToggle");
        const checklistAuditFilterDate = $("#checklistAuditFilterDate");
        const checklistAuditFilterShift = $("#checklistAuditFilterShift");
        const checklistAuditFilterHint = $("#checklistAuditFilterHint");
        const checklistOverdueBackdrop = $("#checklistOverdueBackdrop");
        const checklistOverdueText = $("#checklistOverdueText");
        const checklistOverdueQueueHint = $("#checklistOverdueQueueHint");
        const checklistOverdueGoBtn = $("#checklistOverdueGoBtn");
        const checklistOverdueDismissAllBtn = $("#checklistOverdueDismissAllBtn");

        let checklistOverdueQueue = [];
        let checklistOverdueOpen = false;
        let checklistOverdueCurrent = null;
        let checklistPendingFocusKey = null;

        const CHECKLIST_DEF_STORAGE_KEY = "wx_checklist_definition_v2";
        /** 处置屏业务提醒默认展示条数（与 CSS --checklist-visible-rows 一致） */
        const CHECKLIST_ACTION_VISIBLE_COUNT = 3;
        const CHECKLIST_CONFIG_API = "/api/checklist/config";
        const CHECKLIST_SHIFT_IDS = ["day", "night", "dawn"];

        let CHECKLIST_DATA = null;
        let checklistEmbeddedDefault = null;
        let checklistConfigDraft = null;
        let checklistConfigEditShift = "day";

        function getEmbeddedChecklistData() {
          try {
            const el = document.getElementById("checklist-embedded-data");
            return el ? JSON.parse(el.textContent) : null;
          } catch {
            return null;
          }
        }

        function cloneChecklistData(src) {
          return src ? JSON.parse(JSON.stringify(src)) : null;
        }

        async function loadChecklistDefinition() {
          if (window.__WB_CHECKLIST_EMBEDDED__?.shifts) {
            checklistEmbeddedDefault = cloneChecklistData(window.__WB_CHECKLIST_EMBEDDED__);
          } else {
            checklistEmbeddedDefault = getEmbeddedChecklistData();
          }
          let data = cloneChecklistData(checklistEmbeddedDefault);
          if (window.location.protocol !== "file:") {
            if (!data?.shifts) {
              try {
                const r0 = await fetchWithTimeout(
                  resolveAppAssetUrl("data/checklist-embedded.json"),
                  { cache: "no-store" },
                  6000
                );
                if (r0.ok) {
                  const embedded = await r0.json();
                  if (embedded?.shifts) {
                    data = embedded;
                    if (!checklistEmbeddedDefault) checklistEmbeddedDefault = cloneChecklistData(embedded);
                  }
                }
              } catch {
                /* ignore */
              }
            }
            if (!isStaticHuiDeploy()) {
              try {
                const r = await fetchWithTimeout(`${CHECKLIST_CONFIG_API}?t=${Date.now()}`, { cache: "no-store" }, 4000);
                if (r.ok) {
                  const remote = await r.json();
                  if (remote?.shifts) data = remote;
                }
              } catch {
                /* ignore */
              }
            }
            if (!data?.shifts) {
              try {
                const r2 = await fetchWithTimeout(
                  resolveAppAssetUrl("data/checklist-config.json"),
                  { cache: "no-store" },
                  6000
                );
                if (r2.ok) {
                  const file = await r2.json();
                  if (file?.shifts) data = file;
                }
              } catch {
                /* ignore */
              }
            }
          }
          try {
            const raw = localStorage.getItem(CHECKLIST_DEF_STORAGE_KEY);
            if (raw) {
              const local = JSON.parse(raw);
              if (local?.shifts) data = local;
            }
          } catch {
            /* ignore */
          }
          CHECKLIST_DATA = data?.shifts ? data : checklistEmbeddedDefault;
          applyChecklistDeadlineOrder(CHECKLIST_DATA);
        }

        function normalizeHmInput(s) {
          const t = String(s || "").trim();
          if (!t) return "";
          const m = t.match(/^(\d{1,2}):(\d{2})$/);
          if (m) return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
          const m2 = t.match(/^(\d{3,4})$/);
          if (m2) {
            const raw = m2[1].padStart(4, "0");
            return `${raw.slice(0, 2)}:${raw.slice(2)}`;
          }
          return t;
        }

        /** 检查单工作项按班次内截止先后排序（夜班 17:30 前算次日） */
        function checklistDeadlineSortKey(shift, deadline) {
          const hm = parseHmToMinutes(normalizeHmInput(deadline));
          if (shift === "night") {
            const NIGHT_START = 17 * 60 + 30;
            return hm >= NIGHT_START ? hm : hm + 24 * 60;
          }
          return hm;
        }

        function sortChecklistItemsByDeadline(shiftId, items) {
          return items
            .slice()
            .sort(
              (a, b) =>
                checklistDeadlineSortKey(shiftId, a.deadline) - checklistDeadlineSortKey(shiftId, b.deadline) ||
                String(a.title || "").localeCompare(String(b.title || ""), "zh-CN")
            )
            .map((it, i) => ({ ...it, serial: i + 1 }));
        }

        function applyChecklistDeadlineOrder(data) {
          if (!data?.shifts) return data;
          for (const sid of CHECKLIST_SHIFT_IDS) {
            const block = data.shifts[sid];
            if (!block?.items?.length) continue;
            block.items = sortChecklistItemsByDeadline(sid, block.items);
          }
          return data;
        }

        function normalizeChecklistDefinition(draft) {
          const base = draft && typeof draft === "object" ? draft : {};
          const shifts = {};
          for (const sid of CHECKLIST_SHIFT_IDS) {
            const block = base.shifts?.[sid] || CHECKLIST_DATA?.shifts?.[sid] || { id: sid, label: sid, items: [] };
            const items = sortChecklistItemsByDeadline(
              sid,
              (Array.isArray(block.items) ? block.items : [])
                .map((it) => ({
                  title: String(it?.title || "").trim(),
                  deadline: normalizeHmInput(it?.deadline),
                }))
                .filter((it) => it.title && it.deadline)
            );
            shifts[sid] = {
              id: sid,
              label: block.label || CHECKLIST_DATA?.shifts?.[sid]?.label || sid,
              items,
            };
          }
          const prevVer = Number(base.version) || Number(CHECKLIST_DATA?.version) || 1;
          return {
            version: prevVer + 1,
            source: "工作台·检查单配置",
            exportedAt: new Date().toISOString(),
            shifts,
          };
        }

        async function persistChecklistDefinition(data) {
          localStorage.setItem(CHECKLIST_DEF_STORAGE_KEY, JSON.stringify(data));
          if (window.location.protocol === "file:") return { ok: true, mode: "local" };
          try {
            const r = await fetch(CHECKLIST_CONFIG_API, {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=utf-8" },
              body: JSON.stringify(data),
            });
            if (r.ok) return { ok: true, mode: "server" };
            return { ok: false, mode: "local", err: await r.text() };
          } catch (e) {
            return { ok: false, mode: "local", err: String(e.message || e) };
          }
        }

        function refreshChecklistAfterConfigSave() {
          tickChecklistReminders();
          renderChecklistTasks();
          renderChecklistAudit();
          syncChecklistOverdueQueueForActionView();
        }

        const checklistConfigBackdrop = $("#checklistConfigBackdrop");
        const checklistConfigBtn = $("#checklistConfigBtn");
        const checklistConfigModalClose = $("#checklistConfigModalClose");
        const checklistConfigTabs = $("#checklistConfigTabs");
        const checklistConfigTableBody = $("#checklistConfigTableBody");
        const checklistConfigAddRow = $("#checklistConfigAddRow");
        const checklistConfigSave = $("#checklistConfigSave");
        const checklistConfigReset = $("#checklistConfigReset");
        const checklistConfigMeta = $("#checklistConfigMeta");
        const checklistConfigHint = $("#checklistConfigHint");

        function renderChecklistConfigTable() {
          if (!checklistConfigTableBody || !checklistConfigDraft?.shifts) return;
          const block = checklistConfigDraft.shifts[checklistConfigEditShift];
          const items = Array.isArray(block?.items) ? block.items : [];
          if (!items.length) {
            checklistConfigTableBody.innerHTML =
              '<tr><td colspan="4" class="hint" style="text-align:center;padding:16px">本班次暂无工作项，可点「新增一行」。</td></tr>';
            return;
          }
          checklistConfigTableBody.innerHTML = items
            .map((it, idx) => {
              const dl = normalizeHmInput(it.deadline);
              const timeVal = dl.length === 5 ? dl : "12:00";
              return `<tr data-config-idx="${idx}">
                <td class="col-serial">${idx + 1}</td>
                <td><input type="text" data-field="title" value="${escapeHtml(it.title || "")}" placeholder="工作项描述" /></td>
                <td class="col-deadline"><input type="time" data-field="deadline" value="${escapeHtml(timeVal)}" step="60" /></td>
                <td class="col-actions"><button type="button" class="btn secondary" data-config-del="${idx}">删除</button></td>
              </tr>`;
            })
            .join("");
        }

        function syncChecklistConfigDraftFromTable() {
          if (!checklistConfigDraft?.shifts || !checklistConfigTableBody) return;
          const block = checklistConfigDraft.shifts[checklistConfigEditShift];
          if (!block) return;
          const rows = Array.from(checklistConfigTableBody.querySelectorAll("tr[data-config-idx]"));
          block.items = rows
            .map((row) => {
              const title = row.querySelector('[data-field="title"]')?.value?.trim() || "";
              const deadline = normalizeHmInput(row.querySelector('[data-field="deadline"]')?.value);
              return { title, deadline, serial: 0 };
            })
            .filter((it) => it.title || it.deadline);
        }

        function setChecklistConfigShift(shift) {
          syncChecklistConfigDraftFromTable();
          checklistConfigEditShift = shift;
          checklistConfigTabs?.querySelectorAll("[data-config-shift]").forEach((b) => {
            const on = b.getAttribute("data-config-shift") === shift;
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
          });
          renderChecklistConfigTable();
        }

        function openChecklistConfigModal() {
          if (!checklistConfigBackdrop) return;
          checklistConfigDraft = cloneChecklistData(CHECKLIST_DATA);
          checklistConfigEditShift = checklistActiveShift || "day";
          if (checklistConfigTabs) {
            checklistConfigTabs.querySelectorAll("[data-config-shift]").forEach((b) => {
              const on = b.getAttribute("data-config-shift") === checklistConfigEditShift;
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-selected", on ? "true" : "false");
            });
          }
          if (checklistConfigMeta && CHECKLIST_DATA) {
            checklistConfigMeta.textContent = `当前生效：版本 ${CHECKLIST_DATA.version ?? "—"} · ${CHECKLIST_DATA.exportedAt ? CHECKLIST_DATA.exportedAt.replace("T", " ").slice(0, 19) : "—"}`;
          }
          if (checklistConfigHint && window.location.protocol === "file:") {
            checklistConfigHint.textContent =
              "当前为本地文件打开：保存后写入本浏览器，刷新仍生效；若需写入服务器 JSON，请用 npm start 访问。";
          }
          renderChecklistConfigTable();
          checklistConfigBackdrop.classList.add("is-open");
          checklistConfigBackdrop.setAttribute("aria-hidden", "false");
        }

        function closeChecklistConfigModal() {
          if (!checklistConfigBackdrop) return;
          syncChecklistConfigDraftFromTable();
          checklistConfigDraft = null;
          checklistConfigBackdrop.classList.remove("is-open");
          checklistConfigBackdrop.setAttribute("aria-hidden", "true");
        }

        async function saveChecklistConfig() {
          if (!checklistConfigDraft) return;
          syncChecklistConfigDraftFromTable();
          const normalized = normalizeChecklistDefinition(checklistConfigDraft);
          let emptyShift = "";
          for (const sid of CHECKLIST_SHIFT_IDS) {
            if (!normalized.shifts[sid]?.items?.length) emptyShift = sid;
          }
          if (emptyShift) {
            showToast("未保存", "每个班次至少保留一条有效工作项（含标题与截止时间）。");
            return;
          }
          const result = await persistChecklistDefinition(normalized);
          CHECKLIST_DATA = normalized;
          closeChecklistConfigModal();
          refreshChecklistAfterConfigSave();
          const modeText = result.mode === "server" ? "已同步至服务器" : "已保存到本浏览器";
          showToast("检查单已更新", `${modeText} · 版本 ${normalized.version}`);
        }

        async function resetChecklistConfigToDefault() {
          if (!checklistEmbeddedDefault?.shifts) {
            showToast("无法恢复", "未找到内置默认检查单。");
            return;
          }
          if (!window.confirm("确定恢复为内置默认检查单？将清除本机配置覆盖。")) return;
          localStorage.removeItem(CHECKLIST_DEF_STORAGE_KEY);
          CHECKLIST_DATA = cloneChecklistData(checklistEmbeddedDefault);
          if (window.location.protocol !== "file:") {
            try {
              await fetch(CHECKLIST_CONFIG_API, { method: "DELETE" });
            } catch {
              /* ignore */
            }
          }
          checklistConfigDraft = cloneChecklistData(CHECKLIST_DATA);
          renderChecklistConfigTable();
          refreshChecklistAfterConfigSave();
          showToast("已恢复默认", "业务提醒已按内置检查单刷新。");
        }

        let checklistActiveShift = "day";
        let checklistState = { items: {}, qc: [] };
        const CHECKLIST_QC_RETENTION_DAYS = 31;

        function checklistStorageKey() {
          return `wx_seat_checklist_v1_${getAccount()}`;
        }

        function stripTime(d) {
          return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }

        function addDays(midnight, n) {
          const x = new Date(midnight.getTime());
          x.setDate(x.getDate() + n);
          return x;
        }

        function fmtYmd(d) {
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, "0");
          const da = String(d.getDate()).padStart(2, "0");
          return `${y}-${mo}-${da}`;
        }

        function parseHmToMinutes(s) {
          const [h, m] = String(s).split(":").map((x) => Number(x));
          if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
          return h * 60 + m;
        }

        function minutesNow(d) {
          return d.getHours() * 60 + d.getMinutes();
        }

        function defaultChecklistShift(now) {
          const m = minutesNow(now);
          if (m >= 17 * 60 + 30 || m < 3 * 60 + 30) return "night";
          /* 03:30–08:29 默认晨班；08:30 起默认白班（白班与晨班数据 key 始终分开，仅默认 Tab 不同） */
          if (m >= 3 * 60 + 30 && m < 8 * 60 + 30) return "dawn";
          return "day";
        }

        function displayAnchorNight(now) {
          const m = minutesNow(now);
          const t = stripTime(now);
          if (m < 3 * 60 + 30) return addDays(t, -1);
          if (m >= 17 * 60 + 30) return t;
          return addDays(t, -1);
        }

        function displayAnchorForShift(shift, now) {
          if (shift === "night") return displayAnchorNight(now);
          return stripTime(now);
        }

        function itemKey(shift, anchorMidnight, serial) {
          return `${shift}|${fmtYmd(anchorMidnight)}|${serial}`;
        }

        function deadlineMsForItem(shift, anchorMidnight, item) {
          const hm = parseHmToMinutes(item.deadline);
          const NIGHT_START = 17 * 60 + 30;
          if (shift === "night") {
            if (hm >= NIGHT_START) {
              return new Date(
                anchorMidnight.getFullYear(),
                anchorMidnight.getMonth(),
                anchorMidnight.getDate(),
                Math.floor(hm / 60),
                hm % 60,
                0,
                0
              ).getTime();
            }
            const nx = addDays(anchorMidnight, 1);
            return new Date(nx.getFullYear(), nx.getMonth(), nx.getDate(), Math.floor(hm / 60), hm % 60, 0, 0).getTime();
          }
          return new Date(
            anchorMidnight.getFullYear(),
            anchorMidnight.getMonth(),
            anchorMidnight.getDate(),
            Math.floor(hm / 60),
            hm % 60,
            0,
            0
          ).getTime();
        }

        /** 按 anchorYmd 丢弃早于「今天往前 CHECKLIST_QC_RETENTION_DAYS 天」的质检行 */
        function pruneChecklistQcHistory() {
          const d = stripTime(new Date());
          d.setDate(d.getDate() - CHECKLIST_QC_RETENTION_DAYS);
          const minYmd = fmtYmd(d);
          const prev = checklistState.qc.length;
          checklistState.qc = checklistState.qc.filter((r) => {
            const y = r.anchorYmd;
            if (!y || typeof y !== "string") return true;
            const y10 = y.slice(0, 10);
            return y10 >= minYmd;
          });
          return checklistState.qc.length !== prev;
        }

        function loadChecklistState() {
          try {
            const raw = localStorage.getItem(checklistStorageKey());
            const o = raw ? JSON.parse(raw) : null;
            checklistState = {
              items: o && typeof o.items === "object" ? o.items : {},
              qc: Array.isArray(o?.qc) ? o.qc : [],
            };
          } catch {
            checklistState = { items: {}, qc: [] };
          }
        }

        function saveChecklistState() {
          pruneChecklistQcHistory();
          try {
            localStorage.setItem(checklistStorageKey(), JSON.stringify(checklistState));
          } catch {
            /* ignore */
          }
        }

        function getItemState(key) {
          const st = checklistState.items[key];
          if (!st)
            return { completed: false, completedAt: null, reminded: {}, missedLogged: false, overdueModalAcked: false };
          return {
            completed: !!st.completed,
            completedAt: st.completedAt || null,
            reminded: st.reminded || {},
            missedLogged: !!st.missedLogged,
            overdueModalAcked: !!st.overdueModalAcked,
          };
        }

        function setItemState(key, patch) {
          checklistState.items[key] = { ...checklistState.items[key], ...patch };
          saveChecklistState();
        }

        function findQcRow(key) {
          return checklistState.qc.find((r) => r.key === key);
        }

        function ensureQcRow(key, base) {
          let r = findQcRow(key);
          if (!r) {
            r = { key, ...base };
            checklistState.qc.push(r);
          }
          return r;
        }

        function enumerateChecklistInstances() {
          if (!CHECKLIST_DATA?.shifts) return [];
          const now = new Date();
          const t0 = stripTime(now);
          const out = [];
          const shiftIds = ["day", "night", "dawn"];
          for (let di = -3; di <= 1; di++) {
            const anchor = addDays(t0, di);
            for (const sid of shiftIds) {
              const block = CHECKLIST_DATA.shifts[sid];
              if (!block?.items) continue;
              for (const it of block.items) {
                const key = itemKey(sid, anchor, it.serial);
                const dl = deadlineMsForItem(sid, anchor, it);
                out.push({
                  shift: sid,
                  shiftLabel: block.label,
                  anchor,
                  anchorYmd: fmtYmd(anchor),
                  serial: it.serial,
                  title: it.title,
                  deadline: it.deadline,
                  deadlineMs: dl,
                  key,
                });
              }
            }
          }
          return out;
        }

        function checklistStatusLine(inst, st, nowMs) {
          if (st.completed) {
            const ct = st.completedAt ? new Date(st.completedAt).getTime() : 0;
            const late = ct > inst.deadlineMs ? Math.max(0, Math.floor((ct - inst.deadlineMs) / 60000)) : 0;
            if (late > 0) return `已在截止后补做 · 超时 ${late} 分钟`;
            return "按时完成";
          }
          if (nowMs >= inst.deadlineMs) return "已超过截止时间（以弹窗与质检存档为准）";
          const left = Math.ceil((inst.deadlineMs - nowMs) / 60000);
          return `距截止约 ${left} 分钟`;
        }

        function renderChecklistTasks() {
          if (!checklistTaskList || !CHECKLIST_DATA?.shifts) {
            if (checklistTaskList) checklistTaskList.innerHTML = `<div class="hint">检查单数据未加载。</div>`;
            return;
          }
          const now = new Date();
          const shift = checklistActiveShift;
          const anchor = displayAnchorForShift(shift, now);
          const block = CHECKLIST_DATA.shifts[shift];
          if (!block) return;
          const nowMs = now.getTime();
          const enriched = block.items.map((it) => {
            const key = itemKey(shift, anchor, it.serial);
            const st = getItemState(key);
            const dlMs = deadlineMsForItem(shift, anchor, it);
            return { it, key, st, dlMs };
          });
          const incomplete = enriched.filter((x) => !x.st.completed).sort((a, b) => a.dlMs - b.dlMs);
          if (checklistPendingFocusKey && !incomplete.some((x) => x.key === checklistPendingFocusKey)) {
            checklistPendingFocusKey = null;
          }
          const upcoming = incomplete.filter((x) => x.dlMs > nowMs);
          const overdueOnly = incomplete.filter((x) => x.dlMs <= nowMs);
          const picked = [];
          const seen = new Set();
          const pushPick = (x) => {
            if (!x || picked.length >= CHECKLIST_ACTION_VISIBLE_COUNT || seen.has(x.key)) return;
            seen.add(x.key);
            picked.push(x);
          };
          if (checklistPendingFocusKey) {
            const pref = incomplete.find((x) => x.key === checklistPendingFocusKey);
            pushPick(pref);
          }
          for (const x of upcoming) pushPick(x);
          for (const x of overdueOnly) pushPick(x);
          if (picked.length === 0) {
            checklistTaskList.innerHTML = `<div class="hint">本班次暂无未完成工作项。</div>`;
            return;
          }
          checklistTaskList.innerHTML =
            picked
              .map(({ it, key, st, dlMs }) => {
                const status = checklistStatusLine(
                  { deadlineMs: dlMs, shift, anchor, serial: it.serial, title: it.title, deadline: it.deadline, key },
                  st,
                  nowMs
                );
                const pill = st.completed
                  ? st.completedAt && new Date(st.completedAt).getTime() > dlMs
                    ? `<span class="pill warn dot">补做完成</span>`
                    : `<span class="pill dot">已完成</span>`
                  : `<span class="pill warn dot">待完成</span>`;
                const rowCls = st.completed ? "task done" : "task";
                const btnCls = "btn";
                const btnLabel = st.completed ? "已完成" : "标记已完成";
                const btnDisabled = st.completed ? " disabled" : "";
                return `
                <div class="${rowCls}" data-checklist-key="${escapeHtml(key)}">
                  <div class="task-left">
                    <div class="task-name">${escapeHtml(it.title)}</div>
                    <div class="task-meta">截止 ${escapeHtml(it.deadline)} · ${pill} · ${escapeHtml(status)}</div>
                  </div>
                  <button class="${btnCls}" type="button" data-checklist-complete="${escapeHtml(key)}"${btnDisabled}>${btnLabel}</button>
                </div>`;
              })
              .join("");
        }

        function updateChecklistOverdueModalChrome() {
          const remaining = checklistOverdueQueue.length;
          const total = remaining + (checklistOverdueCurrent ? 1 : 0);
          if (checklistOverdueQueueHint) {
            if (remaining > 0) {
              checklistOverdueQueueHint.hidden = false;
              checklistOverdueQueueHint.textContent = `另有 ${remaining} 条待确认，共 ${total} 条超时提醒。可使用「一键知悉全部」关闭全部弹窗。`;
            } else {
              checklistOverdueQueueHint.hidden = true;
              checklistOverdueQueueHint.textContent = "";
            }
          }
          if (checklistOverdueDismissAllBtn) {
            const showBulk = total > 1;
            checklistOverdueDismissAllBtn.hidden = !showBulk;
            checklistOverdueDismissAllBtn.textContent = showBulk ? `一键知悉全部（${total}）` : "一键知悉全部";
          }
        }

        function openChecklistOverdueModal(inst) {
          if (!checklistOverdueBackdrop || !checklistOverdueText) return;
          checklistOverdueCurrent = inst;
          checklistOverdueOpen = true;
          checklistOverdueText.innerHTML = `<div style="font-weight:650;margin-bottom:8px">${escapeHtml(String(inst.serial))}. ${escapeHtml(inst.title)}</div><div class="hint" style="margin:0">截止 ${escapeHtml(inst.anchorYmd)} ${escapeHtml(inst.deadline)} · 当前账号：${escapeHtml(getAccountDisplayName())}</div>`;
          updateChecklistOverdueModalChrome();
          checklistOverdueBackdrop.classList.add("is-open");
          checklistOverdueBackdrop.setAttribute("aria-hidden", "false");
        }

        /** 一键知悉：当前项 + 队列中全部标记已确认弹窗，不再逐个弹出 */
        function dismissAllChecklistOverdueModals() {
          const keys = [];
          if (checklistOverdueCurrent) keys.push(checklistOverdueCurrent.key);
          for (const inst of checklistOverdueQueue) keys.push(inst.key);
          const n = keys.length;
          if (!n) {
            dismissChecklistOverdueModal({ focus: false });
            return;
          }
          for (const key of keys) setItemState(key, { overdueModalAcked: true });
          checklistOverdueQueue = [];
          checklistOverdueCurrent = null;
          checklistOverdueOpen = false;
          if (checklistOverdueBackdrop) {
            checklistOverdueBackdrop.classList.remove("is-open");
            checklistOverdueBackdrop.setAttribute("aria-hidden", "true");
          }
          renderChecklistTasks();
          showToast(
            "检查单",
            n > 1 ? `已一键知悉 ${n} 条超时提醒，请在列表中逐项完成或标记已完成。` : "已知悉本条超时提醒。"
          );
        }

        /** 关闭超时弹窗；focus=true 时跳转列表并高亮该项（「去处理」） */
        function dismissChecklistOverdueModal(opts) {
          const focus = !opts || opts.focus !== false;
          const ctx = checklistOverdueCurrent;
          checklistOverdueCurrent = null;
          if (checklistOverdueBackdrop) {
            checklistOverdueBackdrop.classList.remove("is-open");
            checklistOverdueBackdrop.setAttribute("aria-hidden", "true");
          }
          checklistOverdueOpen = false;
          if (ctx) {
            setItemState(ctx.key, { overdueModalAcked: true });
            if (focus && !getItemState(ctx.key).completed) focusChecklistItemInUi(ctx);
          }
          pumpChecklistOverdueModal();
        }

        function finishChecklistOverdueModal() {
          dismissChecklistOverdueModal({ focus: true });
        }

        /** 进入处置屏时：将已记档但未确认弹窗的超时项依次补入队列 */
        function syncChecklistOverdueQueueForActionView() {
          if (getView() !== "action") return;
          const nowMs = Date.now();
          const pend = enumerateChecklistInstances()
            .filter((inst) => {
              const st = getItemState(inst.key);
              return !st.completed && nowMs >= inst.deadlineMs && st.missedLogged && !st.overdueModalAcked;
            })
            .sort((a, b) => a.deadlineMs - b.deadlineMs);
          for (const inst of pend) enqueueChecklistOverdue(inst);
          pumpChecklistOverdueModal();
        }

        function pumpChecklistOverdueModal() {
          if (checklistOverdueOpen) return;
          const next = checklistOverdueQueue.shift();
          if (!next) return;
          openChecklistOverdueModal(next);
        }

        function enqueueChecklistOverdue(inst) {
          if (checklistOverdueCurrent && checklistOverdueCurrent.key === inst.key) return;
          if (checklistOverdueQueue.some((x) => x.key === inst.key)) return;
          checklistOverdueQueue.push(inst);
          pumpChecklistOverdueModal();
        }

        function focusChecklistItemInUi(inst) {
          checklistPendingFocusKey = inst.key;
          checklistActiveShift = inst.shift;
          if (checklistTabs) {
            checklistTabs.querySelectorAll(".checklist-tab").forEach((b) => {
              const on = b.getAttribute("data-shift") === inst.shift;
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-selected", on ? "true" : "false");
            });
          }
          renderChecklistTasks();
          window.requestAnimationFrame(() => {
            const rows = checklistTaskList ? Array.from(checklistTaskList.querySelectorAll("[data-checklist-key]")) : [];
            const row = rows.find((el) => el.getAttribute("data-checklist-key") === inst.key);
            if (row) checklistPendingFocusKey = null;
            row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            row?.classList.add("checklist-row-flash");
            window.setTimeout(() => row?.classList.remove("checklist-row-flash"), 2000);
          });
        }

        function qcRowSortTime(r) {
          const a = r.missedAt || r.completedAt || "";
          return a ? new Date(a).getTime() : 0;
        }

        function openChecklistAuditModal() {
          if (!checklistAuditBackdrop) return;
          if (checklistAuditFilterDate && !checklistAuditFilterDate.value) checklistAuditFilterDate.value = fmtYmd(new Date());
          checklistAuditBackdrop.classList.add("is-open");
          checklistAuditBackdrop.setAttribute("aria-hidden", "false");
          renderChecklistAudit();
        }

        function closeChecklistAuditModal() {
          if (!checklistAuditBackdrop) return;
          checklistAuditBackdrop.classList.remove("is-open");
          checklistAuditBackdrop.setAttribute("aria-hidden", "true");
        }

        function renderChecklistAudit() {
          if (!checklistAuditBody) return;
          const dateVal = (checklistAuditFilterDate?.value || "").trim().slice(0, 10);
          const shiftVal = checklistAuditFilterShift?.value || "all";
          let base = checklistState.qc.filter((r) => r.missedAt || (r.completedAt && r.lateMinutes > 0));
          if (dateVal) base = base.filter((r) => (r.anchorYmd || "").slice(0, 10) === dateVal);
          if (shiftVal !== "all") base = base.filter((r) => r.shift === shiftVal);
          const rows = base.slice().sort((a, b) => qcRowSortTime(b) - qcRowSortTime(a));
          if (checklistAuditFilterHint) {
            const d0 = stripTime(new Date());
            d0.setDate(d0.getDate() - CHECKLIST_QC_RETENTION_DAYS);
            checklistAuditFilterHint.textContent = `当前条件共 ${rows.length} 条 · 库内仅保留列表日期在 ${fmtYmd(d0)} 及之后的记录（约 ${CHECKLIST_QC_RETENTION_DAYS} 天）`;
          }
          if (rows.length === 0) {
            checklistAuditBody.innerHTML = `<div class="hint">该日期/班次下暂无记录，或尚无未按时/补做记录。</div>`;
            return;
          }
          checklistAuditBody.innerHTML = `
            <table class="checklist-audit-table">
              <thead><tr><th>值班员</th><th>超时工作项</th><th>超时与记录</th><th>班次/日期</th><th>补做</th></tr></thead>
              <tbody>
                ${rows
                  .map((r) => {
                    const name = escapeHtml(r.missedOperatorName || r.operatorName || "（未记录）");
                    const itemLine = escapeHtml(`${r.serial != null ? String(r.serial) + ". " : ""}${r.title || ""}`);
                    const dlLine = escapeHtml(`${r.anchorYmd || "—"} ${r.deadline || ""}`);
                    const miss = r.missedAt ? escapeHtml(r.missedAt.replace("T", " ").slice(0, 19)) : "—";
                    const om = r.overdueMinutesAtMiss != null ? escapeHtml(String(r.overdueMinutesAtMiss)) : "—";
                    const timeCell = `<div class="checklist-audit-wrap"><div><strong>截止时间</strong> ${dlLine}</div><div><strong>记录未按时</strong> ${miss}</div><div><strong>当时已超</strong> ${om} 分钟</div></div>`;
                    const shiftCell = escapeHtml(`${r.shift || ""} · ${r.anchorYmd || ""}`);
                    const done = r.completedAt ? escapeHtml(r.completedAt.replace("T", " ").slice(0, 19)) : "—";
                    const doneBy = r.completedOperatorName ? escapeHtml(r.completedOperatorName) : "—";
                    const late =
                      r.lateMinutes != null && r.lateMinutes > 0
                        ? escapeHtml(String(r.lateMinutes))
                        : r.lateMinutes === 0
                          ? "0"
                          : "—";
                    const makeupCell =
                      r.completedAt && (r.lateMinutes > 0 || r.makeup)
                        ? `<div class="checklist-audit-wrap"><div>${done}</div><div>操作：${doneBy}</div><div>相对截止晚 ${late} 分</div></div>`
                        : `<span class="hint">—</span>`;
                    return `<tr>
                      <td>${name}</td>
                      <td>${itemLine}</td>
                      <td>${timeCell}</td>
                      <td>${shiftCell}</td>
                      <td>${makeupCell}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`;
        }

        function tickChecklistReminders() {
          if (!CHECKLIST_DATA?.shifts) return;
          const nowMs = Date.now();
          const now = new Date(nowMs);
          let auditDirty = false;
          const list = enumerateChecklistInstances();
          for (const inst of list) {
            const st = getItemState(inst.key);
            if (st.completed) continue;
            const dl = inst.deadlineMs;
            if (nowMs >= dl) {
              if (!st.missedLogged) {
                setItemState(inst.key, { missedLogged: true });
                const row = ensureQcRow(inst.key, {
                  shift: inst.shift,
                  anchorYmd: inst.anchorYmd,
                  serial: inst.serial,
                  title: inst.title,
                  deadline: inst.deadline,
                });
                row.missedAt = now.toISOString();
                row.missedOperatorName = getAccountDisplayName();
                row.missedOperatorId = getAccount();
                row.overdueMinutesAtMiss = Math.max(0, Math.floor((nowMs - inst.deadlineMs) / 60000));
                auditDirty = true;
                if (getView() === "action") enqueueChecklistOverdue(inst);
              }
              continue;
            }
          }
          if (auditDirty) saveChecklistState();
          renderChecklistTasks();
          if (auditDirty) renderChecklistAudit();
        }

        function onChecklistComplete(key) {
          const inst = enumerateChecklistInstances().find((x) => x.key === key);
          if (!inst) return;
          const now = new Date();
          const nowMs = now.getTime();
          const wasMissed = getItemState(key).missedLogged;
          if (nowMs > inst.deadlineMs) {
            const row = ensureQcRow(key, {
              shift: inst.shift,
              anchorYmd: inst.anchorYmd,
              serial: inst.serial,
              title: inst.title,
              deadline: inst.deadline,
            });
            if (!row.missedAt) row.missedAt = new Date(inst.deadlineMs).toISOString();
            if (!row.missedOperatorName) row.missedOperatorName = getAccountDisplayName();
            if (!row.missedOperatorId) row.missedOperatorId = getAccount();
            if (row.overdueMinutesAtMiss == null)
              row.overdueMinutesAtMiss = Math.max(0, Math.floor((nowMs - inst.deadlineMs) / 60000));
            row.completedAt = now.toISOString();
            row.completedOperatorName = getAccountDisplayName();
            row.lateMinutes = Math.max(0, Math.floor((nowMs - inst.deadlineMs) / 60000));
            row.makeup = true;
            saveChecklistState();
          }
          checklistOverdueQueue = checklistOverdueQueue.filter((x) => x.key !== key);
          if (checklistOverdueCurrent?.key === key) {
            dismissChecklistOverdueModal({ focus: false });
          }
          setItemState(key, {
            completed: true,
            completedAt: now.toISOString(),
            missedLogged: wasMissed || nowMs > inst.deadlineMs,
            overdueModalAcked: true,
          });
          showToast("检查单", "已标记完成");
          renderChecklistTasks();
          renderChecklistAudit();
        }

        function initSeatChecklist() {
          if (!checklistTaskList) return;
          loadChecklistState();
          saveChecklistState();
          if (checklistAuditFilterDate) checklistAuditFilterDate.value = fmtYmd(new Date());
          if (checklistAuditFilterShift) checklistAuditFilterShift.value = "all";
          checklistActiveShift = defaultChecklistShift(new Date());
          if (checklistTabs) {
            checklistTabs.querySelectorAll(".checklist-tab").forEach((btn) => {
              const on = btn.getAttribute("data-shift") === checklistActiveShift;
              btn.classList.toggle("is-active", on);
              btn.setAttribute("aria-selected", on ? "true" : "false");
            });
          }
          checklistTabs?.addEventListener("click", (e) => {
            const btn = e.target && e.target.closest && e.target.closest(".checklist-tab");
            if (!btn) return;
            const sh = btn.getAttribute("data-shift");
            if (!sh) return;
            checklistActiveShift = sh;
            checklistTabs.querySelectorAll(".checklist-tab").forEach((b) => {
              const on = b === btn;
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-selected", on ? "true" : "false");
            });
            renderChecklistTasks();
          });
          checklistTaskList.addEventListener("click", (e) => {
            const b = e.target && e.target.closest && e.target.closest("[data-checklist-complete]");
            if (!b) return;
            const k = b.getAttribute("data-checklist-complete");
            if (!k || b.disabled) return;
            onChecklistComplete(k);
          });
          checklistConfigBtn?.addEventListener("click", () => openChecklistConfigModal());
          checklistConfigModalClose?.addEventListener("click", () => closeChecklistConfigModal());
          checklistConfigBackdrop?.addEventListener("click", (e) => {
            if (e.target === checklistConfigBackdrop) closeChecklistConfigModal();
          });
          checklistConfigTabs?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-config-shift]");
            if (!btn) return;
            const sh = btn.getAttribute("data-config-shift");
            if (sh) setChecklistConfigShift(sh);
          });
          checklistConfigAddRow?.addEventListener("click", () => {
            if (!checklistConfigDraft?.shifts) return;
            syncChecklistConfigDraftFromTable();
            const block = checklistConfigDraft.shifts[checklistConfigEditShift];
            if (!block.items) block.items = [];
            block.items.push({ serial: block.items.length + 1, title: "", deadline: "18:00" });
            renderChecklistConfigTable();
          });
          checklistConfigTableBody?.addEventListener("click", (e) => {
            const del = e.target.closest("[data-config-del]");
            if (!del || !checklistConfigDraft?.shifts) return;
            syncChecklistConfigDraftFromTable();
            const idx = Number(del.getAttribute("data-config-del"));
            const block = checklistConfigDraft.shifts[checklistConfigEditShift];
            if (!Number.isFinite(idx)) return;
            block.items.splice(idx, 1);
            renderChecklistConfigTable();
          });
          checklistConfigSave?.addEventListener("click", () => saveChecklistConfig());
          checklistConfigReset?.addEventListener("click", () => resetChecklistConfigToDefault());
          checklistAuditToggle?.addEventListener("click", () => openChecklistAuditModal());
          checklistAuditModalClose?.addEventListener("click", () => closeChecklistAuditModal());
          checklistAuditBackdrop?.addEventListener("click", (e) => {
            if (e.target === checklistAuditBackdrop) closeChecklistAuditModal();
          });
          checklistAuditFilterDate?.addEventListener("change", () => renderChecklistAudit());
          checklistAuditFilterShift?.addEventListener("change", () => renderChecklistAudit());
          checklistOverdueGoBtn?.addEventListener("click", () => finishChecklistOverdueModal());
          checklistOverdueDismissAllBtn?.addEventListener("click", () => dismissAllChecklistOverdueModals());
          accountSelect?.addEventListener("change", () => {
            checklistOverdueQueue = [];
            checklistOverdueCurrent = null;
            checklistOverdueOpen = false;
            if (checklistOverdueBackdrop) {
              checklistOverdueBackdrop.classList.remove("is-open");
              checklistOverdueBackdrop.setAttribute("aria-hidden", "true");
            }
            loadChecklistState();
            saveChecklistState();
            if (checklistAuditFilterDate) checklistAuditFilterDate.value = fmtYmd(new Date());
            if (checklistAuditFilterShift) checklistAuditFilterShift.value = "all";
            renderChecklistTasks();
            renderChecklistAudit();
            syncChecklistOverdueQueueForActionView();
          });
          renderChecklistAudit();
          renderChecklistTasks();
          tickChecklistReminders();
          syncChecklistOverdueQueueForActionView();
          /* 定时重算「最近 3 条未完成」+ 超时记档/弹窗队列（时间推移后列表会跟着变） */
          window.setInterval(tickChecklistReminders, 10000);
          document.addEventListener("visibilitychange", () => {
            if (document.hidden) return;
            tickChecklistReminders();
            if (getView() === "action") syncChecklistOverdueQueueForActionView();
          });
        }


                // New tab open: clone current card content into a standalone page
        function openCardInNewTab(cardId) {
          const card = document.getElementById(cardId);
          if (!card) return;
          const title = card.getAttribute("data-card-title") || "详情";
          const content = card.innerHTML;

          const w = window.open("", "_blank");
          if (!w) return;
          w.document.open();
          w.document.write(`
            <!doctype html>
            <html lang="zh-CN">
              <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>${escapeHtml(title)} - 新标签页</title>
                <style>
                  body{
                    margin:0;
                    font-family:${getComputedStyle(document.body).fontFamily};
                    background: ${getComputedStyle(document.body).background};
                    color: ${getComputedStyle(document.body).color};
                    padding: 18px;
                  }
                  .wrap{
                    max-width: 1200px;
                    margin: 0 auto;
                  }
                  .card{
                    border-radius: 16px;
                    border: 1px solid rgba(157,181,255,0.18);
                    background: rgba(18,26,55,0.78);
                    box-shadow: 0 18px 60px rgba(0,0,0,0.38);
                    overflow:hidden;
                  }
                  .card-inner{ padding: 12px 12px 14px; }
                  a{ color: rgba(122,162,255,0.92); }
                  button, input, textarea, select{ font-family: inherit; }
                  iframe{ width:100%; height: 72vh; border: none; background: rgba(7,10,20,0.55); }
                </style>
              </head>
              <body>
                <div class="wrap">
                  <div class="card">
                    <div class="card-inner">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                        <div style="font-weight:700;">${escapeHtml(title)}（详情视图）</div>
                        <a href="javascript:window.close()" style="text-decoration:none;">关闭</a>
                      </div>
                      <div>${content}</div>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `);
          w.document.close();
        }
        $$("[data-open-card]").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            const id = a.getAttribute("data-open-card");
            if (!id) return;
            openCardInNewTab(id);
          });
        });

        // Accuracy mock (sync bar with value)
        function setAccuracy(pct) {
          const clamped = Math.max(0, Math.min(100, pct));
          accuracyValue.textContent = `${clamped}%`;
          accuracyBar.style.width = `${clamped}%`;
        }
        setAccuracy(85);

        // Initial render：先同步画好时序图，再 ensureLogin；避免 rAF 晚于跳转导致“无图”
        setThemeFromUrl();
        try {
          document.documentElement.removeAttribute("data-color-mode");
          localStorage.removeItem("wx_color_mode_v1");
        } catch {
          /* ignore */
        }
        setViewFromUrl();
        prepareWarningMapEmbedShell();
        syncShellMetrics();
        window.addEventListener("resize", syncShellMetrics);
        if (document.fonts?.ready) {
          document.fonts.ready.then(syncShellMetrics).catch(() => {});
        }
        loadChecklistDefinition()
          .then(() => initSeatChecklist())
          .catch(() => {
            if (window.__WB_CHECKLIST_EMBEDDED__?.shifts) {
              CHECKLIST_DATA = cloneChecklistData(window.__WB_CHECKLIST_EMBEDDED__);
              applyChecklistDeadlineOrder(CHECKLIST_DATA);
            }
            initSeatChecklist();
          });
        initObjectiveForecast();
        setRoleHint(roleSelect?.value || "operator");
        setCoordSourceTag("none");
        renderPending();
        renderWeatherNav();
        loadWarningPool()
          .catch(() => {})
          .finally(() => {
            warningPool = dedupeWarningPoolItems(warningPool);
            renderWarningPanel();
            startWarningPanelAutoRefresh();
          });
        warningPanelRefreshBtn?.addEventListener("click", () => refreshWarningPanelFromSource(true));
        warningPanelClearBtn?.addEventListener("click", () => {
          void clearActiveWarningsPool();
        });
        openWarningMapBtn?.addEventListener("click", () => openWarningMapPopupWindow());
        toggleWarningAllBtn?.addEventListener("click", () => openWarningModal());
        warningModalClose?.addEventListener("click", () => closeWarningModal());
        warningModalBackdrop?.addEventListener("click", (e) => {
          if (e.target === warningModalBackdrop) closeWarningModal();
        });
        warningAirportModalClose?.addEventListener("click", () => closeWarningAirportModal());
        warningAirportBackdrop?.addEventListener("click", (e) => {
          if (e.target === warningAirportBackdrop) closeWarningAirportModal();
        });
        warningAirportList?.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-station]");
          if (!btn) return;
          const station = btn.getAttribute("data-station");
          if (station) openWarningAirportModal(station);
        });
        warningMarqueeViewport?.addEventListener("mouseenter", () => {
          warningMarqueePausedByHover = true;
          syncWarningMarqueePause();
        });
        warningMarqueeViewport?.addEventListener("mouseleave", () => {
          warningMarqueePausedByHover = false;
          syncWarningMarqueePause();
        });
        window.addEventListener("resize", () => syncWarningMarqueeMotion());
        document.addEventListener("keydown", (e) => {
          if (e.key !== "Escape") return;
          if (checklistOverdueBackdrop?.classList.contains("is-open")) {
            finishChecklistOverdueModal();
            return;
          }
          if (publishArchiveBackdrop?.classList.contains("is-open")) {
            closePublishArchiveModal();
            return;
          }
          if (objForecastSettingsBackdrop?.classList.contains("is-open")) {
            closeObjForecastSettings();
            return;
          }
          if (objForecastTableBackdrop?.classList.contains("is-open")) {
            closeObjForecastTableModal();
            return;
          }
          if (objForecastWorkspaceBackdrop?.classList.contains("is-open")) {
            closeObjForecastWorkspace();
            return;
          }
          if (airportAlertBackdrop?.classList.contains("is-open")) {
            closeAirportAlertModal();
            return;
          }
          if (periodForecastBackdrop?.classList.contains("is-open")) {
            closePeriodForecastModal();
            return;
          }
          if (forecastPublishHubBackdrop?.classList.contains("is-open")) {
            closeForecastPublishHub();
            return;
          }
          if (weatherBrushBackdrop?.classList.contains("is-open")) {
            closeWeatherBrushModal();
            return;
          }
          if (checklistConfigBackdrop?.classList.contains("is-open")) {
            closeChecklistConfigModal();
            return;
          }
          if (checklistAuditBackdrop?.classList.contains("is-open")) {
            closeChecklistAuditModal();
            return;
          }
          if (elemForecastBackdrop?.classList.contains("is-open")) {
            closeElemForecastModal();
            return;
          }
          if (msgDetailBackdrop?.classList.contains("is-open")) {
            closeMsgDetail();
            return;
          }
          if (msgListExpandBackdrop?.classList.contains("is-open")) {
            closeMsgExpandModal();
            return;
          }
          if (isMetarRefinedModalOpen()) {
            closeMetarRefinedModal();
            return;
          }
          if (warningModalBackdrop?.classList.contains("is-open")) {
            closeWarningModal();
            return;
          }
          if (warningAirportBackdrop?.classList.contains("is-open")) {
            closeWarningAirportModal();
            return;
          }
          if (reviewRecommendBackdrop?.classList.contains("is-open")) {
            closeReviewRecommendModal();
            return;
          }
        });
        document.getElementById("platformHealthToggleBtn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          setPlatformHealthOpen(!platformHealthOpen);
        });
        document.getElementById("platformHealthCloseBtn")?.addEventListener("click", () => {
          setPlatformHealthOpen(false);
        });
        document.getElementById("platformHealthRefreshBtn")?.addEventListener("click", () => refreshPlatformHealth());
        document.addEventListener("click", (e) => {
          if (!platformHealthOpen) return;
          const panel = document.getElementById("platformHealthPanel");
          const toggleBtn = document.getElementById("platformHealthToggleBtn");
          if (panel?.contains(e.target) || toggleBtn?.contains(e.target)) return;
          setPlatformHealthOpen(false);
        });
        refreshPlatformHealth();
        setInterval(() => refreshPlatformHealth(), 5 * 60 * 1000);
        loadAirportWhitelist()
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
            try {
              await Promise.all([loadMessages({ silent: true }), loadTafMessages({ silent: true })]);
            } catch (_) {
              /* ignore */
            } finally {
              syncMsgStatus();
            }
            refreshPlatformHealth();
            initPopupFromUrl().catch(() => {});
            bindWarningMapBroadcast();
          });

        window.__weatherWorkbench = window.__weatherWorkbench || {};
        window.__weatherWorkbench.airportWhitelist = {
          getIcaoSet: () => new Set(airportWhitelistIcao),
          getAlertPublishIcaoSet: () => getAlertPublishIcaoSet(),
          getAlertPublishMode: () => alertPublishMode,
          getMeta: () => ({ ...airportWhitelistMeta }),
          reload: loadAirportWhitelist,
        };
        window.__weatherWorkbench.metar = {
          reload: loadMessages,
          getBbox: () => AWC_METAR_BBOX,
          getMajorIcaoCount: () => METAR_MAJOR_ICAO.length,
          hubIcao: () => METAR_HUB_ICAO_ORDER.slice(),
        };
        window.__weatherWorkbench.taf = {
          reload: loadTafMessages,
        };
        window.__weatherWorkbench.reportLexicon = {
          entries: () => REPORT_WEATHER_LEXICON,
          annotate: annotateReportText,
          reloadStandards: loadWeatherStandards,
        };
        window.__weatherWorkbench.msgRegion = {
          getMode: () => msgRegionMode,
          setMode: (m) => {
            if (m !== "domestic" && m !== "intl" && m !== "all") return;
            msgRegionMode = m;
            syncMsgRegionButtons();
            renderMessagesFromCache();
            renderTafMessagesFromCache();
          },
        };
        window.__weatherWorkbench.metarRefined = {
          open: () => openMetarRefinedModalFresh(),
          close: () => closeMetarRefinedModal(),
          refresh: () => refreshMetarRefinedTableData(),
          isOpen: () => isMetarRefinedModalOpen(),
          getRegionFilter: () => metarRefinedRegionFilter,
          getColorFilter: () => metarRefinedColorFilter,
          decompose: decomposeMetarRefined,
        };
        window.__weatherWorkbench.reviewSearch = {
          open: () => openReviewRecommendModal(),
          refresh: (force = true) => refreshReviewRecommend(force),
          getContext: () => collectReviewRecommendContext(),
          urls: { ui: getReviewSearchUrl(), api: getReviewApiBase() },
        };

        window.addEventListener("load", () => {
          if (getView() !== "monitor") return;
          const svg = document.getElementById("elemForecastSvg");
          if (svg && !svg.querySelector("path")) loadWindyForecast(false);
        });

        initReviewServiceConfig().finally(() => ensureLogin());
})();
