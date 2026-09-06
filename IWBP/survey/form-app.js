/**
 * 本地问卷渲染与导出（浏览器打开 form.html 使用）
 * 题目请在 config-meteo.js / config-dispatch.js 的 window.SURVEY_CONFIG 中维护
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function collectAnswers(cfg) {
    const answers = [];
    for (const sec of cfg.sections || []) {
      for (const q of sec.questions || []) {
        const base = `[name="${escapeHtml(q.id)}"]`;
        if (q.type === "likert" || q.type === "single") {
          const el = $(`input${base}:checked`);
          answers.push({
            id: q.id,
            type: q.type,
            value: el ? el.value : "",
          });
        } else if (q.type === "multi") {
          const els = $$(`input${base}:checked`);
          answers.push({
            id: q.id,
            type: q.type,
            value: els.map((e) => e.value),
          });
        } else if (q.type === "text") {
          const el = $(`textarea${base}`);
          answers.push({
            id: q.id,
            type: q.type,
            value: el ? el.value.trim() : "",
          });
        }
      }
    }
    return answers;
  }

  function validate(cfg, answers) {
    const byId = Object.fromEntries(answers.map((a) => [a.id, a]));
    const missing = [];
    for (const sec of cfg.sections || []) {
      for (const q of sec.questions || []) {
        if (!q.required) continue;
        const a = byId[q.id];
        if (!a) {
          missing.push(q.id);
          continue;
        }
        if (q.type === "multi" && (!Array.isArray(a.value) || a.value.length === 0)) missing.push(q.id);
        else if ((q.type === "likert" || q.type === "single") && (!a.value || String(a.value).trim() === "")) missing.push(q.id);
        else if (q.type === "text" && (!a.value || String(a.value).trim() === "")) missing.push(q.id);
      }
    }
    return missing;
  }

  function renderSurvey(cfg) {
    const titleEl = $("#surveyTitle");
    const descEl = $("#surveyDesc");
    const formEl = $("#surveyForm");
    const errEl = $("#surveyError");
    if (!cfg || !cfg.sections) {
      formEl.innerHTML = "<p class=\"hint\">配置为空：请编辑 config-meteo.js 或 config-dispatch.js</p>";
      return;
    }
    titleEl.textContent = cfg.title || "问卷";
    descEl.innerHTML = cfg.description ? escapeHtml(cfg.description).replaceAll("\n", "<br/>") : "";

    const parts = [];
    for (const sec of cfg.sections) {
      parts.push(`<section class="sec"><h2 class="sec-title">${escapeHtml(sec.title || "")}</h2>`);
      for (const q of sec.questions || []) {
        parts.push(`<div class="q" data-qid="${escapeHtml(q.id)}">`);
        parts.push(`<div class="q-title">${escapeHtml(q.text || "")}${q.required ? "<span class=\"req\">*</span>" : ""}</div>`);
        if (q.type === "likert") {
          const n = Number(q.scale) === 7 ? 7 : 5;
          const labels = Array.isArray(q.labels) && q.labels.length === n ? q.labels : null;
          parts.push(`<div class="likert" role="radiogroup" aria-label="${escapeHtml(q.text || q.id)}">`);
          for (let i = 1; i <= n; i++) {
            const lab = labels ? labels[i - 1] : String(i);
            parts.push(`
              <label class="likert-item">
                <input type="radio" name="${escapeHtml(q.id)}" value="${i}" ${q.required ? "required" : ""} />
                <span class="num">${i}</span>
                <span class="lab">${escapeHtml(lab)}</span>
              </label>`);
          }
          parts.push(`</div>`);
        } else if (q.type === "single") {
          parts.push(`<div class="opts" role="radiogroup">`);
          for (const opt of q.options || []) {
            const val = typeof opt === "string" ? opt : opt.value;
            const lab = typeof opt === "string" ? opt : opt.label ?? opt.value;
            parts.push(`
              <label class="opt">
                <input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(String(val))}" ${q.required ? "required" : ""} />
                <span>${escapeHtml(String(lab))}</span>
              </label>`);
          }
          parts.push(`</div>`);
        } else if (q.type === "multi") {
          parts.push(`<div class="opts" role="group">`);
          for (const opt of q.options || []) {
            const val = typeof opt === "string" ? opt : opt.value;
            const lab = typeof opt === "string" ? opt : opt.label ?? opt.value;
            parts.push(`
              <label class="opt">
                <input type="checkbox" name="${escapeHtml(q.id)}" value="${escapeHtml(String(val))}" />
                <span>${escapeHtml(String(lab))}</span>
              </label>`);
          }
          parts.push(`</div>`);
        } else if (q.type === "text") {
          const rows = Math.min(16, Math.max(2, Number(q.rows) || 4));
          parts.push(`<textarea name="${escapeHtml(q.id)}" rows="${rows}" ${q.required ? "required" : ""} placeholder="${escapeHtml(
            q.placeholder || ""
          )}"></textarea>`);
        } else {
          parts.push(`<p class="hint">未知题型：${escapeHtml(q.type)}</p>`);
        }
        if (q.hint) parts.push(`<p class="hint">${escapeHtml(q.hint)}</p>`);
        parts.push(`</div>`);
      }
      parts.push(`</section>`);
    }
    formEl.innerHTML = parts.join("");

    $("#btnSubmit").onclick = () => {
      errEl.textContent = "";
      const answers = collectAnswers(cfg);
      const missing = validate(cfg, answers);
      if (missing.length) {
        errEl.textContent = `请完成必填项：${missing.join("、")}`;
        const first = document.querySelector(`[data-qid="${missing[0]}"]`);
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const payload = {
        surveyId: cfg.id,
        surveyTitle: cfg.title,
        submittedAt: new Date().toISOString(),
        answers,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `问卷结果_${cfg.id}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      $("#rawOut").value = JSON.stringify(payload, null, 2);
    };
  }

  window.renderSurvey = renderSurvey;
})();
