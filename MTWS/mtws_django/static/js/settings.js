/**
 * settings.js — 设置弹窗逻辑
 * 依赖 main.js 中的全局变量：currentTimeMode, currentToken, currentUserCode
 * 依赖 main.js 中的函数：showModal, hideModal
 */
(function () {
  'use strict';

  // ========== 状态 ==========
  let areaOptions = {};          // { '国内': [...], '国际': [...] }
  let airportEditCode = null;    // 正在编辑的机场四字代码，null=新增
  let areaEditId = null;
  let carrierEditId = null;

  // ========== 工具 ==========
  function apiUrl(path) {
    const mode = (typeof currentTimeMode !== 'undefined' ? currentTimeMode : null) || window.currentTimeMode || 'current';
    return `/${mode}/api/${path}`;
  }

  function getHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const token = (typeof currentToken !== 'undefined' ? currentToken : null) || window.currentToken;
    const userCode = (typeof currentUserCode !== 'undefined' ? currentUserCode : null) || window.currentUserCode;
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (userCode) h['X-User-Code'] = userCode;
    return h;
  }

  async function apiFetch(url, options) {
    const res = await fetch(url, { headers: getHeaders(), ...options });
    return res.json();
  }

  function showMsg(elId, text, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-msg ' + (type || '');
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ========== Toggle 3-segment track ==========
  function initTrack(trackEl) {
    const segs = trackEl.querySelectorAll('.settings-track-seg');
    const thumb = trackEl.querySelector('.settings-track-thumb');
    const idx = { R: 0, Y: 1, G: 2 };

    function setVal(val) {
      trackEl.dataset.value = val;
      const i = idx[val] ?? 1;
      const colors = window.MTWS_ALERT_COLORS || {};
      thumb.style.background = (colors[val] && colors[val].hex) || '';
      thumb.style.transform = `translateX(${i * 100}%)`;
    }

    setVal(trackEl.dataset.value || 'Y');

    trackEl.addEventListener('click', function (e) {
      const rect = trackEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const seg = Math.floor(x / rect.width * 3);
      const vals = ['R', 'Y', 'G'];
      setVal(vals[Math.min(2, Math.max(0, seg))]);
    });

    return { setVal, getVal: () => trackEl.dataset.value };
  }

  // ========== Tab switching ==========
  function switchTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    const btn = document.querySelector(`.settings-tab[data-tab="${tabName}"]`);
    const pane = document.getElementById(`settings-pane-${tabName}`);
    if (btn) btn.classList.add('active');
    if (pane) pane.classList.add('active');
    return loadTab(tabName);
  }

  async function loadTab(tabName) {
    switch (tabName) {
      case 'airport-info': await loadAirportInfo(); break;
      case 'area-options': await loadAreaOptions(); break;
      case 'data-refresh-timer': await loadTimers(); break;
      case 'carrier': await loadCarriers(); break;
      case 'popup': await loadPopupSettings(); break;
      case 'alert-thresholds': await loadAlertThresholds(); break;
      case 'weather-type': await loadWeatherType(); break;
      case 'weather-alert': await loadWeatherAlert(); break;
      case 'airport-location': await loadAirportLocation(); break;
    }
  }

  // ========== Tab1: 机场信息 ==========
  async function loadAirportInfo() {
    await refreshAreaOptionsCache();
    const res = await apiFetch(apiUrl('settings/airport-info/'));
    if (!res.success) { showMsg('airport-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('airport-tbody');
    tbody.innerHTML = res.data.map(a => {
      const isDefault = a.airport_4code === 'default';
      const ops = isDefault
        ? '<span class="settings-readonly-badge">系统默认</span>'
        : `<button class="settings-edit-btn" onclick="SettingsModal.editAirport('${escHtml(a.airport_4code)}')">编辑</button>
           <button class="settings-del-btn" onclick="SettingsModal.deleteAirport('${escHtml(a.airport_4code)}')">删除</button>`;
      return `<tr class="${isDefault ? 'settings-row-readonly' : ''}">
        <td>${escHtml(a.airport_4code)}</td>
        <td>${escHtml(a.airport_name)}</td>
        <td>${escHtml(a.classification)}</td>
        <td>${escHtml(a.area)}</td>
        <td>${escHtml(a.taf_init_time)}</td>
        <td>${a.import_check_interval}h</td>
        <td>${escHtml(a.taf_max_delay)}</td>
        <td>${escHtml(a.airport_3code)}</td>
        <td>${ops}</td>
      </tr>`;
    }).join('');
    hideAirportForm();
  }

  async function refreshAreaOptionsCache() {
    const res = await apiFetch(apiUrl('settings/area-options/'));
    if (!res.success) return;
    areaOptions = {};
    res.data.forEach(o => {
      if (!areaOptions[o.classification]) areaOptions[o.classification] = [];
      areaOptions[o.classification].push(o.area);
    });
  }

  function updateAreaSelect(classification) {
    const sel = document.getElementById('af-area');
    const areas = areaOptions[classification] || [];
    sel.innerHTML = areas.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('');
  }

  function showAirportForm(data) {
    const panel = document.getElementById('airport-form-panel');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    document.getElementById('airport-form-title').textContent = data ? '编辑机场' : '新增机场';

    const isEdit = !!data;
    document.getElementById('af-4code').disabled = isEdit;
    document.getElementById('af-4code').value = data ? data.airport_4code : '';
    document.getElementById('af-3code').value = data ? (data.airport_3code || '') : '';
    document.getElementById('af-name').value = data ? (data.airport_name || '') : '';
    document.getElementById('af-taf-init').value = data ? (data.taf_init_time ?? '') : '';
    document.getElementById('af-max-delay').value = data ? (data.taf_max_delay ?? '') : '';
    document.getElementById('af-area-code').value = data ? (data.area_code || '') : '';
    document.getElementById('af-forecast-phone').value = data ? (data.forecast_phone || '') : '';
    document.getElementById('af-obs-phone').value = data ? (data.observation_phone || '') : '';
    document.getElementById('af-other-phone').value = data ? (data.other_phone || '') : '';

    const classification = data ? (data.classification || '国内') : '国内';
    const chk = document.getElementById('af-classification-chk');
    chk.checked = classification === '国际';
    updateAreaSelect(classification);
    if (data && data.area) document.getElementById('af-area').value = data.area;

    const intervalChk = document.getElementById('af-interval-chk');
    intervalChk.checked = data ? (parseInt(data.import_check_interval) === 6) : false;
  }

  function hideAirportForm() {
    document.getElementById('airport-form-panel').style.display = 'none';
    airportEditCode = null;
  }

  async function saveAirport() {
    const code = document.getElementById('af-4code').value.trim().toUpperCase();
    const a3 = document.getElementById('af-3code').value.trim().toUpperCase();
    const name = document.getElementById('af-name').value.trim();
    const classificationChk = document.getElementById('af-classification-chk').checked;
    const classification = classificationChk ? '国际' : '国内';
    const area = document.getElementById('af-area').value;
    const tafInit = document.getElementById('af-taf-init').value;
    const intervalChk = document.getElementById('af-interval-chk').checked;
    const importInterval = intervalChk ? 6 : 3;
    const maxDelay = document.getElementById('af-max-delay').value;

    if (!code || code.length !== 4 || !/^[A-Z]{4}$/.test(code)) {
      showMsg('airport-msg', '机场四字代码必须为恰好4位英文大写字母', 'error'); return;
    }
    if (a3 && (a3.length !== 3 || !/^[A-Z]{3}$/.test(a3))) {
      showMsg('airport-msg', '机场三字代码必须为恰好3位英文大写字母', 'error'); return;
    }
    if (!name || name.length < 3 || name.length > 15) {
      showMsg('airport-msg', '机场名称为3–15位字符', 'error'); return;
    }
    if (!area) { showMsg('airport-msg', '请选择区域', 'error'); return; }
    if (tafInit === '' || isNaN(tafInit)) { showMsg('airport-msg', '请填写首份预报发布时间', 'error'); return; }
    if (maxDelay === '' || isNaN(maxDelay) || maxDelay < 0 || maxDelay > 99) {
      showMsg('airport-msg', '预报接收延迟时间需为0–99的整数', 'error'); return;
    }

    const payload = {
      airport_4code: code,
      airport_3code: a3 || null,
      airport_name: name,
      classification,
      area,
      taf_init_time: parseInt(tafInit),
      import_check_interval: importInterval,
      taf_max_delay: parseInt(maxDelay),
      area_code: document.getElementById('af-area-code').value.trim() || null,
      forecast_phone: document.getElementById('af-forecast-phone').value.trim() || null,
      observation_phone: document.getElementById('af-obs-phone').value.trim() || null,
      other_phone: document.getElementById('af-other-phone').value.trim() || null,
    };

    const isEdit = !!airportEditCode;
    const url = isEdit
      ? apiUrl(`settings/airport-info/${airportEditCode}/`)
      : apiUrl('settings/airport-info/');
    const method = isEdit ? 'PUT' : 'POST';

    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (res.success) {
      showMsg('airport-msg', res.message, 'success');
      await loadAirportInfo();
    } else {
      showMsg('airport-msg', res.error, 'error');
    }
  }

  // ========== Tab2: 区域信息 ==========
  async function loadAreaOptions() {
    const res = await apiFetch(apiUrl('settings/area-options/'));
    if (!res.success) { showMsg('area-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('area-tbody');
    let lastClass = null;
    const rows = [];
    res.data.forEach(o => {
      if (lastClass !== null && o.classification !== lastClass) {
        rows.push(`<tr class="settings-area-divider-row"><td colspan="4"><div class="settings-area-divider"></div></td></tr>`);
      }
      rows.push(`<tr>
        <td>${escHtml(o.classification)}</td>
        <td>${escHtml(o.area)}</td>
        <td>${escHtml(o.sequence)}</td>
        <td>
          <button class="settings-edit-btn" onclick="SettingsModal.editArea(${o.id})">编辑</button>
          <button class="settings-del-btn" onclick="SettingsModal.deleteArea(${o.id})">删除</button>
        </td>
      </tr>`);
      lastClass = o.classification;
    });
    tbody.innerHTML = rows.join('');
    hideAreaForm();
  }

  function showAreaForm(data) {
    const panel = document.getElementById('area-form-panel');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    document.getElementById('area-form-title').textContent = data ? '编辑区域' : '新增区域';
    const chk = document.getElementById('aof-classification-chk');
    const classification = data ? (data.classification || '国内') : '国内';
    chk.checked = classification === '国际';
    document.getElementById('aof-area').value = data ? (data.area || '') : '';
    document.getElementById('aof-sequence').value = data ? (data.sequence ?? '') : '';
  }

  function hideAreaForm() {
    document.getElementById('area-form-panel').style.display = 'none';
    areaEditId = null;
  }

  async function saveArea() {
    const chk = document.getElementById('aof-classification-chk').checked;
    const classification = chk ? '国际' : '国内';
    const area = document.getElementById('aof-area').value.trim();
    const sequence = document.getElementById('aof-sequence').value;

    if (!area || area.length < 2 || area.length > 10) {
      showMsg('area-msg', '区域名称为2–10位字符', 'error'); return;
    }
    if (!sequence || isNaN(sequence) || parseInt(sequence) < 1) {
      showMsg('area-msg', '排序需为正整数', 'error'); return;
    }

    const payload = { classification, area, sequence: parseInt(sequence) };
    const isEdit = areaEditId !== null;
    const url = isEdit
      ? apiUrl(`settings/area-options/${areaEditId}/`)
      : apiUrl('settings/area-options/');
    const method = isEdit ? 'PUT' : 'POST';

    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (res.success) {
      showMsg('area-msg', res.message, 'success');
      await loadAreaOptions();
      await refreshAreaOptionsCache();
    } else {
      showMsg('area-msg', res.error, 'error');
    }
  }

  // ========== Tab3: 数据自动更新 ==========
  async function loadTimers() {
    const res = await apiFetch(apiUrl('settings/data-refresh-timer/'));
    if (!res.success) { showMsg('timer-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('timer-tbody');
    tbody.innerHTML = res.data.map(t => `
      <tr id="timer-row-${t.id}">
        <td>${escHtml(t.data_name)}</td>
        <td><input type="number" class="settings-timer-input" id="timer-init-${t.id}" value="${t.init_time}" min="0" max="50" step="0.5"></td>
        <td><input type="number" class="settings-timer-input" id="timer-interval-${t.id}" value="${t.interval}" min="0.5" max="30" step="0.5"></td>
        <td><button class="settings-save-inline-btn" onclick="SettingsModal.saveTimer(${t.id})">保存</button></td>
      </tr>`).join('');
  }

  async function saveTimer(id) {
    const initVal = parseFloat(document.getElementById(`timer-init-${id}`).value);
    const intervalVal = parseFloat(document.getElementById(`timer-interval-${id}`).value);

    if (isNaN(initVal) || initVal < 0 || initVal > 50 || (initVal * 2) % 1 !== 0) {
      showMsg('timer-msg', 'init_time 需为0–50之间0.5的倍数', 'error'); return;
    }
    if (isNaN(intervalVal) || intervalVal < 0.5 || intervalVal > 30 || (intervalVal * 2) % 1 !== 0) {
      showMsg('timer-msg', 'interval 需为0.5–30之间0.5的倍数', 'error'); return;
    }

    const res = await apiFetch(apiUrl(`settings/data-refresh-timer/${id}/`), {
      method: 'PUT',
      body: JSON.stringify({ init_time: initVal, interval: intervalVal })
    });
    showMsg('timer-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
  }

  // ========== Tab4: 承运人 ==========
  async function loadCarriers() {
    const res = await apiFetch(apiUrl('settings/carrier/'));
    if (!res.success) { showMsg('carrier-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('carrier-tbody');
    tbody.innerHTML = res.data.map(c => `
      <tr>
        <td class="${c.is_active ? '' : 'settings-carrier-inactive'}">${escHtml(c.carrier_code)}</td>
        <td>${escHtml(c.carrier_name)}</td>
        <td>${c.is_active ? '生效' : '<span style="color:#aaa">停用</span>'}</td>
        <td>
          <button class="settings-edit-btn" onclick="SettingsModal.editCarrier(${c.id})">编辑</button>
          <button class="settings-del-btn" onclick="SettingsModal.deleteCarrier(${c.id})">删除</button>
        </td>
      </tr>`).join('');
    hideCarrierForm();
  }

  function showCarrierForm(data) {
    const panel = document.getElementById('carrier-form-panel');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    document.getElementById('carrier-form-title').textContent = data ? '编辑承运人' : '新增承运人';
    document.getElementById('cf-code').disabled = !!data;
    document.getElementById('cf-code').value = data ? (data.carrier_code || '') : '';
    document.getElementById('cf-name').value = data ? (data.carrier_name || '') : '';
    const chk = document.getElementById('cf-active-chk');
    chk.checked = data ? !!data.is_active : true;
  }

  function hideCarrierForm() {
    document.getElementById('carrier-form-panel').style.display = 'none';
    carrierEditId = null;
  }

  async function saveCarrier() {
    const code = document.getElementById('cf-code').value.trim();
    const name = document.getElementById('cf-name').value.trim();
    const isActive = document.getElementById('cf-active-chk').checked;

    if (!code || code.length !== 2) {
      showMsg('carrier-msg', '承运人代码必须为恰好2位字符', 'error'); return;
    }
    if (name && name.length > 20) {
      showMsg('carrier-msg', '承运人名称不超过20位字符', 'error'); return;
    }

    const payload = { carrier_code: code, carrier_name: name || null, is_active: isActive };
    const isEdit = carrierEditId !== null;
    const url = isEdit
      ? apiUrl(`settings/carrier/${carrierEditId}/`)
      : apiUrl('settings/carrier/');
    const method = isEdit ? 'PUT' : 'POST';

    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (res.success) {
      showMsg('carrier-msg', res.message, 'success');
      await loadCarriers();
    } else {
      showMsg('carrier-msg', res.error, 'error');
    }
  }

  // ========== Tab5: 弹窗设置 ==========
  let opLevelTrack, parkLevelTrack;

  async function loadPopupSettings() {
    opLevelTrack = opLevelTrack || initTrack(document.getElementById('pf-op-level-track'));
    parkLevelTrack = parkLevelTrack || initTrack(document.getElementById('pf-park-level-track'));

    const res = await apiFetch(apiUrl('settings/popup/'));
    if (!res.success) { showMsg('popup-msg', res.error, 'error'); return; }
    const d = res.data;
    document.getElementById('pf-operation-chk').checked = !!d.operation_metar_popup;
    document.getElementById('pf-parking-chk').checked = !!d.parking_metar_popup;
    document.getElementById('pf-leeway').value = d.operation_metar_popup_leeway ?? 0;
    document.getElementById('pf-intercept-chk').checked = !!d.intercept;
    opLevelTrack.setVal(d.operation_metar_popup_level || 'Y');
    parkLevelTrack.setVal(d.parking_metar_popup_level || 'Y');
  }

  async function savePopupSettings() {
    const payload = {
      operation_metar_popup: document.getElementById('pf-operation-chk').checked ? 1 : 0,
      parking_metar_popup: document.getElementById('pf-parking-chk').checked ? 1 : 0,
      operation_metar_popup_leeway: parseInt(document.getElementById('pf-leeway').value) || 0,
      operation_metar_popup_level: opLevelTrack ? opLevelTrack.getVal() : 'Y',
      parking_metar_popup_level: parkLevelTrack ? parkLevelTrack.getVal() : 'Y',
      intercept: document.getElementById('pf-intercept-chk').checked ? 1 : 0,
    };

    const leeway = payload.operation_metar_popup_leeway;
    if (isNaN(leeway) || leeway < 0 || leeway > 9) {
      showMsg('popup-msg', '告警裕度需为0–9的整数', 'error'); return;
    }

    const res = await apiFetch(apiUrl('settings/popup/'), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showMsg('popup-msg', '保存成功', 'success');
      // 同步主页快捷按钮状态
      if (window.updateToggleState) {
        window.updateToggleState('operation-toggle', !!payload.operation_metar_popup);
        window.updateToggleState('parking-toggle', !!payload.parking_metar_popup);
        window.updateToggleState('intercept-toggle', !!payload.intercept);
      }
    } else {
      showMsg('popup-msg', res.error, 'error');
    }
  }

  // ========== Tab6: 机场告警阈值 ==========
  const TF_MAP = [
    ['visibility_m_red','tf-vis-r'],['visibility_m_yellow','tf-vis-y'],['visibility_m_green','tf-vis-g'],
    ['cloud_min_red','tf-cld-r'],['cloud_min_yellow','tf-cld-y'],['cloud_min_green','tf-cld-g'],
    ['average_wind_speed_mps_red','tf-ws-r'],['average_wind_speed_mps_yellow','tf-ws-y'],['average_wind_speed_mps_green','tf-ws-g'],
    ['gust_mps_red','tf-gs-r'],['gust_mps_yellow','tf-gs-y'],['gust_mps_green','tf-gs-g'],
    ['temperature_cold_red','tf-tc-r'],['temperature_cold_yellow','tf-tc-y'],['temperature_cold_green','tf-tc-g'],
    ['temperature_hot_red','tf-th-r'],['temperature_hot_yellow','tf-th-y'],['temperature_hot_green','tf-th-g'],
    ['rvr_m_red','tf-rvr-r'],['rvr_m_yellow','tf-rvr-y'],['rvr_m_green','tf-rvr-g'],
  ];
  let thresholdEditCode = null;
  let thresholdReadonly = false;

  async function loadAlertThresholds() {
    const res = await apiFetch(apiUrl('settings/alert-thresholds/'));
    if (!res.success) { showMsg('threshold-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('threshold-tbody');
    tbody.innerHTML = res.data.map(r => {
      const isDefault = r.airport_4code === 'default';
      const ops = isDefault
        ? `<button class="settings-edit-btn" onclick="SettingsModal.viewThreshold('${r.airport_4code}')">查看</button>`
        : `<button class="settings-edit-btn" onclick="SettingsModal.editThreshold('${r.airport_4code}')">编辑</button>
           <button class="settings-del-btn" onclick="SettingsModal.deleteThreshold('${r.airport_4code}')">删除</button>`;
      const fmt = (a,b,c) => `${a??'–'}/${b??'–'}/${c??'–'}`;
      return `<tr class="${isDefault?'settings-row-readonly':''}">
        <td>${escHtml(r.airport_4code)}</td>
        <td>${fmt(r.visibility_m_red,r.visibility_m_yellow,r.visibility_m_green)}</td>
        <td>${fmt(r.cloud_min_red,r.cloud_min_yellow,r.cloud_min_green)}</td>
        <td>${fmt(r.average_wind_speed_mps_red,r.average_wind_speed_mps_yellow,r.average_wind_speed_mps_green)}</td>
        <td>${fmt(r.gust_mps_red,r.gust_mps_yellow,r.gust_mps_green)}</td>
        <td>${fmt(r.temperature_cold_red,r.temperature_cold_yellow,r.temperature_cold_green)}</td>
        <td>${fmt(r.temperature_hot_red,r.temperature_hot_yellow,r.temperature_hot_green)}</td>
        <td>${fmt(r.rvr_m_red,r.rvr_m_yellow,r.rvr_m_green)}</td>
        <td>${ops}</td>
      </tr>`;
    }).join('');
    hideThresholdForm();
  }

  function showThresholdForm(data, readonly) {
    thresholdReadonly = !!readonly;
    const panel = document.getElementById('threshold-form-panel');
    panel.style.display = 'flex'; panel.style.flexDirection = 'column';
    document.getElementById('threshold-form-title').textContent =
      thresholdReadonly ? '查看告警阈值（只读）' : (data ? '编辑告警阈值' : '新增告警阈值');
    const codeEl = document.getElementById('tf-4code');
    codeEl.disabled = thresholdReadonly || !!data;
    codeEl.value = data ? data.airport_4code : '';
    TF_MAP.forEach(([field, id]) => {
      const el = document.getElementById(id);
      if (el) { el.value = data ? (data[field] ?? '') : ''; el.disabled = thresholdReadonly; }
    });
    document.getElementById('threshold-save-btn').style.display = thresholdReadonly ? 'none' : '';
    document.getElementById('threshold-cancel-btn').textContent = thresholdReadonly ? '关闭' : '取消';
  }
  function hideThresholdForm() {
    document.getElementById('threshold-form-panel').style.display = 'none';
    thresholdEditCode = null;
    thresholdReadonly = false;
    TF_MAP.forEach(([, id]) => { const el = document.getElementById(id); if (el) el.disabled = false; });
    document.getElementById('threshold-save-btn').style.display = '';
    document.getElementById('threshold-cancel-btn').textContent = '取消';
  }

  async function saveThreshold() {
    const code = document.getElementById('tf-4code').value.trim().toUpperCase();
    if (!thresholdEditCode && (code.length !== 4 || !/^[A-Z]{4}$/.test(code))) {
      showMsg('threshold-msg', '机场四字代码必须为4位英文大写字母', 'error'); return;
    }
    const payload = { airport_4code: code };
    for (const [field, id] of TF_MAP) {
      const val = document.getElementById(id).value;
      if (val === '' || isNaN(val)) { showMsg('threshold-msg', `${field} 为必填数字`, 'error'); return; }
      payload[field] = parseInt(val);
    }
    const isEdit = !!thresholdEditCode;
    const url = isEdit ? apiUrl(`settings/alert-thresholds/${thresholdEditCode}/`) : apiUrl('settings/alert-thresholds/');
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (res.success) { showMsg('threshold-msg', res.message, 'success'); await loadAlertThresholds(); }
    else showMsg('threshold-msg', res.error, 'error');
  }

  // ========== Tab7: 天气类型信息 ==========
  let wtypeEditId = null;

  async function loadWeatherType() {
    const res = await apiFetch(apiUrl('settings/weather-type/'));
    if (!res.success) { showMsg('wtype-msg', res.error, 'error'); return; }
    const tbody = document.getElementById('wtype-tbody');
    tbody.innerHTML = res.data.map(r => `
      <tr>
        <td>${escHtml(r.weather_type_code)}</td>
        <td>${escHtml(r.description_cn)}</td>
        <td>${escHtml(r.description_en)}</td>
        <td>
          <button class="settings-edit-btn" onclick="SettingsModal.editWeatherType(${r.id})">编辑</button>
          <button class="settings-del-btn" onclick="SettingsModal.deleteWeatherType(${r.id})">删除</button>
        </td>
      </tr>`).join('');
    hideWTypeForm();
  }

  function showWTypeForm(data) {
    const panel = document.getElementById('wtype-form-panel');
    panel.style.display = 'flex'; panel.style.flexDirection = 'column';
    document.getElementById('wtype-form-title').textContent = data ? '编辑天气类型' : '新增天气类型';
    document.getElementById('wtf-code').value = data ? (data.weather_type_code || '') : '';
    document.getElementById('wtf-cn').value = data ? (data.description_cn || '') : '';
    document.getElementById('wtf-en').value = data ? (data.description_en || '') : '';
  }
  function hideWTypeForm() {
    document.getElementById('wtype-form-panel').style.display = 'none';
    wtypeEditId = null;
  }

  async function saveWeatherType() {
    const code = document.getElementById('wtf-code').value.trim();
    const cn = document.getElementById('wtf-cn').value.trim();
    const en = document.getElementById('wtf-en').value.trim();
    if (!code || code.length !== 1) { showMsg('wtype-msg', '天气类型代码必须为1位字符', 'error'); return; }
    if (!cn) { showMsg('wtype-msg', '中文说明为必填项', 'error'); return; }
    if (!en) { showMsg('wtype-msg', '英文说明为必填项', 'error'); return; }
    const payload = { weather_type_code: code, description_cn: cn, description_en: en };
    const isEdit = wtypeEditId !== null;
    const url = isEdit ? apiUrl(`settings/weather-type/${wtypeEditId}/`) : apiUrl('settings/weather-type/');
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (res.success) { showMsg('wtype-msg', res.message, 'success'); await loadWeatherType(); }
    else showMsg('wtype-msg', res.error, 'error');
  }

  // ========== Tab8: 天气现象告警等级 ==========
  let walertEditId = null;
  let walertLevelTrack = null;
  let weatherTypeCodes = [];

  function buildTypeOptions(selected) {
    const none = `<option value="">（无）</option>`;
    return none + weatherTypeCodes.map(([code, cn]) =>
      `<option value="${escHtml(code)}" ${selected === code ? 'selected' : ''}>${escHtml(code)} - ${escHtml(cn)}</option>`
    ).join('');
  }

  async function loadWeatherAlert() {
    walertLevelTrack = walertLevelTrack || initTrack(document.getElementById('waf-level-track'));
    const res = await apiFetch(apiUrl('settings/weather-alert/'));
    if (!res.success) { showMsg('walert-msg', res.error, 'error'); return; }
    weatherTypeCodes = res.type_codes || [];
    const tbody = document.getElementById('walert-tbody');
    tbody.innerHTML = res.data.map(r => `
      <tr>
        <td>${escHtml(r.weather)}</td>
        <td>${escHtml(r.alert_level)}</td>
        <td>${escHtml(r.type1)}</td>
        <td>${r.type2 || ''}</td>
        <td>${r.type3 || ''}</td>
        <td>${escHtml(r.description)}</td>
        <td>
          <button class="settings-edit-btn" onclick="SettingsModal.editWeatherAlert(${r.id})">编辑</button>
          <button class="settings-del-btn" onclick="SettingsModal.deleteWeatherAlert(${r.id})">删除</button>
        </td>
      </tr>`).join('');
    hideWAlertForm();
  }

  function showWAlertForm(data) {
    const panel = document.getElementById('walert-form-panel');
    panel.style.display = 'flex'; panel.style.flexDirection = 'column';
    document.getElementById('walert-form-title').textContent = data ? '编辑天气告警等级' : '新增天气告警等级';
    document.getElementById('waf-weather').value = data ? (data.weather || '') : '';
    if (walertLevelTrack) walertLevelTrack.setVal(data ? (data.alert_level || 'R') : 'R');
    ['waf-type1','waf-type2','waf-type3'].forEach((id, i) => {
      const sel = document.getElementById(id);
      const keys = ['type1','type2','type3'];
      sel.innerHTML = buildTypeOptions(data ? data[keys[i]] : null);
    });
    document.getElementById('waf-description').value = data ? (data.description || '') : '';
  }
  function hideWAlertForm() {
    document.getElementById('walert-form-panel').style.display = 'none';
    walertEditId = null;
  }

  async function saveWeatherAlert() {
    const weather = document.getElementById('waf-weather').value.trim().toUpperCase();
    const level = walertLevelTrack ? walertLevelTrack.getVal() : 'R';
    const type1 = document.getElementById('waf-type1').value;
    const type2 = document.getElementById('waf-type2').value || null;
    const type3 = document.getElementById('waf-type3').value || null;
    const description = document.getElementById('waf-description').value.trim() || null;
    if (!weather) { showMsg('walert-msg', '天气现象代码为必填项', 'error'); return; }
    if (!type1) { showMsg('walert-msg', '类型1为必填项', 'error'); return; }
    const payload = { weather, alert_level: level, type1, type2, type3, description };
    const isEdit = walertEditId !== null;
    const url = isEdit ? apiUrl(`settings/weather-alert/${walertEditId}/`) : apiUrl('settings/weather-alert/');
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (res.success) { showMsg('walert-msg', res.message, 'success'); await loadWeatherAlert(); }
    else showMsg('walert-msg', res.error, 'error');
  }

  // ========== Tab9: 机场坐标（按需查询） ==========
  let locEditCode = null;
  let locCurrentCode = null;  // 当前查询的四字代码

  function loadAirportLocation() {
    // Tab切换时只重置到搜索状态，不发请求
    document.getElementById('loc-search-input').value = '';
    document.getElementById('loc-result-area').innerHTML = '';
    document.getElementById('loc-form-panel').style.display = 'none';
    locCurrentCode = null;
    locEditCode = null;
  }

  async function searchLocation() {
    const code = document.getElementById('loc-search-input').value.trim().toUpperCase();
    if (code.length !== 4 || !/^[A-Z]{4}$/.test(code)) {
      showMsg('loc-msg', '请输入4位英文大写四字代码', 'error'); return;
    }
    locCurrentCode = code;
    hideLocForm();
    const res = await apiFetch(apiUrl(`settings/airport-location/${code}/`));
    const area = document.getElementById('loc-result-area');
    if (res.success) {
      const r = res.data;
      area.innerHTML = `
        <table class="settings-table settings-table-auto loc-result-table">
          <thead><tr><th>四字代码</th><th>纬度</th><th>经度</th><th>机场名称</th><th>操作</th></tr></thead>
          <tbody><tr>
            <td>${escHtml(r.airport_4code)}</td>
            <td>${r.latitude}</td>
            <td>${r.longitude}</td>
            <td>${escHtml(r.airport_name)}</td>
            <td>
              <button class="settings-edit-btn" onclick="SettingsModal.editLocation('${escHtml(r.airport_4code)}')">编辑</button>
              <button class="settings-del-btn" onclick="SettingsModal.deleteLocation('${escHtml(r.airport_4code)}')">删除</button>
            </td>
          </tr></tbody>
        </table>`;
    } else {
      area.innerHTML = `
        <div class="loc-not-found">
          未找到 <strong>${escHtml(code)}</strong> 的坐标记录
          <button class="settings-add-btn loc-add-inline-btn" onclick="SettingsModal.addLocationForCode('${escHtml(code)}')">+ 新增</button>
        </div>`;
    }
  }

  function showLocForm(data, preset4code) {
    const panel = document.getElementById('loc-form-panel');
    panel.style.display = 'block';
    document.getElementById('loc-form-title').textContent = data ? '编辑机场坐标' : '新增机场坐标';
    const codeEl = document.getElementById('lf-4code');
    codeEl.disabled = !!data || !!preset4code;
    codeEl.value = data ? data.airport_4code : (preset4code || '');
    document.getElementById('lf-lat').value = data ? data.latitude : '';
    document.getElementById('lf-lon').value = data ? data.longitude : '';
    document.getElementById('lf-name').value = data ? (data.airport_name || '') : '';
  }
  function hideLocForm() {
    document.getElementById('loc-form-panel').style.display = 'none';
    locEditCode = null;
  }

  async function saveLocation() {
    const code = document.getElementById('lf-4code').value.trim().toUpperCase();
    if (!locEditCode && (code.length !== 4 || !/^[A-Z]{4}$/.test(code))) {
      showMsg('loc-msg', '机场四字代码必须为4位英文大写字母', 'error'); return;
    }
    const lat = document.getElementById('lf-lat').value;
    const lon = document.getElementById('lf-lon').value;
    if (lat === '' || isNaN(lat)) { showMsg('loc-msg', '纬度为必填数字', 'error'); return; }
    if (lon === '' || isNaN(lon)) { showMsg('loc-msg', '经度为必填数字', 'error'); return; }
    const payload = {
      airport_4code: code,
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      airport_name: document.getElementById('lf-name').value.trim() || null,
    };
    const isEdit = !!locEditCode;
    const url = isEdit ? apiUrl(`settings/airport-location/${locEditCode}/`) : apiUrl('settings/airport-location/');
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (res.success) {
      showMsg('loc-msg', res.message, 'success');
      hideLocForm();
      // 保存后自动刷新搜索结果
      const savedCode = locEditCode || code;
      document.getElementById('loc-search-input').value = savedCode;
      locCurrentCode = savedCode;
      await searchLocation();
    } else {
      showMsg('loc-msg', res.error, 'error');
    }
  }

  // ========== 初始化 ==========
  function init() {
    // Tab按钮
    document.querySelectorAll('.settings-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 关闭按钮
    document.getElementById('settings-modal-close').addEventListener('click', () => {
      window.hideModal('settings-modal');
    });

    // classification联动 area select (机场信息Tab)
    const afClassChk = document.getElementById('af-classification-chk');
    if (afClassChk) {
      afClassChk.addEventListener('change', () => {
        updateAreaSelect(afClassChk.checked ? '国际' : '国内');
      });
    }

    // 机场表单按钮
    document.getElementById('airport-add-btn').addEventListener('click', () => {
      airportEditCode = null;
      showAirportForm(null);
    });
    document.getElementById('airport-save-btn').addEventListener('click', saveAirport);
    document.getElementById('airport-cancel-btn').addEventListener('click', hideAirportForm);

    // 区域表单按钮
    document.getElementById('area-add-btn').addEventListener('click', () => {
      areaEditId = null;
      showAreaForm(null);
    });
    document.getElementById('area-save-btn').addEventListener('click', saveArea);
    document.getElementById('area-cancel-btn').addEventListener('click', hideAreaForm);

    // 承运人表单按钮
    document.getElementById('carrier-add-btn').addEventListener('click', () => {
      carrierEditId = null;
      showCarrierForm(null);
    });
    document.getElementById('carrier-save-btn').addEventListener('click', saveCarrier);
    document.getElementById('carrier-cancel-btn').addEventListener('click', hideCarrierForm);

    // 弹窗设置保存
    document.getElementById('popup-save-btn').addEventListener('click', savePopupSettings);

    // 告警阈值
    document.getElementById('threshold-add-btn').addEventListener('click', () => { thresholdEditCode = null; showThresholdForm(null); });
    document.getElementById('threshold-save-btn').addEventListener('click', saveThreshold);
    document.getElementById('threshold-cancel-btn').addEventListener('click', hideThresholdForm);

    // 天气类型
    document.getElementById('wtype-add-btn').addEventListener('click', () => { wtypeEditId = null; showWTypeForm(null); });
    document.getElementById('wtype-save-btn').addEventListener('click', saveWeatherType);
    document.getElementById('wtype-cancel-btn').addEventListener('click', hideWTypeForm);

    // 天气告警等级
    document.getElementById('walert-add-btn').addEventListener('click', () => { walertEditId = null; showWAlertForm(null); });
    document.getElementById('walert-save-btn').addEventListener('click', saveWeatherAlert);
    document.getElementById('walert-cancel-btn').addEventListener('click', hideWAlertForm);

    // 机场坐标 — 搜索
    const locSearchInput = document.getElementById('loc-search-input');
    locSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchLocation(); });
    document.getElementById('loc-search-btn').addEventListener('click', searchLocation);
    document.getElementById('loc-save-btn').addEventListener('click', saveLocation);
    document.getElementById('loc-cancel-btn').addEventListener('click', hideLocForm);
  }

  // ========== 公开接口 ==========
  window.SettingsModal = {
    open() {
      window.showModal('settings-modal');
      switchTab('airport-info');
    },

    // 机场
    editAirport(code) {
      airportEditCode = code;
      apiFetch(apiUrl('settings/airport-info/')).then(res => {
        const a = res.data && res.data.find(x => x.airport_4code === code);
        if (a) showAirportForm(a);
      });
    },

    // 新增机场（预填四字代码）—— 等待 loadAirportInfo 完成（其末尾会 hideAirportForm）再显示表单
    newAirportWithCode(code) {
      window.showModal('settings-modal');
      switchTab('airport-info').then(() => {
        airportEditCode = null;
        showAirportForm(null);
        const el = document.getElementById('af-4code');
        if (el) el.value = (code || '').toUpperCase();
      });
    },

    // 打开设置页并直接进入指定机场的编辑表单
    openAndEdit(code) {
      window.showModal('settings-modal');
      switchTab('airport-info').then(() => {
        airportEditCode = code;
        apiFetch(apiUrl('settings/airport-info/')).then(res => {
          const a = res.data && res.data.find(x => x.airport_4code === code);
          if (a) showAirportForm(a);
        });
      });
    },
    async deleteAirport(code) {
      if (!confirm(`确定删除机场 ${code}？`)) return;
      const res = await apiFetch(apiUrl(`settings/airport-info/${code}/`), { method: 'DELETE' });
      showMsg('airport-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) await loadAirportInfo();
    },

    // 区域
    editArea(id) {
      areaEditId = id;
      apiFetch(apiUrl('settings/area-options/')).then(res => {
        const o = res.data && res.data.find(x => x.id === id);
        if (o) showAreaForm(o);
      });
    },
    async deleteArea(id) {
      if (!confirm('确定删除该区域选项？')) return;
      const res = await apiFetch(apiUrl(`settings/area-options/${id}/`), { method: 'DELETE' });
      showMsg('area-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) { await loadAreaOptions(); await refreshAreaOptionsCache(); }
    },

    // 定时器
    saveTimer,

    // 告警阈值
    editThreshold(code) {
      thresholdEditCode = code;
      apiFetch(apiUrl('settings/alert-thresholds/')).then(res => {
        const r = res.data && res.data.find(x => x.airport_4code === code);
        if (r) showThresholdForm(r);
      });
    },
    async deleteThreshold(code) {
      if (!confirm(`确定删除 ${code} 的告警阈值？`)) return;
      const res = await apiFetch(apiUrl(`settings/alert-thresholds/${code}/`), { method: 'DELETE' });
      showMsg('threshold-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) await loadAlertThresholds();
    },

    // 天气类型
    editWeatherType(id) {
      wtypeEditId = id;
      apiFetch(apiUrl('settings/weather-type/')).then(res => {
        const r = res.data && res.data.find(x => x.id === id);
        if (r) showWTypeForm(r);
      });
    },
    async deleteWeatherType(id) {
      if (!confirm('确定删除该天气类型？')) return;
      const res = await apiFetch(apiUrl(`settings/weather-type/${id}/`), { method: 'DELETE' });
      showMsg('wtype-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) await loadWeatherType();
    },

    // 天气告警等级
    editWeatherAlert(id) {
      walertEditId = id;
      apiFetch(apiUrl('settings/weather-alert/')).then(res => {
        const r = res.data && res.data.find(x => x.id === id);
        if (r) { weatherTypeCodes = res.type_codes || []; showWAlertForm(r); }
      });
    },
    async deleteWeatherAlert(id) {
      if (!confirm('确定删除该天气告警等级记录？')) return;
      const res = await apiFetch(apiUrl(`settings/weather-alert/${id}/`), { method: 'DELETE' });
      showMsg('walert-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) await loadWeatherAlert();
    },

    // 告警阈值 — 查看(只读)
    viewThreshold(code) {
      apiFetch(apiUrl('settings/alert-thresholds/')).then(res => {
        const r = res.data && res.data.find(x => x.airport_4code === code);
        if (r) { thresholdEditCode = null; showThresholdForm(r, true); }
      });
    },

    // 机场坐标
    editLocation(code) {
      locEditCode = code;
      apiFetch(apiUrl(`settings/airport-location/${code}/`)).then(res => {
        if (res.success) showLocForm(res.data);
      });
    },
    addLocationForCode(code) {
      locEditCode = null;
      showLocForm(null, code);
    },
    async deleteLocation(code) {
      if (!confirm(`确定删除 ${code} 的坐标记录？`)) return;
      const res = await apiFetch(apiUrl(`settings/airport-location/${code}/`), { method: 'DELETE' });
      showMsg('loc-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) {
        document.getElementById('loc-result-area').innerHTML =
          `<div class="loc-not-found">未找到 <strong>${escHtml(code)}</strong> 的坐标记录
           <button class="settings-add-btn loc-add-inline-btn" onclick="SettingsModal.addLocationForCode('${escHtml(code)}')">+ 新增</button></div>`;
        hideLocForm();
      }
    },

    // 承运人
    editCarrier(id) {
      carrierEditId = id;
      apiFetch(apiUrl('settings/carrier/')).then(res => {
        const c = res.data && res.data.find(x => x.id === id);
        if (c) showCarrierForm(c);
      });
    },
    async deleteCarrier(id) {
      if (!confirm('确定删除该承运人？')) return;
      const res = await apiFetch(apiUrl(`settings/carrier/${id}/`), { method: 'DELETE' });
      showMsg('carrier-msg', res.success ? res.message : res.error, res.success ? 'success' : 'error');
      if (res.success) await loadCarriers();
    },
  };

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
