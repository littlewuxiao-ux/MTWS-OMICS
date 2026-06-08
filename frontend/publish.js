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
    "VTBS": "曼谷", "VVTS": "胡志明", "VVNB": "河内", "RPLL": "马尼拉", "VYYY": "仰光", "WMKK": "吉隆坡", "WSSS": "新加坡",
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
    "西北": ["ZLLL","ZLXY","ZWWW"], "西南": ["ZUUU","ZPPP","ZULS","ZUCK","ZUGY"], "港台": ["VHHH","RCTP"]
  }
};

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
  showWind: true, showVis: true, showWeatherCode: true, showTemp: true, showPressure: false,
  enabledRegions: {}, customCoords: {}, filterWx: {},
  filterWindThreshold: 15, filterVisThreshold: 1600, filterTempHigh: 33, filterTempLow: -28,
  filterHideEmptyAirports: true,
  airportGroups: [],
  expandedAirports: new Set(), 
  forceShowAirports: new Set(),
  allowOtherCarriers: false,
  defaultShowTaf: true, defaultShowEc: true,
  confirmedData: {},
  // 🌟 需求C：新增极寒与积冰配置参数
  cfgIceTemp: 10, cfgIceDew: 1, cfgIceVis: 1500, cfgExtColdTemp: -30
};

let _nextRowIdx = 0, _cachedAirports = [];

// 🌟 需求B：全局统一的保存方法（记录打卡人与时间戳）
window.saveConfirmedDataToLocal = function() {
    const userEl = document.getElementById('user-id-display');
    const curUser = userEl ? userEl.textContent.trim() : 'UNKNOWN';
    const wrapper = { timestamp: Date.now(), user: curUser, data: pbState.confirmedData };
    localStorage.setItem('sf_confirmed_forecasts_v3', JSON.stringify(wrapper));
};

// ==========================================
// 1. 初始化引擎
// ==========================================
window.initPublishModule = async function() {
    if (window.publishInitialized) return;
    window.publishInitialized = true;
    PBLOG('initPublishModule 开始初始化');

    let savedGroups = localStorage.getItem('pb_airport_groups');
    pbState.airportGroups = savedGroups ? JSON.parse(savedGroups) : DEFAULT_AIRPORT_GROUPS;
    
    // 🌟 需求C：加载极寒积冰历史设置
    const savedEcCfg = JSON.parse(localStorage.getItem('pb_auto_ec_cfg'));
    if (savedEcCfg) {
        pbState.cfgIceTemp = savedEcCfg.iceTemp; pbState.cfgIceDew = savedEcCfg.iceDew;
        pbState.cfgIceVis = savedEcCfg.iceVis; pbState.cfgExtColdTemp = savedEcCfg.extCold;
    }

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
    [...Object.keys(AIRPORT_CFG.domestic)].forEach(r => { pbState.enabledRegions[r] = true; });

    try {
        setupQuickTimeOptions(); 
        setupModalEvents();
        setupSearch();
        setupTableInteraction();
        setupAirportInteraction();
        renderAirportGroupsConfig(); 
        setupGlobalToolbar(); 
        PBLOG('交互组件初始化完成');
    } catch (e) {
        PBLOG('交互组件初始化失败: ' + (e && e.stack ? e.stack : e), 'ERROR');
    }

    const token = localStorage.getItem('sf_weather_token');
    const loader = document.getElementById('publish-loading-indicator');

    if (!token) {
        PBLOG('未检测到登录 token，跳过自动加载', 'WARN');
        if (loader) {
            loader.style.display = 'block';
            loader.innerHTML = '<b style="color:#dc2626;">⚠️ 尚未登录或会话已过期。请先在右上角【登录 SF App】。</b>';
        }
    } else {
        PBLOG('检测到登录 token，自动触发首次数据加载');
        if (loader) {
            loader.style.display = 'block';
            loader.innerHTML = '<span class="spinner"></span> 已登录，正在自动加载最新预报数据...';
        }
        // 🌟 自动触发首次加载（带 loading 动画），不再需要手动点击刷新
        loadForecastData().catch(e => PBLOG('首次自动加载异常: ' + e, 'ERROR'));
    }

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
            const hasContent = Array.from(tr.querySelectorAll('.edit-cell')).some(td => td.textContent.trim());
            if (hasContent && !confirm('这一行已有内容，确认删除此行吗？')) return;
            tr.remove();
            if (window.updateAllRowspans) window.updateAllRowspans();
        }
    });
};

function initTopBarData() {
    const now = new Date(Date.now() + 8 * 3600000); 
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const dp = document.getElementById('pb-datetime');
    if(dp) dp.value = `${yyyy}-${mm}-${dd}T${hh}:00`;
    applyTimePreset('24'); 
}

function applyTimePreset(val) {
    const dp = document.getElementById('pb-datetime');
    if(!dp || !dp.value) return;
    
    let bjtDate = new Date(dp.value);
    let sHourBJT = 0; let vHours = 24; 
    
    if (val === '24') { sHourBJT = 15; vHours = 24; }
    else if (val === '12') { sHourBJT = 8; vHours = 12; }
    else if (val === '8') { sHourBJT = 20; vHours = 8; }
    else if (val === '4') { sHourBJT = 4; vHours = 4; }
    else if (val === '48') { sHourBJT = bjtDate.getHours(); vHours = 48; }
    else if (val === 'custom') { 
        document.getElementById('publish-settings-btn')?.click(); 
        document.querySelector('.set-nav[data-target="pane-pb"]')?.click(); 
        return; 
    }

    const utcH = (sHourBJT - 8 + 24) % 24;
    const baseUTC = new Date(Date.UTC(bjtDate.getFullYear(), bjtDate.getMonth(), bjtDate.getDate(), utcH, 0, 0));
    if (sHourBJT - 8 < 0) baseUTC.setUTCDate(baseUTC.getUTCDate() - 1);
    
    pbState.startDate = baseUTC.toISOString().split('T')[0];
    pbState.startHour = baseUTC.getUTCHours();
    pbState.validityHours = vHours;

    pbState.filterWindThreshold = 15;
    pbState.filterVisThreshold = 1600;
    if(document.getElementById('filter-wind-threshold')) document.getElementById('filter-wind-threshold').value = 15;
    if(document.getElementById('filter-vis-threshold')) document.getElementById('filter-vis-threshold').value = 1600;
    
    populateModalForm();
}

