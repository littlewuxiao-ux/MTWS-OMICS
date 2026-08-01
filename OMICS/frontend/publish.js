// =====================================================================
// 独立模块：航空气象预报发布工具 (全业务流定制 V9.6 交互完美版)
// =====================================================================

// =====================================================================
// 🌟 运行日志系统 PBLOG：控制台 + 内存环形缓冲 + 批量上报后端落盘
// =====================================================================
window.PBLOG_BUFFER = window.PBLOG_BUFFER || [];
window._pblogQueue = window._pblogQueue || [];
function PBLOG(msg, level) {
    level = (level || 'INFO').toUpperCase();
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const line = `${ts} [${level}] ${msg}`;
    // 控制台
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN' || level === 'WARNING') console.warn(line);
    else console.log(line);
    // 内存环形缓冲（最多保留 500 条，供一键复制）
    window.PBLOG_BUFFER.push(line);
    if (window.PBLOG_BUFFER.length > 500) window.PBLOG_BUFFER.shift();
    // 批量上报后端（防抱死，最多放 50 条后冲）
    window._pblogQueue.push({ level, msg });
    if (window._pblogQueue.length >= 20) PBLOG_FLUSH();
}
function PBLOG_FLUSH() {
    if (!window._pblogQueue.length) return;
    const entries = window._pblogQueue.splice(0, window._pblogQueue.length);
    try {
        fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries })
        }).catch(() => {}); // 上报失败不影响前端，控制台仍有
    } catch (e) {}
}
// 定期刷出日志 + 页面关闭前刷出
setInterval(PBLOG_FLUSH, 4000);
window.addEventListener('beforeunload', PBLOG_FLUSH);
// 全局未捕获异常也记入日志，避免静默白屏
window.addEventListener('error', (e) => PBLOG(`未捕获错误: ${e.message} @ ${e.filename}:${e.lineno}`, 'ERROR'));
window.addEventListener('unhandledrejection', (e) => PBLOG(`未处理 Promise 拒绝: ${e.reason}`, 'ERROR'));
window.PBLOG = PBLOG;
// 一键复制全部日志供排查
window.copyPublishLog = function() {
    const text = window.PBLOG_BUFFER.join('\n');
    navigator.clipboard?.writeText(text).then(
        () => PBLOG('日志已复制到剪贴板'),
        () => console.log(text)
    );
    return text;
};
PBLOG('publish.js 已加载');

window.publishInitialized = false;
window.AIRPORT_COORDS = window.AIRPORT_COORDS || {};
window.currentApAnalysis = []; 

// 🌟 优先采用服务器物理文件里的覆写字典，若没有则使用默认初始映射
window.GLOBAL_AIRPORT_NAME_MAP = window.GLOBAL_AIRPORT_NAME_MAP || {
    "ZBAA": "北京首都", "ZBAD": "北京大兴", "ZBTJ": "天津", "ZBSJ": "石家庄", "ZBYN": "太原", "ZBHH": "呼和浩特",
    "ZGSZ": "深圳", "ZGGG": "广州", "ZGOW": "揭阳", "ZGSD": "珠海", "ZGHA": "长沙", "ZGNN": "南宁", "ZGWZ": "梧州", "ZGCJ": "常德",
    "ZHEC": "鄂州", "ZHHH": "武汉", "ZHCC": "郑州",
    "ZSPD": "浦东", "ZSSS": "虹桥", "ZSHC": "杭州", "ZSNB": "宁波", "ZSWZ": "温州", "ZSYW": "义乌", "ZSFZ": "福州", "ZSQZ": "泉州", "ZSAM": "厦门", "ZSOF": "合肥", "ZSNJ": "南京", "ZSNT": "南通", "ZSWX": "无锡", "ZSXZ": "徐州", "ZSJN": "济南", "ZSWF": "潍坊", "ZSQD": "青岛", "ZSYT": "烟台",
    "ZYTX": "沈阳", "ZYTL": "大连", "ZYHB": "哈尔滨", "ZYCC": "长春", "ZYQQ": "齐齐哈尔", "ZYMD": "牡丹江",
    "ZLLL": "兰州", "ZLXY": "西安", "ZWWW": "乌鲁木齐", "ZLZW": "中卫", "ZLXN": "西宁", "ZLYA": "延安", "ZLIC": "银川",
    "ZUUU": "成都", "ZPPP": "昆明", "ZULS": "拉萨", "ZUCK": "重庆", "ZUGY": "贵阳", "ZUMY": "绵阳", "ZUYI": "义兴",
    "VHHH": "香港", "RCTP": "台北桃园", "VMMC": "澳门",
    "RJAA": "东京成田", "RJTT": "东京羽田", "RJBB": "大阪关西", "RKSI": "首尔仁川", "RKSS": "首尔金浦", "RKPC": "济州",
    "VTBS": "曼谷", "VVTS": "胡志明", "VVNB": "河内", "RPLL": "马尼拉", "VYYY": "仰光", "WMKK": "吉隆坡", "WMKP": "槟城", "WSSS": "新加坡",
    "VIDP": "新德里", "VOMM": "金奈", "VABB": "孟买", "VOBL": "班加罗尔", "VGHS": "达卡", "OPLA": "拉合尔", "OPIS": "伊斯兰堡",
    "OMAA": "阿布扎比", "OMDB": "迪拜", "OAKB": "喀布尔", "UTTT": "塔什干", "UAAA": "阿拉木图", "UAKK": "卡拉干达", "UACC": "阿斯塔纳",
    "EBLG": "列日", "EDDF": "法兰克福", "LHBP": "布达佩斯", "ENGM": "奥斯陆", "EGNX": "东米德兰兹", "EGLL": "伦敦希思罗", "LFPG": "巴黎戴高乐", "EHAM": "阿姆斯特丹",
    "PANC": "安学雷奇", "KLAX": "洛杉矶", "KJFK": "肯尼迪", "KORD": "奥黑尔"
};

const AIRPORT_CFG = {
  "domestic": {
    "华南": ["ZGSZ","ZGGG","ZGOW","ZGSD"], "华中": ["ZHEC","ZHHH","ZGHA","ZHCC"],
    "华东": ["ZSPD","ZSHC","ZSNB","ZSWZ","ZSYW","ZSFZ","ZSQZ","ZSAM","ZSOF","ZSNJ","ZSNT","ZSWX","ZSXZ","ZSJN","ZSWF","ZSQD","ZSYT"],
    "华北": ["ZBAA","ZBHH","ZBSJ","ZBYN","ZBTJ"], "东北": ["ZYTX","ZYTL","ZYHB","ZYCC"],
    "西北": ["ZLLL","ZLXY","ZWWW"], "西南": ["ZUUU","ZPPP","ZULS","ZUCK","ZUGY"], "港台": ["VHHH","RCTP","VMMC"]
  },
  "international": {
    "东亚": ["RJAA","RJTT","RJBB","RKSI","RKSS","RKPC"],
    "东南亚": ["VTBS","VVTS","VVNB","RPLL","VYYY","WMKK","WMKP","WSSS"],
    "南亚": ["VIDP","VOMM","VABB","VOBL","VGHS","OPLA","OPIS"],
    "中东": ["OMAA","OMDB"],
    "中/西亚": ["OAKB","UTTT","UAAA","UAKK","UACC"],
    "欧洲": ["EBLG","EDDF","LHBP","ENGM","EGNX","EGLL","LFPG","EHAM"],
    "北美": ["PANC","KLAX","KJFK","KORD"],
    "南美": [],
    "澳洲": [],
    "非洲": []
  }
};

const PUBLISH_REGION_NAMES = [
  ...Object.keys(AIRPORT_CFG.domestic),
  ...Object.keys(AIRPORT_CFG.international)
];

const ALL_WX_PHENOMENA = ['小雨','中雨','大雨','暴雨','小阵雨','中阵雨','大阵雨','弱冻雨','中冻雨','大冻雨','小雪','中雪','大雪','小阵雪','中阵雪','大阵雪','雨夹雪','弱雷雨','中雷雨','强雷雨','干雷','雾','霾','浮尘','沙暴'];
const WX_DEFAULT_HIDDEN = new Set(['小雨', '小阵雨']);

const WX_SNOW_KEYWORDS = ['雪', '冰粒', '冰晶', '霰'];  
const WX_RAIN_KEYWORDS = ['雨', '阵雨', '毛毛雨'];
const WX_HVY_RAIN_KEYWORDS = ['大雨', '暴雨', '强阵雨', '大阵雨'];
const WX_OTHER_BLUE_KEYWORDS = ['霾', '雾', '沙', '尘', '霜', '烟'];

const DEFAULT_AIRPORT_GROUPS = [
    { name: "枢纽", alwaysShow: true, airports: ["ZBAA", "ZGSZ", "ZHEC", "ZSHC"] }
];

const pbState = {
  startDate: '', startHour: 0, validityHours: 24,
  showWind: true, showVis: true, showWeatherCode: true, showTemp: true, showPressure: true,
  enabledRegions: {}, customCoords: {}, filterWx: {},
  filterWindThreshold: 15, filterVisThreshold: 1600, filterTempHigh: 33,
  filterHideEmptyAirports: true,
  airportGroups: [],
  selectedResidentGroups: new Set(),
  runningImportMode: null,
  runningAllAirports: new Set(),
  airportOrderMode: 'default',
  importSequence: [],
  sourceAirports: {
    running: new Set(), resident: new Set(), text: new Set(), table: new Set(), custom: new Set()
  },
  importedAirportTypes: {},
  expandedAirports: new Set(), 
  forceShowAirports: new Set(),
  textImportAirports: new Set(),
  allowOtherCarriers: false,
  defaultShowTaf: true, defaultShowEc: false,
  confirmedData: {},
  // 🌟 一键编发状态：记录本次批量采纳的机场，供撤回
  bulkAdopted: { taf: null, ec: null, all: null },
  bulkActionInProgress: false,
  sourceForecastCache: {},
  draftData: {},
  cfgIceTemp: 10, cfgIceDewPointDiff: 0, cfgIceVis: 1500, cfgIcePrecipHours: 12, cfgExtColdTemp: -30,
  specialConditionAirports: new Map()
};

let _nextRowIdx = 0, _cachedAirports = [];
window.pbState = pbState;
window.renderPublishTable = function() { renderPublishTableTriRow(window.currentApAnalysis || []); };

// 🌟 需求B：全局统一的保存方法（记录打卡人与时间戳）
window.saveConfirmedDataToLocal = function() {
    const userEl = document.getElementById('user-id-display');
    const curUser = userEl ? userEl.textContent.trim() : 'UNKNOWN';
    const wrapper = { timestamp: Date.now(), user: curUser, data: pbState.confirmedData };
    localStorage.setItem('sf_confirmed_forecasts_v3', JSON.stringify(wrapper));
};

function getActiveTextImportAirports() {
    return pbState.textImportAirports instanceof Set ? Array.from(pbState.textImportAirports).filter(Boolean) : [];
}

function isTextImportModeActive() {
    return getActiveTextImportAirports().length > 0;
}

window.setTextImportAirports = function(icaos) {
    const normalized = (icaos || []).map(v => String(v || '').trim().toUpperCase()).filter(Boolean);
    pbState.textImportAirports = new Set(normalized);
    pbState.sourceAirports.text = new Set(normalized);
    recordImportSequence(normalized);
};

window.clearTextImportAirports = function() {
    pbState.textImportAirports = new Set();
    pbState.sourceAirports.text.clear();
};

function recordImportSequence(icaos) {
    (icaos || []).forEach(raw => {
        const icao = String(raw || '').trim().toUpperCase();
        if (!icao) return;
        const oldIndex = pbState.importSequence.indexOf(icao);
        if (oldIndex !== -1) pbState.importSequence.splice(oldIndex, 1);
        pbState.importSequence.push(icao);
    });
}

function registerSourceAirports(source, icaos, { replace = false } = {}) {
    if (!pbState.sourceAirports[source]) pbState.sourceAirports[source] = new Set();
    if (replace) pbState.sourceAirports[source].clear();
    const normalized = (icaos || []).map(v => String(v || '').trim().toUpperCase()).filter(Boolean);
    normalized.forEach(icao => pbState.sourceAirports[source].add(icao));
    recordImportSequence(normalized);
}

window.registerPublishSourceAirports = registerSourceAirports;

function getAirportRegion(icao) {
    for (const scope of ['domestic', 'international']) {
        for (const [region, airports] of Object.entries(AIRPORT_CFG[scope])) {
            if (airports.includes(icao)) return region;
        }
    }
    const domesticPrefixes = [
        ['华北', /^ZB/], ['东北', /^ZY/], ['华东', /^ZS/], ['华南', /^ZG/],
        ['华中', /^ZH/], ['西北', /^Z[WL]/], ['西南', /^Z[UP]/]
    ];
    for (const [region, pattern] of domesticPrefixes) {
        if (pattern.test(icao)) return region;
    }
    const internationalPrefixes = [
        ['东南亚', /^(?:RP|VD|VL|VM|VT|VV|VY|WB|WI|WM|WR|WS)/],
        ['南亚', /^(?:OP|VA|VC|VE|VG|VI|VN|VO|VR)/],
        ['中东', /^(?:OB|OE|OJ|OK|OL|OM|OO|OR|OS|OT|OY)/],
        ['中/西亚', /^(?:OA|OI|UA|UB|UC|UD|UG|UK|UT)/],
        ['东亚', /^(?:R|ZM)/], ['欧洲', /^(?:E|L|U)/],
        ['北美', /^(?:C|K|M|P)/], ['南美', /^S/],
        ['澳洲', /^(?:A|N|Y|NZ)/], ['非洲', /^(?:D|F|G|H)/]
    ];
    for (const [region, pattern] of internationalPrefixes) {
        if (pattern.test(icao)) return region;
    }
    return '';
}

function isAirportRegionEnabled(icao) {
    const region = getAirportRegion(icao);
    return !!region && pbState.enabledRegions[region] !== false;
}

function getSelectedAirportGroupInfo(icao) {
    for (let groupIndex = 0; groupIndex < pbState.airportGroups.length; groupIndex++) {
        if (!pbState.selectedResidentGroups.has(String(groupIndex))) continue;
        const group = pbState.airportGroups[groupIndex];
        const airportIndex = group.airports.indexOf(icao);
        if (airportIndex !== -1) return { group, groupIndex, airportIndex, pinned: !!group.alwaysShow };
    }
    return null;
}

function sortPublishAirportAnalysis(items) {
    const domesticRegions = Object.keys(AIRPORT_CFG.domestic);
    const internationalRegions = Object.keys(AIRPORT_CFG.international);
    const importOrder = new Map(pbState.importSequence.map((icao, index) => [icao, index]));
    return [...items].map((item, index) => ({ item, index })).sort((left, right) => {
        const a = left.item;
        const b = right.item;
        const groupA = getSelectedAirportGroupInfo(a.icao);
        const groupB = getSelectedAirportGroupInfo(b.icao);
        if (!!groupA?.pinned !== !!groupB?.pinned) return groupA?.pinned ? -1 : 1;
        if (groupA?.pinned && groupB?.pinned) {
            if (groupA.groupIndex !== groupB.groupIndex) return groupA.groupIndex - groupB.groupIndex;
            if (groupA.airportIndex !== groupB.airportIndex) return groupA.airportIndex - groupB.airportIndex;
        }
        if (pbState.airportOrderMode === 'import') {
            const orderA = importOrder.get(a.icao) ?? Number.MAX_SAFE_INTEGER;
            const orderB = importOrder.get(b.icao) ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return left.index - right.index;
        }
        const regionA = getAirportRegion(a.icao);
        const regionB = getAirportRegion(b.icao);
        const scopeA = domesticRegions.includes(regionA) || (!regionA && /^Z/.test(a.icao)) ? 0 : 1;
        const scopeB = domesticRegions.includes(regionB) || (!regionB && /^Z/.test(b.icao)) ? 0 : 1;
        if (scopeA !== scopeB) return scopeA - scopeB;
        const regions = scopeA === 0 ? domesticRegions : internationalRegions;
        const rankA = regions.indexOf(regionA);
        const rankB = regions.indexOf(regionB);
        const normalizedA = rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA;
        const normalizedB = rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB;
        if (normalizedA !== normalizedB) return normalizedA - normalizedB;
        return left.index - right.index;
    }).map(entry => entry.item);
}

window.configurePublishAirportSources = function({ runningMode = null, residentGroups = [], orderMode = 'default' } = {}) {
    pbState.runningAllAirports.forEach(icao => {
        if (!pbState.textImportAirports.has(icao) && !pbState.confirmedData[icao] && !pbState.customCoords[icao]) {
            pbState.forceShowAirports.delete(icao);
        }
    });
    pbState.runningAllAirports.clear();
    pbState.sourceAirports.running.clear();
    pbState.sourceAirports.resident.clear();
    pbState.runningImportMode = runningMode === 'all' || runningMode === 'filtered' ? runningMode : null;
    pbState.selectedResidentGroups = new Set((residentGroups || []).map(String));
    pbState.airportOrderMode = orderMode === 'import' ? 'import' : 'default';
    const residentAirports = [];
    pbState.airportGroups.forEach((group, index) => {
        if (pbState.selectedResidentGroups.has(String(index))) residentAirports.push(...group.airports);
    });
    registerSourceAirports('resident', residentAirports, { replace: true });
};

window.getPublishAirportGroups = function() {
    return pbState.airportGroups.map((group, index) => ({ ...group, index }));
};

window.loadForecastData = loadForecastData;

function clearAirportsBySources(sources) {
    persistAllPublishDraftsFromDom();
    const selected = new Set(sources || []);
    const sourceNames = Object.keys(pbState.sourceAirports);
    const clearAll = sourceNames.every(source => selected.has(source));
    const affected = new Set();
    selected.forEach(source => pbState.sourceAirports[source]?.forEach(icao => affected.add(icao)));

    selected.forEach(source => pbState.sourceAirports[source]?.clear());
    if (selected.has('running')) {
        pbState.runningImportMode = null;
        pbState.runningAllAirports.clear();
    }
    if (selected.has('resident')) pbState.selectedResidentGroups.clear();
    if (selected.has('text')) pbState.textImportAirports.clear();
    if (selected.has('custom')) {
        Object.keys(pbState.customCoords).forEach(icao => delete pbState.customCoords[icao]);
    }

    const remaining = new Set();
    sourceNames.forEach(source => pbState.sourceAirports[source].forEach(icao => remaining.add(icao)));
    affected.forEach(icao => {
        if (!remaining.has(icao)) {
            delete pbState.confirmedData[icao];
            delete pbState.importedAirportTypes[icao];
            delete pbState.sourceForecastCache[icao];
            pbState.forceShowAirports.delete(icao);
        }
    });

    if (clearAll) {
        pbState.confirmedData = {};
        pbState.draftData = {};
        pbState.customCoords = {};
        pbState.forceShowAirports.clear();
        pbState.importSequence = [];
        pbState.sourceForecastCache = {};
        window.currentApAnalysis = [];
    } else {
        pbState.importSequence = pbState.importSequence.filter(icao => remaining.has(icao));
        window.currentApAnalysis = (window.currentApAnalysis || []).filter(item => remaining.has(item.icao) || pbState.confirmedData[item.icao]);
        affected.forEach(icao => {
            if (!remaining.has(icao)) delete pbState.draftData[icao];
        });
    }
    pbState.bulkAdopted = { taf: null, ec: null, all: null };
    window.saveConfirmedDataToLocal?.();
    renderPublishTableTriRow(window.currentApAnalysis || [], false);
    refreshBulkButtons();
}

