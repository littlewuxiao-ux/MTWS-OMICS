// ============================================================
// main_flight.js — 航班渲染相关函数
// 依赖 main.js 中的全局变量和工具函数：
//   currentTimeRange, currentCarriers, airportData, filters,
//   getAlertColor(), getSelectedAlertMargin(), getCurrentTime()
// ============================================================

window.flightMarksPastExpanded = window.flightMarksPastExpanded || false;

// 主页固定为 marks。格点式恢复：① isFlightMarksMode 改回认 ?flight=marks 与 flight_marks 权限
// ② flight_parser 热路径恢复 _calculate_airport_statistics + _build_time_slots
// ③ api/views 概览改回 AlertCalculator.calculate_airport_alerts（格子着色）
function isFlightMarksMode() {
    return true;
}

function setFlightMarksMode(enabled) {
    try {
        const url = new URL(window.location.href);
        if (enabled) url.searchParams.set('flight', 'marks');
        else url.searchParams.delete('flight');
        window.history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
    document.body.classList.toggle('flight-marks-mode', !!enabled);
    if (!enabled) {
        window.flightMarksPastExpanded = false;
        document.body.classList.remove('flight-marks-past-open');
        hideFlightMarksLegend();
    } else {
        ensureFlightMarksLegend();
    }
}

function syncFlightMarksBodyClass() {
    const on = isFlightMarksMode();
    document.body.classList.toggle('flight-marks-mode', on);
    document.body.classList.toggle('flight-marks-past-open', on && !!window.flightMarksPastExpanded);
    if (on) {
        syncFlightMarksCssVars();
        ensureFlightMarksLegend();
    } else {
        removeFlightPastHandleFloat();
        hideFlightMarksLegend();
    }
}

/** 分钟精度的当前时刻 */
function getMarksNowMs() {
    const t = (typeof getCurrentTime === 'function') ? getCurrentTime() : new Date();
    const d = new Date(t.getTime());
    d.setSeconds(0, 0);
    return d.getTime();
}

window.detailMarksPastExpanded = true;
window.searchMarksPastByCode = window.searchMarksPastByCode || Object.create(null);

function marksScopeFromElement(el) {
    if (!el || !el.closest) return 'home';
    const block = el.closest('.airport-search-block');
    if (block && block.dataset.code) {
        return 'search:' + String(block.dataset.code).toUpperCase();
    }
    if (el.closest('#airport-detail-modal')) return 'detail';
    return 'home';
}

function getMarksPastExpanded(scope) {
    const s = scope || window._marksRenderScope || 'home';
    if (s === 'detail') return window.detailMarksPastExpanded !== false;
    if (typeof s === 'string' && s.indexOf('search:') === 0) {
        const v = window.searchMarksPastByCode[s.slice(7)];
        return v !== false;
    }
    return !!window.flightMarksPastExpanded;
}

function syncMarksPastOpenClass(scope) {
    const on = getMarksPastExpanded(scope);
    if (!scope || scope === 'home') {
        document.body.classList.toggle('flight-marks-past-open', isFlightMarksMode() && on);
        return;
    }
    if (scope === 'detail') {
        const modal = document.getElementById('airport-detail-modal');
        if (modal) modal.classList.toggle('flight-marks-past-open', on);
        return;
    }
    if (scope.indexOf('search:') === 0) {
        const code = scope.slice(7);
        const block = document.querySelector(`.airport-search-block[data-code="${code}"]`);
        if (block) block.classList.toggle('flight-marks-past-open', on);
    }
}

function setMarksPastExpanded(scope, value) {
    if (scope === 'detail') {
        window.detailMarksPastExpanded = !!value;
    } else if (scope && scope.indexOf('search:') === 0) {
        window.searchMarksPastByCode[scope.slice(7)] = !!value;
    } else {
        window.flightMarksPastExpanded = !!value;
    }
    syncMarksPastOpenClass(scope);
}

function withMarksRenderScope(scope, fn) {
    const prev = window._marksRenderScope;
    window._marksRenderScope = scope || 'home';
    try {
        return fn();
    } finally {
        window._marksRenderScope = prev;
    }
}

function withMarksIncludePast(enabled, fn) {
    return withMarksRenderScope(enabled ? 'detail' : 'home', fn);
}

function marksWindowIncludesPast() {
    return getMarksPastExpanded(window._marksRenderScope || 'home');
}

/** marks 可见窗口起点（折叠=now，展开=now-2h） */
function getMarksWindowStartMs() {
    const now = getMarksNowMs();
    return marksWindowIncludesPast() ? (now - 2 * 3600000) : now;
}

function getMarksWindowDurationMs() {
    const hours = (typeof currentTimeRange !== 'undefined') ? currentTimeRange : 36;
    return hours * 3600000;
}

function marksMsToLeftPercent(ms) {
    const start = getMarksWindowStartMs();
    const dur = getMarksWindowDurationMs();
    if (!dur) return 0;
    return ((ms - start) / dur) * 100;
}

function marksEventWarning(event) {
    const w = event && event.warning;
    const m = (typeof getSelectedAlertMargin === 'function') ? getSelectedAlertMargin() : 2;
    if (Array.isArray(w)) {
        const lv = w[m];
        return (lv && lv !== '') ? lv : 'N';
    }
    return w || 'N';
}

/** 竖线：地面白、空中黑；oar/oen/odp 同一套超时闪 */
function marksTickClass(event) {
    const kind = event && event.kind;
    if (kind === 'oar' || kind === 'oen' || kind === 'odp') return ' flight-mark-tick-overdue';
    if (kind === 'enr' || kind === 'off') return ' flight-mark-tick-air';
    return '';
}

function marksWarningColor(level) {
    const lv = level || 'N';
    if (typeof getAlertColor === 'function') return getAlertColor(lv);
    return 'rgba(149, 165, 166, 0.8)';
}

function marksWarningRank(level) {
    return ({ R: 4, Y: 3, G: 2, N: 1 }[level] || 1);
}

function _marksEscHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMarksTooltipTime(v) {
    if (v == null || v === '') return '--';
    const n = Number(v);
    if (!Number.isFinite(n)) return '--';
    try {
        const d = new Date(n);
        const utc = window.displayTimezone === 'UTC';
        const day = utc ? d.getUTCDate() : d.getDate();
        const hh = String(utc ? d.getUTCHours() : d.getHours()).padStart(2, '0');
        const mm = String(utc ? d.getUTCMinutes() : d.getMinutes()).padStart(2, '0');
        return `${day}日 ${hh}:${mm}`;
    } catch (e) {
        return '--';
    }
}

function marksTooltipPayload(ev, track) {
    const o = ev.other || {};
    const kind = ev && ev.kind;
    const isDep = track === 'dep'
        || kind === 'dep' || kind === 'off' || kind === 'odp' || kind === 'dst';
    return {
        role: isDep ? 'dep' : 'arr',
        flightNo: o.flightNo || '',
        dep: o.departureAirport || '',
        arr: o.arrivalAirport || '',
        std: o.std, etd: o.etd, atd: o.atd,
        sta: o.sta, eta: o.eta, ata: o.ata,
    };
}

function formatMarksTooltipHtml(payload) {
    const items = Array.isArray(payload) ? payload : [payload];
    return items.map((p) => {
        const isDep = p.role === 'dep';
        const role = isDep ? '起飞航班' : '着陆航班';
        const no = _marksEscHtml(p.flightNo || '--');
        const aptLabel = isDep ? '目的地机场' : '上一站起飞机场';
        const aptCode = _marksEscHtml((isDep ? p.arr : p.dep) || '--');
        const plan = _marksEscHtml(formatMarksTooltipTime(isDep ? p.std : p.sta));
        const est = _marksEscHtml(formatMarksTooltipTime(isDep ? p.etd : p.eta));
        const act = _marksEscHtml(formatMarksTooltipTime(isDep ? p.atd : p.ata));
        return `<div class="fmt-card">
            <div class="fmt-row1">
                <span class="fmt-role">${role}</span>
                <span class="fmt-no">${no}</span>
                <span class="fmt-apt">${aptLabel}：${aptCode}</span>
            </div>
            <div class="fmt-row2">
                <span><i>计划</i>${plan}</span>
                <span><i>预计</i>${est}</span>
                <span><i>实际</i>${act}</span>
            </div>
        </div>`;
    }).join('');
}

function ensureFlightMarksTooltipEl() {
    let el = document.getElementById('flight-marks-tooltip');
    if (!el) {
        el = document.createElement('div');
        el.id = 'flight-marks-tooltip';
        el.className = 'flight-marks-tooltip';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    return el;
}

function hideFlightMarksTooltip() {
    const el = document.getElementById('flight-marks-tooltip');
    if (!el) return;
    el.style.display = 'none';
    el.innerHTML = '';
    el._srcMark = null;
}

function positionFlightMarksTooltip(el, clientX, clientY) {
    const pad = 12;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = clientX + pad;
    let top = clientY + pad;
    if (left + w > window.innerWidth - 8) left = clientX - w - pad;
    if (top + h > window.innerHeight - 8) top = clientY - h - pad;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function showFlightMarksTooltip(markEl, clientX, clientY) {
    let payload;
    try {
        payload = JSON.parse(markEl.getAttribute('data-marks-tip') || '[]');
    } catch (e) {
        return;
    }
    const el = ensureFlightMarksTooltipEl();
    if (el._srcMark !== markEl) {
        el.innerHTML = formatMarksTooltipHtml(payload);
        el._srcMark = markEl;
    }
    el.style.display = 'block';
    positionFlightMarksTooltip(el, clientX, clientY);
}

function bindFlightMarksTooltip() {
    if (window._flightMarksTooltipBound) return;
    window._flightMarksTooltipBound = true;
    document.addEventListener('mouseover', (e) => {
        const mark = e.target && e.target.closest && e.target.closest('.flight-mark');
        if (!mark || !mark.getAttribute('data-marks-tip')) return;
        showFlightMarksTooltip(mark, e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => {
        const mark = e.target && e.target.closest && e.target.closest('.flight-mark');
        const tip = document.getElementById('flight-marks-tooltip');
        if (!mark || !tip || tip.style.display !== 'block') return;
        showFlightMarksTooltip(mark, e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', (e) => {
        const mark = e.target && e.target.closest && e.target.closest('.flight-mark');
        if (!mark) return;
        const next = e.relatedTarget;
        if (next && mark.contains(next)) return;
        hideFlightMarksTooltip();
    });
}

function clusterFlightMarks(items, timelineWidthPx) {
    if (!items.length) return [];
    const gapPx = 2;
    const sorted = items.slice().sort((a, b) => a.centerPx - b.centerPx);
    // 首轮用估宽
    sorted.forEach((it) => {
        it.halfPx = (it.estWidth || 22) / 2;
    });
    const clusters = [];
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = cur[cur.length - 1];
        const next = sorted[i];
        const edgeGap = (next.centerPx - next.halfPx) - (prev.centerPx + prev.halfPx);
        if (edgeGap < gapPx) cur.push(next);
        else {
            clusters.push(cur);
            cur = [next];
        }
    }
    clusters.push(cur);
    return clusters.map((members) => {
        const leftPx = Math.min(...members.map((m) => m.centerPx - m.halfPx));
        const rightPx = Math.max(...members.map((m) => m.centerPx + m.halfPx));
        const warn = members.reduce((best, m) => {
            const lvl = marksEventWarning(m.event);
            return marksWarningRank(lvl) > marksWarningRank(best) ? lvl : best;
        }, 'N');
        return { members, leftPx, rightPx, warning: warn };
    });
}

function estimateMarkBoxWidth() {
    return 10;
}

function createMarksFlightTimeline(flightData, airportCode) {
    const events = Array.isArray(flightData.events) ? flightData.events : [];
    const winStart = getMarksWindowStartMs();
    const winEnd = winStart + getMarksWindowDurationMs();
    // 前端自裁：丢弃窗口外
    const visible = events.filter((e) => {
        const at = Number(e.at);
        return Number.isFinite(at) && at >= winStart && at <= winEnd;
    });

    // 折叠时也要求 at >= now（与 winStart 一致）；展开则含过去 2h
    const upper = [];
    const lower = [];
    visible.forEach((e) => {
        const at = Number(e.at);
        const leftPct = marksMsToLeftPercent(at);
        if (leftPct < -1 || leftPct > 101) return;
        const item = { event: e, at, leftPct, centerPx: 0, estWidth: estimateMarkBoxWidth() };
        if (e.kind === 'dep' || e.kind === 'off' || e.kind === 'odp' || e.kind === 'dst') lower.push(item);
        else if (e.kind === 'arr' || e.kind === 'enr' || e.kind === 'lnd' || e.kind === 'oar' || e.kind === 'oen') upper.push(item);
    });

    // 用假定时间轴宽度算像素（与格子同宽逻辑：渲染后由 CSS % 定位，聚簇用 1000px 基准再转 %）
    const axisPx = 1000;
    const prepare = (list) => list.map((it) => {
        it.centerPx = (it.leftPct / 100) * axisPx;
        it.estWidth = estimateMarkBoxWidth();
        it.halfPx = it.estWidth / 2;
        return it;
    });

    const renderTrack = (list, track) => {
        const prepared = prepare(list);
        const clusters = clusterFlightMarks(prepared, axisPx);
        return clusters.map((cl) => {
            const eventsIn = cl.members.map((m) => m.event);
            const minW = estimateMarkBoxWidth();
            const widthPx = Math.max(cl.rightPx - cl.leftPx, minW);
            let leftPct;
            let widthPct;
            if (cl.members.length === 1) {
                widthPct = (minW / axisPx) * 100;
                leftPct = cl.members[0].leftPct - widthPct / 2;
            } else {
                const boxW = Math.max(widthPx, minW);
                const center = (cl.leftPx + cl.rightPx) / 2;
                leftPct = ((center - boxW / 2) / axisPx) * 100;
                widthPct = (boxW / axisPx) * 100;
            }
            const color = marksWarningColor(cl.warning);
            const tipPayload = eventsIn.map((ev) => marksTooltipPayload(ev, track));
            const tipAttr = _marksEscHtml(JSON.stringify(tipPayload));
            const trackClass = track === 'dep' ? 'flight-mark-lower' : 'flight-mark-upper';
            // 簇内每个航班在对应时刻各画上下短线；单票则居中一根
            const boxLeftPx = (leftPct / 100) * axisPx;
            const boxWidthPx = Math.max((widthPct / 100) * axisPx, 1);
            const ticksHtml = cl.members.map((m) => {
                const rel = ((m.centerPx - boxLeftPx) / boxWidthPx) * 100;
                const left = Math.max(0, Math.min(100, rel));
                const tickClass = marksTickClass(m.event);
                return `<span class="flight-mark-tick${tickClass}" style="left:${left}%;"></span>`;
            }).join('');
            return `
                <div class="flight-mark ${trackClass}${cl.members.length > 1 ? ' flight-mark-cluster' : ''}"
                     style="left:${leftPct}%;width:${widthPct}%;--mark-bg:${color};background-color:${color};"
                     data-airport="${_marksEscHtml(airportCode || '')}"
                     data-marks-tip="${tipAttr}">
                    ${ticksHtml}
                </div>`;
        }).join('');
    };

    return `
        <div class="flight-marks-layer">
            <div class="flight-marks-track flight-marks-track-upper">${renderTrack(upper, 'upper')}</div>
            <div class="flight-marks-track flight-marks-track-lower">${renderTrack(lower, 'dep')}</div>
        </div>`;
}

// 更新承运人显示
function updateCarrierDisplay() {
    const carrierDisplay = document.getElementById('carrier-display');
    if (currentCarriers && currentCarriers.length > 0) {
        const shown = currentCarriers.slice(0, 2);
        const extra = currentCarriers.length - 2;
        const text = extra > 0
            ? `${shown.join(' ')} +${extra}`
            : shown.join(' ');
        carrierDisplay.textContent = text;
        carrierDisplay.title = currentCarriers.join(' ');
    } else {
        carrierDisplay.textContent = '暂无承运人数据';
        carrierDisplay.title = '暂无承运人数据';
    }
}

function loadCarrierData() {
    if (window.carriers && window.carriers.length > 0) {
        currentCarriers = window.carriers;
        updateCarrierDisplay();
    }
}

function createFlightTimeline(flightData, tafData = null, metarData = null, airport = null) {
    // 格点分支（isFlightMarksMode 为 false 时）：用 time_slots 画 1-2-3；恢复格点后会重新走到这里
    if (isFlightMarksMode()) {
        return createMarksFlightTimeline(flightData || {}, airport && airport.airport_4code);
    }

    const timeSlots = flightData.time_slots || [];
    let flightInfos = [];

    for (let i = 0; i < currentTimeRange; i++) {
        const flightInfo = timeSlots[i] || '';

        if (flightInfo && flightInfo.trim() !== '' && flightInfo.trim() !== 'None' && flightInfo.trim() !== 'null') {
            const leftPercent = (i / currentTimeRange) * 100;
            const widthPercent = (1 / currentTimeRange) * 100;
            const alertLevel = calculateFlightAlertLevel(i, tafData, metarData, flightData, airport);
            const alertColor = alertLevel ? getAlertColor(alertLevel) : '#333';

            flightInfos.push(`
                <div class="flight-info-item" style="
                    position: absolute;
                    left: ${leftPercent}%;
                    width: ${widthPercent}%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: bold;
                    color: ${alertColor};
                    z-index: 2;
                    pointer-events: none;
                ">${flightInfo}</div>
            `);
        }
    }

    return flightInfos.join('');
}

function calculateFlightAlertLevel(timeSlotIndex, tafData, metarData, flightData, airport) {
    try {
        const currentMargin = getSelectedAlertMargin();
        if (airport && airport.computed_alerts) {
            const marginKey = `margin_${currentMargin}`;
            const marginResults = airport.computed_alerts[marginKey];
            if (marginResults && marginResults.time_slots && timeSlotIndex < marginResults.time_slots.length) {
                return marginResults.time_slots[timeSlotIndex];
            }
        }
        return 'N';
    } catch (error) {
        console.error('获取时段告警等级失败:', error);
        return 'N';
    }
}

function getMaxAlertFromList(alerts) {
    if (!alerts || alerts.length === 0) return 'N';
    if (alerts.includes('R')) return 'R';
    if (alerts.includes('Y')) return 'Y';
    if (alerts.includes('G')) return 'G';
    return 'N';
}

function updateFlightStatusWarning(flightStatus) {
    if (!flightStatus) return;

    let warningElement = document.getElementById('flight-status-warning');

    if (!flightStatus.is_available) {
        if (!warningElement) {
            warningElement = document.createElement('div');
            warningElement.id = 'flight-status-warning';
            warningElement.innerHTML = '⚠';
            warningElement.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 80px;
                height: 80px;
                background-color: #ffc107;
                color: #212529;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
                font-weight: bold;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                transition: transform 0.2s;
            `;
            warningElement.addEventListener('mouseenter', function () {
                this.style.transform = 'scale(1.1)';
            });
            warningElement.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
            });
            document.body.appendChild(warningElement);
        }

        if (airportData && airportData.length > 0 && airportData[0].flight_data && airportData[0].flight_data.last_updated) {
            const lastUpdated = new Date(airportData[0].flight_data.last_updated);
            const timeString = lastUpdated.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            warningElement.title = `未获取到最新航班数据，当前显示的航班数据为${timeString}获取`;
        } else {
            warningElement.title = `未获取到最新航班数据，当前无可用的航班数据`;
        }
    } else if (warningElement) {
        warningElement.remove();
    }
}

function getMarksPastRatio() {
    const hours = (typeof currentTimeRange !== 'undefined') ? currentTimeRange : 36;
    return 2 / hours;
}

function syncFlightMarksCssVars() {
    const hours = (typeof currentTimeRange !== 'undefined') ? currentTimeRange : 36;
    document.documentElement.style.setProperty('--marks-range-hours', String(hours));
    document.documentElement.style.setProperty('--marks-past-ratio', String(getMarksPastRatio()));
}

function buildFlightPastHandleHtml() {
    // 已改为页面级悬浮锚点，行内不再插入
    return '';
}

function removeFlightPastHandleFloat() {
    removeMarksPastHandle('home');
}

function marksPastHandleId(scope) {
    if (!scope || scope === 'home') return 'flight-past-handle-float';
    if (scope === 'detail') return 'flight-past-handle-detail';
    return 'flight-past-handle-' + String(scope).replace(/[^a-zA-Z0-9]/g, '-');
}

function marksPastHandleTimelines(scope) {
    if (!scope || scope === 'home') {
        return document.querySelectorAll('#content-main .airport-row .forecast-timeline');
    }
    if (scope === 'detail') {
        return document.querySelectorAll('#airport-detail-main .forecast-timeline');
    }
    const code = scope.slice(7);
    return document.querySelectorAll(`#search-block-main-${code} .forecast-timeline`);
}

function marksPastHandleRows(scope) {
    if (!scope || scope === 'home') {
        return document.querySelectorAll('#content-main .airport-row');
    }
    if (scope === 'detail') {
        return document.querySelectorAll('#airport-detail-main .airport-row');
    }
    const code = scope.slice(7);
    return document.querySelectorAll(`#search-block-main-${code} .airport-row`);
}

function marksScopeHostVisible(scope) {
    if (!scope || scope === 'home') {
        if (window._viewMode === 'plain' || window._viewMode === 'map') return false;
        if (typeof currentView === 'function' && currentView() && currentView() !== 'home') return false;
        const content = document.getElementById('content-main');
        if (content) {
            const host = content.closest('.content-section') || content;
            if (host.style.display === 'none') return false;
        }
        return true;
    }
    if (scope === 'detail') {
        const modal = document.getElementById('airport-detail-modal');
        return !!(modal && modal.style.display === 'block');
    }
    const modal = document.getElementById('airport-search-modal');
    return !!(modal && modal.style.display === 'block');
}

function removeMarksPastHandle(scope) {
    const el = document.getElementById(marksPastHandleId(scope));
    if (el) el.remove();
}

function positionMarksPastHandle(scope) {
    const sc = scope || 'home';
    const wrap = document.getElementById(marksPastHandleId(sc));
    if (!wrap || !isFlightMarksMode()) return;
    if (!marksScopeHostVisible(sc)) {
        wrap.style.display = 'none';
        return;
    }
    const rows = marksPastHandleRows(sc);
    const timelines = marksPastHandleTimelines(sc);
    if (!rows.length || !timelines.length) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';
    const firstTl = timelines[0];
    const tlRect = firstTl.getBoundingClientRect();
    const firstRect = rows[0].getBoundingClientRect();
    const lastRect = rows[rows.length - 1].getBoundingClientRect();
    const top = firstRect.top;
    const height = Math.max(36, lastRect.bottom - firstRect.top);
    wrap.style.left = `${Math.round(tlRect.left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
    wrap.style.height = `${Math.round(height)}px`;
    const expanded = getMarksPastExpanded(sc);
    wrap.classList.toggle('open', expanded);
    wrap.title = expanded ? '收起过去2小时' : '展开过去2小时';
    const knob = wrap.querySelector('.flight-past-handle-knob');
    if (knob) {
        const visTop = Math.max(top, 0);
        const visBottom = Math.min(top + height, window.innerHeight);
        const mid = (visTop + visBottom) / 2;
        const knobH = 28;
        let y = mid - top - knobH / 2;
        y = Math.max(0, Math.min(Math.max(0, height - knobH), y));
        knob.style.top = `${Math.round(y)}px`;
    }
}

function positionFlightPastHandleFloat() {
    positionAllMarksPastHandles();
}

function positionAllMarksPastHandles() {
    positionMarksPastHandle('home');
    positionMarksPastHandle('detail');
    document.querySelectorAll('.airport-search-block[data-code]').forEach((block) => {
        positionMarksPastHandle('search:' + String(block.dataset.code).toUpperCase());
    });
}

function ensureMarksPastHandle(scope) {
    const sc = scope || 'home';
    if (!isFlightMarksMode() || !marksScopeHostVisible(sc)) {
        removeMarksPastHandle(sc);
        return;
    }
    const id = marksPastHandleId(sc);
    let wrap = document.getElementById(id);
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = id;
        wrap.className = 'flight-past-handle-float';
        wrap.dataset.marksScope = sc;
        if (sc !== 'home') wrap.classList.add('in-modal');
        if (sc === 'detail') wrap.classList.add('scope-detail');
        if (sc.indexOf('search:') === 0) wrap.classList.add('scope-search');
        wrap.addEventListener('click', (e) => toggleFlightMarksPast(e, sc));
        document.body.appendChild(wrap);
    }
    if (!wrap.querySelector('.flight-past-handle-rail')) {
        wrap.innerHTML = '<span class="flight-past-handle-rail"></span><span class="flight-past-handle-knob"></span>';
    }
    syncFlightMarksCssVars();
    positionMarksPastHandle(sc);
}

function ensureFlightPastHandleFloat() {
    ensureMarksPastHandle('home');
}

function ensureModalMarksPastHandles() {
    const detailModal = document.getElementById('airport-detail-modal');
    if (detailModal && detailModal.style.display === 'block') {
        ensureMarksPastHandle('detail');
    } else {
        removeMarksPastHandle('detail');
    }
    const searchModal = document.getElementById('airport-search-modal');
    const live = new Set();
    if (searchModal && searchModal.style.display === 'block') {
        document.querySelectorAll('.airport-search-block[data-code]').forEach((block) => {
            const sc = 'search:' + String(block.dataset.code).toUpperCase();
            live.add(marksPastHandleId(sc));
            ensureMarksPastHandle(sc);
        });
    }
    document.querySelectorAll('.flight-past-handle-float.scope-search').forEach((el) => {
        if (!live.has(el.id)) el.remove();
    });
}

function _marksAnimTargets(scope) {
    const list = [];
    const sc = scope || 'home';
    if (!sc || sc === 'home') {
        document.querySelectorAll('#content-main .forecast-timeline > .marks-slide-layer').forEach((el) => list.push(el));
        document.querySelectorAll('.main-title-row .title-timeline > .timeline-row').forEach((el) => list.push(el));
        return list;
    }
    if (sc === 'detail') {
        document.querySelectorAll('#airport-detail-main .forecast-timeline > .marks-slide-layer').forEach((el) => list.push(el));
        document.querySelectorAll('#airport-detail-modal .airport-detail-title-row .title-timeline > .timeline-row').forEach((el) => list.push(el));
        return list;
    }
    const code = sc.slice(7);
    document.querySelectorAll(`#search-block-main-${code} .forecast-timeline > .marks-slide-layer`).forEach((el) => list.push(el));
    const block = document.querySelector(`.airport-search-block[data-code="${code}"]`);
    if (block) {
        block.querySelectorAll('.title-timeline > .timeline-row').forEach((el) => list.push(el));
    }
    return list;
}

function getAirportDataByCode(code) {
    if (!code) return null;
    if (typeof searchAirportCache !== 'undefined' && searchAirportCache && searchAirportCache[code]) {
        return searchAirportCache[code];
    }
    if (typeof airportData !== 'undefined' && Array.isArray(airportData)) {
        for (let i = 0; i < airportData.length; i++) {
            if (airportData[i] && airportData[i].airport_4code === code) return airportData[i];
        }
    }
    return null;
}

function redrawMarksScope(scope) {
    const sc = scope || 'home';
    syncFlightMarksCssVars();
    syncMarksPastOpenClass(sc);
    withMarksRenderScope(sc, () => {
        if (!sc || sc === 'home') {
            if (typeof generateTimeline === 'function') generateTimeline();
            if (typeof applyTimeRangeScaling === 'function') applyTimeRangeScaling();
            if (typeof applyFilters === 'function') applyFilters();
            else if (typeof updateAllAirportGrids === 'function') updateAllAirportGrids();
            ensureMarksPastHandle('home');
            return;
        }
        if (sc === 'detail') {
            if (typeof generateAirportDetailTimeline === 'function') generateAirportDetailTimeline();
            const code = typeof currentDetailAirportCode !== 'undefined' ? currentDetailAirportCode : null;
            const airport = getAirportDataByCode(code);
            const detailMain = document.getElementById('airport-detail-main');
            if (airport && detailMain && typeof createAirportRowForDetail === 'function') {
                detailMain.innerHTML = createAirportRowForDetail(airport, { marksScope: 'detail' });
                const airportRow = detailMain.querySelector('.airport-row');
                if (airportRow && typeof updateAirportGridForModal === 'function') {
                    updateAirportGridForModal(airportRow);
                }
                if (typeof renderNwpOverlayForAirportDetail === 'function') {
                    renderNwpOverlayForAirportDetail();
                }
                if (typeof paintPlainDetailMetar === 'function') paintPlainDetailMetar(airport);
            }
            ensureMarksPastHandle('detail');
            return;
        }
        const code = sc.slice(7);
        if (typeof _generateSearchTimeline === 'function') {
            _generateSearchTimeline(`search-block-bj-${code}`, `search-block-utc-${code}`);
        }
        const airport = getAirportDataByCode(code);
        const mainEl = document.getElementById(`search-block-main-${code}`);
        if (airport && mainEl && typeof createAirportRowForDetail === 'function') {
            mainEl.innerHTML = createAirportRowForDetail(airport, { marksScope: sc });
            const airportRow = mainEl.querySelector('.airport-row');
            if (airportRow && typeof updateAirportGridForModal === 'function') {
                updateAirportGridForModal(airportRow);
            }
            if (typeof renderNwpOverlayForAirportSearch === 'function') {
                renderNwpOverlayForAirportSearch(code);
            }
            if (typeof paintSearchBlockMetar === 'function') paintSearchBlockMetar(code, airport);
        }
        ensureMarksPastHandle(sc);
    });
}

/** 清理历史上误包在顶轴上的 slide 层，恢复 beijing/utc 行结构（时刻数字才能显示） */
function unwrapMarksTitleSlideLayer(titleTimeline) {
    if (!titleTimeline) return;
    const slide = titleTimeline.querySelector(':scope > .marks-slide-layer');
    if (!slide) return;
    while (slide.firstChild) titleTimeline.appendChild(slide.firstChild);
    slide.remove();
}

function removeMarksNowBadge(titleTimeline) {
    if (titleTimeline) {
        titleTimeline.querySelectorAll('.marks-now-badge').forEach((el) => el.remove());
        return;
    }
    document.querySelectorAll('.marks-now-badge').forEach((el) => el.remove());
    const row = document.getElementById('marks-now-row');
    if (row) row.remove();
}

/** NOW：悬浮在时间轴轨道内侧下方，不新开行、不挤整点 */
function updateMarksNowBadge(titleTimeline, winStart, dur, forcePast) {
    if (!titleTimeline) return;
    removeMarksNowBadge(titleTimeline);
    const showPast = forcePast === true || (forcePast !== false && marksWindowIncludesPast());
    if (!showPast || !dur) return;
    const nowMs = getMarksNowMs();
    const pct = ((nowMs - winStart) / dur) * 100;
    if (pct < -0.5 || pct > 100.5) return;

    const badge = document.createElement('span');
    badge.className = 'marks-now-badge';
    badge.style.left = `${pct}%`;
    badge.textContent = 'NOW';
    let host = titleTimeline;
    const rows = titleTimeline.querySelectorAll(':scope > .timeline-row');
    for (let i = rows.length - 1; i >= 0; i--) {
        if (window.getComputedStyle(rows[i]).display !== 'none') {
            host = rows[i];
            break;
        }
    }
    host.appendChild(badge);
}

function _playMarksExpandAnimation(expanding, scope) {
    const sc = scope || 'home';
    const pastPct = getMarksPastRatio() * 100;
    const targets = _marksAnimTargets(sc);
    if (!targets.length) {
        if (!expanding) {
            setMarksPastExpanded(sc, false);
            if (sc === 'home' && typeof syncFlightMarksBodyClass === 'function') syncFlightMarksBodyClass();
            redrawMarksScope(sc);
        }
        return;
    }

    if (expanding) {
        targets.forEach((el) => {
            el.style.transition = 'none';
            el.style.transform = `translateX(-${pastPct}%)`;
        });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                targets.forEach((el) => {
                    el.style.transition = 'transform 0.35s ease-out';
                    el.style.transform = 'translateX(0)';
                });
            });
        });
        setTimeout(() => {
            targets.forEach((el) => {
                el.style.transition = '';
                el.style.transform = '';
            });
            positionAllMarksPastHandles();
        }, 380);
    } else {
        targets.forEach((el) => {
            el.style.transition = 'none';
            el.style.transform = 'translateX(0)';
        });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                targets.forEach((el) => {
                    el.style.transition = 'transform 0.3s ease-in';
                    el.style.transform = `translateX(-${pastPct}%)`;
                });
            });
        });
        setTimeout(() => {
            targets.forEach((el) => {
                el.style.transition = '';
                el.style.transform = '';
            });
            setMarksPastExpanded(sc, false);
            if (sc === 'home' && typeof syncFlightMarksBodyClass === 'function') syncFlightMarksBodyClass();
            redrawMarksScope(sc);
        }, 320);
    }
}

