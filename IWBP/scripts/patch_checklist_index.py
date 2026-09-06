"""Patch index.html: embed checklist JSON, replace card1, add CSS, inject JS."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / "index.html"
json_path = ROOT / "docs" / "checklist-embed.min.json"
html = html_path.read_text(encoding="utf-8")
emb = json_path.read_text(encoding="utf-8").strip()

if "checklist-embedded-data" in html:
    print("already patched")
    raise SystemExit(0)

needle = '    <div class="toast" id="toast" role="status" aria-live="polite">'
if needle not in html:
    raise SystemExit("toast anchor not found")

html = html.replace(
    needle,
    f'    <script type="application/json" id="checklist-embedded-data">{emb}</script>\n\n' + needle,
    1,
)

old_card = """            <div class="task-list">
              <div class="task overdue" data-task="A">
                <div class="task-left">
                  <div class="task-name">任务A</div>
                  <div class="task-meta">截止 10:00 · <span class="pill danger dot">超时未完成</span></div>
                </div>
                <button class="btn danger" type="button">确认完成</button>
              </div>

              <div class="task" data-task="B">
                <div class="task-left">
                  <div class="task-name">任务B</div>
                  <div class="task-meta">截止 11:30 · <span class="pill warn dot">进行中</span></div>
                </div>
                <button class="btn" type="button">确认完成</button>
              </div>
            </div>"""

new_card = """            <div class="checklist-toolbar">
              <div class="checklist-tabs" id="checklistTabs" role="tablist" aria-label="班次检查单">
                <button type="button" class="btn secondary checklist-tab is-active" data-shift="day" role="tab" aria-selected="true">白班 08:30–18:00</button>
                <button type="button" class="btn secondary checklist-tab" data-shift="night" role="tab" aria-selected="false">夜班 17:30–次日03:30</button>
                <button type="button" class="btn secondary checklist-tab" data-shift="dawn" role="tab" aria-selected="false">晨班 03:00–09:00</button>
              </div>
              <button type="button" class="btn secondary" id="checklistAuditToggle" title="展开或收起质检记录">质检存档</button>
            </div>
            <div class="checklist-task-list task-list" id="checklistTaskList"></div>
            <details class="checklist-audit" id="checklistAuditDetails">
              <summary>未按时完成 / 补做记录（本地存档，按账号隔离）</summary>
              <div class="checklist-audit-body" id="checklistAuditBody"></div>
            </details>"""

if old_card not in html:
    raise SystemExit("old card1 task-list not found")
html = html.replace(old_card, new_card, 1)

old_sub = "                <span>任务到期与超时提示（模拟）</span>"
new_sub = ""
if old_sub not in html:
    raise SystemExit("card subtitle not found")
html = html.replace(old_sub, new_sub, 1)

css_anchor = "      .task.overdue {\n        border-color: rgba(255, 92, 92, 0.22);"
css_insert = """      .task.done {
        opacity: 0.78;
        border-color: rgba(94, 234, 212, 0.18);
      }
      .checklist-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .checklist-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .checklist-tabs .checklist-tab.is-active {
        border-color: rgba(251, 191, 36, 0.45);
        box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.12) inset;
      }
      .checklist-task-list {
        max-height: min(52vh, 420px);
        overflow: auto;
        padding-right: 2px;
      }
      .checklist-audit {
        margin-top: 10px;
        border: 1px solid rgba(157, 181, 255, 0.14);
        border-radius: 12px;
        padding: 8px 10px;
        background: rgba(13, 18, 40, 0.28);
      }
      .checklist-audit summary {
        cursor: pointer;
        font-size: 12.5px;
        color: rgba(235, 242, 255, 0.88);
      }
      .checklist-audit-body {
        margin-top: 8px;
        overflow: auto;
        max-height: 220px;
      }
      .checklist-audit-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11.5px;
      }
      .checklist-audit-table th,
      .checklist-audit-table td {
        border: 1px solid rgba(157, 181, 255, 0.12);
        padding: 6px 8px;
        vertical-align: top;
      }
      .checklist-audit-table th {
        color: rgba(235, 242, 255, 0.72);
        font-weight: 650;
        text-align: left;
      }