function setupClearAirportsControls() {
    const modal = document.getElementById('clear-airports-modal');
    const allControl = document.getElementById('clear-source-all');
    const options = Array.from(document.querySelectorAll('.clear-source-option'));
    const close = () => { if (modal) modal.style.display = 'none'; };
    document.getElementById('global-clear-airports-btn')?.addEventListener('click', () => {
        options.forEach(option => {
            option.checked = false;
            const count = pbState.sourceAirports[option.value]?.size || 0;
            const countElement = document.getElementById(`clear-count-${option.value}`);
            if (countElement) countElement.textContent = String(count);
        });
        if (allControl) allControl.checked = false;
        if (modal) modal.style.display = 'flex';
    });
    document.getElementById('close-clear-airports-modal')?.addEventListener('click', close);
    document.getElementById('cancel-clear-airports')?.addEventListener('click', close);
    allControl?.addEventListener('change', () => options.forEach(option => { option.checked = allControl.checked; }));
    options.forEach(option => option.addEventListener('change', () => {
        if (allControl) allControl.checked = options.every(item => item.checked);
    }));
    document.getElementById('confirm-clear-airports')?.addEventListener('click', () => {
        const sources = options.filter(option => option.checked).map(option => option.value);
        if (!sources.length) return;
        clearAirportsBySources(sources);
        close();
    });
}

// ==========================================
// 1. 初始化引擎
// ==========================================
window.initPublishModule = async function() {
    if (window.publishInitialized) return;
    window.publishInitialized = true;
    PBLOG('initPublishModule 开始初始化');

    const settingsConfig = window.OMICS_CONFIG || window.OMICS_SETTINGS_CONFIG || {};
    const publishConfig = settingsConfig.publish || {};
    let savedGroups = publishConfig.airport_groups && publishConfig.airport_groups.length ? JSON.stringify(publishConfig.airport_groups) : localStorage.getItem('pb_airport_groups');
    pbState.airportGroups = savedGroups ? JSON.parse(savedGroups) : DEFAULT_AIRPORT_GROUPS;
    if (publishConfig.airport_groups && publishConfig.airport_groups.length) localStorage.setItem('pb_airport_groups', JSON.stringify(publishConfig.airport_groups));
    
    let localEcCfg = null;
    try { localEcCfg = JSON.parse(localStorage.getItem('pb_auto_ec_cfg')); } catch (e) {}
    const savedEcCfg = publishConfig.auto_ec_cfg && Object.keys(publishConfig.auto_ec_cfg).length ? publishConfig.auto_ec_cfg : localEcCfg;
    if (savedEcCfg) {
        pbState.filterTempHigh = Number(savedEcCfg.highTemp ?? pbState.filterTempHigh);
        pbState.cfgIceTemp = Number(savedEcCfg.groundIceTemp ?? savedEcCfg.iceTemp ?? pbState.cfgIceTemp);
        pbState.cfgIceDewPointDiff = Number(savedEcCfg.groundIceDewPointDiff ?? savedEcCfg.iceDew ?? pbState.cfgIceDewPointDiff);
        pbState.cfgIceVis = Number(savedEcCfg.groundIceVisibility ?? savedEcCfg.iceVis ?? pbState.cfgIceVis);
        pbState.cfgIcePrecipHours = Number(savedEcCfg.precipHours ?? pbState.cfgIcePrecipHours);
        pbState.cfgExtColdTemp = Number(savedEcCfg.extremeColdTemp ?? savedEcCfg.extCold ?? pbState.cfgExtColdTemp);
    }
    const displayElements = publishConfig.display_elements || {};
    if (typeof displayElements.wind === 'boolean') pbState.showWind = displayElements.wind;
    if (typeof displayElements.visibility === 'boolean') pbState.showVis = displayElements.visibility;
    if (typeof displayElements.weather === 'boolean') pbState.showWeatherCode = displayElements.weather;
    if (typeof displayElements.temperature === 'boolean') pbState.showTemp = displayElements.temperature;
    if (typeof displayElements.pressure === 'boolean') pbState.showPressure = displayElements.pressure;

    // 🌟 需求B：确认数据24小时过期与切换用户重置机制
    try {
        const savedWrapper = JSON.parse(localStorage.getItem('sf_confirmed_forecasts_v3'));
        if (savedWrapper && savedWrapper.timestamp && (Date.now() - savedWrapper.timestamp < 24 * 3600 * 1000)) {
            pbState.confirmedData = savedWrapper.data || {};
            pbState.confirmedUser = savedWrapper.user;
            
            // 实时监听用户切换，如果变更则清空确认缓存
            setInterval(() => {
                const userEl = document.getElementById('user-id-display');
                const curUser = userEl ? userEl.textContent.trim() : 'UNKNOWN';
                if (curUser !== 'UNKNOWN' && curUser !== '尚未登录' && pbState.confirmedUser !== 'UNKNOWN' && curUser !== pbState.confirmedUser) {
                    pbState.confirmedData = {};
                    pbState.confirmedUser = curUser;
                    window.saveConfirmedDataToLocal();
                    if(window.updateAllRowspans) renderPublishTableTriRow(window.currentApAnalysis);
                }
            }, 2000);
        } else {
            pbState.confirmedData = {};
        }
    } catch(e) {
        pbState.confirmedData = {};
    }
    
    // 🌟 修复 Bug 1b：初始化时，从本地缓存合并你修改过的机场名称和坐标！
    
    try {
        initTopBarData();
        PBLOG('initTopBarData 完成，时间已初始化');
    } catch (e) {
        PBLOG('initTopBarData 失败: ' + (e && e.stack ? e.stack : e), 'ERROR');
    }
    ALL_WX_PHENOMENA.forEach(wx => { pbState.filterWx[wx] = !WX_DEFAULT_HIDDEN.has(wx); });
    PUBLISH_REGION_NAMES.forEach(region => { pbState.enabledRegions[region] = true; });

    try {
        setupQuickTimeOptions(); 
        setupModalEvents();
        setupSearch();
        setupTableInteraction();
        setupAirportInteraction();
        renderAirportGroupsConfig(); 
        setupGlobalToolbar(); 
        setupClearAirportsControls();
        PBLOG('交互组件初始化完成');
    } catch (e) {
        PBLOG('交互组件初始化失败: ' + (e && e.stack ? e.stack : e), 'ERROR');
    }

    const loader = document.getElementById('publish-loading-indicator');
    window.currentApAnalysis = [];
    renderPublishTableTriRow([]);
    if (loader) loader.style.display = 'none';
    PBLOG('发布页初始化完成，等待选择机场来源');

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        pbState.confirmedData = {};
        localStorage.removeItem('sf_confirmed_forecasts');
        loadForecastData();
    });

    setupDragAndDrop();

    // 🌟 全局合并行高引擎
    window.updateAllRowspans = function() {
        const table = document.getElementById('forecast-table');
        if(!table) return;
        const isTafHidden = document.getElementById('global-toggle-taf')?.checked === false;
        const isEcHidden = document.getElementById('global-toggle-ec')?.checked === false;
        
        table.querySelectorAll('.tr-edit').forEach(trEdit => {
            if(trEdit.style.display === 'none') return;
            let count = 1;
            let next = trEdit.nextElementSibling;
            while(next && !next.classList.contains('tr-edit')) {
                let isHidden = next.style.display === 'none';
                if(next.classList.contains('tr-taf') || next.classList.contains('tr-taf-detail')) {
                    if (isTafHidden) isHidden = true;
                }
                if(next.classList.contains('tr-nwp') || next.classList.contains('tr-nwp-detail')) {
                    if (isEcHidden) isHidden = true;
                }
                if(next.classList.contains('tr-edit-extra')) {
                    isHidden = false; 
                }
                if (!isHidden) count++;
                next = next.nextElementSibling;
            }
            const apTd = trEdit.querySelector('.col-airport');
            const propTd = trEdit.querySelector('td:nth-child(2)');
            if(apTd) apTd.setAttribute('rowspan', count);
            if(propTd) propTd.setAttribute('rowspan', count);
        });
    };
    
    // 🌟 修复 Bug 4：全局事件委托监听所有删除按钮，永不失效
    document.getElementById('forecast-table')?.addEventListener('click', e => {
        if (e.target.classList.contains('btn-delete-extra')) {
            const tr = e.target.closest('tr');
            const icao = tr?.dataset.icao;
            const hasContent = Array.from(tr.querySelectorAll('.edit-cell')).some(td => td.textContent.trim());
            if (hasContent && !confirm('这一行已有内容，确认删除此行吗？')) return;
            tr.remove();
            if (icao && pbState.confirmedData[icao]) persistConfirmedAirportFromDom(icao);
            else if (icao) persistDraftAirportFromDom(icao);
            if (window.updateAllRowspans) window.updateAllRowspans();
        }
    });
};

function initTopBarData() {
    const now = new Date(Date.now() + 8 * 3600000); 
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const dp = document.getElementById('pb-datetime');
    if(dp) dp.value = `${yyyy}-${mm}-${dd}`;
    applyTimePreset('24'); 
}

function getBjtBaseDateFromState() {
    if (!pbState.startDate) return '';
    const hour = String(pbState.startHour || 0).padStart(2, '0');
    const startMs = new Date(`${pbState.startDate}T${hour}:00:00Z`).getTime();
    if (!Number.isFinite(startMs)) return '';
    return new Date(startMs + 8 * 3600000).toISOString().slice(0, 10);
}

function setPublishTimeFromBjtDate(baseDateBjt, startHourUtc, validityHours) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseDateBjt || '');
    if (!match) return false;

    const utcHour = Math.min(23, Math.max(0, Number.parseInt(startHourUtc, 10)));
    const duration = Math.min(168, Math.max(1, Number.parseInt(validityHours, 10)));
    if (!Number.isFinite(utcHour) || !Number.isFinite(duration)) return false;

    const [, year, month, day] = match.map(Number);
    let utcDateMs = Date.UTC(year, month - 1, day);
    // 16-23 UTC 对应次日 00-07 北京时，因此 UTC 日期需回退一天。
    if (utcHour >= 16) utcDateMs -= 24 * 3600000;

    pbState.startDate = new Date(utcDateMs).toISOString().slice(0, 10);
    pbState.startHour = utcHour;
    pbState.validityHours = duration;
    return true;
}

function setCustomPublishTitle() {
    const titleSelect = document.getElementById('pb-main-title-select');
    if (!titleSelect) return;
    let option = titleSelect.querySelector('option[value="custom"]');
    if (!option) {
        option = document.createElement('option');
        option.value = 'custom';
        titleSelect.appendChild(option);
    }
    option.textContent = `${pbState.validityHours}小时天气预报`;
    titleSelect.value = 'custom';
    titleSelect.dataset.appliedValue = 'custom';
}

function syncPublishTimeControls({ custom = false } = {}) {
    const baseDateBjt = getBjtBaseDateFromState();
    const dateInput = document.getElementById('pb-datetime');
    const hourInput = document.getElementById('pb-start-hour');
    const validityInput = document.getElementById('pb-validity-hours');
    const dateDisplay = document.getElementById('pb-date-display');
    if (dateInput && baseDateBjt) dateInput.value = baseDateBjt;
    if (hourInput) hourInput.value = pbState.startHour;
    if (validityInput) validityInput.value = pbState.validityHours;
    if (dateDisplay) dateDisplay.textContent = baseDateBjt || '--';
    if (custom) setCustomPublishTitle();
}

window.syncPublishTimeControls = syncPublishTimeControls;

function applyTimePreset(val) {
    const dp = document.getElementById('pb-datetime');
    if(!dp || !dp.value) return;

    if (val === 'custom') {
        openPublishTimePopover();
        return;
    }
    
    const [year, month, day] = dp.value.split('-').map(Number);
    const bjtDate = new Date(year, month - 1, day);
    let sHourBJT = 0; let vHours = 24; 
    
    if (val === '24') { sHourBJT = 15; vHours = 24; }
    else if (val === '12') { sHourBJT = 8; vHours = 12; }
    else if (val === '8') { sHourBJT = 20; vHours = 8; }
    else if (val === '4') { sHourBJT = 4; vHours = 4; }
    else if (val === '48') { sHourBJT = new Date(Date.now() + 8 * 3600000).getUTCHours(); vHours = 48; }

    const utcH = (sHourBJT - 8 + 24) % 24;
    const baseUTC = new Date(Date.UTC(bjtDate.getFullYear(), bjtDate.getMonth(), bjtDate.getDate(), utcH, 0, 0));
    if (sHourBJT - 8 < 0) baseUTC.setUTCDate(baseUTC.getUTCDate() - 1);
    
    pbState.startDate = baseUTC.toISOString().split('T')[0];
    pbState.startHour = baseUTC.getUTCHours();
    pbState.validityHours = vHours;

    const titleSelect = document.getElementById('pb-main-title-select');
    if (titleSelect) {
        const customOption = titleSelect.querySelector('option[value="custom"]');
        if (customOption) customOption.textContent = '自定义参数预报';
        titleSelect.value = val;
        titleSelect.dataset.appliedValue = val;
    }
    syncPublishTimeControls();

    pbState.filterWindThreshold = 15;
    pbState.filterVisThreshold = 1600;
    if(document.getElementById('filter-wind-threshold')) document.getElementById('filter-wind-threshold').value = 15;
    if(document.getElementById('filter-vis-threshold')) document.getElementById('filter-vis-threshold').value = 1600;
    
    populateModalForm();
}

// 🌟 需求：EC/TAF 勾选变化时，仅凭缓存重算 hasAlert 并重渲染（不重新请求 API）。
function recomputeAlertsAndRerender() {
    if (Array.isArray(window.currentApAnalysis)) {
        window.currentApAnalysis.forEach(ap => {
            if (pbState.confirmedData[ap.icao]) { ap.hasAlert = true; return; }
            ap.hasAlert = (pbState.defaultShowEc && ap.hasAlertEC) || (pbState.defaultShowTaf && ap.hasAlertTAF);
        });
        renderPublishTableTriRow(window.currentApAnalysis);
    }
    if(window.updateAllRowspans) window.updateAllRowspans();
}
window.recomputeAlertsAndRerender = recomputeAlertsAndRerender;

function sourceRowsFromTableRow(sourceTr) {
    if (!sourceTr) return { rows: [], note: '适航' };
    const cellTokens = Array.from(sourceTr.querySelectorAll('.col-time')).map(cell =>
        cell.textContent.trim().split(/\s+/).filter(token => token && token !== '—')
    );
    const maxRows = Math.max(1, ...cellTokens.map(tokens => tokens.length));
    const note = sourceTr.querySelector('.col-op')?.dataset.note?.trim() || '';
    const rows = [];
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
        const cells = cellTokens.map(tokens => {
            const text = tokens[rowIndex] || '';
            const style = getMultiCellStyle(text);
            return { text, bg: style.bg, fg: style.fg, ts: style.ts || 'none' };
        });
        rows.push(cells);
    }
    const hasWeather = rows.some(row => row.some(cell => cell.text));
    return { rows, note: hasWeather ? (note || '/') : '适航' };
}

function getSourceForecastData(icao, source) {
    return pbState.sourceForecastCache[icao]?.[source] || { rows: [], note: '适航' };
}

function clonePublishState(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
}

function getBulkTargetIcaos() {
    return Array.from(new Set((window.currentApAnalysis || [])
        .map(item => item.icao)
        .filter(icao => icao && !pbState.confirmedData[icao])));
}

function setBulkButtonState(btn, active, label, rollbackLabel) {
    if (!btn) return;
    btn.textContent = active ? rollbackLabel : label;
    btn.style.background = active ? '#d97706' : '';
}

function refreshBulkButtons() {
    setBulkButtonState(document.getElementById('global-adopt-taf'), !!pbState.bulkAdopted.taf?.airports?.length, '一键采纳', '撤回采纳');
    setBulkButtonState(document.getElementById('global-adopt-ec'), !!pbState.bulkAdopted.ec?.airports?.length, '一键采纳', '撤回采纳');
    setBulkButtonState(document.getElementById('global-adopt-all'), !!pbState.bulkAdopted.all?.airports?.length, '一键编发', '撤回编发');
}

function rollbackDraftSource(icao, source) {
    const draft = pbState.draftData[icao];
    if (!draft) return;
    const rowSources = draft.rowSources || draft.rows.map(() => null);
    const keep = rowSources.map((rowSource, index) => rowSource !== source ? index : -1).filter(index => index >= 0);
    const adoptedSources = new Set(String(draft.adoptedSources || '').split(',').filter(Boolean));
    adoptedSources.delete(source);
    if (!keep.length) {
        delete pbState.draftData[icao];
        return;
    }
    draft.rows = keep.map(index => draft.rows[index]);
    draft.notes = keep.map(index => draft.notes?.[index] || '');
    draft.rowSources = keep.map(index => rowSources[index] || null);
    draft.adoptedSources = Array.from(adoptedSources).join(',');
}

function applyBulkAdoption(source) {
    const active = pbState.bulkAdopted[source];
    let skipDomDraftSync = false;
    if (active?.airports?.length) {
        active.airports.forEach(icao => rollbackDraftSource(icao, source));
        pbState.bulkAdopted[source] = null;
        // The visible rows still contain the source being withdrawn. Do not
        // serialize that stale DOM back into draftData during the rerender.
        skipDomDraftSync = true;
    } else {
        persistAllPublishDraftsFromDom();
        const targets = getBulkTargetIcaos();
        pbState.bulkActionInProgress = true;
        renderPublishTableTriRow(window.currentApAnalysis);
        const buttonSelector = source === 'taf' ? '.btn-adopt-taf' : '.btn-adopt-nwp';
        document.querySelectorAll(buttonSelector).forEach(button => button.click());
        pbState.bulkAdopted[source] = targets.length ? { airports: targets } : null;
        pbState.bulkActionInProgress = false;
    }
    renderPublishTableTriRow(window.currentApAnalysis, !skipDomDraftSync);
    refreshBulkButtons();
}

function setupBulkAdoptButton(btnId, source) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    setBulkButtonState(btn, !!pbState.bulkAdopted[source]?.airports?.length, '一键采纳', '撤回采纳');
    btn.onclick = () => applyBulkAdoption(source);
}

function setupBulkAllButton() {
    const btn = document.getElementById('global-adopt-all');
    if (!btn) return;
    const active = pbState.bulkAdopted.all?.airports?.length;
    setBulkButtonState(btn, !!active, '一键编发', '撤回编发');
    btn.onclick = () => {
        const current = pbState.bulkAdopted.all;
        if (current?.airports?.length) {
            current.airports.forEach(icao => {
                const confirmed = current.confirmedSnapshots[icao];
                const draft = current.draftSnapshots[icao];
                if (confirmed) pbState.confirmedData[icao] = clonePublishState(confirmed);
                else delete pbState.confirmedData[icao];
                if (draft) pbState.draftData[icao] = clonePublishState(draft);
                else delete pbState.draftData[icao];
            });
            pbState.bulkAdopted.taf = current.sourceStates.taf;
            pbState.bulkAdopted.ec = current.sourceStates.ec;
            pbState.bulkAdopted.all = null;
        } else {
            persistAllPublishDraftsFromDom();
            const targets = getBulkTargetIcaos();
            const confirmedSnapshots = {};
            const draftSnapshots = {};
            targets.forEach(icao => {
                confirmedSnapshots[icao] = clonePublishState(pbState.confirmedData[icao]);
                draftSnapshots[icao] = clonePublishState(pbState.draftData[icao]);
            });
            pbState.bulkActionInProgress = true;
            renderPublishTableTriRow(window.currentApAnalysis);
            targets.forEach(confirmAirportFromDom);
            pbState.bulkAdopted.all = targets.length ? {
                airports: targets,
                confirmedSnapshots,
                draftSnapshots,
                sourceStates: { taf: pbState.bulkAdopted.taf, ec: pbState.bulkAdopted.ec }
            } : null;
            pbState.bulkAdopted.taf = null;
            pbState.bulkAdopted.ec = null;
            pbState.bulkActionInProgress = false;
        }
        window.saveConfirmedDataToLocal?.();
        renderPublishTableTriRow(window.currentApAnalysis);
        refreshBulkButtons();
    };
}

