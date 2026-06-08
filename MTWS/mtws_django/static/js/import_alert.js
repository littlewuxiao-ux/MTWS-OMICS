// ============================================================
// 报文入库异常告警模块（实况 METAR + 预报 TAF）
// 依赖：main.js 中的全局变量 importAlerts / alertedAirports /
//       importAlertUnhandledCount / currentTimeMode / currentToken
// ============================================================

// ============================================================
// CSS 注入
// ============================================================
(function injectImportAlertStyles() {
    const style = document.createElement('style');
    style.id = 'import-alert-styles';
    style.textContent = `
/* 过期实况 weather-info 红色斜线背景 */
.weather-info.import-alerted {
    position: relative;
}
.weather-info.import-alerted::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
        135deg,
        transparent 0px,
        transparent 8px,
        rgba(255, 0, 0, 0.3) 8px,
        rgba(255, 0, 0, 0.3) 16px
    );
    pointer-events: none;
    z-index: 0;
}
.weather-info.import-alerted .weather-info-container {
    position: relative;
    z-index: 1;
}

/* TAF入库告警 forecast-row 红色斜线背景 */
.forecast-row.taf-import-alerted {
    position: relative;
}
.forecast-row.taf-import-alerted::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
        135deg,
        transparent 0px,
        transparent 8px,
        rgba(255, 0, 0, 0.3) 8px,
        rgba(255, 0, 0, 0.3) 16px
    );
    pointer-events: none;
    z-index: 2;
}

/* 悬浮按钮 */
#import-alert-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #2c3e50;
    color: #fff;
    border-radius: 24px;
    cursor: pointer;
    z-index: 5000;
    box-shadow: 0 3px 10px rgba(0,0,0,0.4);
    user-select: none;
    white-space: nowrap;
    font-size: 13px;
    transition: box-shadow 0.2s;
}
#import-alert-btn:hover { box-shadow: 0 5px 16px rgba(0,0,0,0.5); }
.ia-badge-group { display: flex; align-items: center; gap: 4px; }
.ia-badge {
    background: red;
    color: #fff;
    border-radius: 10px;
    min-width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    padding: 0 5px;
}
.ia-badge-label {
    font-size: 10px;
    opacity: 0.85;
}
.ia-badge-sep {
    opacity: 0.5;
    font-size: 11px;
}

/* 告警面板 */
#import-alert-panel {
    position: fixed;
    bottom: 64px;
    left: 20px;
    width: 520px;
    max-height: 560px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.25);
    z-index: 5000;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
#import-alert-panel.open { display: flex; }

.ia-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #2c3e50;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
    flex-shrink: 0;
}
.ia-panel-close {
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    opacity: 0.8;
}
.ia-panel-close:hover { opacity: 1; }

/* Tab 切换器 */
.ia-tab-bar {
    display: flex;
    flex-shrink: 0;
    background: #e8ecf0;
    border-bottom: 1px solid #ccc;
    overflow: hidden;
}
.ia-tab {
    flex: 1;
    padding: 7px 0;
    text-align: center;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
    user-select: none;
    border-right: 1px solid #ccc;
}
.ia-tab:last-child { border-right: none; }
.ia-tab:hover { background: #dde3e9; }
.ia-tab.active {
    background: #fff;
    color: #2c3e50;
    border-bottom: 2px solid #2c3e50;
    margin-bottom: -1px;
}

/* 表格头 */
.ia-table-head {
    display: grid;
    grid-template-columns: 60px 50px 88px 72px 72px 1fr;
    gap: 4px;
    padding: 6px 10px;
    background: #f0f2f5;
    border-bottom: 1px solid #ddd;
    font-size: 12px;
    font-weight: bold;
    color: #555;
    flex-shrink: 0;
}

/* 告警列表滚动区 */
.ia-list {
    overflow-y: auto;
    flex: 1;
}

/* 每条告警 */
.ia-row {
    border-bottom: 1px solid #eee;
}
.ia-row-main {
    display: grid;
    grid-template-columns: 60px 50px 88px 72px 72px 1fr;
    gap: 4px;
    padding: 6px 10px;
    align-items: center;
    font-size: 12px;
}
.ia-row-main:hover { background: #fafafa; }
.ia-row.unhandled .ia-row-main { background: #fffbe6; }
.ia-row.unhandled .ia-row-main:hover { background: #fff8d6; }

.ia-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ia-red { color: red; font-weight: bold; }
.ia-handle-btn {
    color: #555;
    cursor: default;
    border-radius: 3px;
    padding: 2px 6px;
    transition: background 0.15s, color 0.15s;
}
.ia-handle-btn.hovering {
    background: #c0392b;
    color: #fff;
    font-weight: bold;
    cursor: pointer;
}
.ia-handle-time { color: #888; cursor: pointer; font-size: 11px; }
.ia-handle-time:hover { text-decoration: underline; }

/* 展开的处理选项区 */
.ia-expand {
    padding: 8px 14px 10px 14px;
    background: #f9f9f9;
    border-top: 1px dashed #ddd;
    font-size: 12px;
}
.ia-expand-options {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 8px;
}
.ia-expand-options label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
}
.ia-confirm-btn {
    padding: 4px 16px;
    border: none;
    border-radius: 4px;
    background: #bbb;
    color: #fff;
    cursor: not-allowed;
    font-size: 12px;
    transition: background 0.15s;
}
.ia-confirm-btn.active {
    background: #27ae60;
    cursor: pointer;
}
.ia-confirm-btn.active:hover { background: #219a52; }

/* 只读处理详情 */
.ia-detail-expand {
    padding: 6px 14px 8px 14px;
    background: #f0f8ff;
    border-top: 1px dashed #b3d9f7;
    font-size: 12px;
    color: #444;
}

/* 分页 */
.ia-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    background: #f0f2f5;
    border-top: 1px solid #ddd;
    flex-shrink: 0;
    font-size: 12px;
}
.ia-page-btn {
    padding: 2px 8px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
}
.ia-page-btn:hover { background: #e8e8e8; }
.ia-page-btn.current { background: #2c3e50; color: #fff; border-color: #2c3e50; cursor: default; }
.ia-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
`;
    document.head.appendChild(style);
})();