function toggleFlightMarksPast(event, scope) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!isFlightMarksMode()) return;
    if (window._flightMarksAnimating) return;

    const sc = scope
        || (event && event.currentTarget && event.currentTarget.dataset.marksScope)
        || 'home';
    const willExpand = !getMarksPastExpanded(sc);
    window._flightMarksAnimating = true;

    if (willExpand) {
        setMarksPastExpanded(sc, true);
        if (sc === 'home' && typeof syncFlightMarksBodyClass === 'function') syncFlightMarksBodyClass();
        redrawMarksScope(sc);
        _playMarksExpandAnimation(true, sc);
        setTimeout(() => { window._flightMarksAnimating = false; }, 400);
    } else {
        _playMarksExpandAnimation(false, sc);
        setTimeout(() => { window._flightMarksAnimating = false; }, 400);
    }
}

const MARKS_LEGEND_POS_KEY = 'mtws_marks_legend_pos';

function hideFlightMarksLegend() {
    const el = document.getElementById('flight-marks-legend');
    if (el) el.style.display = 'none';
}

function _clampMarksLegend(el, left, bottom) {
    const w = el.offsetWidth || 420;
    const h = el.offsetHeight || 88;
    const maxL = Math.max(0, window.innerWidth - w);
    const maxB = Math.max(0, window.innerHeight - h);
    return {
        left: Math.max(0, Math.min(maxL, left)),
        bottom: Math.max(0, Math.min(maxB, bottom)),
    };
}