function addShortTermBeforeThunder(value) {
    const text = String(value || '');
    return text.replace(/弱雷雨|中雷雨|强雷雨|雷雨|雷暴/g, (match, offset, source) =>
        source.slice(Math.max(0, offset - 2), offset) === '短时' ? match : `短时${match}`
    );
}

function isDomesticMainlandAirport(icao) {
    const region = getAirportRegion(icao);
    return region !== '港台' && Object.keys(AIRPORT_CFG.domestic).includes(region);
}

function buildPublishExportText(timezone = 'auto') {
    const confirmedIcaos = Object.keys(pbState.confirmedData);
    if (!confirmedIcaos.length) return '⚠️ 暂无已确认编发的预报数据。请先点击表格中的【确认编发】。';

    if (pbState.airportOrderMode === 'import') {
        const importOrder = new Map(pbState.importSequence.map((icao, index) => [icao, index]));
        confirmedIcaos.sort((a, b) =>
            (importOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (importOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
        );
    } else {
        const sorted = sortPublishAirportAnalysis(confirmedIcaos.map(icao => ({ icao })));
        confirmedIcaos.splice(0, confirmedIcaos.length, ...sorted.map(item => item.icao));
    }

    const startMs = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();

    return confirmedIcaos.map(icao => {
        const data = pbState.confirmedData[icao];
        const rows = data.rows || [data.cells || []];
        const notes = data.notes || [data.note || ''];
        const maxCells = Math.max(1, ...rows.map(row => row?.length || 0));
        const airportTimezone = timezone === 'auto' ? (isDomesticMainlandAirport(icao) ? 'bjt' : 'utc') : timezone;
        const isUtc = airportTimezone === 'utc';
        const timezoneOffsetHours = isUtc ? 0 : 8;

        const endpoint = (offset, withMonth = false) => {
            const date = new Date(startMs + (offset + timezoneOffsetHours) * 3600000);
            const month = date.getUTCMonth() + 1;
            const day = date.getUTCDate();
            const hour = String(date.getUTCHours()).padStart(2, '0');
            return { month, day, hour, label: `${withMonth ? `${month}月` : ''}${day}日${hour}` };
        };
        const first = endpoint(0, true);
        const last = endpoint(maxCells - 1, true);
        const hasCrossMonth = first.month !== last.month;
        const formatRange = (startIndex, endIndex) => {
            const start = endpoint(startIndex, hasCrossMonth);
            const end = endpoint(endIndex, hasCrossMonth);
            const suffix = isUtc ? 'Z' : '时';
            if (start.month === end.month && start.day === end.day) {
                return `${start.label}-${end.hour}${suffix}`;
            }
            return `${start.label}${suffix}-${end.label}${suffix}`;
        };
        const formatCellValue = cell => {
            const withoutTemperature = String(cell?.text || '').trim().split(/\s+/)
                .filter(token => parseForecastTemperature(token) === null)
                .join(' ');
            const windText = formatPublishWindText(withoutTemperature);
            return addShortTermBeforeThunder(windText);
        };
        const getCellTemperature = cell => {
            const temperatures = String(cell?.text || '').trim().split(/\s+/)
                .map(parseForecastTemperature)
                .filter(value => value !== null && value >= pbState.filterTempHigh);
            return temperatures.length ? Math.max(...temperatures) : null;
        };

        const rowTexts = rows.map((cells, rowIndex) => {
            if (!cells?.length) return '';
            const note = String(notes[rowIndex] || '').trim();
            const effectiveNote = (note === '/' || note === '适航' ? '' : note)
                .split(/\s+/).filter(token => token && token !== '高温').join(' ');
            const isModifier = /间歇|短时|偶有|局地|阶段性|阵性/.test(effectiveNote);
            const isWindDescription = /风/.test(effectiveNote) && !isModifier;
            const ranges = [];
            let currentValue = formatCellValue(cells[0]);
            let startIndex = 0;
            for (let index = 1; index <= cells.length; index++) {
                const nextValue = index < cells.length ? formatCellValue(cells[index]) : null;
                if (nextValue !== currentValue) {
                    if (currentValue && currentValue !== '—' && currentValue !== '适航') {
                        const inlineNote = effectiveNote && !isWindDescription ? effectiveNote : '';
                        ranges.push(`${formatRange(startIndex, index - 1)}${inlineNote}${currentValue}`);
                    }
                    currentValue = nextValue;
                    startIndex = index;
                }
            }

            const temperatureRanges = [];
            let temperatureStart = null;
            let temperatures = [];
            for (let index = 0; index <= cells.length; index++) {
                const temperature = index < cells.length ? getCellTemperature(cells[index]) : null;
                if (temperature !== null) {
                    if (temperatureStart === null) temperatureStart = index;
                    temperatures.push(temperature);
                } else if (temperatureStart !== null) {
                    const minimum = Math.min(...temperatures);
                    const maximum = Math.max(...temperatures);
                    const temperatureText = minimum === maximum ? `${minimum}℃` : `${minimum}-${maximum}℃`;
                    temperatureRanges.push(`${formatRange(temperatureStart, index - 1)}温度${temperatureText}`);
                    temperatureStart = null;
                    temperatures = [];
                }
            }

            const weatherText = ranges.length ? `${isWindDescription ? `${effectiveNote}，` : ''}${ranges.join('，')}` : '';
            const combined = [weatherText, ...temperatureRanges].filter(Boolean);
            return combined.length ? combined.join('，') : (effectiveNote || '');
        }).filter(Boolean);

        const timeText = rowTexts.length ? rowTexts.join('；') : '预计天气适航';
        const displayName = window.GLOBAL_AIRPORT_NAME_MAP[icao] || icao;
        return `${displayName}：${timeText}。`;
    }).join('\n');
}

window.buildPublishExportText = buildPublishExportText;

function setupGlobalToolbar() {
    const table = document.getElementById('forecast-table');
    if (!table) return;
    
    table.classList.add('table-merged'); 
    
    const tafCb = document.getElementById('global-toggle-taf');
    if (tafCb) {
        tafCb.checked = pbState.defaultShowTaf;
        table.classList.toggle('hide-taf-global', !tafCb.checked);
        tafCb.onchange = (e) => { 
            pbState.defaultShowTaf = e.target.checked;
            table.classList.toggle('hide-taf-global', !e.target.checked); 
            recomputeAlertsAndRerender();
        };
    }
    
    const ecCb = document.getElementById('global-toggle-ec');
    if (ecCb) {
        ecCb.checked = pbState.defaultShowEc;
        table.classList.toggle('hide-ec-global', !ecCb.checked);
        ecCb.onchange = (e) => { 
            pbState.defaultShowEc = e.target.checked;
            table.classList.toggle('hide-ec-global', !e.target.checked); 
            recomputeAlertsAndRerender();
        };
    }

    const regionOptions = Array.from(document.querySelectorAll('.publish-region-option'));
    const domesticRegions = new Set(Object.keys(AIRPORT_CFG.domestic));
    const scopeControls = {
        domestic: document.getElementById('publish-region-domestic-all'),
        international: document.getElementById('publish-region-international-all')
    };
    const optionsForScope = scope => regionOptions.filter(option =>
        scope === 'domestic' ? domesticRegions.has(option.value) : !domesticRegions.has(option.value)
    );
    const syncScopeControls = () => {
        Object.entries(scopeControls).forEach(([scope, control]) => {
            if (control) control.checked = optionsForScope(scope).every(option => option.checked);
        });
    };
    const refreshRegions = () => {
        regionOptions.forEach(option => { pbState.enabledRegions[option.value] = option.checked; });
        syncScopeControls();
        if (pbState.runningImportMode) loadForecastData(true);
    };
    Object.entries(scopeControls).forEach(([scope, control]) => {
        if (!control) return;
        control.onchange = () => {
            optionsForScope(scope).forEach(option => {
                option.checked = control.checked;
                pbState.enabledRegions[option.value] = control.checked;
            });
            if (pbState.runningImportMode) loadForecastData(true);
        };
    });
    regionOptions.forEach(option => {
        option.checked = pbState.enabledRegions[option.value] !== false;
        option.onchange = refreshRegions;
    });
    syncScopeControls();
    
    const tafExpandBtn = document.getElementById('global-expand-taf');
    if (tafExpandBtn) {
        let isTafMerged = true;
        tafExpandBtn.onclick = () => {
            isTafMerged = !isTafMerged;
            tafExpandBtn.textContent = isTafMerged ? "合并显示" : "分行展开";
            tafExpandBtn.style.background = isTafMerged ? "#64748b" : "#0f766e";
            document.querySelectorAll('.tr-taf').forEach(tr => tr.classList.toggle('row-expanded', !isTafMerged));
            document.querySelectorAll('.tr-taf-detail').forEach(tr => tr.style.display = isTafMerged ? 'none' : 'table-row');
            if(window.updateAllRowspans) window.updateAllRowspans();
        };
    }
    
    const ecExpandBtn = document.getElementById('global-expand-ec');
    if (ecExpandBtn) {
        let isEcMerged = true;
        ecExpandBtn.onclick = () => {
            isEcMerged = !isEcMerged;
            ecExpandBtn.textContent = isEcMerged ? "合并显示" : "分行展开";
            ecExpandBtn.style.background = isEcMerged ? "#64748b" : "#0f766e";
            document.querySelectorAll('.tr-nwp').forEach(tr => tr.classList.toggle('row-expanded', !isEcMerged));
            document.querySelectorAll('.tr-nwp-detail').forEach(tr => tr.style.display = isEcMerged ? 'none' : 'table-row');
            if(window.updateAllRowspans) window.updateAllRowspans();
        };
    }
    
    // 🌟 一键编发：把当前表中所有未确认机场批量采纳指定数据源(TAF/EC)并确认编发；再次点击退回。
    setupBulkAdoptButton('global-adopt-taf', 'taf');
    setupBulkAdoptButton('global-adopt-ec', 'ec');
    setupBulkAllButton();

    const modeBtn = document.getElementById('global-toggle-mode');
    if (modeBtn) {
        let isMerged = true;
        modeBtn.onclick = () => {
            isMerged = !isMerged;
            modeBtn.textContent = isMerged ? "一键全展开" : "取消全展开";
            modeBtn.style.background = isMerged ? "#0f766e" : "#dc2626";
            
            document.querySelectorAll('.tr-nwp, .tr-taf').forEach(tr => tr.classList.toggle('row-expanded', !isMerged));
            document.querySelectorAll('.tr-nwp-detail, .tr-taf-detail').forEach(tr => tr.style.display = isMerged ? 'none' : 'table-row');
            
            if(tafExpandBtn) { tafExpandBtn.textContent = isMerged?"合并显示":"分行展开"; tafExpandBtn.style.background=isMerged?"#64748b":"#0f766e"; }
            if(ecExpandBtn) { ecExpandBtn.textContent = isMerged?"合并显示":"分行展开"; ecExpandBtn.style.background=isMerged?"#64748b":"#0f766e"; }
            
            if(window.updateAllRowspans) window.updateAllRowspans();
        };
    }
    
    const refBtn = document.getElementById('global-refresh-btn');
    if (refBtn) {
        refBtn.onclick = () => {
            if (!(localStorage.getItem('sf_weather_token') || localStorage.getItem('mtws_token'))) return alert("请先登录！");
            loadForecastData();
        };
    }

    const refreshExportText = () => {
        const textarea = document.getElementById('export-text-content');
        if (!textarea) return;
        const timezone = document.querySelector('input[name="export-text-timezone"]:checked')?.value || 'auto';
        textarea.value = buildPublishExportText(timezone);
    };
    document.querySelectorAll('input[name="export-text-timezone"]').forEach(option => {
        option.addEventListener('change', refreshExportText);
    });
    document.getElementById('global-export-text-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('export-text-modal');
        if (!modal) return;
        refreshExportText();
        modal.style.display = 'flex';
    });
    
    document.getElementById('close-export-modal')?.addEventListener('click', () => {
        document.getElementById('export-text-modal').style.display = 'none';
    });

    document.getElementById('copy-export-text-btn')?.addEventListener('click', () => {
        const textarea = document.getElementById('export-text-content');
        textarea.select();
        document.execCommand('copy');
        const btn = document.getElementById('copy-export-text-btn');
        const oldTxt = btn.textContent;
        btn.textContent = '✅ 已成功复制！';
        setTimeout(() => btn.textContent = oldTxt, 2000);
    });
}

function setupQuickTimeOptions() {
    const titleSelect = document.getElementById('pb-main-title-select');
    if(titleSelect) {
        titleSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                openPublishTimePopover();
                return;
            }
            const now = new Date(Date.now() + 8 * 3600000); 
            document.getElementById('pb-datetime').value = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
            applyTimePreset(e.target.value);
        });
    }

    const trigger = document.getElementById('pb-time-trigger');
    const popover = document.getElementById('pb-time-popover');
    const closePopover = (restoreTitle = false) => {
        if (!popover || !trigger) return;
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        syncPublishTimeControls();
        if (restoreTitle && titleSelect) {
            titleSelect.value = titleSelect.dataset.appliedValue || '24';
        }
    };

    trigger?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (popover?.hidden) openPublishTimePopover();
        else closePopover(true);
    });
    popover?.addEventListener('click', event => event.stopPropagation());
    document.getElementById('pb-time-cancel')?.addEventListener('click', () => closePopover(true));
    document.getElementById('pb-time-apply')?.addEventListener('click', () => {
        const dateInput = document.getElementById('pb-datetime');
        const hourInput = document.getElementById('pb-start-hour');
        const validityInput = document.getElementById('pb-validity-hours');
        for (const input of [dateInput, hourInput, validityInput]) {
            if (input && !input.checkValidity()) {
                input.reportValidity();
                return;
            }
        }
        const baseDate = dateInput?.value;
        const startHour = hourInput?.value;
        const validity = validityInput?.value;
        if (!setPublishTimeFromBjtDate(baseDate, startHour, validity)) return;

        setCustomPublishTitle();
        closePopover(false);
        renderPublishTableTriRow(window.currentApAnalysis || []);
        if ((window.currentApAnalysis || []).length > 0) loadForecastData(true);
    });
    popover?.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') document.getElementById('pb-time-apply')?.click();
        });
    });
    document.addEventListener('click', () => {
        if (popover && !popover.hidden) closePopover(true);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && popover && !popover.hidden) closePopover(true);
    });
    window.addEventListener('resize', () => {
        if (popover && !popover.hidden) positionPublishTimePopover();
    });
}

function positionPublishTimePopover() {
    const trigger = document.getElementById('pb-time-trigger');
    const popover = document.getElementById('pb-time-popover');
    if (!trigger || !popover || popover.hidden) return;
    const control = trigger.closest('#pb-time-control') || trigger.parentElement;
    if (!control) return;
    const controlRect = control.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const margin = 12;
    const desiredLeft = controlRect.left;
    const maxLeft = Math.max(margin, window.innerWidth - popoverRect.width - margin);
    const clampedLeft = Math.max(margin, Math.min(desiredLeft, maxLeft));
    popover.style.left = `${clampedLeft - controlRect.left}px`;
}

function openPublishTimePopover() {
    const trigger = document.getElementById('pb-time-trigger');
    const popover = document.getElementById('pb-time-popover');
    if (!trigger || !popover) return;
    syncPublishTimeControls();
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPublishTimePopover();
    document.getElementById('pb-datetime')?.focus();
}

function renderAirportGroupsConfig() {
    const container = document.getElementById('pb-airport-groups-container');
    if (!container) return;
    container.innerHTML = '';
    pbState.airportGroups.forEach((g, idx) => {
        container.innerHTML += `
            <div class="ap-group-item" style="border:1px solid #cce5ff; padding:10px; margin-bottom:10px; border-radius:4px; background:#f8fbff;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <div>组名: <input type="text" class="grp-name" value="${g.name}" style="width:80px; font-weight:bold; padding:2px;"></div>
                    <label style="cursor:pointer; font-weight:bold; color:#d9534f;"><input type="checkbox" class="grp-show" ${g.alwaysShow?'checked':''}> 置顶</label>
                    <button class="mini-btn del-grp" data-idx="${idx}" style="background:#dc2626;color:white;border:none;">删 除</button>
                </div>
                <textarea class="grp-aps" placeholder="输入4字ICAO，用空格隔开" style="width:100%; height:45px; padding:5px; border-radius:4px; border:1px solid #b8daff; outline:none; box-sizing:border-box;">${g.airports.join(' ')}</textarea>
            </div>
        `;
    });
    document.querySelectorAll('.del-grp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            syncAirportGroupsFromForm();
            pbState.airportGroups.splice(e.target.dataset.idx, 1);
            renderAirportGroupsConfig();
        });
    });
}

document.getElementById('add-pb-group-btn')?.addEventListener('click', () => {
    syncAirportGroupsFromForm();
    pbState.airportGroups.push({ name: "新性质", alwaysShow: false, airports: [] });
    renderAirportGroupsConfig();
});

function syncAirportGroupsFromForm() {
    const items = document.querySelectorAll('.ap-group-item');
    if (!items.length) return;
    pbState.airportGroups = Array.from(items).map(item => {
        const name = item.querySelector('.grp-name').value.trim() || '未命名';
        const alwaysShow = item.querySelector('.grp-show').checked;
        const airports = item.querySelector('.grp-aps').value.toUpperCase().split(/[\s,]+/).filter(code => code.length === 4);
        return { name, alwaysShow, airports };
    });
}

// 🌟 构造 publish 配置块，供分块 PATCH 使用。
//   localStorage 缺失时回退到 window.OMICS_CONFIG(持久唯一源)，绝不提交空块覆盖磁盘。
function buildPublishBlockFromLocal() {
    const cfg = window.OMICS_CONFIG || window.OMICS_SETTINGS_CONFIG || {};
    const s = (cfg && cfg.publish) ? cfg.publish : {};
    let groups = null, ec = null;
    try { groups = localStorage.getItem('pb_airport_groups') ? JSON.parse(localStorage.getItem('pb_airport_groups')) : null; } catch (e) {}
    try { ec = localStorage.getItem('pb_auto_ec_cfg') ? JSON.parse(localStorage.getItem('pb_auto_ec_cfg')) : null; } catch (e) {}
    return {
        airport_groups: (groups && groups.length) ? groups : (s.airport_groups || []),
        auto_ec_cfg: (ec && Object.keys(ec).length) ? ec : (s.auto_ec_cfg || {}),
        display_elements: {
            wind: pbState.showWind,
            visibility: pbState.showVis,
            weather: pbState.showWeatherCode,
            temperature: pbState.showTemp,
            pressure: pbState.showPressure
        }
    };
}