// ============================================================
// 模块状态：TAF 专用（METAR 状态在 main.js 中定义）
// ============================================================
let tafAlerts = [];
let tafAlertedAirports = new Set();
let tafAlertUnhandledCount = 0;
let tafAlertCurrentPage = 1;
let tafAlertTotalPages = 1;
let tafAlertExpandedId = null;
let tafAlertDetailOpenId = null;

// 当前激活的 Tab：'metar' | 'taf'
let currentAlertTab = 'metar';

// ============================================================
// 辅助：生成 weather-info div（供 main.js 的 buildWeatherInfoDiv 调用）
// ============================================================
function buildWeatherInfoDiv(airportCode, latestMetar) {
    const isAlerted = typeof alertedAirports !== 'undefined' && alertedAirports.has(airportCode);
    const alertClass = isAlerted ? ' import-alerted' : '';
    const alertTitle = isAlerted ? ' title="【过期实况数据，注意提醒】"' : '';
    const styleAttr = latestMetar ? getWeatherInfoStyle(latestMetar) : '';
    const inner = latestMetar
        ? createWeatherInfo(latestMetar)
        : '<div class="no-data">无METAR数据</div>';
    return `<div class="weather-info${alertClass}"${alertTitle} ${styleAttr}>${inner}</div>`;
}

