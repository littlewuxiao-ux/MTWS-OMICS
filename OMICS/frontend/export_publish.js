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

    // 计算分页：返回每页机场行数组成的数组。优先按“每页机场数”，否则按“总页数”平均分配。
    function paginate(rows, enableSplit, pageCountValue, perPageValue, pageSizesValue) {
        if (!enableSplit || rows.length === 0) return [rows];
        const customSizes = (pageSizesValue || []).map(v => parseInt(v, 10)).filter(v => v > 0);
        if (customSizes.length) {
            const pages = [];
            let pos = 0;
            customSizes.forEach(size => {
                if (pos < rows.length) { pages.push(rows.slice(pos, pos + size)); pos += size; }
            });
            if (pos < rows.length) pages.push(rows.slice(pos));
            return pages.filter(p => p.length);
        }
        const perPage = parseInt(perPageValue, 10);
        if (perPage && perPage > 0) {
            const pages = [];
            for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
            return pages;
        }
        let pageCount = parseInt(pageCountValue, 10);
        if (!pageCount || pageCount < 1) pageCount = Math.min(2, rows.length);
        pageCount = Math.min(pageCount, rows.length);
        const pages = [];
        const base = Math.floor(rows.length / pageCount);
        let extra = rows.length % pageCount;
        let pos = 0;
        for (let p = 0; p < pageCount; p++) {
            const size = base + (extra-- > 0 ? 1 : 0);
            pages.push(rows.slice(pos, pos + size));
            pos += size;
        }
        return pages;
    }

    /* 构建一页用于截图的离屏 DOM：头(标题栏) + 表格(仅选定机场行) + 尾(结冰/颜色/说明)
       通过克隆现有 DOM 节点，最大程度保持与界面一致的观感。 */
    function buildPageNode(pageRows, pageIdx, pageTotal) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:1200px; background:#fff; font-family:微软雅黑,Microsoft YaHei,Arial,sans-serif; color:#1f2937;';

        // 头：克隆标题栏
        const headerSrc = document.getElementById('pb-export-header');
        if (headerSrc) {
            const h = headerSrc.cloneNode(true);
            h.style.borderRadius = '0';
            h.style.padding = '14px 18px 28px 18px';
            h.querySelectorAll('select,input').forEach(el => {
                const display = document.createElement('span');
                display.textContent = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value || '') : (el.value || '');
                display.style.cssText = el.id === 'pb-main-title-select'
                    ? 'display:block; text-align:center; font-size:42px; line-height:1.15; font-weight:800; letter-spacing:2px; color:#fff; margin-bottom:22px;'
                    : 'display:inline-block; min-width:70px; text-align:center; color:#fff;';
                el.replaceWith(display);
            });
            wrap.appendChild(h);
        }

        // 表格：克隆 thead + 选中机场对应的 tbody 行（含其确认行）
        const srcTable = document.getElementById('forecast-table');
        const tbl = document.createElement('table');
        tbl.style.cssText = 'width:100%; border-collapse:collapse; table-layout:auto; text-align:center; border-bottom:2px solid #5D6D7E; font-family:微软雅黑,Microsoft YaHei,Arial,sans-serif;';
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
        const textWidth = (txt, min, max, unit = 14) => Math.max(min, Math.min(max, String(txt || '').trim().length * unit + 28));
        const airportWidth = Math.max(90, ...pageRows.map(r => textWidth(r.name, 90, 220, 16)));
        const typeWidth = Math.max(60, ...pageRows.map(r => textWidth(r.type, 60, 150, 15)));
        const noteWidth = Math.max(92, ...pageRows.map(r => textWidth(r.note, 92, 260, 10)));
        const hourCells = (window.pbState?.validityHours || 24) + 1;
        const hourWidth = hourCells > 25 ? 38 : 42;
        const tableWidth = Math.max(1200, airportWidth + typeWidth + noteWidth + hourCells * hourWidth + 24);
        wrap.style.width = `${tableWidth}px`;
        tbl.style.width = `${tableWidth}px`;

        // sticky 在截图里会错位，统一取消；同时把字体/换行压到适合图片输出，避免内容撑破单元格。
        tbl.querySelectorAll('th, td').forEach(c => {
            c.style.position = 'static';
            c.style.border = '1px solid rgba(148, 163, 184, 0.55)';
            c.style.overflow = 'hidden';
            c.style.textOverflow = 'clip';
            c.style.boxSizing = 'border-box';
            c.style.lineHeight = '1.15';
            c.style.padding = '3px 2px';
            c.style.height = '30px';
            if (c.classList.contains('td-data')) {
                c.style.whiteSpace = 'normal';
                c.style.wordBreak = 'break-word';
                c.style.overflowWrap = 'anywhere';
                c.style.fontFamily = '微软雅黑,Microsoft YaHei,Arial,sans-serif';
                c.style.fontSize = '10px';
                c.style.fontWeight = '700';
                c.style.width = `${hourWidth}px`;
                c.style.minWidth = `${hourWidth}px`;
            }
            if (c.classList.contains('td-airport')) {
                c.style.whiteSpace = 'nowrap';
                c.style.wordBreak = 'keep-all';
                c.style.width = `${airportWidth}px`;
                c.style.minWidth = `${airportWidth}px`;
            } else if (c.classList.contains('col-airport') && !c.classList.contains('td-data')) {
                c.style.whiteSpace = 'nowrap';
                c.style.wordBreak = 'keep-all';
            }
            if (c.classList.contains('col-source') || c.classList.contains('col-op') || c.classList.contains('col-desc')) {
                c.style.whiteSpace = 'nowrap';
                c.style.wordBreak = 'keep-all';
                c.style.width = c.classList.contains('col-desc') ? `${noteWidth}px` : `${Math.ceil(noteWidth / 2)}px`;
                c.style.minWidth = c.style.width;
            }
        });
        tbl.querySelectorAll('input,button').forEach(el => {
            if (el.classList.contains('airport-delete-x')) { el.remove(); return; }
            if (el.tagName === 'INPUT') {
                const span = document.createElement('span');
                span.textContent = el.value || '';
                span.style.cssText = 'font-size:10px; font-weight:700; color:#1e40af; white-space:nowrap; word-break:keep-all;';
                el.replaceWith(span);
            } else {
                el.style.display = 'none';
            }
        });
        wrap.appendChild(tbl);

        // 尾：克隆结冰/颜色/说明区
        const footerSrc = document.getElementById('pb-export-footer');
        if (footerSrc) {
            const f = footerSrc.cloneNode(true);
            f.querySelectorAll('input').forEach(el => {
                const span = document.createElement('span');
                span.textContent = el.value || '无';
                span.style.cssText = 'font-weight:700; color:#005A9C;';
                el.replaceWith(span);
            });
            f.style.fontSize = '12px';
            f.style.borderColor = 'rgba(148, 163, 184, 0.55)';
            f.querySelectorAll('div').forEach(el => {
                const st = el.style;
                if (st.border || st.borderBottom || st.borderRight || st.borderTop || st.borderLeft) {
                    st.borderColor = 'rgba(148, 163, 184, 0.55)';
                }
            });
            wrap.appendChild(f);
        }

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
            const canvas = await html2canvas(pageNode, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                windowWidth: pageNode.scrollWidth,
                windowHeight: pageNode.scrollHeight
            });
            return canvas.toDataURL('image/png');
        } finally {
            document.body.removeChild(holder);
        }
    }

    function updatePublishStickyOffsets() {
        const header = document.getElementById('pb-export-header');
        const workspace = document.getElementById('publish-workspace');
        if (!header || !workspace) return;
        const h = Math.ceil(header.getBoundingClientRect().height || 0);
        workspace.style.setProperty('--pb-sticky-top', `${h}px`);
    }

    // ---- 预览弹窗状态 ----
    const state = { mode: 'image', rows: [], rawRows: [], images: [], pageSizes: [], rendering: false };

    function refreshPreview() {
        const body = document.getElementById('export-preview-body');
        const info = document.getElementById('export-page-info');
        if (!body) return;
        const split = document.getElementById('export-split-toggle')?.checked;
        const pageCountInput = document.getElementById('export-pagecount');
        if (split && pageCountInput && !pageCountInput.value) pageCountInput.value = Math.min(2, state.rows.length || 2);
        const pageCount = pageCountInput?.value;
        const perPage = document.getElementById('export-perpage')?.value;
        const pageCountEl = document.getElementById('export-pagecount');
        const perPageEl = document.getElementById('export-perpage');
        if (pageCountEl) pageCountEl.disabled = !split;
        if (perPageEl) perPageEl.disabled = !split;

        if (state.mode === 'excel') {
            // Excel 预览：用 HTML 表格近似展示将写入的机场数据
            const pages = [state.rows];
            renderExcelPreview(body, info, state.rows);
            return;
        }

        const sizeInputs = Array.from(document.querySelectorAll('.export-page-size-input')).map(i => i.value);
        const pages = paginate(state.rows, split, pageCount, perPage, sizeInputs);
        state.pageSizes = pages.map(p => p.length);
        renderPageSizeControls(split, pages);
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

    function renderPageSizeControls(split, pages) {
        const box = document.getElementById('export-page-size-controls');
        if (!box) return;
        if (!split || !pages || pages.length <= 1) { box.style.display = 'none'; box.innerHTML = ''; return; }
        box.style.display = 'flex';
        box.innerHTML = '<span style="font-weight:bold;color:#1e40af;">单页机场数:</span>' + pages.map((p, idx) =>
            `<label style="display:flex;align-items:center;gap:4px;">第${idx + 1}页 <input class="export-page-size-input" data-page="${idx}" type="number" min="1" value="${p.length}" style="width:58px;padding:3px;border:1px solid #cbd5e1;border-radius:4px;"></label>`
        ).join('') + '<span style="color:#94a3b8;">修改后会重新分配，剩余机场自动顺延</span>';
        box.querySelectorAll('.export-page-size-input').forEach(inp => inp.addEventListener('change', () => { state.images = []; refreshPreview(); }));
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
        state.images = [];
        state.pageSizes = [];
        if (state.rows.length === 0) { alert('没有已确认编发或有效的机场行可导出。'); return; }

        document.getElementById('export-preview-title').textContent = mode === 'image' ? '🖼️ 导出图片预览' : '📊 导出 Excel 预览';
        // Excel 模式隐藏图片分页控件
        const splitWrap = document.getElementById('export-split-wrap');
        const pageWrap = document.getElementById('export-pagecount-wrap');
        const perWrap = document.getElementById('export-perpage-wrap');
        if (splitWrap) splitWrap.style.display = mode === 'image' ? 'flex' : 'none';
        if (pageWrap) pageWrap.style.display = mode === 'image' ? 'flex' : 'none';
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
                    const pageCount = document.getElementById('export-pagecount')?.value;
                    const perPage = document.getElementById('export-perpage')?.value;
                    const sizeInputs = Array.from(document.querySelectorAll('.export-page-size-input')).map(i => i.value);
                    const pages = paginate(state.rows, split, pageCount, perPage, sizeInputs);
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
        updatePublishStickyOffsets();
        window.addEventListener('resize', updatePublishStickyOffsets);
        const pbHeader = document.getElementById('pb-export-header');
        if (pbHeader) new MutationObserver(updatePublishStickyOffsets).observe(pbHeader, { childList: true, subtree: true, attributes: true });
        document.getElementById('close-export-preview')?.addEventListener('click', () => {
            document.getElementById('export-preview-modal').style.display = 'none';
        });
        document.getElementById('export-split-toggle')?.addEventListener('change', () => { state.images = []; refreshPreview(); });
        document.getElementById('export-pagecount')?.addEventListener('change', () => { state.images = []; refreshPreview(); });
        document.getElementById('export-perpage')?.addEventListener('change', () => { state.images = []; refreshPreview(); });
        document.getElementById('export-preview-confirm')?.addEventListener('click', doExport);

        // ---- 文图互导：导出/导入 标签切换 + 纠错 ----
        const tabOut = document.getElementById('export-text-tab-out');
        const tabIn = document.getElementById('export-text-tab-in');
        const importBtn = document.getElementById('import-export-text-btn');
        const checkBtn = document.getElementById('check-export-text-btn');
        const copyBtn = document.getElementById('copy-export-text-btn');
        const outHint = document.getElementById('export-text-out-hint');
        const inHint = document.getElementById('export-text-in-hint');
        const panel = document.getElementById('export-text-error-panel');
        const ta = document.getElementById('export-text-content');

        function setTab(mode) {
            const isIn = mode === 'in';
            if (tabIn) tabIn.style.background = isIn ? '#2563eb' : '#64748b';
            if (tabOut) tabOut.style.background = isIn ? '#64748b' : '#28a745';
            if (outHint) outHint.style.display = isIn ? 'none' : 'block';
            if (inHint) inHint.style.display = isIn ? 'block' : 'none';
            if (importBtn) importBtn.style.display = isIn ? 'inline-block' : 'none';
            if (checkBtn) checkBtn.style.display = isIn ? 'inline-block' : 'none';
            if (copyBtn) copyBtn.style.display = isIn ? 'none' : 'inline-block';
            if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
            if (ta) {
                ta.style.borderColor = '#ccc';
                if (isIn) {
                    ta.value = '';
                    ta.placeholder = '例：\n深圳：5日08-11时有雷雨，12-15时有大风。\n杭州：5日06Z-09Z有小雨。（Z=世界时/UTC；无Z默认北京时）';
                }
                ta.dataset.mode = mode;
            }
        }
        tabOut?.addEventListener('click', () => setTab('out'));
        tabIn?.addEventListener('click', () => setTab('in'));
        checkBtn?.addEventListener('click', () => validateImportText(ta.value, true));
        importBtn?.addEventListener('click', () => {
            const checked = validateImportText(ta.value, true);
            if (!checked.ok) return;
            const n = importTextToForecast(ta.value);
            if (n > 0) {
                document.getElementById('export-text-modal').style.display = 'none';
                alert(`✅ 已导入 ${n} 个机场的预报，已以编发状态显示。`);
            }
        });
    });

    /* ===== 需求2：文字 -> 24小时预报（反向解析） =====
       支持行格式：机场名：时段描述。
       北京时：5日08-11时有雷雨；世界时：5日00Z-03Z有雷雨 / 00Z-03Z有雷雨。
       无 Z 默认北京时；任一端带 Z 则按世界时 UTC 解析。 */
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

    function standardFormatTip() {
        return '标准格式：每行一个机场，例如：\n' +
            '深圳：5日08-11时有雷雨，12-15时有大风。\n' +
            '杭州：5日06Z-09Z有小雨。\n' +
            '说明：无 Z 默认北京时；时间后加 Z 表示世界时/UTC；机场可填中文名或四字码。';
    }

    // 将「N日HH」或「HH」解析为相对起报世界时的小时偏移。
    // isUTC=true 表示输入时间为世界时；false 表示北京时。
    function resolveOffset(dayStr, hourStr, isUTC = false) {
        const startEpoch = startEpochUTC();
        if (startEpoch === null) return -1;
        const hour = parseInt(hourStr, 10);
        if (isNaN(hour) || hour < 0 || hour > 23) return -1;

        const base = new Date(startEpoch + (isUTC ? 0 : 8 * 3600000));
        if (dayStr) {
            const day = parseInt(dayStr, 10);
            if (isNaN(day) || day < 1 || day > 31) return -1;
            const y = base.getUTCFullYear();
            const m = base.getUTCMonth();
            let targetWall = Date.UTC(y, m, day, hour, 0, 0);
            if (day < base.getUTCDate()) targetWall = Date.UTC(y, m + 1, day, hour, 0, 0);
            const targetEpoch = isUTC ? targetWall : targetWall - 8 * 3600000;
            return Math.round((targetEpoch - startEpoch) / 3600000);
        }

        const numCells = (window.pbState?.validityHours || 24) + 1;
        const startWallHour = isUTC ? (window.pbState?.startHour || 0) : ((window.pbState?.startHour || 0) + 8) % 24;
        for (let i = 0; i < numCells; i++) {
            if ((startWallHour + i) % 24 === hour) return i;
        }
        return -1;
    }

    function parseForecastLine(line, lineNo, nameToIcao, numCells) {
        const errors = [];
        const m = line.match(/^(.+?)[：:]\s*(.+?)[。.]?$/);
        if (!m) {
            errors.push({ lineNo, line, reason: '缺少“机场名：预报内容”结构。' });
            return { errors };
        }
        const namePart = m[1].trim();
        const body = m[2].trim();
        const icao = nameToIcao[namePart] || (/^[A-Z]{4}$/.test(namePart.toUpperCase()) ? namePart.toUpperCase() : null);
        if (!icao) {
            errors.push({ lineNo, line, reason: `无法识别机场“${namePart}”。请使用机场中文名或四字码，如“深圳”或“ZGSZ”。` });
            return { errors };
        }

        const cells = [];
        for (let i = 0; i < numCells; i++) cells.push({ text: '', bg: 'transparent', fg: '#1e293b', ts: 'none' });

        if (/适航|天气适航/.test(body)) return { icao, cells, note: '适航', errors: [] };

        const segs = body.split(/[，,；;]/).map(s => s.trim()).filter(Boolean);
        if (!segs.length) {
            errors.push({ lineNo, line, reason: '没有识别到时段描述。' });
            return { errors };
        }

        let lastDay = null;
        let applied = 0;
        segs.forEach(seg => {
            // 例：5日08-11时有雷雨；5日00Z-03Z有雷雨；5日22时-6日02时有雷雨
            const r = seg.match(/(?:(\d{1,2})日)?(\d{1,2})(?:时)?(Z)?\s*[-—~至]\s*(?:(\d{1,2})日)?(\d{1,2})(?:时)?(Z)?\s*有?\s*(.+)/i);
            let startOff = -1, endOff = -1, phenomenon = '';
            if (r) {
                const d1 = r[1] || lastDay;
                const h1 = r[2];
                const z1 = !!r[3];
                const d2 = r[4] || r[1] || lastDay;
                const h2 = r[5];
                const z2 = !!r[6];
                const isUTC = z1 || z2;
                lastDay = r[4] || r[1] || lastDay;
                startOff = resolveOffset(d1, h1, isUTC);
                endOff = resolveOffset(d2, h2, isUTC);
                phenomenon = (r[7] || '').trim();
            } else {
                const r2 = seg.match(/(?:(\d{1,2})日)?(\d{1,2})(?:时)?(Z)?\s*有?\s*(.+)/i);
                if (r2) {
                    const d1 = r2[1] || lastDay;
                    const h1 = r2[2];
                    const isUTC = !!r2[3];
                    lastDay = r2[1] || lastDay;
                    startOff = endOff = resolveOffset(d1, h1, isUTC);
                    phenomenon = (r2[4] || '').trim();
                }
            }
            phenomenon = phenomenon.replace(/[。.、]$/, '').trim();
            if (startOff < 0 || endOff < 0 || !phenomenon) {
                errors.push({ lineNo, line, segment: seg, reason: '无法识别时段或天气现象。请写成“5日08-11时有雷雨”或“5日00Z-03Z有雷雨”。' });
                return;
            }
            if (startOff >= numCells || endOff < 0) {
                errors.push({ lineNo, line, segment: seg, reason: '时段不在当前预报有效期内。' });
                return;
            }
            const lo = Math.max(0, Math.min(startOff, endOff));
            const hi = Math.min(numCells - 1, Math.max(startOff, endOff));
            const style = window.getMultiCellStyle ? window.getMultiCellStyle(phenomenon) : { bg: '#dc2626', fg: '#fff', ts: 'none' };
            for (let i = lo; i <= hi; i++) cells[i] = { text: phenomenon, bg: style.bg, fg: style.fg, ts: style.ts || 'none' };
            applied++;
        });

        if (!applied) errors.push({ lineNo, line, reason: '整行没有任何可导入的有效时段。' });
        return { icao, cells, note: '/', errors };
    }

    function renderValidationPanel(result) {
        const panel = document.getElementById('export-text-error-panel');
        const ta = document.getElementById('export-text-content');
        if (!panel || !ta) return;
        if (result.ok) {
            ta.style.borderColor = '#22c55e';
            panel.style.display = 'block';
            panel.style.borderColor = '#bbf7d0';
            panel.style.background = '#f0fdf4';
            panel.innerHTML = `<div style="color:#15803d; font-weight:bold;">✅ 纠错检查通过：可导入 ${result.validCount} 个机场。</div>`;
            return;
        }
        ta.style.borderColor = '#dc2626';
        panel.style.display = 'block';
        panel.style.borderColor = '#fecaca';
        panel.style.background = '#fff7f7';
        const rows = result.errors.map(e => `<div style="border-left:4px solid #dc2626; background:#fee2e2; padding:6px 8px; margin:5px 0; border-radius:4px; color:#7f1d1d;">
            <b>第 ${e.lineNo} 行无法识别：</b>${escapeHtml(e.line || '')}<br>
            ${e.segment ? `<b>问题片段：</b>${escapeHtml(e.segment)}<br>` : ''}
            <b>原因：</b>${escapeHtml(e.reason)}
        </div>`).join('');
        panel.innerHTML = rows + `<div style="margin-top:8px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; padding:8px; border-radius:4px; white-space:pre-line;">${escapeHtml(standardFormatTip())}</div>`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    function validateImportText(text, showPanel = false) {
        if (!window.pbState || startEpochUTC() === null) {
            const result = { ok: false, validCount: 0, errors: [{ lineNo: '-', line: '', reason: '预报状态未就绪，请先选择起报日期/时间并刷新预报。' }] };
            if (showPanel) renderValidationPanel(result);
            return result;
        }
        const nameToIcao = buildNameToIcao();
        const numCells = (window.pbState.validityHours || 24) + 1;
        const lines = (text || '').split(/\n+/).map((raw, idx) => ({ raw: raw.trim(), lineNo: idx + 1 })).filter(x => x.raw);
        if (!lines.length) {
            const result = { ok: false, validCount: 0, errors: [{ lineNo: 1, line: '', reason: '请输入需要导入的预报文本。' }] };
            if (showPanel) renderValidationPanel(result);
            return result;
        }
        const parsed = lines.map(x => parseForecastLine(x.raw, x.lineNo, nameToIcao, numCells));
        const errors = parsed.flatMap(p => p.errors || []);
        const validCount = parsed.filter(p => p.icao && !(p.errors || []).length).length;
        const result = { ok: errors.length === 0, validCount, errors, parsed };
        if (showPanel) renderValidationPanel(result);
        return result;
    }

    function importTextToForecast(text) {
        const checked = validateImportText(text, false);
        if (!checked.ok) {
            renderValidationPanel(checked);
            return 0;
        }
        let imported = 0;
        checked.parsed.forEach(item => {
            if (!item.icao) return;
            window.pbState.confirmedData[item.icao] = { rows: [item.cells], notes: [item.note || '/'] };
            window.pbState.forceShowAirports.add(item.icao);
            imported++;
        });
        if (imported > 0) {
            if (window.saveConfirmedDataToLocal) window.saveConfirmedDataToLocal();
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