function saveAirportGroupsConfig() {
    syncAirportGroupsFromForm();
    localStorage.setItem('pb_airport_groups', JSON.stringify(pbState.airportGroups));
    // 🌟 只 PATCH publish 块，不全量覆盖（避免冲掉阈值/人员等）
    if (typeof window.OMICS_patchSettingsConfig === 'function') window.OMICS_patchSettingsConfig({ publish: buildPublishBlockFromLocal() });
    else if (typeof window.OMICS_syncSettingsConfig === 'function') window.OMICS_syncSettingsConfig();
}

function populateModalForm() {
  const q = id => document.getElementById(id);
  if(q('cfg-allow-other-carriers')) q('cfg-allow-other-carriers').checked = pbState.allowOtherCarriers;
  if(q('cfg-default-taf')) q('cfg-default-taf').checked = pbState.defaultShowTaf;
  if(q('cfg-default-ec')) q('cfg-default-ec').checked = pbState.defaultShowEc;

  if(q('filter-wind-threshold')) q('filter-wind-threshold').value = pbState.filterWindThreshold;
  if(q('filter-vis-threshold')) q('filter-vis-threshold').value = pbState.filterVisThreshold;
  if(q('filter-temp-high')) q('filter-temp-high').value = pbState.filterTempHigh;
  if(q('cfg-ice-temp')) q('cfg-ice-temp').value = pbState.cfgIceTemp;
  if(q('cfg-ice-dew-diff')) q('cfg-ice-dew-diff').value = pbState.cfgIceDewPointDiff;
  if(q('cfg-ice-vis')) q('cfg-ice-vis').value = pbState.cfgIceVis;
  if(q('cfg-ice-precip-hours')) q('cfg-ice-precip-hours').value = pbState.cfgIcePrecipHours;
  if(q('cfg-ext-cold-temp')) q('cfg-ext-cold-temp').value = pbState.cfgExtColdTemp;
  
  const c = (id, val) => { const el=q(id); if(el) el.checked = val; };
  c('cfg-wind', pbState.showWind); c('cfg-vis', pbState.showVis); c('cfg-wx', pbState.showWeatherCode); c('cfg-temp', pbState.showTemp); c('cfg-pressure', pbState.showPressure);
  c('filter-hide-empty-airports', pbState.filterHideEmptyAirports);
  
  ALL_WX_PHENOMENA.forEach((wx, idx) => { const el = q(`filter-wx-${idx}`); if(el) el.checked = pbState.filterWx[wx] !== false; });
}

function saveModalForm() {
  const q = id => document.getElementById(id);
  const numberValue = (id, fallback) => {
      const value = Number.parseFloat(q(id)?.value);
      return Number.isFinite(value) ? value : fallback;
  };
  if(q('cfg-allow-other-carriers')) pbState.allowOtherCarriers = q('cfg-allow-other-carriers').checked;
  if(q('cfg-default-taf')) pbState.defaultShowTaf = q('cfg-default-taf').checked;
  if(q('cfg-default-ec')) pbState.defaultShowEc = q('cfg-default-ec').checked;

  pbState.filterWindThreshold = numberValue('filter-wind-threshold', 15);
  pbState.filterVisThreshold = numberValue('filter-vis-threshold', 1600);
  pbState.filterTempHigh = numberValue('filter-temp-high', 33);
  
  const c = id => q(id)?.checked;
  pbState.showWind = c('cfg-wind'); pbState.showVis = c('cfg-vis'); pbState.showWeatherCode = c('cfg-wx'); pbState.showTemp = c('cfg-temp'); pbState.showPressure = c('cfg-pressure');
  pbState.filterHideEmptyAirports = c('filter-hide-empty-airports');
  
  ALL_WX_PHENOMENA.forEach((wx, idx) => { const cb = q(`filter-wx-${idx}`); if (cb) pbState.filterWx[wx] = cb.checked; });
  
  pbState.cfgIceTemp = numberValue('cfg-ice-temp', 10);
  pbState.cfgIceDewPointDiff = Math.max(0, numberValue('cfg-ice-dew-diff', 0));
  pbState.cfgIceVis = numberValue('cfg-ice-vis', 1500);
  pbState.cfgIcePrecipHours = Math.max(1, Math.round(numberValue('cfg-ice-precip-hours', 12)));
  pbState.cfgExtColdTemp = numberValue('cfg-ext-cold-temp', -30);
  localStorage.setItem('pb_auto_ec_cfg', JSON.stringify({
      highTemp: pbState.filterTempHigh,
      groundIceTemp: pbState.cfgIceTemp,
      groundIceDewPointDiff: pbState.cfgIceDewPointDiff,
      groundIceVisibility: pbState.cfgIceVis,
      precipHours: pbState.cfgIcePrecipHours,
      extremeColdTemp: pbState.cfgExtColdTemp
  }));
  if (typeof window.OMICS_patchSettingsConfig === 'function') window.OMICS_patchSettingsConfig({ publish: buildPublishBlockFromLocal() });
  else if (typeof window.OMICS_syncSettingsConfig === 'function') window.OMICS_syncSettingsConfig();

  saveAirportGroupsConfig(); 
  
  const tafCb = document.getElementById('global-toggle-taf');
  if (tafCb) { tafCb.checked = pbState.defaultShowTaf; tafCb.dispatchEvent(new Event('change')); }
  const ecCb = document.getElementById('global-toggle-ec');
  if (ecCb) { ecCb.checked = pbState.defaultShowEc; ecCb.dispatchEvent(new Event('change')); }
}

async function syncAirportsToServer() {
    try {
        // 直接向 Flask 后端派发最新状态，由后端执行文件物理覆写
        await fetch('/api/save_airports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coords: window.AIRPORT_COORDS, names: window.GLOBAL_AIRPORT_NAME_MAP })
        });
    } catch(e) {
        console.error("同步机场至服务器静态文件失败:", e);
    }
}

function setupModalEvents() {
  const globalModal = document.getElementById('global-settings-modal');
  
  document.getElementById('settings-toggle-btn')?.addEventListener('click', () => {
      populateModalForm(); 
      globalModal.style.display = 'flex';
      
      // 🌟 核心修复：延迟 10 毫秒，彻底抹除 script.js 残留的内联灰底色，实现大一统！
      setTimeout(() => {
          const currentMode = document.querySelector('input[name="forecast-mode"]:checked')?.value;
          
          document.querySelectorAll('.set-nav').forEach(n => {
              n.classList.remove('active');
              // 关键：剥夺原有的内联背景色统治权
              n.style.background = '';
              n.style.backgroundColor = '';
              // 仅清除普通项的字体颜色，防止冲掉机场字典/管理员的专属黄橙色
              if (n.dataset.target === 'pane-qa' || n.dataset.target === 'pane-pb') {
                  n.style.color = ''; 
              }
          });
          
          document.querySelectorAll('.set-pane').forEach(p => p.style.display = 'none');
          
          if (currentMode === 'publish') {
              const pbNav = document.querySelector('.set-nav[data-target="pane-pb"]');
              if(pbNav) { pbNav.classList.add('active'); document.getElementById('pane-pb').style.display = 'block'; }
          } else {
              const qaNav = document.querySelector('.set-nav[data-target="pane-qa"]');
              if(qaNav) { qaNav.classList.add('active'); document.getElementById('pane-qa').style.display = 'block'; }
          }
      }, 10);
  });

  document.querySelectorAll('.set-nav').forEach(nav => {
      nav.addEventListener('click', () => {
          document.querySelectorAll('.set-nav').forEach(n => n.classList.remove('active'));
          nav.classList.add('active');
          document.querySelectorAll('.set-pane').forEach(p => p.style.display = 'none');
          const tgt = document.getElementById(nav.dataset.target);
          if (tgt) tgt.style.display = 'block';
      });
  });
  
  document.getElementById('pb-settings-save-btn')?.addEventListener('click', () => { 
      saveModalForm(); 
      globalModal.style.display = 'none';
      loadForecastData(); 
  });

  ['cfg-wind', 'cfg-vis', 'cfg-wx', 'cfg-temp', 'cfg-pressure'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
          const q = key => document.getElementById(key)?.checked === true;
          pbState.showWind = q('cfg-wind');
          pbState.showVis = q('cfg-vis');
          pbState.showWeatherCode = q('cfg-wx');
          pbState.showTemp = q('cfg-temp');
          pbState.showPressure = q('cfg-pressure');
          window.OMICS_patchSettingsConfig?.({ publish: buildPublishBlockFromLocal() });
      });
  });

  const grid = document.getElementById('filter-wx-grid');
  if(grid) {
      grid.innerHTML = '';
      ALL_WX_PHENOMENA.forEach((wx, idx) => {
        const checked = !WX_DEFAULT_HIDDEN.has(wx) ? 'checked' : '';
        grid.innerHTML += `<label class="wx-item"><input type="checkbox" id="filter-wx-${idx}" ${checked}> ${wx}</label>`;
      });
  }

  document.querySelector('.set-nav[data-target="pane-ap"]')?.addEventListener('click', () => {
      const dictTbody = document.getElementById('dict-tbody');
      const dictLoading = document.getElementById('dict-loading');
      if (dictTbody) dictTbody.innerHTML = '';
      if (dictLoading) dictLoading.style.display = 'block';
      
      requestAnimationFrame(() => {
          setTimeout(() => {
              renderDictTable();
              if (dictLoading) dictLoading.style.display = 'none';
          }, 50);
      });
  });

  const dictSearch = document.getElementById('dict-search-input');
  // 🌟 问题1：机场字典无限滚动 —— 默认渲染前50个，滚轮到底部继续加50个；搜索时显示全部
  const DICT_PAGE = 50;
  let _dictLimit = DICT_PAGE;
  let _dictFilter = '';

  function _dictMatchedKeys(filterText) {
    const ft = (filterText || '').toUpperCase();
    const all = Object.keys(window.AIRPORT_COORDS || {}).sort();
    if (!ft) return all;
    return all.filter(icao => {
      const name = window.GLOBAL_AIRPORT_NAME_MAP[icao] || '未知';
      return icao.includes(ft) || name.includes(filterText);
    });
  }

  function _dictRowHtml(icao) {
    const name = window.GLOBAL_AIRPORT_NAME_MAP[icao] || '未知';
    const coords = window.AIRPORT_COORDS[icao];
    return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding:8px; font-weight:bold; color:#1e40af;">${icao}</td>
                <td style="padding:8px;"><input type="text" class="dict-inp-name" value="${name}" style="width:80px; text-align:center; border:1px solid transparent; background:transparent;"></td>
                <td style="padding:8px;"><input type="number" class="dict-inp-lat" value="${coords ? coords[0] : ''}" step="0.01" style="width:60px; text-align:center; border:1px solid transparent; background:transparent;"></td>
                <td style="padding:8px;"><input type="number" class="dict-inp-lon" value="${coords ? coords[1] : ''}" step="0.01" style="width:60px; text-align:center; border:1px solid transparent; background:transparent;"></td>
                <td style="padding:8px;">
                    <button class="mini-btn dict-save-btn" data-icao="${icao}" style="background:#28a745; color:white; padding:4px 8px; font-size:11px;">保存</button>
                    <button class="mini-btn dict-del-btn" data-icao="${icao}" style="background:#dc2626; color:white; padding:4px 8px; font-size:11px;">删除</button>
                </td>
            </tr>
        `;
  }

  function _bindDictRowEvents(scope) {
    scope.querySelectorAll('input').forEach(inp => {
        inp.onfocus = () => { inp.style.border = '1px solid #2563eb'; inp.style.background = 'white'; };
        inp.onblur = () => { inp.style.border = '1px solid transparent'; inp.style.background = 'transparent'; };
    });
    scope.querySelectorAll('.dict-save-btn').forEach(btn => {
        btn.onclick = (e) => {
            const tr = e.target.closest('tr');
            const icao = e.target.dataset.icao;
            const newName = tr.querySelector('.dict-inp-name').value.trim();
            const newLat = parseFloat(tr.querySelector('.dict-inp-lat').value);
            const newLon = parseFloat(tr.querySelector('.dict-inp-lon').value);
            if(isNaN(newLat) || isNaN(newLon)) return alert("经纬度必须为数字！");
            window.AIRPORT_COORDS[icao] = [newLat, newLon];
            window.GLOBAL_AIRPORT_NAME_MAP[icao] = newName;
            syncAirportsToServer(); 
            e.target.textContent = "已存"; setTimeout(() => e.target.textContent = "保存", 1500);
        };
    });
    scope.querySelectorAll('.dict-del-btn').forEach(btn => {
        btn.onclick = (e) => {
            const icao = e.target.dataset.icao;
            if(confirm(`确定移除 ${icao} 吗？`)) {
                delete window.AIRPORT_COORDS[icao];
                syncAirportsToServer(); 
                renderDictTable(document.getElementById('dict-search-input').value.trim());
            }
        };
    });
  }

  function renderDictTable(filterText = '') {
    const dictTbody = document.getElementById('dict-tbody');
    if (!dictTbody) return;
    _dictFilter = filterText || '';
    // 搜索时显示全部匹配项；空搜索时从第一页重新开始
    _dictLimit = _dictFilter ? Number.MAX_SAFE_INTEGER : DICT_PAGE;
    const keys = _dictMatchedKeys(_dictFilter);
    const shown = keys.slice(0, _dictLimit);
    dictTbody.innerHTML = shown.map(_dictRowHtml).join('');
    _bindDictRowEvents(dictTbody);
  }

  // 🌟 滚动到底部时追加下一批 50 个（仅非搜索状态生效）
  function _appendNextDictPage() {
    if (_dictFilter) return; // 搜索时已全部展开
    const dictTbody = document.getElementById('dict-tbody');
    if (!dictTbody) return;
    const keys = _dictMatchedKeys('');
    if (_dictLimit >= keys.length) return; // 已全部加载
    const next = keys.slice(_dictLimit, _dictLimit + DICT_PAGE);
    _dictLimit += DICT_PAGE;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = next.map(_dictRowHtml).join('');
    while (tmp.firstChild) dictTbody.appendChild(tmp.firstChild);
    _bindDictRowEvents(dictTbody);
  }

  // 绑定滚动容器的触底加载（只绑一次）
  (function bindDictScroll() {
    const tb = document.getElementById('dict-tbody');
    const container = tb ? tb.closest('div[style*="overflow"]') : null;
    if (container && !container._dictScrollBound) {
        container._dictScrollBound = true;
        container.addEventListener('scroll', () => {
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 40) {
                _appendNextDictPage();
            }
        });
    }
  })();

if (dictSearch) dictSearch.addEventListener('input', (e) => renderDictTable(e.target.value.trim()));

  document.getElementById('dict-add-new-btn')?.addEventListener('click', () => {
      const icao = prompt("请输入新机场的4位ICAO代码:")?.trim().toUpperCase();
      if(!icao || icao.length !== 4) return alert("无效的ICAO代码！");
      if(window.AIRPORT_COORDS[icao]) return alert("字典中已存在此机场！");
      window.AIRPORT_COORDS[icao] = [0, 0];
      window.GLOBAL_AIRPORT_NAME_MAP[icao] = "新机场";
      syncAirportsToServer(); dictSearch.value = icao; renderDictTable(icao);
  });
}

// ==========================================
// 🌟 航班与气象数据拉取核心
// ==========================================
async function fetchActiveFlightAirports(startMs, endMs, setProgress) {
    if(setProgress) setProgress("正在向后端请求真实运行航班机场...");
    const token = (localStorage.getItem('sf_weather_token') || localStorage.getItem('mtws_token'));
    const d = new Date(startMs);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    try {
        const res = await fetch('/api/fetch_flights', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, flight_date: dateStr })
        });
        const result = await res.json();
        if (result.success && result.data) {
            const aps = new Set();
            result.data.forEach(flight => {
                if (flight.carrier !== 'O3' && !pbState.allowOtherCarriers) return;
                ['departureAirport','arrivalAirport','depApt','arrApt','airportCode'].forEach(k => {
                    if (flight[k]) aps.add(flight[k].toUpperCase());
                });
            });
            const finalAps = Array.from(aps);
            if(setProgress) setProgress(`匹配: 从 ${result.data.length} 条航班中成功提取到 ${finalAps.length} 个运行机场`);
            return finalAps;
        }
        return [];
    } catch (e) {
        if(setProgress) setProgress(`❌ 航班请求异常: ${e.message}`, true);
        return [];
    }
}

async function fetchTafDataForAirports(airports, startMs, endMs, setProgress) {
    if (airports.length === 0) return {};
    const token = (localStorage.getItem('sf_weather_token') || localStorage.getItem('mtws_token'));
    const fmt = ms => {
        const d = new Date(ms + 8 * 3600000); // UTC to BJT
        return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}00`;
    };
    
    const sStr = fmt(startMs - 36 * 3600000); 
    const eStr = fmt(endMs);

    try {
        if(setProgress) setProgress(`正在极速拉取并解析 TAF 报文，请稍候...`);
        const res = await fetch('/api/fetch_data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, start_time: sStr, end_time: eStr, airports: airports.join(' '), wtypes: ["FC", "FT"] })
        });
        if (!res.ok) throw new Error(`后端拒绝访问 (HTTP 状态码: ${res.status})`);
        
        const result = await res.json();
        let tafMap = {};
        airports.forEach(ap => tafMap[ap] = { raw: [], hourly: null });
        
        if (result.success) {
            if (result.data) {
                if (typeof result.data === 'string') {
                    result.data.split('\n').forEach(line => {
                        const match = line.match(/(?:TAF|TAF AMD|TAF COR)\s+([A-Z]{4})/);
                        if (match && tafMap[match[1]]) tafMap[match[1]].raw.push(line.trim());
                    });
                } else if (typeof result.data === 'object' && !Array.isArray(result.data)) {
                    for (let ap in result.data) { if (tafMap[ap]) tafMap[ap].raw = result.data[ap]; }
                }
            }
            if (result.parsed_tafs && Array.isArray(result.parsed_tafs)) {
                result.parsed_tafs.slice().reverse().forEach(pTaf => {
                    if (tafMap[pTaf.airport]) {
                        if (!tafMap[pTaf.airport].hourly) tafMap[pTaf.airport].hourly = {};
                        Object.keys(pTaf.forecasts).forEach(hKey => {
                            tafMap[pTaf.airport].hourly[hKey] = pTaf.forecasts[hKey];
                        });
                    }
                });
            }
        }
        return tafMap;
    } catch(e) {
        if(setProgress) setProgress(`❌ TAF 请求失败: ${e.message}`, true);
        return {};
    }
}

// ==========================================
// 🌟 翻译、判定与多要素处理核心
// ==========================================
function translateMETARtoCN(code) {
    if (!code || code === 'NSW') return '';
    const map = {
        "TSRA": "中雷雨", "+TSRA": "强雷雨", "-TSRA": "弱雷雨", "TS": "干雷",
        "RA": "中雨", "+RA": "大雨", "-RA": "小雨",
        "SN": "中雪", "+SN": "大雪", "-SN": "小雪",
        "SHRA": "中阵雨", "+SHRA": "大阵雨", "-SHRA": "小阵雨",
        "FZRA": "冻雨", "GR": "冰雹", "GS": "小冰雹",
        "FG": "雾", "BR": "轻雾", "HZ": "霾", "SA": "扬沙", "SS": "沙尘暴", "SQ": "飑", "FC": "龙卷", "DU": "浮尘", "FU": "烟"
    };
    let res = [];
    code.split(' ').forEach(c => {
        let core = c.replace(/VC|MI|PR|BC|BL|DR/g, ''); 
        if (map[core]) res.push(map[core]);
        else if (core.includes('TS')) res.push("雷暴");
        else if (core.includes('RA')) res.push("雨");
        else if (core.includes('SN')) res.push("雪");
        else res.push(core);
    });
    return res.join(' ');
}