// ============================================================
// 从已加载的 metar 数据同步 METAR 告警状态（由 main.js 调用）
// ============================================================
function syncAlertStateFromMetarData(airports) {
    alertedAirports = new Set();
    importAlertUnhandledCount = 0;

    (airports || []).forEach(airport => {
        const metar = airport.metar_data && airport.metar_data[0];
        if (!metar || metar.import_alert !== 'Y') return;
        alertedAirports.add(airport.airport_4code);
        if (!metar.import_alert_handle_time) importAlertUnhandledCount++;
    });

    _updateAlertBadge();
}

// ============================================================
// 从已加载的 taf 数据同步 TAF 告警状态（由 main.js 调用）
// ============================================================
function syncAlertStateFromTafData(airports) {
    tafAlertedAirports = new Set();
    tafAlertUnhandledCount = 0;

    (airports || []).forEach(airport => {
        const taf = airport.taf_data && airport.taf_data[0];
        if (!taf || taf.import_alert !== 'Y') return;
        tafAlertedAirports.add(airport.airport_4code);
        if (!taf.import_alert_handle_time) tafAlertUnhandledCount++;
    });

    _updateAlertBadge();
}

// ============================================================
// 徽章更新：在按钮上显示 METAR 和 TAF 各自的未处理计数
// ============================================================
function _updateAlertBadge() {
    const badgeMetar = document.getElementById('ia-badge-metar');
    const badgeTaf = document.getElementById('ia-badge-taf');
    if (badgeMetar) badgeMetar.textContent = importAlertUnhandledCount;
    if (badgeTaf) badgeTaf.textContent = tafAlertUnhandledCount;

    // 根据数量控制各分组显隐
    const showMetar = importAlertUnhandledCount > 0;
    const showTaf = tafAlertUnhandledCount > 0;
    const metarGroup = document.getElementById('ia-badge-metar-group');
    const tafGroup = document.getElementById('ia-badge-taf-group');
    const sep = document.getElementById('ia-badge-sep');
    const badgeGroup = document.getElementById('ia-badge-group');
    if (metarGroup) metarGroup.style.display = showMetar ? '' : 'none';
    if (tafGroup) tafGroup.style.display = showTaf ? '' : 'none';
    if (sep) sep.style.display = (showMetar && showTaf) ? '' : 'none';
    if (badgeGroup) badgeGroup.style.display = (showMetar || showTaf) ? '' : 'none';

    // 更新 Tab 标签上的计数
    const tabMetar = document.getElementById('ia-tab-metar');
    const tabTaf = document.getElementById('ia-tab-taf');
    if (tabMetar) tabMetar.textContent = `实况 METAR${importAlertUnhandledCount > 0 ? ' (' + importAlertUnhandledCount + ')' : ''}`;
    if (tabTaf) tabTaf.textContent = `预报 TAF${tafAlertUnhandledCount > 0 ? ' (' + tafAlertUnhandledCount + ')' : ''}`;
}

// ============================================================
// 数据拉取 — METAR
// ============================================================
function fetchImportAlerts(page) {
    page = page || importAlertCurrentPage || 1;
    const headers = _authHeaders();
    fetch(`/${currentTimeMode}/api/import-alerts/?page=${page}`, { headers })
        .then(r => r.json())
        .then(data => {
            if (!data.success) { _renderAlertPanel(); return; }
            importAlerts = data.alerts || [];
            importAlertCurrentPage = data.current_page || 1;
            importAlertTotalPages = data.total_pages || 1;
            _renderAlertPanel();
        })
        .catch(err => console.error('fetchImportAlerts 失败:', err));
}

// ============================================================
// 数据拉取 — TAF
// ============================================================
function fetchTafImportAlerts(page) {
    page = page || tafAlertCurrentPage || 1;
    const headers = _authHeaders();
    fetch(`/${currentTimeMode}/api/taf-import-alerts/?page=${page}`, { headers })
        .then(r => r.json())
        .then(data => {
            if (!data.success) { _renderAlertPanel(); return; }
            tafAlerts = data.alerts || [];
            tafAlertCurrentPage = data.current_page || 1;
            tafAlertTotalPages = data.total_pages || 1;
            _renderAlertPanel();
        })
        .catch(err => console.error('fetchTafImportAlerts 失败:', err));
}