function _applyMarksLegendPos(el, pos) {
    const p = _clampMarksLegend(el, pos.left, pos.bottom);
    el.style.left = p.left + 'px';
    el.style.bottom = p.bottom + 'px';
    el.style.right = 'auto';
    el.style.top = 'auto';
    el.style.transform = 'none';
}

function ensureFlightMarksLegend() {
    if (!isFlightMarksMode()) {
        hideFlightMarksLegend();
        return;
    }
    let el = document.getElementById('flight-marks-legend');
    if (!el) {
        el = document.createElement('div');
        el.id = 'flight-marks-legend';
        el.className = 'flight-marks-legend';
        document.body.appendChild(el);
        window.addEventListener('resize', () => {
            const box = document.getElementById('flight-marks-legend');
            if (!box || box.style.display === 'none') return;
            const left = parseFloat(box.style.left);
            const bottom = parseFloat(box.style.bottom);
            if (Number.isFinite(left) && Number.isFinite(bottom)) {
                _applyMarksLegendPos(box, { left, bottom });
            }
        });
    }
    if (!el.querySelector('.fml-left')) {
        el.innerHTML = `
            <div class="fml-handle" title="按住拖动">航班标记说明</div>
            <div class="fml-body">
                <div class="fml-left">
                    <span class="fml-swatch"><span class="fml-mark fml-mark-r"></span>红色告警</span>
                    <span class="fml-swatch"><span class="fml-mark fml-mark-y"></span>黄色告警</span>
                    <span class="fml-swatch"><span class="fml-mark fml-mark-g"></span>绿色告警</span>
                    <span class="fml-swatch"><span class="fml-mark fml-mark-n"></span>无告警</span>
                </div>
                <div class="fml-right">
                    <div class="fml-row">
                        <span class="fml-item">上行＝进港/落地</span>
                        <span class="fml-item">下行＝起飞/离港</span>
                    </div>
                    <div class="fml-row fml-row-lines">
                        <span class="fml-item"><span class="fml-tick fml-tick-white"></span>白＝飞机在地面</span>
                        <span class="fml-item"><span class="fml-tick fml-tick-black"></span>黑＝飞机在空中</span>
                        <span class="fml-item"><span class="fml-tick fml-tick-blink"></span>闪＝超时未起/未落</span>
                    </div>
                </div>
            </div>`;
        el.dataset.dragBound = '';
        _bindMarksLegendDrag(el);
    }
    el.style.display = 'flex';
    try {
        const saved = JSON.parse(localStorage.getItem(MARKS_LEGEND_POS_KEY) || 'null');
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.bottom)) {
            _applyMarksLegendPos(el, saved);
        } else {
            const w = el.offsetWidth || 420;
            _applyMarksLegendPos(el, {
                left: Math.max(8, (window.innerWidth - w) / 2),
                bottom: 12,
            });
        }
    } catch (e) {
        _applyMarksLegendPos(el, { left: 12, bottom: 12 });
    }
}