const PUBLISH_WIND_LABELS = {
    N: '偏北风', NNE: '东北偏北风', NE: '东北风', ENE: '东北偏东风',
    E: '偏东风', ESE: '东南偏东风', SE: '东南风', SSE: '东南偏南风',
    S: '偏南风', SSW: '西南偏南风', SW: '西南风', WSW: '西南偏西风',
    W: '偏西风', WNW: '西北偏西风', NW: '西北风', NNW: '西北偏北风', VRB: '风向不定'
};

function resolvePublishWindCode(direction) {
    if (direction === undefined || direction === null || direction === '') return '';
    const raw = String(direction).trim().toUpperCase().replace('°', '');
    if (PUBLISH_WIND_LABELS[raw]) return raw;
    const degrees = Number(raw);
    if (!Number.isFinite(degrees)) return '';
    const sixteenDirections = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return sixteenDirections[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

function formatPublishWind(direction, speed) {
    const numericSpeed = Number(speed);
    if (!Number.isFinite(numericSpeed)) return '';
    const code = resolvePublishWindCode(direction);
    return `${code || 'VRB'}${numericSpeed}`;
}

function formatPublishWindText(value) {
    const text = String(value ?? '');
    return text.replace(/(^|\s)(NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|VRB|NE|SE|SW|NW|N|E|S|W)(\d+(?:\.\d+)?)(?=\s|$)/gi,
        (_, prefix, code, speed) => `${prefix}${PUBLISH_WIND_LABELS[code.toUpperCase()] || '风向不定'}${speed}米/秒`);
}

function formatPublishWindTableText(value) {
    let text = String(value ?? '');
    const labels = Object.entries(PUBLISH_WIND_LABELS).sort((a, b) => b[1].length - a[1].length);
    labels.forEach(([code, label]) => {
        const expression = new RegExp(`${label}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:米/秒|m/s)?`, 'g');
        text = text.replace(expression, `${code}$1`);
    });
    return text;
}

window.formatPublishWind = formatPublishWind;
window.formatPublishWindText = formatPublishWindText;
window.formatPublishWindTableText = formatPublishWindTableText;

function getAlertElements(wxStr, vis, spd, direction = '') {
    let elements = [];
    let notes = new Set();
    let fogHandledVis = false;
    
    if (wxStr !== '') {
        wxStr.split(' ').forEach(p => {
            // 🌟 修复：如果设置里取消了勾选该天气，直接跳过不显示
            if (pbState.filterWx[p] === false) return; 

            if (/雾|霾|沙|尘|烟/.test(p)) {
                if (vis < pbState.filterVisThreshold) {
                    elements.push(vis.toString());
                    notes.add(p);
                    fogHandledVis = true;
                }
            } else {
                elements.push(p);
            }
        });
    }
    
    if (spd >= pbState.filterWindThreshold) elements.push(formatPublishWind(direction, spd));
    if (!fogHandledVis && vis < pbState.filterVisThreshold) elements.push(vis.toString());
    
    elements = Array.from(new Set(elements));
    return { w: elements.join(' '), noteStr: Array.from(notes).join(' ') };
}

function getCellStyleByContent(v) {
    if (!v || v === '' || v === '—' || v === '适航') return { bg: 'transparent', fg: '#333' }; 
    if (v.includes('雷') || v.includes('雹')) return { bg: '#dc2626', fg: '#FFFFFF' }; 
    if (WX_HVY_RAIN_KEYWORDS.some(kw => v.includes(kw))) return { bg: '#0f766e', fg: '#FFFFFF' }; 
    if (WX_RAIN_KEYWORDS.some(kw => v.includes(kw))) return { bg: '#16a34a', fg: '#FFFFFF' }; 
    if (WX_SNOW_KEYWORDS.some(kw => v.includes(kw))) return { bg: '#64748b', fg: '#FFFFFF' }; 
    if (v === '低云') return { bg: '#f59e0b', fg: '#FFFFFF' }; 
    if (WX_OTHER_BLUE_KEYWORDS.some(kw => v.includes(kw))) return { bg: '#bae6fd', fg: '#000000' }; 
    const temperature = parseForecastTemperature(v);
    if (temperature !== null) return temperature >= pbState.filterTempHigh
        ? { bg: '#bae6fd', fg: '#000000' }
        : { bg: 'transparent', fg: '#1e293b' };
    if (/风.*\d+(?:\.\d+)?(?:米\/秒)?$/.test(v) || /^(?:N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW|VRB)\d+$/.test(v)) return { bg: '#2563eb', fg: '#FFFFFF' };
    if (/^\d+$/.test(v)) return { bg: '#fde047', fg: '#000000' }; 
    return { bg: '#bae6fd', fg: '#000000' };
}

function getMultiCellStyle(value) {
    if (!value || value === '' || value === '—' || value === '适航') return { bg: 'transparent', fg: '#333', ts: 'none' };
    let elements = value.split(' ');
    if (elements.length === 1) return { ...getCellStyleByContent(elements[0]), ts: 'none' };
    
    let colors = elements.map(e => {
        let c = getCellStyleByContent(e).bg;
        return c === 'transparent' ? '#94a3b8' : c;
    });
    
    let stops = [];
    let pct = 100 / colors.length;
    for(let i=0; i<colors.length; i++) {
        stops.push(`${colors[i]} ${i*pct}%`, `${colors[i]} ${(i+1)*pct}%`);
    }
    return { bg: `linear-gradient(to bottom right, ${stops.join(', ')})`, fg: '#ffffff', ts: '1px 1px 2px rgba(0,0,0,0.8)' };
}
window.getMultiCellStyle = getMultiCellStyle;
window.getCellStyleByContent = getCellStyleByContent;
function processAirportData(apiData) {
  if (!apiData || !apiData.hourly) return null;
  const targetUTC = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();
  let idx = -1;
  for (let i = 0; i < apiData.hourly.time.length; i++) {
      const t = new Date(apiData.hourly.time[i] + "Z").getTime();
      if (Math.abs(t - targetUTC) < 1000) { idx = i; break; }
  }
  if (idx === -1) return null;
  const count = pbState.validityHours + 1;
  const sl = arr => arr ? arr.slice(idx, idx + count) : null;
  return {
    temperature_2m: sl(apiData.hourly.temperature_2m), dew_point_2m: sl(apiData.hourly.dew_point_2m), visibility: sl(apiData.hourly.visibility),
    precipitation: sl(apiData.hourly.precipitation),
    wind_speed_10m: sl(apiData.hourly.wind_speed_10m), wind_direction_10m: sl(apiData.hourly.wind_direction_10m),
    wind_gusts_10m: sl(apiData.hourly.wind_gusts_10m), weather_code: sl(apiData.hourly.weather_code), pressure_msl: sl(apiData.hourly.pressure_msl),
    raw_weather_code: apiData.hourly.weather_code,
    raw_precipitation: apiData.hourly.precipitation,
    start_idx: idx
  };
}

function calcWindSpeed(spd, gst) {
  if (spd == null || gst == null) return null;
  return (gst - spd >= 5) ? Math.ceil(gst) : Math.ceil((spd + gst) / 2);
}
function intensityByPrecip(prec, weak, mid, strong) { return prec < 0.5 ? weak : (prec < 1.5 ? mid : strong); }
function intensityByVis(vis, weak, mid, strong) { return vis >= 1000 ? weak : (vis >= 500 ? mid : strong); }
function getWeatherPhenomenon(wc, prec, vis, windSpeed) {
  if (wc >= 60 && wc <= 65) return intensityByPrecip(prec, '小雨', '中雨', '大雨');
  if (wc >= 70 && wc <= 75) return intensityByVis(vis, '小雪', '中雪', '大雪');
  if (wc >= 96 && wc <= 99) return intensityByPrecip(prec, '弱雷雨', '中雷雨', '强雷雨');
  if (wc === 91 || wc === 92 || wc === 95) return intensityByPrecip(prec, '弱雷雨', '中雷雨', '强雷雨');
  if (wc >= 80 && wc <= 82) return intensityByPrecip(prec, '小阵雨', '中阵雨', '大阵雨');
  if (wc === 45 || wc === 48) return '雾';
  return '';
}
function getWeatherPhenomenonResult(data, i) {
  const wc = data.weather_code?.[i] ?? null;
  const prec = data.precipitation?.[i] ?? 0;
  const vis = data.visibility?.[i] ?? 9999;
  const spd = data.wind_speed_10m?.[i];
  const gst = data.wind_gusts_10m?.[i];
  return { text: getWeatherPhenomenon(wc, prec, vis, calcWindSpeed(spd, gst)) };
}

function parseForecastTemperature(value) {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:℃|°C|度)$/i);
  return match ? Number(match[1]) : null;
}

function isHighTemperatureValue(value) {
  const temperature = parseForecastTemperature(value);
  return temperature !== null && temperature >= pbState.filterTempHigh;
}

function hasRecentPrecipitation(data, forecastIndex) {
  const raw = data.raw_precipitation || [];
  const globalIndex = data.start_idx + forecastIndex;
  for (let offset = 0; offset < pbState.cfgIcePrecipHours; offset++) {
      const value = raw[globalIndex - offset];
      if (Number(value) > 0) return true;
  }
  return false;
}

function getAirportSpecialConditions(nwp) {
  const reasons = new Set();
  if (!nwp) return reasons;
  for (let i = 0; i <= pbState.validityHours; i++) {
      const temperature = Number(nwp.temperature_2m?.[i]);
      const dewPoint = Number(nwp.dew_point_2m?.[i]);
      const visibility = Number(nwp.visibility?.[i]);
      if (!Number.isFinite(temperature)) continue;
      if (temperature < pbState.cfgExtColdTemp) reasons.add('极寒');
      if (temperature < pbState.cfgIceTemp) {
          const dewPointDifferenceMatches = Number.isFinite(dewPoint) && Math.abs(temperature - dewPoint) <= pbState.cfgIceDewPointDiff + 0.0001;
          const lowVisibility = Number.isFinite(visibility) && visibility < pbState.cfgIceVis;
          if (dewPointDifferenceMatches || lowVisibility || hasRecentPrecipitation(nwp, i)) reasons.add('地面结冰');
      }
  }
  return reasons;
}

function updateSpecialConditionFooter() {
  const input = document.getElementById('pb-special-airports');
  if (!input) return;
  const values = [];
  sortPublishAirportAnalysis(window.currentApAnalysis || []).forEach(ap => {
      const reasons = pbState.specialConditionAirports.get(ap.icao);
      if (!reasons?.size) return;
      const name = window.GLOBAL_AIRPORT_NAME_MAP[ap.icao] || ap.icao;
      values.push(`${name}（${Array.from(reasons).join('/')}）`);
  });
  input.value = values.length ? values.join('、') : '无';
}

function analyzeCategory(val) {
    if (!val || val === '' || val === '—' || val === '适航') return [];
    let cats = new Set();
    val.split(' ').forEach(v => {
        if (v.includes('雷') || v.includes('雹')) cats.add('ts');
        else if (WX_HVY_RAIN_KEYWORDS.some(kw => v.includes(kw))) cats.add('hvy-rain');
        else if (v.includes('雨')) cats.add('rain');
        else if (WX_SNOW_KEYWORDS.some(kw => v.includes(kw))) cats.add('snow');
        else if (WX_OTHER_BLUE_KEYWORDS.some(kw => v.includes(kw))) cats.add('other');
        else if (parseForecastTemperature(v) !== null) {
            if (isHighTemperatureValue(v)) cats.add('other');
        }
        else if (/风.*\d+(?:\.\d+)?(?:米\/秒)?$/.test(v) || /^(?:N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW|VRB)\d+$/.test(v)) {
            let spd = parseFloat(v.match(/\d+(?:\.\d+)?(?=(?:米\/秒)?$)/)?.[0] || '0');
            if (spd >= pbState.filterWindThreshold) cats.add('wind');
        }
        else if (/^\d+$/.test(v)) {
            let vis = parseInt(v);
            if (vis < pbState.filterVisThreshold) cats.add('vis');
        }
        else if (v === '低云') cats.add('cld');
        else cats.add('other');
    });
    return Array.from(cats);
}

function updateTopCountersFromTable() {
    let counts = { ts:0, wind:0, snow:0, vis:0, cld:0, 'hvy-rain':0, rain:0, other:0 };
    const table = document.getElementById('forecast-table');
    if (!table) return;
    const airportHits = {}; 
    
    table.querySelectorAll('tbody tr.tr-edit, tbody tr.tr-edit-extra').forEach(tr => {
        let icao = tr.dataset.icao;
        if (!icao) return;
        if (!airportHits[icao]) airportHits[icao] = new Set();
        tr.querySelectorAll('td.td-data').forEach(td => {
            analyzeCategory(td.textContent.trim()).forEach(c => airportHits[icao].add(c));
        });
    });
    
    Object.values(airportHits).forEach(hits => hits.forEach(c => counts[c]++));
    Object.keys(counts).forEach(k => { const el = document.getElementById(`count-${k}`); if(el) el.textContent = counts[k]; });
}

function serializePublishRows(rows) {
    return {
        rows: rows.map(row => Array.from(row.querySelectorAll('.edit-cell')).map(cell => ({
            text: cell.textContent.trim(),
            bg: cell.style.background,
            fg: cell.style.color,
            ts: cell.style.textShadow
        }))),
        notes: rows.map(row => {
            const input = row.querySelector('.edit-note-input');
            const display = row.querySelector('.edit-note-display');
            return input ? input.value : (display?.textContent || '').trim();
        }),
        rowSources: rows.map(row => row.dataset.rowSource || null)
    };
}

function confirmAirportFromDom(icao) {
    const rows = getAirportEditableRows(icao);
    if (!rows.length) return;
    const serialized = serializePublishRows(rows);
    const allClear = serialized.rows.every(row => row.every(cell => !cell.text));
    if (allClear) {
        serialized.notes = serialized.notes.map((_, index) => index === 0 ? '适航' : '');
        serialized.rows.forEach(row => row.forEach(cell => {
            cell.text = '';
            cell.bg = 'transparent';
            cell.fg = '#1e293b';
            cell.ts = 'none';
        }));
    } else {
        serialized.notes = serialized.notes.map(note => note || '/');
    }
    const existing = pbState.confirmedData[icao] || {};
    pbState.confirmedData[icao] = {
        ...existing,
        rows: serialized.rows,
        notes: serialized.notes,
        rowSources: serialized.rows.map(() => null)
    };
    delete pbState.draftData[icao];
}

function persistDraftAirportFromDom(icao) {
    if (!icao || pbState.confirmedData[icao]) return;
    const rows = getAirportEditableRows(icao).filter(row => row.dataset.confirmed === 'false');
    if (!rows.length) return;
    const serialized = serializePublishRows(rows);
    const mainRow = rows.find(row => row.classList.contains('tr-edit')) || rows[0];
    const adoptedSources = mainRow.dataset.adoptedSources || '';
    const hasContent = serialized.rows.some(row => row.some(cell => cell.text)) || serialized.notes.some(Boolean);
    if (!hasContent && !adoptedSources) {
        delete pbState.draftData[icao];
        return;
    }
    pbState.draftData[icao] = { ...serialized, adoptedSources };
}

function persistAllPublishDraftsFromDom() {
    document.querySelectorAll('#forecast-table tr.tr-edit[data-confirmed="false"][data-icao]').forEach(row => {
        if (row.dataset.icao !== 'TEMP_ADD') persistDraftAirportFromDom(row.dataset.icao);
    });
}

