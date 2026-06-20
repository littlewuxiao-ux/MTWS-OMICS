/* ===================================================================
 * export_publish.js — 预报发布导出（图片/Excel 分离、预览、图片分页切割）
 * 依赖：html2canvas、publish.js 中的 window.pbState / forecast-table DOM
 * 不依赖外部 xlsm 模板，仅复刻其版式观感。
 * =================================================================== */
(function () {
    'use strict';

    const apiBase = () => (window.location.pathname.startsWith('/omics') ? '/omics/api' : '/api');

    // 抓取当前发布表里“已确认/有效”的机场行，作为导出数据源
    function collectPublishRows() {
        const table = document.getElementById('forecast-table');
        const rows = [];
        if (!table) return rows;
        table.querySelectorAll('tbody tr.tr-edit').forEach(tr => {
            if (tr.style.display === 'none') return;
            const nameCell = tr.querySelector('.td-airport');
            const name = nameCell?.childNodes?.[0]?.textContent?.trim() || '';
            const type = nameCell?.nextElementSibling?.textContent?.trim() || '普通';
            const numCells = (window.pbState?.validityHours || 24) + 1;
            const values = [];
            for (let i = 0; i < numCells; i++) {
                const td = tr.querySelector(`td.td-data[data-c="${i}"]`);
                values.push(td ? td.textContent.trim() : '');
            }
            const noteInput = tr.querySelector('.edit-note-input');
            const note = noteInput ? noteInput.value.trim() : '';
            const confirmed = tr.dataset.confirmed === 'true';
            if (name && (values.some(Boolean) || confirmed)) {
                rows.push({ icao: tr.dataset.icao || '', name, type, values, note, confirmed });
            }
        });
        return rows;
    }

    // 把整张表格序列化为二维数组（含表头），供后端 Excel 兜底
    function collectRawRows() {
        const table = document.getElementById('forecast-table');
        const rows = [];
        if (!table) return rows;
        table.querySelectorAll('tr').forEach(tr => {
            if (tr.style.display === 'none') return;
            const rowData = [];
            tr.querySelectorAll('th, td').forEach(td => rowData.push(td.innerText.trim()));
            rows.push(rowData);
        });
        return rows;
    }

    function getIcingText() {
        const footer = document.getElementById('pb-export-footer');
        if (!footer) return '无';
        const inp = footer.querySelector('input[type="text"]');
        return inp ? (inp.value.trim() || '无') : '无';
    }

    function exportPath() {
        return document.getElementById('publish-export-path')?.value || '';
    }

    // 计算分页：返回每页机场行数组成的数组
    function paginate(rows, enableSplit, perPage) {
        if (!enableSplit || rows.length === 0) return [rows];
        let n = parseInt(perPage, 10);
        if (!n || n < 1) {
            // 默认平均分配：尽量每页机场数接近，页数 = ceil(总数/10)
            const pageCount = Math.max(1, Math.ceil(rows.length / 10));
            n = Math.ceil(rows.length / pageCount);
        }
        const pages = [];
        for (let i = 0; i < rows.length; i += n) pages.push(rows.slice(i, i + n));
        return pages;
    }

    /* 构建一页用于截图的离屏 DOM：头(标题栏) + 表格(仅选定机场行) + 尾(结冰/颜色/说明)
       通过克隆现有 DOM 节点，最大程度保持与界面一致的观感。 */
    function buildPageNode(pageRows, pageIdx, pageTotal) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:1200px; background:#fff; font-family:微软雅黑,Microsoft YaHei,sans-serif;';

        // 头：克隆标题栏
        const headerSrc = document.getElementById('pb-export-header');
        if (headerSrc) {
            const h = headerSrc.cloneNode(true);
            h.style.borderRadius = '8px 8px 0 0';
            wrap.appendChild(h);
        }

        // 表格：克隆 thead + 选中机场对应的 tbody 行（含其确认行）
        const srcTable = document.getElementById('forecast-table');
        const tbl = document.createElement('table');
        tbl.style.cssText = 'width:100%; border-collapse:collapse; text-align:center; border-bottom:2px solid #5D6D7E;';
        tbl.className = srcTable ? srcTable.className : '';
        tbl.id = '';
        if (srcTable) {
            const thead = srcTable.querySelector('thead');
            if (thead) tbl.appendChild(thead.cloneNode(true));
            const tbody = document.createElement('tbody');
            const icaoSet = new Set(pageRows.map(r => r.icao).filter(Boolean));
            srcTable.querySelectorAll('tbody tr').forEach(tr => {
                if (tr.style.display === 'none') return;
                const icao = tr.dataset.icao;
                // 只保留属于本页机场的行（确认主行 + 其附属行）
                if (icao && icaoSet.has(icao)) tbody.appendChild(tr.cloneNode(true));
            });
            tbl.appendChild(tbody);
        }
        // sticky 在截图里会错位，统一取消
        tbl.querySelectorAll('th, td').forEach(c => { c.style.position = 'static'; });
        wrap.appendChild(tbl);

        // 尾：克隆结冰/颜色/说明区
        const footerSrc = document.getElementById('pb-export-footer');
        if (footerSrc) wrap.appendChild(footerSrc.cloneNode(true));

        if (pageTotal > 1) {
            const tag = document.createElement('div');
            tag.style.cssText = 'text-align:right; padding:6px 12px; font-size:12px; color:#64748b;';
            tag.textContent = `第 ${pageIdx + 1} / ${pageTotal} 页`;
            wrap.appendChild(tag);
        }
        return wrap;
    }

    async function renderPageImage(pageNode) {
        // 离屏渲染：放进一个不可见容器再截图
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed; left:-99999px; top:0; z-index:-1;';
        holder.appendChild(pageNode);
        document.body.appendChild(holder);
        try {
            const canvas = await html2canvas(pageNode, { scale: 2, backgroundColor: '#ffffff' });
            return canvas.toDataURL('image/png');
        } finally {
            document.body.removeChild(holder);
        }
    }

    // ---- 预览弹窗状态 ----
    const state = { mode: 'image', rows: [], rawRows: [], images: [] };

    function refreshPreview() {
        const body = document.getElementById('export-preview-body');
        const info = document.getElementById('export-page-info');
        if (!body) return;
        const split = document.getElementById('export-split-toggle')?.checked;
        const perPage = document.getElementById('export-perpage')?.value;
        document.getElementById('export-perpage').disabled = !split;

        if (state.mode === 'excel') {
            // Excel 预览：用 HTML 表格近似展示将写入的机场数据
            const pages = [state.rows];
            renderExcelPreview(body, info, state.rows);
            return;
        }

        const pages = paginate(state.rows, split, perPage);
        if (info) info.textContent = `共 ${state.rows.length} 个机场，${pages.length} 页`;
        body.innerHTML = '<div style="color:#64748b; padding:20px;">⏳ 正在生成预览…</div>';

        // 逐页渲染图片
        (async () => {
            state.images = [];
            const frag = document.createElement('div');
            for (let i = 0; i < pages.length; i++) {
                const node = buildPageNode(pages[i], i, pages.length);
                const img = await renderPageImage(node);
                state.images.push(img);
                const card = document.createElement('div');
                card.style.cssText = 'margin:0 auto 18px auto; max-width:100%; box-shadow:0 2px 8px rgba(0,0,0,0.15); background:#fff;';
                const im = document.createElement('img');
                im.src = img;
                im.style.cssText = 'width:100%; display:block;';
                card.appendChild(im);
                frag.appendChild(card);
            }
            body.innerHTML = '';
            body.appendChild(frag);
        })().catch(e => {
            body.innerHTML = `<div style="color:#dc2626; padding:20px;">预览生成失败: ${e.message}</div>`;
        });
    }

    function renderExcelPreview(body, info, rows) {
        const numCells = (window.pbState?.validityHours || 24) + 1;
        const sH = window.pbState?.startHour || 0;
        let html = '<table style="border-collapse:collapse; margin:0 auto; font-size:12px; background:#fff;">';
        html += '<tr><th style="border:1px solid #d1d5db; background:#5D6D7E; color:#fff; padding:4px 8px;">名称</th>';
        html += '<th style="border:1px solid #d1d5db; background:#5D6D7E; color:#fff; padding:4px 8px;">性质</th>';
        for (let i = 0; i < numCells; i++) {
            const h = (sH + i + 8) % 24;
            html += `<th style="border:1px solid #d1d5db; background:#4A5867; color:#E2E8F0; padding:2px 4px;">${String(h).padStart(2, '0')}时</th>`;
        }
        html += '</tr>';
        rows.forEach(r => {
            html += `<tr><td style="border:1px solid #d1d5db; padding:3px 8px; font-weight:bold;">${r.name}</td>`;
            html += `<td style="border:1px solid #d1d5db; padding:3px 8px;">${r.type}</td>`;
            for (let i = 0; i < numCells; i++) {
                const v = (r.values[i] || '').replace(/[—/]/g, '');
                html += `<td style="border:1px solid #d1d5db; padding:3px 4px;">${v}</td>`;
            }
            html += '</tr>';
        });
        html += '</table>';
        if (info) info.textContent = `共 ${rows.length} 个机场`;
        body.innerHTML = html;
    }

    function openPreview(mode) {
        const table = document.getElementById('forecast-table');
        if (!table || table.innerHTML.trim() === '') { alert('当前没有可导出的数据！'); return; }
        if (mode === 'image' && typeof html2canvas !== 'function') {
            alert('导出组件 html2canvas 未加载，请检查网络或本地依赖。'); return;
        }
        state.mode = mode;
        state.rows = collectPublishRows();
        state.rawRows = collectRawRows();
        if (state.rows.length === 0) { alert('没有已确认编发或有效的机场行可导出。'); return; }

        document.getElementById('export-preview-title').textContent = mode === 'image' ? '🖼️ 导出图片预览' : '📊 导出 Excel 预览';
        // Excel 模式隐藏图片分页控件
        const splitWrap = document.getElementById('export-split-wrap');
        const perWrap = document.getElementById('export-perpage-wrap');
        if (splitWrap) splitWrap.style.display = mode === 'image' ? 'flex' : 'none';
        if (perWrap) perWrap.style.display = mode === 'image' ? 'flex' : 'none';

        document.getElementById('export-preview-modal').style.display = 'flex';
        refreshPreview();
    }

    async function doExport() {
        const btn = document.getElementById('export-preview-confirm');
        const oldTxt = btn.textContent;
        btn.textContent = '⏳ 导出中…';
        btn.disabled = true;
        try {
            const payload = {
                mode: state.mode,
                data: state.rawRows,
                publish_rows: state.rows,
                export_path: exportPath(),
                start_date: window.pbState?.startDate,
                start_hour: window.pbState?.startHour,
                forecaster: document.getElementById('pb-forecaster')?.value || '',
                validity_hours: window.pbState?.validityHours || 24,
                icing_text: getIcingText()
            };
            if (state.mode === 'image') {
                // 确保有最新分页图片
                if (!state.images.length) {
                    const split = document.getElementById('export-split-toggle')?.checked;
                    const perPage = document.getElementById('export-perpage')?.value;
                    const pages = paginate(state.rows, split, perPage);
                    state.images = [];
                    for (let i = 0; i < pages.length; i++) {
                        const node = buildPageNode(pages[i], i, pages.length);
                        state.images.push(await renderPageImage(node));
                    }
                }
                payload.images = state.images;
                payload.image = state.images[0]; // 兼容旧字段
            }
            const res = await fetch(`${apiBase()}/export_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const contentType = res.headers.get('content-type') || '';
            const responseText = await res.text();
            if (!contentType.includes('application/json')) {
                throw new Error(`导出接口返回了非 JSON 内容 (HTTP ${res.status})：${responseText.slice(0, 120)}`);
            }
            const result = JSON.parse(responseText);
            if (result.success) {
                alert('✅ 导出成功！\n保存目录:\n' + result.path + (result.files ? '\n文件:\n' + result.files.join('\n') : ''));
                document.getElementById('export-preview-modal').style.display = 'none';
            } else {
                alert('❌ 导出失败: ' + result.error);
            }
        } catch (e) {
            alert('导出发生异常: ' + e.message);
        } finally {
            btn.textContent = oldTxt;
            btn.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('close-export-preview')?.addEventListener('click', () => {
            document.getElementById('export-preview-modal').style.display = 'none';
        });
        document.getElementById('export-split-toggle')?.addEventListener('change', refreshPreview);
        document.getElementById('export-perpage')?.addEventListener('change', refreshPreview);
        document.getElementById('export-preview-confirm')?.addEventListener('click', doExport);

        // ---- 文图互导：导出/导入 标签切换 ----
        const tabOut = document.getElementById('export-text-tab-out');
        const tabIn = document.getElementById('export-text-tab-in');
        const importBtn = document.getElementById('import-export-text-btn');
        const copyBtn = document.getElementById('copy-export-text-btn');
        const outHint = document.getElementById('export-text-out-hint');
        const inHint = document.getElementById('export-text-in-hint');
        const ta = document.getElementById('export-text-content');

        function setTab(mode) {
            const isIn = mode === 'in';
            if (tabIn) tabIn.style.background = isIn ? '#2563eb' : '#64748b';
            if (tabOut) tabOut.style.background = isIn ? '#64748b' : '#28a745';
            if (outHint) outHint.style.display = isIn ? 'none' : 'block';
            if (inHint) inHint.style.display = isIn ? 'block' : 'none';
            if (importBtn) importBtn.style.display = isIn ? 'inline-block' : 'none';
            if (copyBtn) copyBtn.style.display = isIn ? 'none' : 'inline-block';
            if (isIn) { ta.value = ''; ta.placeholder = '例：\n深圳：5日08-11时有雷雨，12-15时有大风。\n杭州：5日14-18时有小雨。'; }
            ta.dataset.mode = mode;
        }
        tabOut?.addEventListener('click', () => setTab('out'));
        tabIn?.addEventListener('click', () => setTab('in'));
        importBtn?.addEventListener('click', () => {
            const n = importTextToForecast(ta.value);
            if (n > 0) {
                document.getElementById('export-text-modal').style.display = 'none';
                alert(`✅ 已导入 ${n} 个机场的预报，已以编发状态显示。`);
            }
        });
    });

    /* ===== 需求2：文字 -> 24小时预报（反向解析） =====
       支持行格式：机场名：时段描述。
       时段片段：「N日HH-HH时有XX」 / 「N日HH时-N日HH时有XX」 / 「HH-HH时有XX」 */
    function buildNameToIcao() {
        const map = {};
        const src = window.GLOBAL_AIRPORT_NAME_MAP || {};
        Object.keys(src).forEach(icao => { map[src[icao]] = icao; });
        return map;
    }

    function startEpochUTC() {
        const sd = window.pbState?.startDate;
        const sh = window.pbState?.startHour || 0;
        if (!sd) return null;
        return new Date(`${sd}T${String(sh).padStart(2, '0')}:00:00Z`).getTime();
    }

    // 将「N日HH」或「HH」解析为相对起报时间的小时偏移（北京时）
    function resolveOffset(dayStr, hourStr) {
        const sh = window.pbState?.startHour || 0;
        const startBJT = (sh + 8) % 24;
        const startEpoch = startEpochUTC();
        if (startEpoch === null) return -1;
        const hour = parseInt(hourStr, 10);
        if (isNaN(hour)) return -1;
        if (dayStr) {
            // 有明确日期：用起报日期所在月拼出目标北京时间点
            const day = parseInt(dayStr, 10);
            const startDateBJT = new Date(startEpoch + 8 * 3600000);
            const y = startDateBJT.getUTCFullYear();
            let m = startDateBJT.getUTCMonth();
            // 如果目标日小于起报日，视为次月
            let targetBJT = Date.UTC(y, m, day, hour, 0, 0);
            if (day < startDateBJT.getUTCDate()) targetBJT = Date.UTC(y, m + 1, day, hour, 0, 0);
            const targetEpoch = targetBJT - 8 * 3600000;
            return Math.round((targetEpoch - startEpoch) / 3600000);
        }
        // 无日期：在 0..validity 范围内找第一个匹配该北京时钟点的偏移
        const numCells = (window.pbState?.validityHours || 24) + 1;
        for (let i = 0; i < numCells; i++) {
            if ((startBJT + i) % 24 === hour) return i;
        }
        return -1;
    }

    function importTextToForecast(text) {
        if (!window.pbState) { alert('预报状态未就绪，请先刷新预报数据。'); return 0; }
        if (startEpochUTC() === null) { alert('请先选择起报日期/时间并刷新预报。'); return 0; }
        const nameToIcao = buildNameToIcao();
        const numCells = (window.pbState.validityHours || 24) + 1;
        const lines = (text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
        let imported = 0;
        const unknown = [];

        lines.forEach(line => {
            const m = line.match(/^(.+?)[：:]\s*(.+?)[。.]?$/);
            if (!m) return;
            const namePart = m[1].trim();
            const body = m[2].trim();
            const icao = nameToIcao[namePart] || (/^[A-Z]{4}$/.test(namePart.toUpperCase()) ? namePart.toUpperCase() : null);
            if (!icao) { unknown.push(namePart); return; }

            // 初始化空白一行
            const cells = [];
            for (let i = 0; i < numCells; i++) cells.push({ text: '', bg: 'transparent', fg: '#1e293b', ts: 'none' });

            if (/适航|天气适航/.test(body)) {
                // 适航：保留空白，备注记为适航
                window.pbState.confirmedData[icao] = { rows: [cells], notes: ['适航'] };
                window.pbState.forceShowAirports.add(icao);
                imported++;
                return;
            }

            // 拆分多个时段片段（以逗号/分号/顿号分隔）
            const segs = body.split(/[，,；;]/).map(s => s.trim()).filter(Boolean);
            let lastDay = null;
            segs.forEach(seg => {
                // 匹配 「(N日)?HH(时)?-(N日)?HH时 有 XXX」
                const r = seg.match(/(?:(\d{1,2})日)?(\d{1,2})时?\s*[-—~至]\s*(?:(\d{1,2})日)?(\d{1,2})时\s*有?\s*(.+)/);
                let startOff = -1, endOff = -1, phenomenon = '';
                if (r) {
                    const d1 = r[1] || lastDay; const h1 = r[2];
                    const d2 = r[3] || r[1] || lastDay; const h2 = r[4];
                    lastDay = r[3] || r[1] || lastDay;
                    startOff = resolveOffset(d1, h1);
                    endOff = resolveOffset(d2, h2);
                    phenomenon = (r[5] || '').trim();
                } else {
                    // 单时点：「(N日)?HH时有XXX」
                    const r2 = seg.match(/(?:(\d{1,2})日)?(\d{1,2})时\s*有?\s*(.+)/);
                    if (r2) {
                        const d1 = r2[1] || lastDay;
                        lastDay = r2[1] || lastDay;
                        startOff = endOff = resolveOffset(d1, r2[2]);
                        phenomenon = (r2[3] || '').trim();
                    }
                }
                if (startOff < 0 || endOff < 0 || !phenomenon) return;
                phenomenon = phenomenon.replace(/[。.、]$/, '').trim();
                const lo = Math.max(0, Math.min(startOff, endOff));
                const hi = Math.min(numCells - 1, Math.max(startOff, endOff));
                const style = window.getMultiCellStyle ? window.getMultiCellStyle(phenomenon) : { bg: '#dc2626', fg: '#fff', ts: 'none' };
                for (let i = lo; i <= hi; i++) {
                    cells[i] = { text: phenomenon, bg: style.bg, fg: style.fg, ts: style.ts || 'none' };
                }
            });

            window.pbState.confirmedData[icao] = { rows: [cells], notes: ['/'] };
            window.pbState.forceShowAirports.add(icao);
            imported++;
        });

        if (unknown.length) {
            alert('以下名称未能识别为机场，已跳过：\n' + unknown.join('、'));
        }
        if (imported > 0) {
            if (window.saveConfirmedDataToLocal) window.saveConfirmedDataToLocal();
            // 确保导入的机场出现在分析列表里
            if (Array.isArray(window.currentApAnalysis)) {
                Object.keys(window.pbState.confirmedData).forEach(icao => {
                    if (!window.currentApAnalysis.some(a => a.icao === icao)) {
                        window.currentApAnalysis.push({ icao, hasAlert: true, nwp: null, tafRaw: '', tafHourly: null, autoAdoptEC: false, autoAdoptReason: '' });
                    }
                });
            }
            if (window.renderPublishTable) window.renderPublishTable();
        }
        return imported;
    }

    window.OMICSExport = { openPreview, importTextToForecast };
})();