function _bindMarksLegendDrag(el) {
    if (el.dataset.dragBound === '1') return;
    el.dataset.dragBound = '1';
    const handle = el.querySelector('.fml-handle') || el;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origBottom = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        _applyMarksLegendPos(el, { left: origLeft + dx, bottom: origBottom - dy });
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        try {
            localStorage.setItem(MARKS_LEGEND_POS_KEY, JSON.stringify({
                left: parseFloat(el.style.left) || 0,
                bottom: parseFloat(el.style.bottom) || 0,
            }));
        } catch (err) { /* ignore */ }
    };

    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origLeft = rect.left;
        origBottom = window.innerHeight - rect.bottom;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
    handle.addEventListener('touchstart', (e) => {
        const pt = e.touches[0];
        if (!pt) return;
        dragging = true;
        startX = pt.clientX;
        startY = pt.clientY;
        const rect = el.getBoundingClientRect();
        origLeft = rect.left;
        origBottom = window.innerHeight - rect.bottom;
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }, { passive: true });
}

function bindMarksPastHandleLayoutWatch() {
    if (window._marksPastHandleRo || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
        if (window._marksPastHandleRoRaf) cancelAnimationFrame(window._marksPastHandleRoRaf);
        window._marksPastHandleRoRaf = requestAnimationFrame(() => {
            window._marksPastHandleRoRaf = 0;
            positionAllMarksPastHandles();
        });
    });
    window._marksPastHandleRo = ro;
    [
        document.querySelector('#airport-detail-modal .airport-detail-content'),
        document.getElementById('airport-detail-content'),
        document.querySelector('#airport-search-modal .airport-search-modal-content'),
        document.getElementById('airport-search-list'),
    ].forEach((el) => {
        if (el) ro.observe(el);
    });
}

function initFlightMarksMode() {
    syncFlightMarksBodyClass();
    syncFlightMarksCssVars();
    ensureFlightPastHandleFloat();
    bindFlightMarksTooltip();
    ensureFlightMarksLegend();
    bindMarksPastHandleLayoutWatch();
    if (!window._flightMarksHandleBound) {
        window._flightMarksHandleBound = true;
        window.addEventListener('resize', () => positionAllMarksPastHandles());
        document.addEventListener('scroll', () => positionAllMarksPastHandles(), true);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFlightMarksMode);
} else {
    initFlightMarksMode();
}