// ==========================================
// 🌟 核心引擎：数据加载与三行独立渲染
// ==========================================
async function loadForecastData(retainOrder = false) {
    const token = (localStorage.getItem('sf_weather_token') || localStorage.getItem('mtws_token'));
    const loader = document.getElementById('publish-loading-indicator');
    PBLOG(`loadForecastData 开始 | retainOrder=${retainOrder} | startDate=${pbState.startDate} startHour=${pbState.startHour} validity=${pbState.validityHours}h`);
    
    const setProgress = (msg, isError = false) => {
        if (!loader) return;
        loader.style.display = 'block'; loader.style.color = isError ? '#dc2626' : '#005A9C';
        loader.innerHTML = isError ? `❌ ${msg}` : `<span class="spinner"></span> ${msg}`;
    };

    if (!token) { PBLOG('loadForecastData 中止：无 token', 'WARN'); return; }

    pbState.specialConditionAirports = new Map();
    updateSpecialConditionFooter();

    try {
        setProgress('初始化: 正在计算航班有效时段...');
        const startMs = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();
        const baseEndMs = startMs + pbState.validityHours * 3600000;
        const flightEndMs = baseEndMs + (3 * 3600000); 
        
        let flightAps = [];
        if (pbState.runningImportMode) {
            setProgress('查询: 正在获取当前运行航班机场列表...');
            flightAps = await fetchActiveFlightAirports(startMs, flightEndMs, setProgress);
            flightAps = flightAps.filter(isAirportRegionEnabled);
            registerSourceAirports('running', flightAps, { replace: true });
            pbState.runningAllAirports = new Set(flightAps);
        } else {
            pbState.sourceAirports.running.clear();
            pbState.runningAllAirports.clear();
        }
        
        setProgress(`匹配: 识别到 ${flightAps.length} 个运行机场，正在合并所选机场来源...`);
        const combinedAps = []; const seen = new Set();
        
        pbState.airportGroups.forEach((g, index) => {
            if (pbState.selectedResidentGroups.has(String(index))) {
                g.airports.forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });
            }
        });
        flightAps.forEach(ap => {
            if(!seen.has(ap)) { seen.add(ap); combinedAps.push(ap); }
            if (pbState.runningImportMode === 'all') {
                pbState.forceShowAirports.add(ap);
            }
        });
        Object.keys(pbState.customCoords).forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });
        pbState.forceShowAirports.forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });
        getActiveTextImportAirports().forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });
        Object.keys(pbState.confirmedData).forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });

        const validAps = combinedAps.filter(icao => window.AIRPORT_COORDS[icao] || pbState.customCoords[icao]);

        if (validAps.length === 0) {
            setProgress('⚠️ 没有找到带有坐标的有效机场！', true);
            return;
        }

        setProgress(`加载: 正在并发请求 ${validAps.length} 个机场的数值与 TAF 数据...`);
        const lats = []; const lons = [];
        validAps.forEach(icao => {
            const coords = window.AIRPORT_COORDS[icao] || pbState.customCoords[icao];
            lats.push(coords[0]); lons.push(coords[1]);
        });

        const D = Math.ceil((pbState.validityHours + 3) / 24) + 1; 
        const endDate = new Date(startMs + D * 86400000).toISOString().split('T')[0];
        // 🌟 修复 EC 请求 400：open-meteo 不允许 start_date/end_date 与 past_days 同时使用。
        // 查询起始日按结冰降水回看配置前移，确保跨日和最长回看窗口都有完整数据。
        const historyDays = Math.max(1, Math.ceil(pbState.cfgIcePrecipHours / 24));
        const queryStartDate = new Date(startMs - historyDays * 86400000).toISOString().split('T')[0];

        const chunkSize = 50; const nwpPromises = [];
        for (let i = 0; i < validAps.length; i += chunkSize) {
            const chunkLats = lats.slice(i, i + chunkSize); const chunkLons = lons.slice(i, i + chunkSize);
            // 获取温度、露点和历史降水，供地面结冰判定。
            const nwpUrl = `https://api.open-meteo.com/v1/forecast?latitude=${chunkLats.join(',')}&longitude=${chunkLons.join(',')}&hourly=temperature_2m,dew_point_2m,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl&models=ecmwf_ifs&timezone=GMT&wind_speed_unit=ms&start_date=${queryStartDate}&end_date=${endDate}`;
            const chunkIdx = Math.floor(i / chunkSize);
            // 🌟 不再静默吞错：记录数值预报抓取的 HTTP 状态与失败原因
            const p = fetch(nwpUrl)
                .then(res => {
                    if (!res.ok) {
                        PBLOG(`数值预报(NWP)请求失败 chunk#${chunkIdx} HTTP ${res.status} ${res.statusText}`, 'ERROR');
                        return [];
                    }
                    return res.json();
                })
                .then(data => {
                    if (data && data.error) {
                        PBLOG(`数值预报(NWP) chunk#${chunkIdx} 返回错误: ${data.reason || JSON.stringify(data)}`, 'ERROR');
                    } else {
                        const cnt = Array.isArray(data) ? data.length : 1;
                        PBLOG(`数值预报(NWP) chunk#${chunkIdx} 成功，返回 ${cnt} 个点`);
                    }
                    return data;
                })
                .catch(err => {
                    PBLOG(`数值预报(NWP)请求异常 chunk#${chunkIdx}: ${err} (可能是断网/防火墙拦截/超时)`, 'ERROR');
                    return [];
                });
            nwpPromises.push(p);
        }

        const [tafDataMap, ...nwpChunks] = await Promise.all([
            fetchTafDataForAirports(validAps, startMs, flightEndMs, setProgress),
            ...nwpPromises
        ]);

        setProgress('5/6 正在解析数据与判断恶劣天气...');
        let nwpArr = [];
        nwpChunks.forEach(chunk => { if (Array.isArray(chunk)) nwpArr = nwpArr.concat(chunk); else nwpArr.push(chunk); });

        let forecastMap = {};
        validAps.forEach((icao, idx) => { if (nwpArr[idx] && !nwpArr[idx].error) forecastMap[icao] = processAirportData(nwpArr[idx]); });

        pbState.specialConditionAirports = new Map();
        const apAnalysis = validAps.map(icao => {
            const isConfirmed = !!pbState.confirmedData[icao];
            const nwp = forecastMap[icao];
            const tafObj = tafDataMap && tafDataMap[icao] ? tafDataMap[icao] : { raw: [], hourly: null };
            const tafRaw = tafObj.raw.length > 0 ? tafObj.raw[0] : '';
            const tafHourly = tafObj.hourly;
            
            let hasAlertEC = false;
            let hasAlertTAF = false;
            
            if (nwp) {
                for(let i = 0; i <= pbState.validityHours; i++) {
                    const wx = getWeatherPhenomenonResult(nwp, i).text;
                    const ws = calcWindSpeed(nwp.wind_speed_10m[i], nwp.wind_gusts_10m[i]);
                    const v = nwp.visibility[i];
                    let ext = getAlertElements(wx, v, ws, nwp.wind_direction_10m?.[i]);
                    if (ext.w !== '') { hasAlertEC = true; } 
                    
                    const temperature = Number(nwp.temperature_2m?.[i]);
                    if (Number.isFinite(temperature) && temperature >= pbState.filterTempHigh) {
                        hasAlertEC = true;
                    }
                }
                if (pbState.runningAllAirports.has(icao)) {
                    const specialConditions = getAirportSpecialConditions(nwp);
                    if (specialConditions.size) pbState.specialConditionAirports.set(icao, specialConditions);
                }
            }
            if (tafHourly) {
                for (let i = 0; i <= pbState.validityHours; i++) {
                    const targetUTC = new Date(startMs + i * 3600000);
                    const hourKey = `${String(targetUTC.getUTCDate()).padStart(2, '0')}${String(targetUTC.getUTCHours()).padStart(2, '0')}`;
                    const hData = tafHourly[hourKey];
                    if (hData) {
                        const rule = hData.rule || 'NORMAL';
                        let dataToRead = hData.base || {};
                        if (rule === 'TEMPO' || rule === 'BECMG_TRANSITION') dataToRead = { ...dataToRead, ...(hData.change || {}) };
                        const wx = translateMETARtoCN(dataToRead.weather || '');
                        const spd = dataToRead.wind_speed || 0;
                        const vis = dataToRead.visibility !== undefined ? dataToRead.visibility : 9999;
                        
                        let ext = getAlertElements(wx, vis, spd, dataToRead.wind_direction || dataToRead.wind_dir);
                        if (ext.w !== '') { hasAlertTAF = true; break; }
                    }
                }
            }
            // 🌟 需求：EC/TAF 未勾选时不作为筛选依据。hasAlert 只由被勾选的数据源决定。
            // （常驻机场、手动追加、已确认机场不受此限制，在过滤/排序环节另行豁免）
            const hasAlert = isConfirmed || (pbState.defaultShowEc && hasAlertEC) || (pbState.defaultShowTaf && hasAlertTAF);
            return { icao, hasAlert, hasAlertEC, hasAlertTAF, nwp, tafRaw, tafHourly };
        });

        setProgress('6/6 正在排版...');
        apAnalysis.forEach((ap, idx) => ap.originalIdx = idx);
        const sortedAnalysis = sortPublishAirportAnalysis(apAnalysis);

        _cachedAirports = sortedAnalysis.map(a => a.icao);
        window.currentApAnalysis = sortedAnalysis;
        renderPublishTableTriRow(window.currentApAnalysis);
        updateSpecialConditionFooter();
        PBLOG(`数据加载完成，共渲染 ${apAnalysis.length} 个机场`);

        if (loader) loader.style.display = 'none';
        PBLOG_FLUSH();

    } catch (e) {
        console.error(e);
        PBLOG('loadForecastData 致命异常: ' + (e && e.stack ? e.stack : e.message), 'ERROR');
        PBLOG_FLUSH();
        setProgress(`致命异常: ${e.message}`, true);
    }
}