function setupGlobalToolbar() {
    const table = document.getElementById('forecast-table');
    if (!table) return;
    
    table.classList.add('table-merged'); 
    
    const tafCb = document.getElementById('global-toggle-taf');
    if (tafCb) {
        tafCb.checked = pbState.defaultShowTaf;
        table.classList.toggle('hide-taf-global', !tafCb.checked);
        tafCb.onchange = (e) => { 
            table.classList.toggle('hide-taf-global', !e.target.checked); 
            if(window.updateAllRowspans) window.updateAllRowspans();
        };
    }
    
    const ecCb = document.getElementById('global-toggle-ec');
    if (ecCb) {
        ecCb.checked = pbState.defaultShowEc;
        table.classList.toggle('hide-ec-global', !ecCb.checked);
        ecCb.onchange = (e) => { 
            table.classList.toggle('hide-ec-global', !e.target.checked); 
            if(window.updateAllRowspans) window.updateAllRowspans();
        };
    }
    
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
            if (!localStorage.getItem('sf_weather_token')) return alert("请先登录！");
            loadForecastData();
        };
    }

    document.getElementById('global-export-text-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('export-text-modal');
        const textarea = document.getElementById('export-text-content');
        if (!modal || !textarea) return;
        
        const startH = pbState.startHour;
        let exportLines = [];
        
        const confirmedIcaos = Object.keys(pbState.confirmedData);
        if (confirmedIcaos.length === 0) {
            textarea.value = "⚠️ 暂无已确认编发的预报数据。请先点击表格中的【确认编发】。";
        } else {
            confirmedIcaos.forEach(icao => {
                const data = pbState.confirmedData[icao];
                const mainCells = data.rows ? data.rows[0] : data.cells;
                const firstNote = data.notes ? data.notes[0] : (data.note || '');
                let timeRanges = [];
                let curVal = mainCells[0].text.trim();
                let startIdx = 0;
                
                const formatEndpoint = (offset, withMonth = false) => {
                    const totalH = startH + offset + 8;
                    const dayOffset = Math.floor(totalH / 24);
                    const h = String(totalH % 24).padStart(2, '0');
                    const d = new Date(pbState.startDate + 'T00:00:00Z');
                    d.setUTCDate(d.getUTCDate() + dayOffset);
                    return {
                        month: d.getUTCMonth() + 1,
                        day: d.getUTCDate(),
                        hour: h,
                        label: `${withMonth ? (d.getUTCMonth()+1) + '月' : ''}${d.getUTCDate()}日${h}`
                    };
                };
                const hasCrossMonth = (() => {
                    const first = formatEndpoint(0, true);
                    const last = formatEndpoint(mainCells.length - 1, true);
                    return first.month !== last.month;
                })();
                const formatRange = (a, b) => {
                    const start = formatEndpoint(a, hasCrossMonth);
                    const end = formatEndpoint(b, hasCrossMonth);
                    // 同一天只写一次日期：5日04-07时；跨天：5日22时-6日02时；跨月自动带月。
                    if (start.month === end.month && start.day === end.day) return `${start.label}-${end.hour}时`;
                    return `${start.label}时-${end.label}时`;
                };
                
                for (let i = 1; i <= mainCells.length; i++) {
                    let val = i < mainCells.length ? (mainCells[i].text || '').trim() : null;
                    if (val !== curVal) {
                        if (curVal !== '' && curVal !== '—' && curVal !== '适航') {
                            timeRanges.push(`${formatRange(startIdx, i-1)}有${curVal}`);
                        }
                        curVal = val;
                        startIdx = i;
                    }
                }
                // 导出文本排版：同日合并日期，不跨月不写月份。
                let timeStr = timeRanges.length > 0 ? timeRanges.join('，') : '预计天气适航';
                let apName = window.GLOBAL_AIRPORT_NAME_MAP[icao];
                let displayName = apName ? apName : icao; // 优先中文名，没有则用四字码
                let finalNote = (firstNote === '适航' || firstNote === '/') ? '' : `，${firstNote}`;
                
                let line = `${displayName}：${timeStr}${finalNote}。`;
                exportLines.push(line);
            });
            textarea.value = exportLines.join('\n');
        }
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
        titleSelect.addEventListener('change', async (e) => {
            const now = new Date(Date.now() + 8 * 3600000); 
            document.getElementById('pb-datetime').value = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}:00`;
            applyTimePreset(e.target.value);
            if(e.target.value !== 'custom') { await loadForecastData(); }
        });
    }
    const dp = document.getElementById('pb-datetime');
    if(dp) {
        dp.addEventListener('change', async () => {
            const selectVal = document.getElementById('pb-main-title-select').value;
            if(selectVal !== 'custom') {
                applyTimePreset(selectVal);
                await loadForecastData();
            }
        });
    }
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
                    <label style="cursor:pointer; font-weight:bold; color:#d9534f;"><input type="checkbox" class="grp-show" ${g.alwaysShow?'checked':''}> 常驻显示</label>
                    <button class="mini-btn del-grp" data-idx="${idx}" style="background:#dc2626;color:white;border:none;">删 除</button>
                </div>
                <textarea class="grp-aps" placeholder="输入4字ICAO，用空格隔开" style="width:100%; height:45px; padding:5px; border-radius:4px; border:1px solid #b8daff; outline:none; box-sizing:border-box;">${g.airports.join(' ')}</textarea>
            </div>
        `;
    });
    document.querySelectorAll('.del-grp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            pbState.airportGroups.splice(e.target.dataset.idx, 1);
            renderAirportGroupsConfig();
        });
    });
}

document.getElementById('add-pb-group-btn')?.addEventListener('click', () => {
    pbState.airportGroups.push({ name: "新性质", alwaysShow: false, airports: [] });
    renderAirportGroupsConfig();
});