// ============================================================
// 悬浮按钮与面板初始化
// ============================================================
function _initImportAlertBtn() {
    if (document.getElementById('import-alert-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'import-alert-btn';
    btn.innerHTML = `
        <span>&#9888; 报文入库告警</span>
        <span class="ia-badge-group" id="ia-badge-group" style="display:none">
            <span id="ia-badge-metar-group" style="display:none">
                <span class="ia-badge-label">实况</span>
                <span class="ia-badge" id="ia-badge-metar">0</span>
            </span>
            <span class="ia-badge-sep" id="ia-badge-sep" style="display:none">|</span>
            <span id="ia-badge-taf-group" style="display:none">
                <span class="ia-badge-label">预报</span>
                <span class="ia-badge" id="ia-badge-taf">0</span>
            </span>
        </span>
    `;
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'import-alert-panel';
    panel.innerHTML = `
        <div class="ia-panel-header">
            <span>&#9888; 报文入库告警详情</span>
            <span class="ia-panel-close" id="ia-panel-close">&#x2715;</span>
        </div>
        <div class="ia-tab-bar">
            <div class="ia-tab active" id="ia-tab-metar">实况 METAR</div>
            <div class="ia-tab" id="ia-tab-taf">预报 TAF</div>
        </div>
        <div class="ia-table-head" id="ia-table-head">
            <span>机场</span>
            <span>类型</span>
            <span>告警时间</span>
            <span style="color:red">发布间隔</span>
            <span style="color:red">入库间隔</span>
            <span>处理结果</span>
        </div>
        <div class="ia-list" id="ia-list"></div>
        <div class="ia-pagination" id="ia-pagination"></div>
    `;
    document.body.appendChild(panel);

    // Tab 切换
    document.getElementById('ia-tab-metar').addEventListener('click', function () {
        _switchTab('metar');
    });
    document.getElementById('ia-tab-taf').addEventListener('click', function () {
        _switchTab('taf');
    });

    // 按钮点击：切换面板，并确定默认 Tab
    btn.addEventListener('click', function (e) {
        if (_dragged) { _dragged = false; return; }
        const isOpen = panel.classList.contains('open');
        if (!isOpen) {
            // 决定默认 Tab
            const tafHasUnhandled = tafAlertUnhandledCount > 0;
            const metarHasUnhandled = importAlertUnhandledCount > 0;
            const defaultTab = (tafHasUnhandled && !metarHasUnhandled) ? 'taf' : 'metar';
            _switchTab(defaultTab, false); // false = 不重新拉取，下面统一拉
            panel.classList.add('open');
            _fetchCurrentTab();
        } else {
            panel.classList.remove('open');
        }
    });

    document.getElementById('ia-panel-close').addEventListener('click', function () {
        panel.classList.remove('open');
    });

    document.addEventListener('click', function (e) {
        if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    _makeDraggable(btn);
}

function _switchTab(tab, fetchData) {
    currentAlertTab = tab;
    // 重置展开状态
    importAlertExpandedId = null;
    importAlertDetailOpenId = null;
    tafAlertExpandedId = null;
    tafAlertDetailOpenId = null;

    const tabMetar = document.getElementById('ia-tab-metar');
    const tabTaf = document.getElementById('ia-tab-taf');
    if (tabMetar) tabMetar.classList.toggle('active', tab === 'metar');
    if (tabTaf) tabTaf.classList.toggle('active', tab === 'taf');

    if (fetchData !== false) {
        _fetchCurrentTab();
    }
}

function _fetchCurrentTab() {
    if (currentAlertTab === 'taf') {
        fetchTafImportAlerts(tafAlertCurrentPage);
    } else {
        fetchImportAlerts(importAlertCurrentPage);
    }
}

// ============================================================
// 拖动逻辑
// ============================================================
let _dragged = false;
function _makeDraggable(el) {
    let isDragging = false;
    let startX, startY, origLeft, origBottom;

    el.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origLeft = rect.left;
        origBottom = window.innerHeight - rect.bottom;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragged = true;
        const newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, origLeft + dx));
        const newBottom = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, origBottom - dy));
        el.style.left = newLeft + 'px';
        el.style.bottom = newBottom + 'px';
        el.style.right = 'auto';
        const panel = document.getElementById('import-alert-panel');
        if (panel) {
            panel.style.left = newLeft + 'px';
            panel.style.bottom = (newBottom + el.offsetHeight + 4) + 'px';
            panel.style.right = 'auto';
        }
    });

    document.addEventListener('mouseup', function () {
        isDragging = false;
    });
}