"""
if css_anchor not in html:
    raise SystemExit("css anchor not found")
html = html.replace(css_anchor, css_insert + css_anchor, 1)

js_anchor = "        // New tab open: clone current card content into a standalone page"
js_block = r'''        /* ========== 气象服务席检查单（三班次） ========== */
        const checklistTaskList = $("#checklistTaskList");
        const checklistTabs = $("#checklistTabs");
        const checklistAuditBody = $("#checklistAuditBody");
        const checklistAuditDetails = $("#checklistAuditDetails");
        const checklistAuditToggle = $("#checklistAuditToggle");

        let CHECKLIST_DATA = null;
        try {
          const el = document.getElementById("checklist-embedded-data");
          CHECKLIST_DATA = el ? JSON.parse(el.textContent) : null;
        } catch {
          CHECKLIST_DATA = null;
        }

        let checklistActiveShift = "day";
        let checklistState = { items: {}, qc: [] };

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
          /* 03:30–08:29 默认晨班；08:30 起默认白班（班次数据 key 分开，仅默认 Tab） */
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
          try {
            localStorage.setItem(checklistStorageKey(), JSON.stringify(checklistState));
          } catch {
            /* ignore */
          }
        }

        function getItemState(key) {
          const st = checklistState.items[key];
          if (!st) return { completed: false, completedAt: null, reminded: {}, missedLogged: false };
          return {
            completed: !!st.completed,
            completedAt: st.completedAt || null,
            reminded: st.reminded || {},
            missedLogged: !!st.missedLogged,
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
          if (nowMs >= inst.deadlineMs) return "已超时未完成";
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
          checklistTaskList.innerHTML = block.items
            .map((it) => {
              const key = itemKey(shift, anchor, it.serial);
              const st = getItemState(key);
              const dlMs = deadlineMsForItem(shift, anchor, it);
              const overdue = !st.completed && nowMs >= dlMs;
              const status = checklistStatusLine(
                { deadlineMs: dlMs, shift, anchor, serial: it.serial, title: it.title, deadline: it.deadline, key },
                st,
                nowMs
              );
              const pill = st.completed
                ? st.completedAt && new Date(st.completedAt).getTime() > dlMs
                  ? `<span class="pill warn dot">补做完成</span>`
                  : `<span class="pill dot">已完成</span>`
                : overdue
                  ? `<span class="pill danger dot">超时未完成</span>`
                  : `<span class="pill warn dot">待完成</span>`;
              const rowCls = overdue ? "task overdue" : st.completed ? "task done" : "task";
              const btnCls = overdue ? "btn danger" : "btn";
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

        function renderChecklistAudit() {
          if (!checklistAuditBody) return;
          const rows = checklistState.qc.filter((r) => r.missedAt || (r.completedAt && r.lateMinutes > 0)).slice().reverse();
          if (rows.length === 0) {
            checklistAuditBody.innerHTML = `<div class="hint">暂无未按时/补做记录。</div>`;
            return;
          }
          checklistAuditBody.innerHTML = `
            <table class="checklist-audit-table">
              <thead><tr><th>日期/班次</th><th>项</th><th>截止</th><th>未按时记录</th><th>补做完成</th><th>超时(分)</th></tr></thead>
              <tbody>
                ${rows
                  .map((r) => {
                    const miss = r.missedAt ? escapeHtml(r.missedAt.replace("T", " ").slice(0, 19)) : "—";
                    const done = r.completedAt ? escapeHtml(r.completedAt.replace("T", " ").slice(0, 19)) : "—";
                    const late = r.lateMinutes != null && r.lateMinutes > 0 ? escapeHtml(String(r.lateMinutes)) : r.lateMinutes === 0 ? "0" : "—";
                    return `<tr>
                      <td>${escapeHtml(r.anchorYmd || "")} · ${escapeHtml(r.shift || "")}</td>
                      <td>${escapeHtml(String(r.serial || ""))}. ${escapeHtml(r.title || "")}</td>
                      <td>${escapeHtml(r.deadline || "")}</td>
                      <td>${miss}</td>
                      <td>${done}</td>
                      <td>${late}</td>
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
            const r0 = { ...(st.reminded || {}) };
            if (nowMs >= dl) {
              if (!st.missedLogged) {
                setItemState(inst.key, { missedLogged: true, reminded: r0 });
                const row = ensureQcRow(inst.key, {
                  shift: inst.shift,
                  anchorYmd: inst.anchorYmd,
                  serial: inst.serial,
                  title: inst.title,
                  deadline: inst.deadline,
                });
                row.missedAt = now.toISOString();
                auditDirty = true;
                showToast("检查单超时", `已记录未按时：${inst.serial}. ${inst.title.slice(0, 26)}…`, 5200);
              }
              continue;
            }
            const hit = [];
            if (nowMs >= dl - 30 * 60000 && !r0.m30) hit.push("30");
            if (nowMs >= dl - 15 * 60000 && !r0.m15) hit.push("15");
            if (nowMs >= dl - 5 * 60000 && !r0.m5) hit.push("5");
            if (hit.length === 0) continue;
            const r1 = { ...r0 };
            if (hit.includes("30")) r1.m30 = true;
            if (hit.includes("15")) r1.m15 = true;
            if (hit.includes("5")) r1.m5 = true;
            setItemState(inst.key, { reminded: r1 });
            const label = hit.join("、");
            showToast("检查单提醒", `「${inst.title.slice(0, 34)}${inst.title.length > 34 ? "…" : ""}」距截止 ${label} 分钟节点`, 4600);
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
            row.completedAt = now.toISOString();
            row.lateMinutes = Math.max(0, Math.floor((nowMs - inst.deadlineMs) / 60000));
            saveChecklistState();
          }
          setItemState(key, {
            completed: true,
            completedAt: now.toISOString(),
            missedLogged: wasMissed || nowMs > inst.deadlineMs,
          });
          showToast("检查单", "已标记完成");
          renderChecklistTasks();
          renderChecklistAudit();
        }

        function initSeatChecklist() {
          if (!checklistTaskList) return;
          loadChecklistState();
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
          checklistAuditToggle?.addEventListener("click", () => {
            if (!checklistAuditDetails) return;
            checklistAuditDetails.open = !checklistAuditDetails.open;
          });
          accountSelect?.addEventListener("change", () => {
            loadChecklistState();
            renderChecklistTasks();
            renderChecklistAudit();
          });
          renderChecklistAudit();
          tickChecklistReminders();
          window.setInterval(tickChecklistReminders, 30000);
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) tickChecklistReminders();
          });
        }

''' + "\n        "

if js_anchor not in html:
    raise SystemExit("js anchor not found")
html = html.replace(js_anchor, js_block + js_anchor, 1)

init_anchor = "        setAccuracy(85);\n\n        // Initial render"
init_insert = "        setAccuracy(85);\n\n        initSeatChecklist();\n\n        // Initial render"
if init_anchor not in html:
    raise SystemExit("init anchor not found")
html = html.replace(init_anchor, init_insert, 1)

html_path.write_text(html, encoding="utf-8")
print("patched", html_path)