// 🌟 终极 DOM 渲染引擎 (多行完美合并版)
function renderPublishTableTriRow(apAnalysis, preserveDrafts = true) {
    const table = document.getElementById('forecast-table');
    if(!table) return;
    if (preserveDrafts) persistAllPublishDraftsFromDom();
    table.innerHTML = '';
    
    const numCells = pbState.validityHours + 1;                      
    const sH = pbState.startHour;
    const isWide = numCells > 25;
    const cellStyle = isWide ? 'width:40px; min-width:40px;' : 'width:auto; min-width:25px;';
    const wideWidth = 240 + numCells * 40;
    table.style.width = isWide ? `${wideWidth}px` : '100%';
    table.style.minWidth = isWide ? `${wideWidth}px` : '0';

    // 🌟 时间轴表头现在渲染到 #pb-timeline-header（并入发布头部），不再作为表格 thead。
    renderTimelineHeader(numCells, sH, cellStyle, isWide);

    const tbody = document.createElement('tbody');
    const startMs = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();
    
    const analysisForDisplay = sortPublishAirportAnalysis(apAnalysis);
    const filteredAnalysis = analysisForDisplay.filter(apInfo => {
        let apType = pbState.importedAirportTypes[apInfo.icao] || '普通';
        let isAlwaysShow = false; // 🌟 新增：标记该机场是否具备常驻属性
        
        for (let groupIndex = 0; groupIndex < pbState.airportGroups.length; groupIndex++) {
            const g = pbState.airportGroups[groupIndex];
            if (pbState.selectedResidentGroups.has(String(groupIndex)) && g.airports.includes(apInfo.icao)) {
                if (!pbState.importedAirportTypes[apInfo.icao]) apType = g.name;
                if (g.alwaysShow) isAlwaysShow = true; // 置顶组机场不受空机场隐藏影响
                break; 
            } 
        }
        if (pbState.confirmedData[apInfo.icao]) { apInfo._apType = apType; return true; }
        if (pbState.draftData[apInfo.icao]) { apInfo._apType = apType; return true; }
        
        // 🌟 修复 Bug：即便开启了隐藏空机场，只要它是常驻机场(isAlwaysShow)或手动追加机场，都绝不隐藏！
        // 文图互导模式下，机场列表由文本输入显式指定，因此不再受“空机场隐藏”影响。
        if (pbState.filterHideEmptyAirports && !pbState.bulkActionInProgress && !apInfo.hasAlert && !pbState.forceShowAirports.has(apInfo.icao) && !isAlwaysShow) {
            return false;
        }
        
        apInfo._apType = apType; return true;
    });
    
    _cachedAirports = filteredAnalysis.map(a => a.icao);
    
    filteredAnalysis.forEach((apInfo, groupIdx) => {
        const { icao, hasAlert, nwp, tafHourly, tafRaw } = apInfo;
        const apType = apInfo._apType;
        const gClass = (groupIdx % 2 === 0) ? 'g0' : 'g1';
        const apName = window.GLOBAL_AIRPORT_NAME_MAP[icao] || icao; 
        
        const cData = pbState.confirmedData[icao];
        const isConfirmed = !!cData;
        const draftData = isConfirmed ? null : pbState.draftData[icao];
        const rowData = cData || draftData || {};
        const isGray = !isConfirmed && !hasAlert && !pbState.forceShowAirports.has(icao);
        const rowStyle = isGray ? 'background-color: #f3f4f6; color: #94a3b8;' : '';

        // 🌟 修复崩溃：安全提取已确认数据
        const rowsToRender = isConfirmed ? (cData.rows || [cData.cells]) : (draftData?.rows || [null]);
        const notesToRender = isConfirmed ? (cData.notes || [cData.note || '']) : (draftData?.notes || ['']);

        const trEdit = document.createElement('tr');
        trEdit.className = `${gClass} tr-edit`;
        trEdit.style.cssText = rowStyle;
        trEdit.dataset.confirmed = isConfirmed ? "true" : "false";
        trEdit.dataset.icao = icao;
        if (draftData?.rowSources?.[0]) trEdit.dataset.rowSource = draftData.rowSources[0];
        if (draftData?.adoptedSources) trEdit.dataset.adoptedSources = draftData.adoptedSources;
        
        let srcOpHTML = '';
        if (isConfirmed) {
            srcOpHTML = `<td colspan="2" class="col-desc confirmed-note-cell" title="右键可撤销编发"><input type="text" class="edit-note-input" value=""><button type="button" class="btn-add-extra" data-icao="${icao}" title="增加一行空白要素">+</button></td>`;
        } else {
            srcOpHTML = `
                <td colspan="2" class="col-desc draft-note-cell">
                    <input type="text" class="edit-note-input" value="">
                    <button class="btn-confirm-edit">确认编发</button>
                </td>
            `;
        }

        trEdit.innerHTML = `
            <td class="col-airport td-airport" rowspan="1" draggable="true" data-icao="${icao}" title="${tafRaw || '无TAF报文'}" style="font-weight:bold; vertical-align:middle; cursor:move; position:sticky; ${isGray?'color:#94a3b8;':''}">${apName}<button class="airport-delete-x" data-icao="${icao}" title="删除该机场">×</button></td>
            <td rowspan="1" class="col-airport-type" style="vertical-align:middle; border-right:2px solid #cbd5e1;">${apType}</td>
            ${srcOpHTML}
        `;
        for (let i = 0; i < numCells; i++) {
            let val = '', bg = 'transparent', fg = isGray ? '#94a3b8' : '#1e293b', ts = 'none';
            if (rowsToRender[0] && rowsToRender[0][i]) {
                const c = rowsToRender[0][i];
                val = c.text || '';
                if (rowData.origin !== 'text') val = formatPublishWindTableText(val);
                const normalizedStyle = getMultiCellStyle(val);
                bg = normalizedStyle.bg; fg = normalizedStyle.fg; ts = normalizedStyle.ts || 'none';
            }
            const cls = isConfirmed ? 'data-cell-editable' : '';
            trEdit.innerHTML += `<td class="col-time td-data edit-cell ${cls}" data-c="${i}" style="${cellStyle} font-weight:bold; background:${bg}; color:${fg}; text-shadow:${ts};">${val}</td>`;
        }
        const mainNoteInput = trEdit.querySelector('.edit-note-input');
        if (mainNoteInput) mainNoteInput.value = notesToRender[0] || '';
        tbody.appendChild(trEdit);

        if (rowsToRender.length > 1) {
            for (let r = 1; r < rowsToRender.length; r++) {
                const subTr = document.createElement('tr');
                subTr.className = `${gClass} tr-edit-extra`;
                subTr.dataset.confirmed = isConfirmed ? "true" : "false";
                subTr.dataset.icao = icao;
                if (draftData?.rowSources?.[r]) subTr.dataset.rowSource = draftData.rowSources[r];
                
                let subHtml = isConfirmed
                    ? `<td colspan="2" class="col-desc draft-note-cell"><input type="text" class="edit-note-input" value=""><button type="button" class="btn-delete-extra" title="删除此行">删除</button></td>`
                    : `<td colspan="2" class="col-desc draft-note-cell"><input type="text" class="edit-note-input" value=""><button class="btn-delete-extra">删除</button></td>`;
                for (let i = 0; i < numCells; i++) {
                    // 🌟 防崩溃：已确认数据按旧的时长(cell 数)保存，切到更长时段(如 24h→48h)时尾部 cell 不存在，需兜底
                    const c = (rowsToRender[r] && rowsToRender[r][i]) ? rowsToRender[r][i] : { text: '', bg: 'transparent', fg: '#1e293b', ts: 'none' };
                    const normalizedText = rowData.origin === 'text' ? String(c.text || '') : formatPublishWindTableText(c.text);
                    const normalizedStyle = getMultiCellStyle(normalizedText);
                    subHtml += `<td class="col-time td-data edit-cell data-cell-editable" data-c="${i}" style="${cellStyle} font-weight:bold; background:${normalizedStyle.bg}; color:${normalizedStyle.fg}; text-shadow:${normalizedStyle.ts};">${normalizedText}</td>`;
                }
                subTr.innerHTML = subHtml;
                const subNoteInput = subTr.querySelector('.edit-note-input');
                if (subNoteInput) subNoteInput.value = notesToRender[r] || '';
                tbody.appendChild(subTr);
            }
            if (isConfirmed) return;
        } else if (isConfirmed) {
            return;
        }

        // --- 生成未确认状态下的 TAF 与 EC 行 ---
        let allTafNotes = new Set(), allEcNotes = new Set();
        let tafCellsHtml='', tafWxHtml='', tafWindHtml='', tafVisHtml='';
        let ecCellsHtml='', ecWxHtml='', ecWindHtml='', ecVisHtml='', ecTempHtml='', ecPressHtml='';

        for (let i = 0; i < numCells; i++) {
            const targetUTC = new Date(startMs + i * 3600000);
            const hourKey = `${String(targetUTC.getUTCDate()).padStart(2, '0')}${String(targetUTC.getUTCHours()).padStart(2, '0')}`;
            
            let tW = '', tWxRaw = '—', tWindRaw = '—', tVisRaw = '—';
            if (tafHourly && tafHourly[hourKey]) {
                const hData = tafHourly[hourKey];
                let dataToRead = hData.base || {};
                if ((hData.rule || 'NORMAL') === 'TEMPO' || (hData.rule || 'NORMAL') === 'BECMG_TRANSITION') dataToRead = { ...dataToRead, ...(hData.change || {}) };
                const wx = translateMETARtoCN(dataToRead.weather || '');
                const spd = dataToRead.wind_speed || 0;
                const vis = dataToRead.visibility !== undefined ? dataToRead.visibility : 9999;
                
                tWxRaw = wx || '—';
                tWindRaw = spd > 0 ? formatPublishWind(dataToRead.wind_direction || dataToRead.wind_dir, spd) : '—';
                tVisRaw = vis !== 9999 ? vis : '—';
                
                let ext = getAlertElements(wx, vis, spd, dataToRead.wind_direction || dataToRead.wind_dir);
                tW = ext.w; if(ext.noteStr) ext.noteStr.split(' ').forEach(n => allTafNotes.add(n));
            }
            let tStyle = getMultiCellStyle(tW);
            tafCellsHtml += `<td class="col-time td-data taf-cell" data-c="${i}" style="${cellStyle} background:${tStyle.bg}; color:${tStyle.fg}; text-shadow:${tStyle.ts}; font-size:11px; font-weight:bold;">${tW}</td>`;
            tafWxHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${tWxRaw}</td>`;
            tafWindHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${tWindRaw}</td>`;
            tafVisHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${tVisRaw}</td>`;

            let eW = '', eWxRaw = '—', eWindRaw = '—', eVisRaw = '—', eTempRaw = '—', ePressRaw = '—';
            if (nwp) {
                let wx = getWeatherPhenomenonResult(nwp, i).text;
                let ws = calcWindSpeed(nwp.wind_speed_10m[i], nwp.wind_gusts_10m[i]);
                let v = nwp.visibility[i];
                eWxRaw = wx || '—';
                eWindRaw = ws > 0 ? formatPublishWind(nwp.wind_direction_10m[i], ws) : '—';
                eVisRaw = v;
                eTempRaw = Math.round(nwp.temperature_2m[i]) + '℃';
                ePressRaw = nwp.pressure_msl ? Math.round(nwp.pressure_msl[i]) : '—';
                
                let ext = getAlertElements(wx, v, ws, nwp.wind_direction_10m[i]);
                eW = ext.w; if(ext.noteStr) ext.noteStr.split(' ').forEach(n => allEcNotes.add(n));
                if (eW.includes('雷雨')) allEcNotes.add('终端区/本场');
                if (Number(nwp.temperature_2m?.[i]) >= pbState.filterTempHigh) {
                    const temperatureText = `${Math.round(Number(nwp.temperature_2m[i]))}℃`;
                    eW = [eW, temperatureText].filter(Boolean).join(' ');
                    allEcNotes.add('高温');
                }
            }
            let eStyle = getMultiCellStyle(eW);
            ecCellsHtml += `<td class="col-time td-data nwp-cell" data-c="${i}" style="${cellStyle} background:${eStyle.bg}; color:${eStyle.fg}; text-shadow:${eStyle.ts}; font-size:11px; font-weight:bold;">${eW}</td>`;
            ecWxHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${eWxRaw}</td>`;
            ecWindHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${eWindRaw}</td>`;
            ecVisHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${eVisRaw}</td>`;
            ecTempHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${eTempRaw}</td>`;
            ecPressHtml += `<td class="col-time td-data" data-c="${i}" style="${cellStyle}">${ePressRaw}</td>`;
        }

        const trTaf = document.createElement('tr');
        trTaf.className = `${gClass} tr-taf`;
        trTaf.style.cssText = rowStyle;
        let tafNoteStr = Array.from(allTafNotes).join(' ');
        let tafNoteHtml = tafNoteStr ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:#d9534f; font-weight:bold; z-index:1;">(注:${tafNoteStr})</div>` : '';
        trTaf.innerHTML = `
            <td class="col-source" style="font-weight:bold; vertical-align:middle; font-size:11px; border-right:none; cursor:pointer; user-select:none;" title="双击展开/合并数据列">TAF</td>
            <td class="col-op" style="padding:4px; position:relative; vertical-align:middle; border-left:none;" data-note="${tafNoteStr}">
                ${tafNoteHtml}
                <button class="hover-btn btn-adopt-taf" style="position:relative; z-index:2; background:#dc2626; color:white; width:100%; border:none; padding:4px 0; border-radius:4px; font-size:11px; font-weight:bold;">采纳 TAF</button>
            </td>
            ${tafCellsHtml}
        `;
        tbody.appendChild(trTaf);

        const appendDetail = (cls, title, cells) => {
            const r = document.createElement('tr');
            r.className = `${gClass} ${cls}`;
            r.style.cssText = `display:none; background:#f1f5f9; font-size:10px; color:#475569;`;
            r.innerHTML = `<td class="col-source" style="border-right:none; padding-left:15px;">${title}</td><td class="col-op" style="border-left:none;"></td>${cells}`;
            tbody.appendChild(r);
        };
        if (pbState.showWeatherCode) appendDetail('tr-taf-detail', '↳ 天气', tafWxHtml);
        if (pbState.showWind) appendDetail('tr-taf-detail', '↳ 风向风速', tafWindHtml);
        if (pbState.showVis) appendDetail('tr-taf-detail', '↳ 能见度', tafVisHtml);

        const trNwp = document.createElement('tr');
        trNwp.className = `${gClass} tr-nwp`;
        trNwp.style.cssText = rowStyle;
        let ecNoteStr = Array.from(allEcNotes).join(' ');
        let ecNoteHtml = ecNoteStr ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:#d9534f; font-weight:bold; z-index:1;">(注:${ecNoteStr})</div>` : '';
        trNwp.innerHTML = `
            <td class="col-source" style="font-weight:bold; vertical-align:middle; font-size:11px; border-right:none; cursor:pointer; user-select:none;" title="双击展开/合并数据列">EC</td>
            <td class="col-op" style="padding:4px; position:relative; vertical-align:middle; border-left:none;" data-note="${ecNoteStr}">
                ${ecNoteHtml}
                <button class="hover-btn btn-adopt-nwp" style="position:relative; z-index:2; background:#dc2626; color:white; width:100%; border:none; padding:4px 0; border-radius:4px; font-size:11px; font-weight:bold;">采纳数值</button>
            </td>
            ${ecCellsHtml}
        `;
        tbody.appendChild(trNwp);
        pbState.sourceForecastCache[icao] = {
            taf: sourceRowsFromTableRow(trTaf),
            ec: sourceRowsFromTableRow(trNwp)
        };

        if (pbState.showWeatherCode) appendDetail('tr-nwp-detail', '↳ 天气', ecWxHtml);
        if (pbState.showWind) appendDetail('tr-nwp-detail', '↳ 风向风速', ecWindHtml);
        if (pbState.showVis) appendDetail('tr-nwp-detail', '↳ 能见度', ecVisHtml);
        if (pbState.showTemp) appendDetail('tr-nwp-detail', '↳ 气温', ecTempHtml);
        if (pbState.showPressure) appendDetail('tr-nwp-detail', '↳ 气压', ecPressHtml);
        const toggleExpand = (mainTr, detailClass) => {
            mainTr.classList.toggle('row-expanded');
            let isExp = mainTr.classList.contains('row-expanded');
            let next = mainTr.nextElementSibling;
            while(next && next.classList.contains(detailClass)) {
                next.style.display = isExp ? 'table-row' : 'none';
                next = next.nextElementSibling;
            }
            if (window.updateAllRowspans) window.updateAllRowspans();
        };

        const editSourceCell = trEdit.querySelector('.col-source');
        if (editSourceCell) editSourceCell.ondblclick = () => { toggleExpand(trTaf, 'tr-taf-detail'); toggleExpand(trNwp, 'tr-nwp-detail'); };
        trTaf.querySelector('.col-source').ondblclick = () => toggleExpand(trTaf, 'tr-taf-detail');
        trNwp.querySelector('.col-source').ondblclick = () => toggleExpand(trNwp, 'tr-nwp-detail');

        const btnConfirm = trEdit.querySelector('.btn-confirm-edit');
        const btnTaf = trTaf.querySelector('.btn-adopt-taf');
        const btnNwp = trNwp.querySelector('.btn-adopt-nwp');
        const editNoteInput = trEdit.querySelector('.edit-note-input');

        const executeAdoptSplit = (sourceTr, sourceKey) => {
            const adoptedSources = new Set((trEdit.dataset.adoptedSources || '').split(',').filter(Boolean));
            if (adoptedSources.has(sourceKey)) return;
            const sourceData = sourceRowsFromTableRow(sourceTr);
            const existingRows = Array.from(document.querySelectorAll(`tr[data-icao="${icao}"]`))
                .filter(row => row.classList.contains('tr-edit') || row.classList.contains('tr-edit-extra'));
            const hasExistingWeather = existingRows.some(row =>
                Array.from(row.querySelectorAll('.edit-cell')).some(cell => cell.textContent.trim()) ||
                !!row.querySelector('.edit-note-input')?.value.trim()
            );

            const fillCells = (rowElement, cells) => {
                rowElement.querySelectorAll('.edit-cell').forEach((cell, index) => {
                    const data = cells[index] || { text: '', bg: 'transparent', fg: '#1e293b', ts: 'none' };
                    cell.textContent = data.text;
                    cell.style.background = data.bg;
                    cell.style.color = data.fg;
                    cell.style.textShadow = data.ts || 'none';
                });
            };
            const createExtraRow = (cells, note) => {
                const extra = document.createElement('tr');
                extra.className = `${gClass} tr-edit-extra`;
                extra.dataset.confirmed = 'false';
                extra.dataset.icao = icao;
                extra.dataset.rowSource = sourceKey;
                let html = `
                    <td colspan="2" class="col-desc draft-note-cell">
                        <input type="text" class="edit-note-input" value="">
                        <button class="btn-delete-extra">删除</button>
                    </td>`;
                cells.forEach((cell, index) => {
                    html += `<td class="col-time td-data edit-cell data-cell-editable" data-c="${index}" style="${cellStyle} font-weight:bold; background:${cell.bg}; color:${cell.fg}; text-shadow:${cell.ts || 'none'};">${cell.text}</td>`;
                });
                extra.innerHTML = html;
                extra.querySelector('.edit-note-input').value = note || '';
                return extra;
            };

            let firstIncomingIndex = 0;
            let insertAfter = existingRows[existingRows.length - 1] || trEdit;
            if (!hasExistingWeather) {
                fillCells(trEdit, sourceData.rows[0]);
                editNoteInput.value = sourceData.note || '适航';
                trEdit.dataset.rowSource = sourceKey;
                firstIncomingIndex = 1;
                insertAfter = trEdit;
            }
            for (let rowIndex = firstIncomingIndex; rowIndex < sourceData.rows.length; rowIndex++) {
                const note = rowIndex === 0 ? sourceData.note : '/';
                const extra = createExtraRow(sourceData.rows[rowIndex], note);
                insertAfter.insertAdjacentElement('afterend', extra);
                insertAfter = extra;
            }
            adoptedSources.add(sourceKey);
            trEdit.dataset.adoptedSources = Array.from(adoptedSources).join(',');
            persistDraftAirportFromDom(icao);
            updateRowActiveStyle(trEdit);
            updateTopCountersFromTable();
            if(window.updateAllRowspans) window.updateAllRowspans();
        };

        btnTaf.onclick = () => executeAdoptSplit(trTaf, 'taf');
        btnNwp.onclick = () => executeAdoptSplit(trNwp, 'ec');

        btnConfirm.onclick = () => {
            confirmAirportFromDom(icao);
            window.saveConfirmedDataToLocal();
            renderPublishTableTriRow(window.currentApAnalysis);
        };
    });
    
    table.appendChild(tbody);
    if(window.updateAllRowspans) window.updateAllRowspans();
    updateTopCountersFromTable(); 
    updateSpecialConditionFooter();
    // 🌟 表体渲染完成后，同步时间轴表头的总宽与横向滚动位置
    syncTimelineHeader();
}

// 🌟 渲染时间轴表头（名称/性质/备注 + 逐小时列）到 #pb-timeline-header。
// 与正文 #forecast-table 采用一致的定宽列（名称90/性质50/备注100/小时列沿用 cellStyle），保证上下对齐。
function renderTimelineHeader(numCells, sH, cellStyle, isWide) {
    const colgroup = document.getElementById('pb-timeline-colgroup');
    const tbody = document.getElementById('pb-timeline-body');
    if (!colgroup || !tbody) return;

    const hourW = isWide ? 40 : 25;
    // 🌟 与正文严格对齐的 4 前导列：名称90 / 性质50 / 编辑列50 / 备注列50（编辑列与备注列等宽，合计=正文 col-desc 的 100px）
    let cols = `<col style="width:90px;"><col style="width:50px;"><col style="width:50px;"><col style="width:50px;">`;
    for (let i = 0; i < numCells; i++) cols += `<col style="width:${hourW}px;">`;
    colgroup.innerHTML = cols;

    const thBase = 'border:1px solid #95A5A6; background-color:#4B5563; color:#fff; box-sizing:border-box; padding:8px 4px; font-weight:bold;';
    // 第一行：影响机场(colspan2) | 备注(colspan2, rowspan2) | 0h 1h 2h...
    let tr1 = `<tr><th colspan="2" style="${thBase} font-size:13px;">影响机场</th><th colspan="2" rowspan="2" style="${thBase} font-size:11px; color:#fff;">备注</th>`;
    for (let i = 0; i < numCells; i++) tr1 += `<th style="${thBase} font-size:11px;">${i}h</th>`;
    tr1 += `</tr>`;
    // 第二行：名称 | 性质 | 小时刻度(北京时)。备注由上一行 rowspan 占位，这里不再出列。
    let tr2 = `<tr><th style="${thBase} font-size:13px;">名称</th><th style="${thBase} font-size:13px;">性质</th>`;
    for (let i = 0; i < numCells; i++) {
        const bjtHour = (sH + i + 8) % 24;
        tr2 += `<th style="${thBase} font-size:11px; color:#E2E8F0;">${String(bjtHour).padStart(2, '0')}时</th>`;
    }
    tr2 += `</tr>`;
    tbody.innerHTML = tr1 + tr2;
}

// 🌟 让时间轴表头与正文表格逐列像素级对齐：一次性采集正文所有列的实渲染宽，再统一写回表头。
// 两个独立 table 无法共享列宽；forecast-table 是 table-layout:fixed + width:100% 被容器约束，
// 小时列被压缩成亚像素宽。必须把每列实测宽写回表头 col，并让表头总宽严格等于这些列宽之和。
function syncTimelineHeader() {
    const table = document.getElementById('forecast-table');
    const tlTable = document.getElementById('pb-timeline-table');
    const tw = document.getElementById('table-wrapper');
    const colgroup = document.getElementById('pb-timeline-colgroup');
    if (!table || !tlTable || !colgroup) return;

    const firstRow = table.querySelector('tbody tr');
    const cols = colgroup.querySelectorAll('col');
    if (firstRow && cols.length) {
        // 前导 4 列实测：名称(col-airport) / 性质(col-airport-type) / 编辑(col-source) / op(col-op)。
        // 备注区在未确认态是 col-source+col-op 两列；已确认态是 col-desc(colspan=2) 一列。
        const lead = firstRow.querySelector('.col-desc')
            ? [ '.col-airport', '.col-airport-type', '.col-desc' ]   // 已确认：备注为合并单列
            : [ '.col-airport', '.col-airport-type', '.col-source', '.col-op' ];
        // 先一次性采集所有实测宽（避免边写边测导致 fixed 布局重算）
        const leadWidths = lead.map(sel => {
            const el = firstRow.querySelector(sel);
            return el ? el.getBoundingClientRect().width : 0;
        });
        const timeCells = firstRow.querySelectorAll('td.col-time');
        const hourWidths = [...timeCells].map(c => c.getBoundingClientRect().width);

        // 表头 colgroup 固定为 4 前导列：名称/性质/编辑/备注。
        // 未确认态：leadWidths 正好 4 个，逐一对应；已确认态：备注合并宽拆成表头编辑+备注两列。
        let headLead;
        if (leadWidths.length === 4) {
            headLead = leadWidths;
        } else {
            const noteW = leadWidths[2] || 0;
            headLead = [ leadWidths[0], leadWidths[1], Math.floor(noteW / 2), Math.ceil(noteW / 2) ];
        }
        let total = 0;
        headLead.forEach((w, i) => { if (cols[i]) cols[i].style.width = w + 'px'; total += w; });
        hourWidths.forEach((w, i) => { const col = cols[4 + i]; if (col) { col.style.width = w + 'px'; total += w; } });

        if (total) {
            tlTable.style.width = total + 'px';
            // 🌟 修复右侧“外框”：表头容器(#pb-timeline-header)靠负 margin 撑满 export-header 全宽，
            // 但内部表只有 total 宽。当 total 小于可视全宽时(如24h)，右侧会露出容器
            // 深色背景形成外框——收紧到 total 即可。当内容超宽时(如48h)，容器须
            // 保持可视全宽以便 overflow:hidden 裁剪 + scrollLeft 同步滚动，不能撑到 total。
            const header = document.getElementById('pb-timeline-header');
            if (header) {
                // 先复位 wrapper 宽度再量可视全宽，避免上一次收紧后读到陈旧值
                if (tw) tw.style.width = '';
                const fullW = tw ? tw.getBoundingClientRect().width : total;
                header.style.width = Math.min(total, fullW) + 'px';
                // 🌟 正文 wrapper 也同步：内容窄时收紧到 total，使表头/正文/容器右边界统一；
                // 内容超宽时保持 100% 以便 overflow-x 滚动。
                if (tw && total <= fullW + 1) tw.style.width = total + 'px';
            }
        }
    }
    // 横向滚动同步：初始对齐当前 scrollLeft
    const header = document.getElementById('pb-timeline-header');
    if (header && tw) header.scrollLeft = tw.scrollLeft;
}

document.getElementById('forecast-table')?.addEventListener('contextmenu', (e) => {
    const noteCell = e.target.closest('td.col-desc');
    if (!noteCell) return;
    let tr = noteCell.closest('tr');
    if (!tr) return;
    
    let icao = tr.dataset.icao;
    if (!icao) {
        let tempTr = tr;
        while (tempTr && !tempTr.dataset.icao) tempTr = tempTr.previousElementSibling;
        if (tempTr) icao = tempTr.dataset.icao;
    }
    
    if (icao && pbState.confirmedData[icao]) {
        e.preventDefault();
        let unconfirmMenu = document.getElementById('unconfirm-menu');
        unconfirmMenu.style.left = e.clientX + 'px';
        unconfirmMenu.style.top = e.clientY + 'px';
        unconfirmMenu.style.display = 'block';
        unconfirmMenu.onmouseleave = () => { unconfirmMenu.style.display = 'none'; };
        
        unconfirmMenu.onclick = () => {
            delete pbState.confirmedData[icao];
            window.saveConfirmedDataToLocal();
            const tw = document.getElementById('table-wrapper');
            const sx = tw ? tw.scrollLeft : 0, sy = tw ? tw.scrollTop : 0;
            renderPublishTableTriRow(window.currentApAnalysis); 
            if (tw) { tw.scrollLeft = sx; tw.scrollTop = sy; }
            unconfirmMenu.style.display = 'none';
        };
    }
});

document.addEventListener('mousemove', (e) => {
    const menu = document.getElementById('unconfirm-menu');
    if (!menu || menu.style.display !== 'block') return;
    if (!e.target.closest('#unconfirm-menu') && !e.target.closest('td.col-desc')) menu.style.display = 'none';
});

function removeAirportFromPublish(icao) {
    if (!icao) return;
    persistAllPublishDraftsFromDom();
    _cachedAirports = _cachedAirports.filter(a => a !== icao);
    if (Array.isArray(window.currentApAnalysis)) {
        window.currentApAnalysis = window.currentApAnalysis.filter(a => a.icao !== icao);
    }
    pbState.forceShowAirports.delete(icao);
    delete pbState.draftData[icao];
    delete pbState.customCoords[icao];
    if (pbState.confirmedData[icao]) {
        delete pbState.confirmedData[icao];
        window.saveConfirmedDataToLocal();
    }
    renderPublishTableTriRow(window.currentApAnalysis || [], false);
}

function getAirportEditableRows(icao) {
    return Array.from(document.querySelectorAll(`#forecast-table tr[data-icao="${icao}"]`))
        .filter(row => row.classList.contains('tr-edit') || row.classList.contains('tr-edit-extra'));
}

function persistConfirmedAirportFromDom(icao) {
    const data = pbState.confirmedData[icao];
    if (!data) return;
    const rows = getAirportEditableRows(icao).filter(row => row.dataset.confirmed === 'true');
    if (!rows.length) return;
    const serialized = serializePublishRows(rows);
    data.rows = serialized.rows;
    data.notes = serialized.notes;
    if (data.rowSources) data.rowSources = data.rows.map((_, index) => data.rowSources[index] || null);
    window.saveConfirmedDataToLocal?.();
}

function syncHighTemperatureNoteForRow(row) {
    if (!row) return;
    const hasHighTemperature = Array.from(row.querySelectorAll('.edit-cell')).some(cell =>
        cell.textContent.split(/\s+/).some(isHighTemperatureValue)
    );
    const noteControl = row.querySelector('.edit-note-input, .edit-note-display');
    if (!noteControl) return;
    const current = noteControl.matches('input') ? noteControl.value : noteControl.textContent;
    let tokens = String(current || '').trim().split(/\s+/).filter(token => token && token !== '高温');
    if (hasHighTemperature) {
        tokens = tokens.filter(token => token !== '/' && token !== '适航');
        tokens.push('高温');
    }
    const next = tokens.join(' ');
    if (noteControl.matches('input')) noteControl.value = next;
    else noteControl.textContent = next;
    if (row.dataset.confirmed === 'true') persistConfirmedAirportFromDom(row.dataset.icao);
}

function updateRowActiveStyle(tr) {
    if (!tr) return;
    const icao = tr.dataset.icao;
    const airportRows = icao
        ? Array.from(document.querySelectorAll(`#forecast-table tr[data-icao="${icao}"]`)).filter(row => row.classList.contains('tr-edit') || row.classList.contains('tr-edit-extra'))
        : [tr];
    const hasContent = airportRows.some(row => Array.from(row.querySelectorAll('.edit-cell')).some(td => {
        const txt = td.textContent.trim();
        return txt !== '' && txt !== '—' && txt !== '适航';
    }));
    if (hasContent) {
        airportRows.forEach(row => { row.style.backgroundColor = ''; });
        const mainRow = airportRows.find(row => row.classList.contains('tr-edit')) || tr;
        const apTd = mainRow.querySelector('.td-airport');
        const typeTd = mainRow.querySelector('td:nth-child(2)');
        if (apTd) apTd.style.color = '#1e293b'; 
        if (typeTd) typeTd.style.color = '#1e293b';
    }
    updateTopCountersFromTable();
}

function setupDragAndDrop() {
    const table = document.getElementById('forecast-table');
    const indicator = document.getElementById('drag-indicator');
    if(!table || !indicator) return;
    
    let draggedIcao = null;

    table.addEventListener('dragstart', e => {
        const td = e.target.closest('.td-airport');
        if (!td) { e.preventDefault(); return; }
        draggedIcao = td.dataset.icao;
        e.dataTransfer.effectAllowed = 'move';
    });

    table.addEventListener('dragover', e => {
        e.preventDefault();
        if (!draggedIcao) return;
        const tr = e.target.closest('.tr-edit');
        if (tr) {
            const rect = tr.getBoundingClientRect();
            indicator.style.display = 'block';
            indicator.style.top = rect.top + 'px'; 
        }
    });

    table.addEventListener('dragleave', e => { indicator.style.display = 'none'; });

    table.addEventListener('drop', e => {
        e.preventDefault();
        indicator.style.display = 'none';
        if (!draggedIcao) return;
        const tr = e.target.closest('.tr-edit');
        if (tr) {
            const targetIcao = tr.dataset.icao;
            if (targetIcao !== draggedIcao) {
                const fromIdx = window.currentApAnalysis.findIndex(a => a.icao === draggedIcao);
                const toIdx = window.currentApAnalysis.findIndex(a => a.icao === targetIcao);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = window.currentApAnalysis.splice(fromIdx, 1);
                    window.currentApAnalysis.splice(toIdx, 0, moved);
                    pbState.forceShowAirports.add(draggedIcao); 
                    renderPublishTableTriRow(window.currentApAnalysis);
                }
            }
        }
        draggedIcao = null;
    });
    document.addEventListener('dragend', () => indicator.style.display = 'none');
}