// ============================================================
// 面板渲染（根据当前 Tab 路由）
// ============================================================
function _renderAlertPanel() {
    if (currentAlertTab === 'taf') {
        _renderTafAlertPanel();
    } else {
        _renderMetarAlertPanel();
    }
}

// --- METAR 面板渲染 ---
function _renderMetarAlertPanel() {
    const list = document.getElementById('ia-list');
    const pag = document.getElementById('ia-pagination');
    if (!list || !pag) return;

    if (importAlerts.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">暂无实况告警记录</div>';
        pag.innerHTML = '';
        return;
    }

    list.innerHTML = importAlerts.map(a => _renderAlertRow(a)).join('');
    _renderPagination(pag, importAlertCurrentPage, importAlertTotalPages, 'metar');
    _bindRowEvents(list);
}

// --- TAF 面板渲染 ---
function _renderTafAlertPanel() {
    const list = document.getElementById('ia-list');
    const pag = document.getElementById('ia-pagination');
    if (!list || !pag) return;

    if (tafAlerts.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">暂无预报告警记录</div>';
        pag.innerHTML = '';
        return;
    }

    list.innerHTML = tafAlerts.map(a => _renderTafAlertRow(a)).join('');
    _renderPagination(pag, tafAlertCurrentPage, tafAlertTotalPages, 'taf');
    _bindRowEvents(list);
}

// ============================================================
// METAR 行渲染
// ============================================================
function _renderAlertRow(a) {
    const isUnhandled = !a.import_alert_handle_time;
    const rowClass = isUnhandled ? 'unhandled' : '';
    const rowKey = btoa(unescape(encodeURIComponent(a.sqc)));

    const alertTimeStr = _fmtTs(a.import_alert_time);
    const refTime = isUnhandled ? null : a.import_alert_handle_time;
    const pubInterval = _intervalMinRef(a.metar_observation_time, refTime);
    const inbInterval = _intervalMinRef(a.created_at, refTime);

    const handleCell = _buildHandleCell(a, rowKey, isUnhandled, 'metar');
    const expandHtml = _renderExpandSection(a, rowKey, 'metar');

    return `
<div class="ia-row ${rowClass}" id="ia-row-${rowKey}">
    <div class="ia-row-main">
        <span class="ia-cell">${a.airport_4code}</span>
        <span class="ia-cell">${a.metar_type || '—'}</span>
        <span class="ia-cell" style="font-size:11px">${alertTimeStr}</span>
        <span class="ia-cell ia-red">${_formatInterval(pubInterval)}</span>
        <span class="ia-cell ia-red">${_formatInterval(inbInterval)}</span>
        <span class="ia-cell">${handleCell}</span>
    </div>
    ${expandHtml}
</div>`;
}