function saveAirportGroupsConfig() {
    const items = document.querySelectorAll('.ap-group-item');
    const newGroups = [];
    items.forEach(item => {
        const name = item.querySelector('.grp-name').value.trim() || '未命名';
        const alwaysShow = item.querySelector('.grp-show').checked;
        const apsStr = item.querySelector('.grp-aps').value.toUpperCase();
        const airports = apsStr.split(/[\s,]+/).filter(x => x.length === 4);
        newGroups.push({ name, alwaysShow, airports });
    });
    pbState.airportGroups = newGroups;
    localStorage.setItem('pb_airport_groups', JSON.stringify(newGroups));
}

function populateModalForm() {
  const q = id => document.getElementById(id);
  if(q('cfg-allow-other-carriers')) q('cfg-allow-other-carriers').checked = pbState.allowOtherCarriers;
  if(q('cfg-default-taf')) q('cfg-default-taf').checked = pbState.defaultShowTaf;
  if(q('cfg-default-ec')) q('cfg-default-ec').checked = pbState.defaultShowEc;

  if(q('cfg-start-date')) q('cfg-start-date').value = pbState.startDate;
  if(q('cfg-start-hour')) q('cfg-start-hour').value = pbState.startHour;
  if(q('cfg-validity')) q('cfg-validity').value = pbState.validityHours;
  if(q('filter-wind-threshold')) q('filter-wind-threshold').value = pbState.filterWindThreshold;
  if(q('filter-vis-threshold')) q('filter-vis-threshold').value = pbState.filterVisThreshold;
  if(q('filter-temp-high')) q('filter-temp-high').value = pbState.filterTempHigh;
  if(q('filter-temp-low')) q('filter-temp-low').value = pbState.filterTempLow;
  
  const c = (id, val) => { const el=q(id); if(el) el.checked = val; };
  c('cfg-wind', pbState.showWind); c('cfg-vis', pbState.showVis); c('cfg-wx', pbState.showWeatherCode); c('cfg-temp', pbState.showTemp); c('cfg-pressure', pbState.showPressure);
  c('filter-hide-empty-airports', pbState.filterHideEmptyAirports);
  
  document.querySelectorAll('[data-region]').forEach(cb => { cb.checked = pbState.enabledRegions[cb.dataset.region] !== false; });
  ALL_WX_PHENOMENA.forEach((wx, idx) => { const el = q(`filter-wx-${idx}`); if(el) el.checked = pbState.filterWx[wx] !== false; });
}

function saveModalForm() {
  const q = id => document.getElementById(id);
  if(q('cfg-allow-other-carriers')) pbState.allowOtherCarriers = q('cfg-allow-other-carriers').checked;
  if(q('cfg-default-taf')) pbState.defaultShowTaf = q('cfg-default-taf').checked;
  if(q('cfg-default-ec')) pbState.defaultShowEc = q('cfg-default-ec').checked;

  if(q('cfg-start-date')) pbState.startDate = q('cfg-start-date').value || pbState.startDate;
  if(q('cfg-start-hour')) pbState.startHour = Math.min(23, Math.max(0, parseInt(q('cfg-start-hour').value) || 0));
  if(q('cfg-validity')) pbState.validityHours = Math.max(1, parseInt(q('cfg-validity').value) || 48);

  if(q('filter-wind-threshold')) pbState.filterWindThreshold = parseFloat(q('filter-wind-threshold').value) || 15;
  if(q('filter-vis-threshold')) pbState.filterVisThreshold = parseFloat(q('filter-vis-threshold').value) || 1600;
  if(q('filter-temp-high')) pbState.filterTempHigh = parseFloat(q('filter-temp-high').value) || 33;
  if(q('filter-temp-low')) pbState.filterTempLow = parseFloat(q('filter-temp-low').value) || -28;
  
  const c = id => q(id)?.checked;
  pbState.showWind = c('cfg-wind'); pbState.showVis = c('cfg-vis'); pbState.showWeatherCode = c('cfg-wx'); pbState.showTemp = c('cfg-temp'); pbState.showPressure = c('cfg-pressure');
  pbState.filterHideEmptyAirports = c('filter-hide-empty-airports');
  
  document.querySelectorAll('[data-region]').forEach(cb => { pbState.enabledRegions[cb.dataset.region] = cb.checked; });
  ALL_WX_PHENOMENA.forEach((wx, idx) => { const cb = q(`filter-wx-${idx}`); if (cb) pbState.filterWx[wx] = cb.checked; });
  
  if(q('cfg-ice-temp')) pbState.cfgIceTemp = parseFloat(q('cfg-ice-temp').value) || 10;
  if(q('cfg-ice-dew')) pbState.cfgIceDew = parseFloat(q('cfg-ice-dew').value) || 1;
  if(q('cfg-ice-vis')) pbState.cfgIceVis = parseFloat(q('cfg-ice-vis').value) || 1500;
  if(q('cfg-ext-cold-temp')) pbState.cfgExtColdTemp = parseFloat(q('cfg-ext-cold-temp').value) || -30;
  localStorage.setItem('pb_auto_ec_cfg', JSON.stringify({
      iceTemp: pbState.cfgIceTemp, iceDew: pbState.cfgIceDew,
      iceVis: pbState.cfgIceVis, extCold: pbState.cfgExtColdTemp
  }));

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
      const titleSelect = document.getElementById('pb-main-title-select');
      if(titleSelect) {
          let opt = titleSelect.querySelector('option[value="custom"]');
          if(!opt) { opt = document.createElement('option'); opt.value = 'custom'; titleSelect.appendChild(opt); }
          opt.textContent = `${pbState.validityHours}小时天气预报`; titleSelect.value = 'custom'; 
      }
      loadForecastData(); 
  });

  const buildList = (id, regions) => {
    const container = document.getElementById(id);
    if(!container) return;
    container.innerHTML = '';
    regions.forEach(region => {
      const airports = AIRPORT_CFG.domestic[region] || [];
      if (airports.length === 0) return;
      const label = document.createElement('label'); label.className = 'region-item';
      label.innerHTML = `<input type="checkbox" data-region="${region}" checked> ${region} (${airports.length})`;
      container.appendChild(label);
    });
  };
  buildList('region-list-domestic', Object.keys(AIRPORT_CFG.domestic));

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
    const token = localStorage.getItem('sf_weather_token');
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
    const token = localStorage.getItem('sf_weather_token');
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