function setupTableInteraction() {
  const table = document.getElementById('forecast-table');
  if(!table) return;
  const sel = { active: false, r1: -1, c1: -1, r2: -1, c2: -1 };
  
  function getAllInteractiveRows() {
      return Array.from(table.querySelectorAll('.tr-edit, .tr-edit-extra, .tr-taf, .tr-taf-detail, .tr-nwp, .tr-nwp-detail')).filter(tr => tr.style.display !== 'none');
  }
  
  function highlightSelection() {
    const rMin = Math.min(sel.r1, sel.r2), rMax = Math.max(sel.r1, sel.r2);
    const cMin = Math.min(sel.c1, sel.c2), cMax = Math.max(sel.c1, sel.c2);
    
    getAllInteractiveRows().forEach((tr, rIdx) => {
        tr.querySelectorAll('td.td-data').forEach(td => {
            const c = +td.dataset.c;
            if (isNaN(c)) return;
            td.classList.toggle('selected', rIdx >= rMin && rIdx <= rMax && c >= cMin && c <= cMax);
        });
    });
  }

  table.addEventListener('mousedown', e => {
    if (e.target.closest('td.td-airport') || e.target.tagName === 'INPUT') return; 
    
    // 🌟 修复复制粘贴 Bug 1：强制失焦拦截，确保剪贴板事件挂载到 table
    if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
    }
    
    const td = e.target.closest('td.td-data');
    if (!td || td.querySelector('input.cell-editor')) return;
    const tr = td.closest('tr');
    
    table.querySelectorAll('td.td-data.selected').forEach(td => td.classList.remove('selected'));
    const rows = getAllInteractiveRows();
    const r = rows.indexOf(tr);
    const c = +td.dataset.c;

    sel.active = true; sel.r1 = sel.r2 = r; sel.c1 = sel.c2 = c; 
    highlightSelection(); e.preventDefault();
  });
  
  table.addEventListener('mouseover', e => {
    if (!sel.active) return; 
    const td = e.target.closest('td.td-data'); if (!td) return;
    const rows = getAllInteractiveRows();
    sel.r2 = rows.indexOf(td.closest('tr')); 
    sel.c2 = +td.dataset.c; 
    highlightSelection();
  });
  
  document.addEventListener('mouseup', () => { sel.active = false; });

  const saveConfirmedRowIfApplicable = (tr) => {
      if (!tr?.dataset?.icao) return;
      if (tr.dataset.confirmed === "true") persistConfirmedAirportFromDom(tr.dataset.icao);
      else persistDraftAirportFromDom(tr.dataset.icao);
  };

  table.addEventListener('input', e => {
      const noteInput = e.target.closest('.edit-note-input');
      if (noteInput) {
          const icao = noteInput.closest('tr')?.dataset.icao;
          if (noteInput.closest('tr')?.dataset.confirmed === 'true') persistConfirmedAirportFromDom(icao);
          else persistDraftAirportFromDom(icao);
      }
  });

  document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const selected = table.querySelectorAll('td.td-data.edit-cell.selected');
      if (selected.length > 0 && !document.querySelector('.cell-editor')) {
          if (e.ctrlKey || e.metaKey || e.altKey) return; 
          if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') {
              e.preventDefault();
              const firstTd = selected[0]; 
              let initialVal = '';
              if (e.key === 'Backspace') initialVal = '';
              if (e.key === 'Enter') initialVal = firstTd.textContent === '—' ? '' : firstTd.textContent;

              firstTd.innerHTML = `<input type="text" class="cell-editor" style="width:100%; height:100%; box-sizing:border-box; border:2px solid #2563eb; text-align:center; font-weight:bold; background:transparent;" value="${initialVal}">`;
              const inp = firstTd.querySelector('input');
              inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; 
              
              inp.onblur = () => {
                  const origin = pbState.confirmedData[firstTd.closest('tr')?.dataset.icao]?.origin;
                  const finalVal = (origin === 'text' ? inp.value.trim() : formatPublishWindTableText(inp.value.trim())) || '';
                  selected.forEach(targetTd => {
                      targetTd.textContent = finalVal;
                      const style = getMultiCellStyle(finalVal);
                      targetTd.style.background = style.bg;
                      targetTd.style.color = style.fg;
                      targetTd.style.textShadow = style.ts;
                  });
                  new Set(Array.from(selected).map(cell => cell.closest('tr'))).forEach(syncHighTemperatureNoteForRow);
                  updateRowActiveStyle(firstTd.closest('tr'));
                  saveConfirmedRowIfApplicable(firstTd.closest('tr'));
                  updateTopCountersFromTable();
              };
              inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
          }
      }
  });

  table.addEventListener('dblclick', e => {
      const td = e.target.closest('td.td-data.edit-cell');
      if (!td || td.querySelector('input')) return;
      const tr = td.closest('tr');

      const original = td.textContent;
      td.innerHTML = `<input type="text" class="cell-editor" style="width:100%; height:100%; box-sizing:border-box; border:2px solid #2563eb; text-align:center; font-weight:bold; background:transparent;" value="${original === '—' ? '' : original}">`;
      const inp = td.querySelector('input');
      inp.focus(); inp.select();
      
      inp.onblur = () => {
          const origin = pbState.confirmedData[tr.dataset.icao]?.origin;
          const finalVal = origin === 'text' ? inp.value.trim() : formatPublishWindTableText(inp.value.trim());
          td.textContent = finalVal;
          const style = getMultiCellStyle(finalVal);
          td.style.background = style.bg;
          td.style.color = style.fg;
          td.style.textShadow = style.ts;
          syncHighTemperatureNoteForRow(tr);
          updateRowActiveStyle(tr);
          saveConfirmedRowIfApplicable(tr);
          updateTopCountersFromTable(); 
      };
      inp.onkeydown = ev => { if(ev.key === 'Enter') inp.blur(); };
  });

  document.addEventListener('keydown', e => {
    // 🌟 修复复制粘贴 Bug 1：强制降级全平台支持的 execCommand 保证内网环境也能复制！
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel.r1 >= 0) {
      if (document.activeElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;
      e.preventDefault();
      const rMin = Math.min(sel.r1, sel.r2), rMax = Math.max(sel.r1, sel.r2);
      const cMin = Math.min(sel.c1, sel.c2), cMax = Math.max(sel.c1, sel.c2);
      const map = {};
      
      const rows = getAllInteractiveRows();
      rows.forEach((tr, rIdx) => {
          if (rIdx >= rMin && rIdx <= rMax) {
              tr.querySelectorAll('td.td-data').forEach(td => {
                  const c = +td.dataset.c;
                  if (c >= cMin && c <= cMax) {
                      if (!map[rIdx]) map[rIdx] = {}; 
                      map[rIdx][c] = td.textContent || ''; 
                  }
              });
          }
      });
      const lines = [];
      for (let r = rMin; r <= rMax; r++) {
        const line = []; for (let c = cMin; c <= cMax; c++) line.push(map[r] && map[r][c] != null ? map[r][c] : '');
        if (line.length > 0) lines.push(line.join('\t'));
      }
      
      const textToCopy = lines.join('\n');
      // 🌟 修复：如果高端 API 被浏览器拦截，自动使用更鲁棒的 fallback 强制复制
      const fallbackCopy = (text) => {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed"; textArea.style.left = "-9999px";
          document.body.appendChild(textArea);
          textArea.focus(); textArea.select();
          try { document.execCommand('copy'); } catch(err) {}
          document.body.removeChild(textArea);
      };

      if(navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(textToCopy).catch(() => fallbackCopy(textToCopy));
      } else {
          fallbackCopy(textToCopy);
      }
    }
  });

  document.addEventListener('paste', e => {
    if (sel.r1 < 0) return; 
      if (document.activeElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain'); if (!text) return;
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    
    const r0 = Math.min(sel.r1, sel.r2), c0 = Math.min(sel.c1, sel.c2);
    const cellMap = {};
    const rows = getAllInteractiveRows();
    
    rows.forEach((tr, rIdx) => {
        tr.querySelectorAll('td.td-data.edit-cell').forEach(td => {
            const c = +td.dataset.c;
            if (c != null) cellMap[`${rIdx},${c}`] = td;
        });
    });
    
    let affectedTrs = new Set();
    lines.forEach((line, ri) => {
      line.split('\t').forEach((val, ci) => {
        const td = cellMap[`${r0 + ri},${c0 + ci}`]; if (!td) return;
        const origin = pbState.confirmedData[td.closest('tr')?.dataset.icao]?.origin;
        val = origin === 'text' ? val.trim() : formatPublishWindTableText(val.trim()); td.textContent = val || '';
        const style = getMultiCellStyle(val);
        td.style.background = style.bg; td.style.color = style.fg; td.style.textShadow = style.ts;
        affectedTrs.add(td.closest('tr'));
      });
    });
    
    affectedTrs.forEach(tr => {
        syncHighTemperatureNoteForRow(tr);
        updateRowActiveStyle(tr);
        saveConfirmedRowIfApplicable(tr);
    });
    updateTopCountersFromTable(); 
  });
}

function setupSearch() {
  const addBtn = document.getElementById('custom-airport-btn');
  const input = document.getElementById('custom-airport-input');
  const restoreBtn = document.getElementById('restore-table-btn');
  const soloBtn = document.getElementById('standalone-airport-btn');

  if(addBtn && input) {
      addBtn.onclick = async () => {
          const icao = input.value.trim().toUpperCase();
          if(icao.length !== 4) return alert("请输入4位ICAO");
          if(_cachedAirports.includes(icao)) return alert("该机场已在当前列表中");
          if (!window.AIRPORT_COORDS[icao]) return alert("坐标库中未收录此机场");
          
          _cachedAirports.unshift(icao);
          pbState.customCoords[icao] = window.AIRPORT_COORDS[icao]; 
          pbState.forceShowAirports.add(icao);
          registerSourceAirports('custom', [icao]);
          await loadForecastData(true);
          input.value = '';
      };
      soloBtn.onclick = async () => {
          const icao = input.value.trim().toUpperCase();
          if(icao.length !== 4) return alert("请输入4位ICAO");
          if (!window.AIRPORT_COORDS[icao]) return alert("坐标库中未收录此机场");
          
          pbState.customCoords[icao] = window.AIRPORT_COORDS[icao];
          pbState.forceShowAirports.add(icao);
          registerSourceAirports('custom', [icao]);
          document.querySelectorAll('.publish-region-option').forEach(cb => cb.checked = false);
          document.getElementById('publish-region-domestic-all').checked = false;
          document.getElementById('publish-region-international-all').checked = false;
          PUBLISH_REGION_NAMES.forEach(region => { pbState.enabledRegions[region] = false; });
          
          await loadForecastData();
          input.value = '';
      };
  }

  if(restoreBtn) {
      restoreBtn.onclick = async () => {
          document.querySelectorAll('.publish-region-option').forEach(cb => { cb.checked = true; pbState.enabledRegions[cb.value] = true; });
          document.getElementById('publish-region-domestic-all').checked = true;
          document.getElementById('publish-region-international-all').checked = true;
          pbState.customCoords = {};
          pbState.sourceAirports.custom.clear();
          pbState.forceShowAirports.clear();
          await loadForecastData();
      };
  }
}

function setupAirportInteraction() {
  const table = document.getElementById('forecast-table');
  const ctxMenu = document.getElementById('airport-ctx-menu');
  let selectedIcao = null;

  if(!table || !ctxMenu) return;
  document.addEventListener('click', () => ctxMenu.style.display = 'none');
  
  table.addEventListener('contextmenu', e => {
      if (e.target.tagName === 'INPUT') return; 
      let tr = e.target.closest('tr');
      if (!tr) return;

      // 备注列保留撤销编发菜单；天气单元格可继续增加或删除附加行。
      if (e.target.closest('td.col-desc')) return;

      let tempTr = tr;
      while (tempTr && !tempTr.dataset.icao) tempTr = tempTr.previousElementSibling;
      if (tempTr) selectedIcao = tempTr.dataset.icao;
      if (!selectedIcao) return;
      e.preventDefault();
      
      document.querySelectorAll('.td-airport').forEach(el => el.classList.remove('airport-selected'));
      const activeApCell = table.querySelector(`.td-airport[data-icao="${selectedIcao}"]`);
      if(activeApCell) activeApCell.classList.add('airport-selected');

      const delRowBtn = document.getElementById('ctx-delete-row');
      if (delRowBtn) {
          const isExtraRow = tr.classList.contains('tr-edit-extra');
          delRowBtn.style.display = isExtraRow ? 'block' : 'none';
          delRowBtn.onclick = () => {
              if (!isExtraRow) return;
              const hasContent = Array.from(tr.querySelectorAll('.edit-cell')).some(td => td.textContent.trim());
              if (hasContent && !confirm('这一行已有内容，确认删除此行吗？')) return;
              tr.remove();
              if (selectedIcao && pbState.confirmedData[selectedIcao]) persistConfirmedAirportFromDom(selectedIcao);
              else if (selectedIcao) persistDraftAirportFromDom(selectedIcao);
              if(window.updateAllRowspans) window.updateAllRowspans();
          };
      }
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
  });

  table.addEventListener('click', e => {
      const addExtraBtn = e.target.closest('.btn-add-extra');
      if (addExtraBtn) {
          e.preventDefault();
          e.stopPropagation();
          selectedIcao = addExtraBtn.dataset.icao;
          document.getElementById('ctx-copy-airport')?.click();
          return;
      }
      const btn = e.target.closest('.airport-delete-x');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const icao = btn.dataset.icao;
      if (icao) removeAirportFromPublish(icao);
  });


  document.getElementById('ctx-add-blank')?.addEventListener('click', () => {
      if(!selectedIcao) return;
      const srcTd = document.querySelector(`.td-airport[data-icao="${selectedIcao}"]`);
      if(!srcTd) return;
      const srcTr = srcTd.closest('tr');
      const rowspan = parseInt(srcTd.getAttribute('rowspan') || 1);
      let lastTr = srcTr;
      for(let i=1; i<rowspan; i++) lastTr = lastTr.nextElementSibling;

      const numCells = pbState.validityHours + 1;
      const eTr = document.createElement('tr');
      
      // 🌟 修复 Bug 5：彻底改造插入新机场的排版结构，输入框移动到名称列，匹配 colspan！
      eTr.className = 'tr-edit'; 
      eTr.dataset.icao = "TEMP_ADD";
      
      let html = `
          <td class="col-airport td-airport" style="padding:0;">
              <input type="text" class="new-ap-input" placeholder="输完回车" style="width:100%; height:100%; min-height:30px; box-sizing:border-box; text-align:center; text-transform:uppercase; font-weight:bold; border:2px solid #0f766e; outline:none;">
          </td>
          <td class="col-airport-type" style="vertical-align:middle; border-right:2px solid #cbd5e1;">普通</td>
          <td colspan="2" class="col-desc td-desc" style="font-size:10px; color:#888;">(失焦取消)</td>
      `;
      for(let i=0; i<numCells; i++) html += `<td class="col-time td-data" style="width:auto; min-width:25px;"></td>`;
      eTr.innerHTML = html;
      
      lastTr.insertAdjacentElement('afterend', eTr);
      if(window.updateAllRowspans) window.updateAllRowspans();

      const inp = eTr.querySelector('.new-ap-input');
      inp.focus();
      
      // 🌟 修复 Bug 5：点击外部自动销毁
      inp.addEventListener('blur', () => {
          if (!inp.value.trim()) {
              eTr.remove();
              if(window.updateAllRowspans) window.updateAllRowspans();
          }
      });
      
      inp.addEventListener('keydown', async (ev) => {
          if (ev.key === 'Enter') {
              const icao = inp.value.trim().toUpperCase();
              if(icao.length !== 4 || !window.AIRPORT_COORDS[icao]) return alert("无效的四字码或系统未收录！");
              
              pbState.customCoords[icao] = window.AIRPORT_COORDS[icao]; 
              pbState.forceShowAirports.add(icao); 
              registerSourceAirports('custom', [icao]);
              await loadForecastData(true);
          }
      });
  });
  
  document.getElementById('ctx-copy-airport')?.addEventListener('click', () => {
      if(!selectedIcao) return;
      const mainTr = document.querySelector(`.tr-edit[data-icao="${selectedIcao}"]`);
      if(!mainTr) return;
      
      const numCells = pbState.validityHours + 1;
      const gClass = mainTr.className.includes('g0') ? 'g0' : 'g1';
      const eTr = document.createElement('tr');
      eTr.className = `${gClass} tr-edit-extra`;
      eTr.dataset.confirmed = mainTr.dataset.confirmed;
      eTr.dataset.icao = selectedIcao;
      
      let opCell = '';
      if (mainTr.dataset.confirmed !== "true") {
          opCell = `
              <td colspan="2" class="col-desc draft-note-cell">
                  <input type="text" class="edit-note-input" value="">
                  <button class="btn-delete-extra">删除</button>
              </td>
          `;
      } else {
           opCell = `<td colspan="2" class="col-desc draft-note-cell"><input type="text" class="edit-note-input" value=""><button type="button" class="btn-delete-extra" title="删除此行">删除</button></td>`;
      }

      let eHtml = opCell;
      for(let i=0; i<numCells; i++) {
          eHtml += `<td class="col-time td-data edit-cell data-cell-editable" data-c="${i}" style="width:auto; min-width:25px; font-weight:bold; background:transparent; color:#1e293b; text-shadow:none;"></td>`;
      }
      eTr.innerHTML = eHtml;

      let lastRow = mainTr;
      while(lastRow.nextElementSibling && lastRow.nextElementSibling.classList.contains('tr-edit-extra')) {
          lastRow = lastRow.nextElementSibling;
      }
      lastRow.insertAdjacentElement('afterend', eTr);
      if (mainTr.dataset.confirmed === 'true') persistConfirmedAirportFromDom(selectedIcao);
      else persistDraftAirportFromDom(selectedIcao);
      
      if(window.updateAllRowspans) window.updateAllRowspans();
  });

}