// ============================================================
// TAF 行渲染
// ============================================================
function _renderTafAlertRow(a) {
    const isUnhandled = !a.import_alert_handle_time;
    const rowClass = isUnhandled ? 'unhandled' : '';
    const rowKey = btoa(unescape(encodeURIComponent(a.sqc)));

    const alertTimeStr = _fmtTs(a.import_alert_time);
    const refTime = isUnhandled ? null : a.import_alert_handle_time;
    const pubInterval = _intervalMinRef(a.taf_observation_time, refTime);
    const inbInterval = _intervalMinRef(a.created_at, refTime);

    const handleCell = _buildHandleCell(a, rowKey, isUnhandled, 'taf');
    const expandHtml = _renderExpandSection(a, rowKey, 'taf');

    return `
<div class="ia-row ${rowClass}" id="ia-row-${rowKey}">
    <div class="ia-row-main">
        <span class="ia-cell">${a.airport_4code}</span>
        <span class="ia-cell">${a.taf_type || '—'}</span>
        <span class="ia-cell" style="font-size:11px">${alertTimeStr}</span>
        <span class="ia-cell ia-red">${_formatInterval(pubInterval)}</span>
        <span class="ia-cell ia-red">${_formatInterval(inbInterval)}</span>
        <span class="ia-cell">${handleCell}</span>
    </div>
    ${expandHtml}
</div>`;
}

// ============================================================
// 公用：构建处理结果单元格
// ============================================================
function _buildHandleCell(a, rowKey, isUnhandled, tab) {
    if (isUnhandled) {
        return `<span class="ia-handle-btn" data-sqc="${a.sqc}"
            onmouseenter="this.classList.add('hovering');this.textContent='去处理'"
            onmouseleave="this.classList.remove('hovering');this.textContent='未处理'"
            onclick="_onClickHandle('${rowKey}','${tab}')">未处理</span>`;
    }
    const handleTimeStr = _fmtTs(a.import_alert_handle_time);
    return `<span class="ia-handle-time" onclick="_onClickHandleTime('${rowKey}','${tab}')"
        title="点击查看处理详情">${handleTimeStr}</span>`;
}

// ============================================================
// 公用：展开区域（操作 or 只读详情）
// ============================================================
function _renderExpandSection(a, rowKey, tab) {
    const isUnhandled = !a.import_alert_handle_time;

    if (!isUnhandled) {
        return `<div class="ia-detail-expand" id="ia-detail-${rowKey}" style="display:none">
            处理结果：${a.handle_status || ''}
        </div>`;
    }

    return `<div class="ia-expand" id="ia-expand-${rowKey}" style="display:none">
        <div class="ia-expand-options">
            <label><input type="checkbox" name="opt_${rowKey}" value="评估无影响"> 评估无影响</label>
            <label><input type="checkbox" name="opt_${rowKey}" value="通知签派"> 通知签派</label>
            <label><input type="checkbox" name="opt_${rowKey}" value="维护报文" data-mutex="维护报文"> 维护报文</label>
            <label><input type="checkbox" name="opt_${rowKey}" value="其他官方途径未查询到报文" data-mutex="维护报文"> 其他官方途径未查询到报文</label>
        </div>
        <button class="ia-confirm-btn" id="ia-confirm-${rowKey}" disabled
            onclick="_onConfirm('${rowKey}','${a.sqc}','${tab}')">确认</button>
    </div>`;
}

// ============================================================
// 分页渲染（参数化）
// ============================================================
function _renderPagination(container, currentPage, totalPages, tab) {
    if (totalPages <= 1) {
        const count = tab === 'taf' ? tafAlerts.length : importAlerts.length;
        container.innerHTML = `<span style="color:#999">共 ${count} 条</span>`;
        return;
    }
    const fetchFn = tab === 'taf' ? 'fetchTafImportAlerts' : 'fetchImportAlerts';
    let html = '';
    html += `<button class="ia-page-btn" ${currentPage <= 1 ? 'disabled' : ''}
        onclick="${fetchFn}(${currentPage - 1})">&#8249;</button>`;
    for (let p = 1; p <= totalPages; p++) {
        const cls = p === currentPage ? 'current' : '';
        html += `<button class="ia-page-btn ${cls}" onclick="${fetchFn}(${p})">${p}</button>`;
    }
    html += `<button class="ia-page-btn" ${currentPage >= totalPages ? 'disabled' : ''}
        onclick="${fetchFn}(${currentPage + 1})">&#8250;</button>`;
    container.innerHTML = html;
}