function getAlertElements(wxStr, vis, spd) {
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
    
    if (spd >= pbState.filterWindThreshold) elements.push(`W${spd}`);
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
    if (/^W\d+$/.test(v)) return { bg: '#2563eb', fg: '#FFFFFF' }; 
    if (/^\d+$/.test(v)) return { bg: '#fde047', fg: '#000000' }; 
    return { bg: 'transparent', fg: '#1e293b' };
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
    wind_speed_10m: sl(apiData.hourly.wind_speed_10m), wind_direction_10m: sl(apiData.hourly.wind_direction_10m),
    wind_gusts_10m: sl(apiData.hourly.wind_gusts_10m), weather_code: sl(apiData.hourly.weather_code), surface_pressure: sl(apiData.hourly.surface_pressure),
    raw_weather_code: apiData.hourly.weather_code, start_idx: idx // 🌟 保留原始完整数组和时间锚点，用于追溯过去12小时
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
  if (wc >= 96 && wc <= 99) return prec < 1.5 ? '中雷雨' : '强雷雨';
  if (wc === 91 || wc === 92 || wc === 95) return prec === 0 ? '干雷' : intensityByPrecip(prec, '弱雷雨', '中雷雨', '强雷雨');
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

function analyzeCategory(val) {
    if (!val || val === '' || val === '—' || val === '适航') return [];
    let cats = new Set();
    val.split(' ').forEach(v => {
        if (v.includes('雷') || v.includes('雹')) cats.add('ts');
        else if (WX_HVY_RAIN_KEYWORDS.some(kw => v.includes(kw))) cats.add('hvy-rain');
        else if (v.includes('雨')) cats.add('rain');
        else if (WX_SNOW_KEYWORDS.some(kw => v.includes(kw))) cats.add('snow');
        else if (WX_OTHER_BLUE_KEYWORDS.some(kw => v.includes(kw))) cats.add('other');
        else if (/^W\d+$/.test(v)) {
            let spd = parseInt(v.replace('W',''));
            if (spd >= pbState.filterWindThreshold) cats.add('wind');
        }
        else if (/^\d+$/.test(v)) {
            let vis = parseInt(v);
            if (vis < pbState.filterVisThreshold) cats.add('vis');
        }
        else if (v === '低云') cats.add('cld');
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

// ==========================================
// 🌟 核心引擎：数据加载与三行独立渲染
// ==========================================
async function loadForecastData(retainOrder = false) {
    const token = localStorage.getItem('sf_weather_token');
    const loader = document.getElementById('publish-loading-indicator');
    PBLOG(`loadForecastData 开始 | retainOrder=${retainOrder} | startDate=${pbState.startDate} startHour=${pbState.startHour} validity=${pbState.validityHours}h`);
    
    const setProgress = (msg, isError = false) => {
        if (!loader) return;
        loader.style.display = 'block'; loader.style.color = isError ? '#dc2626' : '#005A9C';
        loader.innerHTML = isError ? `❌ ${msg}` : `<span class="spinner"></span> ${msg}`;
    };

    if (!token) { PBLOG('loadForecastData 中止：无 token', 'WARN'); return; }

    try {
        setProgress('初始化: 正在计算航班有效时段...');
        const startMs = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();
        const baseEndMs = startMs + pbState.validityHours * 3600000;
        const flightEndMs = baseEndMs + (3 * 3600000); 
        
        setProgress('查询: 正在获取当前运行航班机场列表...');
        const flightAps = await fetchActiveFlightAirports(startMs, flightEndMs, setProgress);
        
        setProgress(`匹配: 识别到 ${flightAps.length} 个运行机场，正在合并常驻配置...`);
        const combinedAps = []; const seen = new Set();
        
        pbState.airportGroups.forEach(g => {
            if (g.alwaysShow) { g.airports.forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } }); }
        });
        flightAps.forEach(ap => { if(!seen.has(ap)) { seen.add(ap); combinedAps.push(ap); } });
        Object.keys(pbState.customCoords).forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });
        pbState.forceShowAirports.forEach(ap => { if(!seen.has(ap)){ seen.add(ap); combinedAps.push(ap); } });

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
        // 改为把查询起始日提前 1 天，同样拿到过去 24h 历史数据，供 processAirportData 用 start_idx 溯源。
        const queryStartDate = new Date(startMs - 86400000).toISOString().split('T')[0];

        const chunkSize = 50; const nwpPromises = [];
        for (let i = 0; i < validAps.length; i += chunkSize) {
            const chunkLats = lats.slice(i, i + chunkSize); const chunkLons = lons.slice(i, i + chunkSize);
            // 🌟 需求C：新增 dew_point_2m 获取温露差；query_start 提前1天以含过去24小时历史降水供溯源
            const nwpUrl = `https://api.open-meteo.com/v1/forecast?latitude=${chunkLats.join(',')}&longitude=${chunkLons.join(',')}&hourly=temperature_2m,dew_point_2m,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure&models=ecmwf_ifs&timezone=GMT&wind_speed_unit=ms&start_date=${queryStartDate}&end_date=${endDate}`;
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

        const apAnalysis = validAps.map(icao => {
            if (pbState.confirmedData[icao]) return { icao, hasAlert: true, nwp: null, tafRaw: '', tafHourly: null, autoAdoptEC: false, autoAdoptReason: "" };
            
            const nwp = forecastMap[icao];
            const tafObj = tafDataMap && tafDataMap[icao] ? tafDataMap[icao] : { raw: [], hourly: null };
            const tafRaw = tafObj.raw.length > 0 ? tafObj.raw[0] : '';
            const tafHourly = tafObj.hourly;
            
            let hasAlert = false;
            let autoAdoptEC = false;
            let autoAdoptReason = "";
            
            if (nwp) {
                for(let i = 0; i <= pbState.validityHours; i++) {
                    const wx = getWeatherPhenomenonResult(nwp, i).text;
                    const ws = calcWindSpeed(nwp.wind_speed_10m[i], nwp.wind_gusts_10m[i]);
                    const v = nwp.visibility[i];
                    let ext = getAlertElements(wx, v, ws);
                    if (ext.w !== '') { hasAlert = true; } 
                    
                    // 🌟 需求C：极寒与积冰自动采纳条件判定系统
                    if (!autoAdoptEC && nwp.start_idx !== -1) {
                        let T = nwp.temperature_2m[i];
                        let Td = nwp.dew_point_2m[i];
                        let globalIdx = nwp.start_idx + i;
                        
                        // 1. 极寒判定
                        if (T < pbState.cfgExtColdTemp) {
                            autoAdoptEC = true; autoAdoptReason = "极寒预警";
                        }
                        // 2. 积冰判定
                        if (!autoAdoptEC && T < pbState.cfgIceTemp) {
                            if (T - Td < pbState.cfgIceDew) {
                                autoAdoptEC = true; autoAdoptReason = "积冰(温露差小)";
                            } else if (v < pbState.cfgIceVis) {
                                autoAdoptEC = true; autoAdoptReason = "积冰(能见度极低)";
                            } else {
                                let hasPrecipPast12h = false;
                                for (let p = 1; p <= 12; p++) {
                                    let pIdx = globalIdx - p;
                                    if (pIdx >= 0 && nwp.raw_weather_code) {
                                        let wc = nwp.raw_weather_code[pIdx];
                                        // NWP 气象码提取：51-67(降水/冻雨), 71-77(降雪), 80-86(阵性降水), 95-99(雷暴降水)
                                        if ((wc >= 51 && wc <= 67) || (wc >= 71 && wc <= 77) || (wc >= 80 && wc <= 86) || (wc >= 95 && wc <= 99)) {
                                            hasPrecipPast12h = true; break;
                                        }
                                    }
                                }
                                if (hasPrecipPast12h) { autoAdoptEC = true; autoAdoptReason = "积冰(近12h有降水)"; }
                            }
                        }
                    }
                }
            }
            if (!hasAlert && tafHourly) {
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
                        
                        let ext = getAlertElements(wx, vis, spd);
                        if (ext.w !== '') { hasAlert = true; break; }
                    }
                }
            }
            return { icao, hasAlert, nwp, tafRaw, tafHourly };
        });

        setProgress('6/6 正在排版...');
        apAnalysis.forEach((ap, idx) => ap.originalIdx = idx);
        // 🌟 问题2：判断国内(中国大陆 Z 开头，不含港澳台 VH/RC/VM)。国内排前，国际排后。
        const isDomestic = (icao) => /^Z[BGHSYLUPW]/.test(icao || '');
        apAnalysis.sort((a, b) => {
            const getPriority = (icao, hasAlert) => {
                if (pbState.confirmedData[icao]) return 5; 
                if (pbState.forceShowAirports.has(icao)) return 4;
                let isAlwaysShow = false;
                for (let g of pbState.airportGroups) {
                    if (g.alwaysShow && g.airports.includes(icao)) { isAlwaysShow = true; break; }
                }
                if (isAlwaysShow) return 3;
                if (hasAlert) return 2;
                return 1;
            };
            const pA = getPriority(a.icao, a.hasAlert);
            const pB = getPriority(b.icao, b.hasAlert);
            if (pA !== pB) return pB - pA;
            // 🌟 问题2：同优先级内，国内优先于国际
            const dA = isDomestic(a.icao) ? 0 : 1;
            const dB = isDomestic(b.icao) ? 0 : 1;
            if (dA !== dB) return dA - dB;
            return a.originalIdx - b.originalIdx; 
        });

        _cachedAirports = apAnalysis.map(a => a.icao);
        window.currentApAnalysis = apAnalysis; 
        renderPublishTableTriRow(window.currentApAnalysis);
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
function renderPublishTableTriRow(apAnalysis) {
    const table = document.getElementById('forecast-table');
    if(!table) return;
    table.innerHTML = '';
    
    const numCells = pbState.validityHours + 1;                      
    const sH = pbState.startHour;
    const isWide = numCells > 25;
    const cellStyle = isWide ? 'width:40px; min-width:40px;' : 'width:auto; min-width:25px;';

    const thead = document.createElement('thead');
    let trLead1 = `<tr><th class="col-airport hdr" colspan="2" style="width:140px; border-bottom:1px solid #c8d5e5; background-color:#5D6D7E; color:#fff;">影响机场</th><th class="col-desc hdr" rowspan="2" colspan="2" style="width:100px; border-bottom:1px solid #c8d5e5; background-color:#5D6D7E; color:#fff;">备注</th>`;
    for (let i = 0; i < numCells; i++) trLead1 += `<th class="col-time th-lead" style="${cellStyle}">${i}h</th>`;
    trLead1 += `</tr><tr><th class="col-airport hdr" style="width:90px; border-top:1px solid #c8d5e5; border-right:1px solid #c8d5e5; background-color:#5D6D7E; color:#fff;">名称</th><th class="col-airport hdr" style="width:50px; border-top:1px solid #c8d5e5; background-color:#5D6D7E; color:#fff;">性质</th>`;
    for (let i = 0; i < numCells; i++) {
        const bjtHour = (sH + i + 8) % 24; 
        trLead1 += `<th class="col-time th-hour" style="${cellStyle} background:#e2e8f0; color:#333;">${String(bjtHour).padStart(2, '0')}时</th>`;
    }
    trLead1 += `</tr>`;
    thead.innerHTML = trLead1;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const startMs = new Date(`${pbState.startDate}T${String(pbState.startHour).padStart(2, '0')}:00:00Z`).getTime();
    
    const filteredAnalysis = apAnalysis.filter(apInfo => {
        let apType = '普通';
        let isAlwaysShow = false; // 🌟 新增：标记该机场是否具备常驻属性
        
        for (let g of pbState.airportGroups) { 
            if (g.airports.includes(apInfo.icao)) { 
                apType = g.name; 
                if (g.alwaysShow) isAlwaysShow = true; // 如果组配置了常驻显示，打上豁免标记
                break; 
            } 
        }
        if (pbState.confirmedData[apInfo.icao]) { apInfo._apType = apType; return true; }
        
        // 🌟 修复 Bug：即便开启了隐藏空机场，只要它是常驻机场(isAlwaysShow)或手动追加机场，都绝不隐藏！
        if (pbState.filterHideEmptyAirports && !apInfo.hasAlert && !pbState.forceShowAirports.has(apInfo.icao) && !isAlwaysShow) {
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
        const isGray = !isConfirmed && !hasAlert && !pbState.forceShowAirports.has(icao);
        const rowStyle = isGray ? 'background-color: #f3f4f6; color: #94a3b8;' : '';

        // 🌟 修复崩溃：安全提取已确认数据
        const rowsToRender = isConfirmed ? (cData.rows || [cData.cells]) : [null];
        const notesToRender = isConfirmed ? (cData.notes || [cData.note || '']) : [''];

        const trEdit = document.createElement('tr');
        trEdit.className = `${gClass} tr-edit`;
        trEdit.style.cssText = rowStyle;
        trEdit.dataset.confirmed = isConfirmed ? "true" : "false";
        trEdit.dataset.icao = icao;
        
        let srcOpHTML = '';
        if (isConfirmed) {
            srcOpHTML = `<td colspan="2" class="col-desc" style="padding:4px;" title="右键唤出撤销菜单"><input type="text" class="edit-note-input" value="${notesToRender[0] || ''}" style="width:100%; height:100%; min-height:26px; border:1px solid #ccc; border-radius:4px; text-align:center; font-size:11px; font-weight:bold; color:#1e40af; background:transparent;"></td>`;
        } else {
            srcOpHTML = `
                <td class="col-source" style="font-weight:bold; color:#1e40af; vertical-align:middle; font-size:11px; border-right:none; cursor:pointer; user-select:none;" title="双击展开/折叠下方行">编辑</td>
                <td class="col-op" style="padding:4px; position:relative; vertical-align:middle; border-left:none;">
                    <div class="edit-note-display" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:#1e40af; font-weight:bold; z-index:1;"></div>
                    <button class="hover-btn btn-confirm-edit" style="position:relative; z-index:2; background:#dc2626; color:white; width:100%; border:none; padding:6px 0; border-radius:4px; font-weight:bold; font-size:11px;">确认编发</button>
                </td>
            `;
        }

        trEdit.innerHTML = `
            <td class="col-airport td-airport" rowspan="1" draggable="true" data-icao="${icao}" title="${tafRaw || '无TAF报文'}" style="font-weight:bold; vertical-align:middle; cursor:move; position:sticky; ${isGray?'color:#94a3b8;':''}">${apName}<button class="airport-delete-x" data-icao="${icao}" title="删除该机场">×</button></td>
            <td rowspan="1" style="vertical-align:middle; border-right:2px solid #cbd5e1;">${apType}</td>
            ${srcOpHTML}
        `;
        
        for (let i = 0; i < numCells; i++) {
            let val = '', bg = 'transparent', fg = isGray ? '#94a3b8' : '#1e293b', ts = 'none';
            if (rowsToRender[0] && rowsToRender[0][i]) {
                const c = rowsToRender[0][i]; val = c.text; bg = c.bg; fg = c.fg; ts = c.ts || 'none';
            }
            const cls = isConfirmed ? 'data-cell-editable' : '';
            trEdit.innerHTML += `<td class="col-time td-data edit-cell ${cls}" data-c="${i}" style="${cellStyle} font-weight:bold; background:${bg}; color:${fg}; text-shadow:${ts};">${val}</td>`;
        }
        tbody.appendChild(trEdit);

        if (isConfirmed && rowsToRender.length > 1) {
            for (let r = 1; r < rowsToRender.length; r++) {
                const subTr = document.createElement('tr');
                subTr.className = `${gClass} tr-edit-extra`;
                subTr.dataset.confirmed = "true";
                subTr.dataset.icao = icao;
                
                let subHtml = `<td colspan="2" class="col-desc" style="padding:4px;" title="右键唤出撤销菜单"><input type="text" class="edit-note-input" value="${notesToRender[r] || ''}" style="width:100%; height:100%; min-height:26px; border:1px solid #ccc; border-radius:4px; text-align:center; font-size:11px; font-weight:bold; color:#1e40af; background:transparent;"></td>`;
                for (let i = 0; i < numCells; i++) {
                    const c = rowsToRender[r][i];
                    subHtml += `<td class="col-time td-data edit-cell data-cell-editable" data-c="${i}" style="${cellStyle} font-weight:bold; background:${c.bg}; color:${c.fg}; text-shadow:${c.ts};">${c.text}</td>`;
                }
                subTr.innerHTML = subHtml;
                tbody.appendChild(subTr);
            }
            return; 
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
                tWindRaw = dataToRead.wind_direction !== undefined ? `${dataToRead.wind_direction}°/${spd}` : `W${spd}`;
                tVisRaw = vis !== 9999 ? vis : '—';
                
                let ext = getAlertElements(wx, vis, spd);
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
                eWindRaw = nwp.wind_direction_10m[i] !== undefined ? `${Math.round(nwp.wind_direction_10m[i])}°/${ws}` : `W${ws}`;
                eVisRaw = v;
                eTempRaw = Math.round(nwp.temperature_2m[i]) + '℃';
                ePressRaw = nwp.surface_pressure ? Math.round(nwp.surface_pressure[i]) : '—';
                
                let ext = getAlertElements(wx, v, ws);
                eW = ext.w; if(ext.noteStr) ext.noteStr.split(' ').forEach(n => allEcNotes.add(n));
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

        if (pbState.showWeatherCode) appendDetail('tr-nwp-detail', '↳ 天气', ecWxHtml);
        if (pbState.showWind) appendDetail('tr-nwp-detail', '↳ 风向风速', ecWindHtml);
        if (pbState.showVis) appendDetail('tr-nwp-detail', '↳ 能见度', ecVisHtml);
        if (pbState.showTemp) appendDetail('tr-nwp-detail', '↳ 气温', ecTempHtml);
        if (pbState.showPressure) appendDetail('tr-nwp-detail', '↳ 气压', ecPressHtml);
        // 🌟 需求C：若命中积冰或极寒条件，等待 DOM 就绪后直接虚拟点击采纳！
        if (!isConfirmed && apInfo.autoAdoptEC) {
            setTimeout(() => {
                const nwpBtn = trNwp.querySelector('.btn-adopt-nwp');
                if (nwpBtn) {
                    nwpBtn.click(); // 程序代点“采纳数值”
                    // 在右上角角标追加触发原因提示
                    const noteDisplay = trEdit.querySelector('.edit-note-display');
                    if (noteDisplay) {
                        noteDisplay.innerHTML = `<span style="color:#d97706; background:#fff3cd; padding:0 2px; border-radius:2px;">[自动EC: ${apInfo.autoAdoptReason}]</span> ` + noteDisplay.innerHTML;
                    }
                }
            }, 50); 
        }
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

        trEdit.querySelector('.col-source').ondblclick = () => { toggleExpand(trTaf, 'tr-taf-detail'); toggleExpand(trNwp, 'tr-nwp-detail'); };
        trTaf.querySelector('.col-source').ondblclick = () => toggleExpand(trTaf, 'tr-taf-detail');
        trNwp.querySelector('.col-source').ondblclick = () => toggleExpand(trNwp, 'tr-nwp-detail');

        const btnConfirm = trEdit.querySelector('.btn-confirm-edit');
        const btnTaf = trTaf.querySelector('.btn-adopt-taf');
        const btnNwp = trNwp.querySelector('.btn-adopt-nwp');
        const editNoteDisplay = trEdit.querySelector('.edit-note-display');

        const executeAdoptSplit = (sourceTr) => {
            const cellDataArr = Array.from(sourceTr.querySelectorAll('.col-time:not(.th-lead)')).map(c => c.textContent.trim().split(' ').filter(x => x && x !== '—'));
            const maxRows = Math.max(1, ...cellDataArr.map(arr => arr.length));

            let nTr = trEdit.nextElementSibling;
            while(nTr && nTr.classList.contains('tr-edit-extra') && nTr.dataset.icao === icao) {
                const delTr = nTr; nTr = nTr.nextElementSibling; delTr.remove();
            }

            const mainCells = trEdit.querySelectorAll('.edit-cell');
            for(let i=0; i<numCells; i++) {
                const val = cellDataArr[i][0] || '';
                mainCells[i].textContent = val;
                const style = getMultiCellStyle(val);
                mainCells[i].style.background = style.bg; mainCells[i].style.color = style.fg; mainCells[i].style.textShadow = style.ts;
            }

            let refTr = trEdit;
            for(let r=1; r<maxRows; r++) {
                const eTr = document.createElement('tr');
                eTr.className = `${gClass} tr-edit-extra`;
                eTr.dataset.confirmed = "false"; eTr.dataset.icao = icao;
                let eHtml = `
                    <td class="col-source" style="font-weight:bold; color:#1e40af; vertical-align:middle; font-size:11px; border-right:none;">附加</td>
                    <td class="col-op" style="padding:4px; position:relative; vertical-align:middle; border-left:none;">
                        <div class="edit-note-display" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:#1e40af; font-weight:bold; z-index:1;"></div>
                        <button class="hover-btn btn-delete-extra" style="background:#d97706; color:white; width:100%; border:none; padding:6px 0; border-radius:4px; font-weight:bold; font-size:11px;">删除</button>
                    </td>
                `;
                for(let i=0; i<numCells; i++) {
                    const val = cellDataArr[i][r] || '';
                    const style = getMultiCellStyle(val);
                    eHtml += `<td class="col-time td-data edit-cell data-cell-editable" data-c="${i}" style="${cellStyle} font-weight:bold; background:${style.bg}; color:${style.fg}; text-shadow:${style.ts};">${val}</td>`;
                }
                eTr.innerHTML = eHtml;
                refTr.insertAdjacentElement('afterend', eTr);
                refTr = eTr;
            }

            editNoteDisplay.textContent = sourceTr.querySelector('.col-op').dataset.note || '';
            updateRowActiveStyle(trEdit);
            updateTopCountersFromTable();
            if(window.updateAllRowspans) window.updateAllRowspans();
        };

        btnTaf.onclick = () => executeAdoptSplit(trTaf);
        btnNwp.onclick = () => executeAdoptSplit(trNwp);

        btnConfirm.onclick = () => {
            const allIcaoRows = Array.from(document.querySelectorAll(`tr[data-icao="${icao}"]`)).filter(r => r.classList.contains('tr-edit') || r.classList.contains('tr-edit-extra'));
            const cRows = [];
            const cNotes = [];
            let allClear = true;
            
            allIcaoRows.forEach(row => {
                const rowCells = [];
                row.querySelectorAll('.edit-cell').forEach(td => {
                    const txt = td.textContent.trim();
                    if (txt !== '') allClear = false;
                    rowCells.push({ text: txt, bg: td.style.background, fg: td.style.color, ts: td.style.textShadow });
                });
                cRows.push(rowCells);
                
                let note = '';
                const noteDisplay = row.querySelector('.edit-note-display');
                if (noteDisplay) note = noteDisplay.textContent.trim();
                else {
                    const noteInput = row.querySelector('.edit-note-input');
                    if (noteInput) note = noteInput.value.trim();
                }
                cNotes.push(note);
            });

            
            if (allClear) {
                let isAlwaysShow = false;
                pbState.airportGroups.forEach(g => { if(g.alwaysShow && g.airports.includes(icao)) isAlwaysShow = true; });
                if (!isAlwaysShow) {
                    removeAirportFromPublish(icao);
                    return;
                }
                cNotes[0] = "适航"; 
                for(let i=1; i<cNotes.length; i++) cNotes[i] = "";
                cRows.forEach(r => r.forEach(c => { c.text=""; c.bg="transparent"; c.fg="#1e293b"; c.ts="none"; }));
            } else {
                cNotes.forEach((n, idx) => { if (!n) cNotes[idx] = "/"; });
            }

            pbState.confirmedData[icao] = { rows: cRows, notes: cNotes };
            window.saveConfirmedDataToLocal();
            
            renderPublishTableTriRow(window.currentApAnalysis);
        };
    });
    
    table.appendChild(tbody);
    if(window.updateAllRowspans) window.updateAllRowspans();
    updateTopCountersFromTable(); 
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
    _cachedAirports = _cachedAirports.filter(a => a !== icao);
    if (Array.isArray(window.currentApAnalysis)) {
        window.currentApAnalysis = window.currentApAnalysis.filter(a => a.icao !== icao);
    }
    pbState.forceShowAirports.delete(icao);
    delete pbState.customCoords[icao];
    if (pbState.confirmedData[icao]) {
        delete pbState.confirmedData[icao];
        window.saveConfirmedDataToLocal();
    }
    renderPublishTableTriRow(window.currentApAnalysis || []);
}

function updateRowActiveStyle(tr) {
    if (!tr) return;
    let hasContent = false;
    tr.querySelectorAll('.edit-cell').forEach(td => {
        const txt = td.textContent.trim();
        if (txt !== '' && txt !== '—' && txt !== '适航') hasContent = true;
    });
    if (hasContent) {
        tr.style.backgroundColor = '';
        const apTd = tr.querySelector('.td-airport');
        const typeTd = tr.querySelector('td:nth-child(2)');
        if (apTd) apTd.style.color = '#1e293b'; 
        if (typeTd) typeTd.style.color = '#1e293b';
    }
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
      if (tr.dataset.confirmed !== "true") return;
      const icao = tr.dataset.icao;
      if (pbState.confirmedData[icao]) {
          const allIcaoRows = Array.from(document.querySelectorAll(`tr[data-icao="${icao}"]`)).filter(r => r.classList.contains('tr-edit') || r.classList.contains('tr-edit-extra'));
          const cRows = [];
          allIcaoRows.forEach(row => {
              const rowCells = [];
              row.querySelectorAll('.edit-cell').forEach(ctd => rowCells.push({ text: ctd.textContent, bg: ctd.style.background, fg: ctd.style.color, ts: ctd.style.textShadow }));
              cRows.push(rowCells);
          });
          pbState.confirmedData[icao].rows = cRows;
          window.saveConfirmedDataToLocal();
      }
  };

  document.addEventListener('keydown', e => {
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
                  const finalVal = inp.value.trim() || '';
                  selected.forEach(targetTd => {
                      targetTd.textContent = finalVal;
                      const style = getMultiCellStyle(finalVal);
                      targetTd.style.background = style.bg;
                      targetTd.style.color = style.fg;
                      targetTd.style.textShadow = style.ts;
                  });
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
          td.textContent = inp.value || '';
          const style = getMultiCellStyle(inp.value);
          td.style.background = style.bg;
          td.style.color = style.fg;
          td.style.textShadow = style.ts;
          
          updateRowActiveStyle(tr);
          saveConfirmedRowIfApplicable(tr);
          updateTopCountersFromTable(); 
      };
      inp.onkeydown = ev => { if(ev.key === 'Enter') inp.blur(); };
  });

  document.addEventListener('keydown', e => {
    // 🌟 修复复制粘贴 Bug 1：强制降级全平台支持的 execCommand 保证内网环境也能复制！
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel.r1 >= 0) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.isContentEditable)) return;
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
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.isContentEditable)) return;
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
        val = val.trim(); td.textContent = val || ''; 
        const style = getMultiCellStyle(val);
        td.style.background = style.bg; td.style.color = style.fg; td.style.textShadow = style.ts;
        affectedTrs.add(td.closest('tr'));
      });
    });
    
    affectedTrs.forEach(tr => {
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
          await loadForecastData(true);
          input.value = '';
      };
      soloBtn.onclick = async () => {
          const icao = input.value.trim().toUpperCase();
          if(icao.length !== 4) return alert("请输入4位ICAO");
          if (!window.AIRPORT_COORDS[icao]) return alert("坐标库中未收录此机场");
          
          pbState.customCoords[icao] = window.AIRPORT_COORDS[icao];
          pbState.forceShowAirports.add(icao);
          document.querySelectorAll('[data-region]').forEach(cb => cb.checked = false); 
          pbState.enabledRegions = {};
          
          await loadForecastData();
          input.value = '';
      };
  }

  if(restoreBtn) {
      restoreBtn.onclick = async () => {
          document.querySelectorAll('[data-region]').forEach(cb => { cb.checked = true; pbState.enabledRegions[cb.dataset.region] = true; });
          pbState.customCoords = {};
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

      // 已确认数据的撤销菜单只在备注列处理；这里处理未确认状态下的普通右键菜单。
      if (pbState.confirmedData[tr.dataset.icao] || e.target.closest('td.col-desc')) return;

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
              if(window.updateAllRowspans) window.updateAllRowspans();
          };
      }
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
  });

  table.addEventListener('click', e => {
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
          <td style="vertical-align:middle; border-right:2px solid #cbd5e1;">普通</td>
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
              <td class="col-source" style="font-weight:bold; color:#1e40af; vertical-align:middle; font-size:11px; border-right:none; cursor:pointer; user-select:none;">附加</td>
              <td class="col-op" style="padding:4px; position:relative; vertical-align:middle; border-left:none;">
                  <div class="edit-note-display" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:#1e40af; font-weight:bold; z-index:1;"></div>
                  <button class="hover-btn btn-delete-extra" style="background:#d97706; color:white; width:100%; border:none; padding:6px 0; border-radius:4px; font-weight:bold; font-size:11px;">删除</button>
              </td>
          `;
      } else {
           opCell = `<td colspan="2" class="col-desc" style="padding:4px;" title="右键唤出撤销菜单"><input type="text" class="edit-note-input" style="width:100%; height:100%; min-height:26px; border:1px solid #ccc; border-radius:4px; text-align:center; font-size:11px; font-weight:bold; color:#1e40af; background:transparent;"></td>`;
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
      
      if(window.updateAllRowspans) window.updateAllRowspans();
  });

}