// ============================================================
// 行事件绑定（checkbox change）
// ============================================================
function _bindRowEvents(list) {
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', function () {
            const rowKey = this.name.replace('opt_', '');
            _handleCheckboxChange(rowKey, this);
        });
    });
}

function _handleCheckboxChange(rowKey, changedCb) {
    if (changedCb.checked && changedCb.dataset.mutex) {
        const mutexVal = changedCb.dataset.mutex;
        const container = document.getElementById(`ia-expand-${rowKey}`);
        if (container) {
            container.querySelectorAll(`input[data-mutex="${mutexVal}"]`).forEach(other => {
                if (other !== changedCb) other.checked = false;
            });
        }
    }
    _updateConfirmBtn(rowKey);
}

function _updateConfirmBtn(rowKey) {
    const container = document.getElementById(`ia-expand-${rowKey}`);
    const btn = document.getElementById(`ia-confirm-${rowKey}`);
    if (!container || !btn) return;
    const anyChecked = Array.from(
        container.querySelectorAll('input[type=checkbox]')
    ).some(cb => cb.checked);
    btn.disabled = !anyChecked;
    btn.classList.toggle('active', anyChecked);
}

// ============================================================
// 点击"去处理"：展开操作区
// ============================================================
function _onClickHandle(rowKey, tab) {
    tab = tab || currentAlertTab;
    const expandedRef = tab === 'taf' ? 'tafAlertExpandedId' : 'importAlertExpandedId';

    const prevId = tab === 'taf' ? tafAlertExpandedId : importAlertExpandedId;
    if (prevId && prevId !== rowKey) {
        const prev = document.getElementById(`ia-expand-${prevId}`);
        if (prev) prev.style.display = 'none';
    }
    const expand = document.getElementById(`ia-expand-${rowKey}`);
    if (!expand) return;
    const isOpen = expand.style.display !== 'none';
    expand.style.display = isOpen ? 'none' : 'block';
    const newId = isOpen ? null : rowKey;
    if (tab === 'taf') tafAlertExpandedId = newId;
    else importAlertExpandedId = newId;
}

// ============================================================
// 点击已处理时间：展开/收起只读详情
// ============================================================
function _onClickHandleTime(rowKey, tab) {
    tab = tab || currentAlertTab;
    const prevId = tab === 'taf' ? tafAlertDetailOpenId : importAlertDetailOpenId;
    if (prevId && prevId !== rowKey) {
        const prev = document.getElementById(`ia-detail-${prevId}`);
        if (prev) prev.style.display = 'none';
    }
    const detail = document.getElementById(`ia-detail-${rowKey}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    const newId = isOpen ? null : rowKey;
    if (tab === 'taf') tafAlertDetailOpenId = newId;
    else importAlertDetailOpenId = newId;
}

// ============================================================
// 点击"确认"按钮：提交处理结果
// ============================================================
function _onConfirm(rowKey, sqc, tab) {
    tab = tab || currentAlertTab;
    const container = document.getElementById(`ia-expand-${rowKey}`);
    if (!container) return;
    const checked = Array.from(
        container.querySelectorAll('input[type=checkbox]:checked')
    ).map(cb => cb.value);
    if (checked.length === 0) return;

    const handleTime = Date.now();
    const handleStatus = checked.join('、');
    const endpoint = tab === 'taf' ? 'taf-import-alerts' : 'import-alerts';

    const headers = { 'Content-Type': 'application/json', ..._authHeaders() };
    fetch(`/${currentTimeMode}/api/${endpoint}/handle/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sqc: sqc, import_alert_handle_time: handleTime, handle_status: handleStatus }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            container.style.display = 'none';
            if (tab === 'taf') {
                tafAlertExpandedId = null;
                fetchTafImportAlerts(tafAlertCurrentPage);
            } else {
                importAlertExpandedId = null;
                fetchImportAlerts(importAlertCurrentPage);
            }
            if (typeof applyFilters === 'function') applyFilters();
        }
    })
    .catch(() => {});
}

// ============================================================
// 工具函数
// ============================================================
function _authHeaders() {
    if (typeof currentTimeMode !== 'undefined' && currentTimeMode === 'current'
            && typeof currentToken !== 'undefined' && currentToken) {
        return { 'Authorization': `Bearer ${currentToken}` };
    }
    return {};
}

/**
 * 毫秒 UTC 时间戳（数字或字符串均可）→ 时间字符串。
 * 跟随 window.displayTimezone：
 *   'UTC' → 显示 UTC 时间并附加 " UTC" 后缀
 *   其他  → 显示 CST（UTC+8）时间
 */
function _fmtTs(ts) {
    if (!ts) return '--';
    try {
        const num = Number(ts);
        if (isNaN(num)) return '--';
        const pad = n => String(n).padStart(2, '0');
        if (window.displayTimezone === 'UTC') {
            const d = new Date(num);
            return `${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} `
                 + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
        }
        // CST = UTC+8，通过偏移后用 UTC 方法取值，避免依赖浏览器本地时区
        const cst = new Date(num + 8 * 3600 * 1000);
        return `${pad(cst.getUTCMonth()+1)}-${pad(cst.getUTCDate())} `
             + `${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}:${pad(cst.getUTCSeconds())}`;
    } catch (e) { return '--'; }
}

/**
 * 将分钟数转换为"X天X小时X分钟"复合格式。
 * 规则：首位（前导）单位为0时省略；末位（结尾）单位为0时省略；
 * 中间单位（如天>0且分钟>0时小时为0）不省略。
 * 特殊值 '--' 原样返回，全为0时返回 '0分钟'。
 */
function _formatInterval(minStr) {
    if (minStr === '--' || minStr === null || minStr === undefined) return '--';
    const totalMin = parseInt(minStr, 10);
    if (isNaN(totalMin) || totalMin < 0) return '--';

    const days  = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins  = totalMin % 60;

    const parts = [
        { value: days,  unit: '天' },
        { value: hours, unit: '小时' },
        { value: mins,  unit: '分钟' },
    ];

    let first = -1, last = -1;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].value !== 0) {
            if (first === -1) first = i;
            last = i;
        }
    }

    if (first === -1) return '0分钟';

    let result = '';
    for (let i = first; i <= last; i++) {
        result += `${parts[i].value}${parts[i].unit}`;
    }
    return result;
}

/** 毫秒时间戳距现在的分钟数（向上取整，接受数字或字符串） */
function _intervalMin(ts) {
    if (!ts) return '--';
    const num = Number(ts);
    if (isNaN(num)) return '--';
    const diff = Date.now() - num;
    if (diff <= 0) return '0';
    return String(Math.ceil(diff / 60000));
}

/**
 * 毫秒时间戳距指定参考时间点的分钟数（向上取整）。
 * refTs 为参考时间戳（毫秒），缺省时回退到 Date.now()。
 * 用于已处理告警：以处理时刻为参考点，展示当时的滞后时长。
 */
function _intervalMinRef(ts, refTs) {
    if (!ts) return '--';
    const num = Number(ts);
    if (isNaN(num)) return '--';
    const ref = refTs ? Number(refTs) : Date.now();
    const diff = (isNaN(ref) ? Date.now() : ref) - num;
    if (diff <= 0) return '0';
    return String(Math.ceil(diff / 60000));
}

// ============================================================
// 启动
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
        _initImportAlertBtn();
    }, 1000);
});
