"""界面样式与通用 UI 组件。"""
from __future__ import annotations

import html
import re

import jieba

THEME_CSS = """
<style>
:root {
    --navy-950: #07111f;
    --navy-900: #0c1929;
    --navy-800: #132337;
    --navy-700: #1e3a5f;
    --sky-500: #0ea5e9;
    --sky-400: #38bdf8;
    --cyan-500: #06b6d4;
    --slate-50: #f8fafc;
    --slate-100: #f1f5f9;
    --slate-200: #e2e8f0;
    --slate-500: #64748b;
    --slate-700: #334155;
    --slate-900: #0f172a;
    --emerald-500: #10b981;
    --amber-500: #f59e0b;
}

html, body, [class*="css"] {
    font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
}

html, body {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    height: auto !important;
}

[data-testid="stApp"],
[data-testid="stAppViewContainer"],
section.main {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    height: auto !important;
}

[data-testid="stAppViewContainer"] {
    background: linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%) !important;
}

[data-testid="stMain"],
[data-testid="stMain"] > div,
[data-testid="stMainBlockContainer"] {
    background: transparent !important;
}

[data-testid="stSidebar"],
[data-testid="stSidebar"] > div,
[data-testid="stSidebarContent"] {
    background: linear-gradient(180deg, #0c1929 0%, #07111f 100%) !important;
    border-right: 1px solid rgba(56, 189, 248, 0.12);
    overflow-y: auto !important;
}

[data-testid="stSidebar"] p,
[data-testid="stSidebar"] label,
[data-testid="stSidebar"] span,
[data-testid="stSidebar"] small,
[data-testid="stSidebar"] .stMarkdown {
    color: #e2e8f0 !important;
}

[data-testid="stSidebar"] .stCaption,
[data-testid="stSidebar"] [data-testid="stCaptionContainer"] {
    color: #94a3b8 !important;
}

[data-testid="stSidebar"] strong {
    color: #f1f5f9 !important;
}

[data-testid="stSidebar"] .stRadio {
    width: 100% !important;
}

[data-testid="stSidebar"] .stRadio > div {
    width: 100% !important;
}

[data-testid="stSidebar"] .stRadio > label {
    display: none;
}

[data-testid="stSidebar"] .stRadio [role="radiogroup"] {
    display: flex !important;
    flex-direction: column !important;
    gap: 0.4rem !important;
    width: 100% !important;
}

[data-testid="stSidebar"] .stRadio [role="radiogroup"] > label,
[data-testid="stSidebar"] .stRadio [role="radiogroup"] label {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    min-height: 2.45rem !important;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 0.55rem 0.85rem !important;
    transition: all 0.2s ease;
}

[data-testid="stSidebar"] .stRadio [role="radiogroup"] label:hover {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.35);
}

[data-testid="stSidebar"] .stRadio [role="radiogroup"] label[data-checked="true"],
[data-testid="stSidebar"] .stRadio div[aria-checked="true"] label {
    background: linear-gradient(135deg, rgba(14,165,233,0.28), rgba(6,182,212,0.18)) !important;
    border-color: rgba(56, 189, 248, 0.55) !important;
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.15);
}

[data-testid="stSidebar"] hr {
    border-color: rgba(255,255,255,0.08) !important;
}

[data-testid="stSidebar"] code {
    background: rgba(0,0,0,0.25) !important;
    color: #7dd3fc !important;
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 8px;
    padding: 0.45rem 0.6rem !important;
}

[data-testid="stSidebar"] .sidebar-lan {
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.25rem;
}

[data-testid="stSidebar"] .sidebar-lan-label {
    font-weight: 600;
    color: #f1f5f9 !important;
    font-size: 0.9rem;
    margin: 0 0 0.45rem 0;
    padding: 0;
}

[data-testid="stSidebar"] .sidebar-lan-url {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    color: #7dd3fc !important;
    font-size: 0.82rem;
    line-height: 1.4;
    word-break: break-all;
    font-family: Consolas, "Courier New", monospace;
}

[data-testid="stSidebar"] .sidebar-lan-hint {
    color: #94a3b8 !important;
    font-size: 0.78rem;
    margin: 0.4rem 0 0 0;
    padding: 0;
}

[data-testid="stToolbarActions"] { display: none !important; }

.block-container {
    padding-top: 2rem !important;
    padding-bottom: 2rem !important;
    max-width: 1180px;
    background: transparent !important;
}

[data-testid="stMainBlockContainer"] {
    padding-top: 1.25rem !important;
    background: transparent !important;
}

[data-testid="stVerticalBlock"],
[data-testid="stVerticalBlockBorderWrapper"],
[data-testid="stMarkdownContainer"] {
    background: transparent !important;
}

/* 顶部横幅 iframe：去掉底部空隙 */
[data-testid="stHtml"] {
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
}

div[data-testid="stHtml"] iframe {
    border: none !important;
    display: block;
    margin-bottom: 0 !important;
}

.panel-card {
    background: #ffffff;
    border: 1px solid var(--slate-200);
    border-radius: 16px;
    padding: 1.1rem 1.2rem 0.4rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
    margin-bottom: 1rem;
}

.panel-card-title {
    font-size: 1.02rem;
    font-weight: 700;
    color: var(--slate-900);
    margin: 0 0 0.25rem;
}

.panel-card-desc {
    font-size: 0.86rem;
    color: var(--slate-500);
    margin: 0 0 0.8rem;
}

.panel-notice {
    background: #f8fafc;
    border: 1px solid var(--slate-200);
    border-radius: 10px;
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.9rem;
}

.panel-notice-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--slate-700);
    margin-bottom: 0.35rem;
}

.panel-notice p {
    margin: 0 0 0.35rem;
    font-size: 0.86rem;
    color: var(--slate-600, #475569);
    line-height: 1.55;
}

.panel-notice p:last-child {
    margin-bottom: 0;
}

.kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.85rem;
    margin-bottom: 1rem;
}

.kpi-card {
    background: #fff;
    border: 1px solid var(--slate-200);
    border-radius: 14px;
    padding: 0.95rem 1rem;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
}

.kpi-label {
    font-size: 0.78rem;
    color: var(--slate-500);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
}

.kpi-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--slate-900);
    margin-top: 0.2rem;
}

.kpi-sub {
    font-size: 0.8rem;
    color: var(--slate-500);
    margin-top: 0.15rem;
}

.hit-card {
    background: #fff;
    border: 1px solid var(--slate-200);
    border-radius: 16px;
    padding: 1rem 1.1rem;
    margin-bottom: 0.85rem;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.hit-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
    border-color: rgba(14, 165, 233, 0.28);
}

.hit-head {
    display: grid;
    grid-template-columns: 42px 1fr auto;
    gap: 0.75rem;
    align-items: start;
}

.hit-rank {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #0369a1;
    background: linear-gradient(135deg, #e0f2fe, #ecfeff);
    border: 1px solid #bae6fd;
    font-size: 0.9rem;
}

.hit-title {
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--slate-900);
    line-height: 1.35;
    word-break: break-all;
}

.hit-sub {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: var(--slate-500);
}

.hit-score-box {
    text-align: right;
    min-width: 72px;
}

.hit-score-val {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--sky-500);
    line-height: 1;
}

.hit-score-label {
    font-size: 0.72rem;
    color: var(--slate-500);
    margin-top: 0.15rem;
}

.relevance-track {
    height: 6px;
    background: var(--slate-100);
    border-radius: 999px;
    overflow: hidden;
    margin: 0.75rem 0 0.65rem;
}

.relevance-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--sky-500), var(--cyan-500));
}

.tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.65rem;
}

.tag-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.18rem 0.55rem;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    border: 1px solid transparent;
}

.tag-pill.airport { color: #0c4a6e; background: #e0f2fe; border-color: #bae6fd; }
.tag-pill.weather { color: #7c2d12; background: #ffedd5; border-color: #fed7aa; }
.tag-pill.impact { color: #4c1d95; background: #ede9fe; border-color: #ddd6fe; }
.tag-pill.date { color: #334155; background: #f1f5f9; border-color: #e2e8f0; }
.tag-pill.rank { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }

.hit-excerpt {
    background: var(--slate-50);
    border-left: 3px solid var(--sky-400);
    border-radius: 0 10px 10px 0;
    padding: 0.75rem 0.85rem;
    color: var(--slate-700);
    font-size: 0.9rem;
    line-height: 1.65;
}

.hit-excerpt mark {
    background: #fef08a;
    color: #713f12;
    padding: 0 0.15rem;
    border-radius: 3px;
}

.doc-card {
    background: #fff;
    border: 1px solid var(--slate-200);
    border-radius: 14px;
    padding: 0.95rem 1rem;
    margin-bottom: 0.75rem;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.04);
}

.doc-card-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--slate-900);
    margin-bottom: 0.35rem;
}

.doc-card-meta {
    font-size: 0.8rem;
    color: var(--slate-500);
    line-height: 1.5;
}

.sidebar-brand {
    padding: 0.2rem 0 0.8rem;
}

[data-testid="stSidebar"] .sidebar-brand-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f8fafc !important;
    letter-spacing: 0.03em;
}

[data-testid="stSidebar"] .sidebar-brand-sub {
    font-size: 0.78rem;
    color: #94a3b8 !important;
    margin-top: 0.2rem;
}

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 600;
    width: 100%;
    box-sizing: border-box;
}

[data-testid="stSidebar"] .status-pill.ok {
    background: rgba(16, 185, 129, 0.2) !important;
    border: 1px solid rgba(16, 185, 129, 0.45) !important;
    color: #bbf7d0 !important;
}

[data-testid="stSidebar"] .status-pill.warn {
    background: rgba(245, 158, 11, 0.2) !important;
    border: 1px solid rgba(245, 158, 11, 0.45) !important;
    color: #fde68a !important;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
}

.section-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--slate-900);
    margin: 0.75rem 0 0.2rem;
}

.section-desc {
    font-size: 0.86rem;
    color: var(--slate-500);
    margin: 0 0 1rem;
}

.results-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    background: linear-gradient(135deg, #ecfeff, #f0f9ff);
    border: 1px solid #bae6fd;
    border-radius: 12px;
    padding: 0.7rem 0.9rem;
    margin-bottom: 0.9rem;
    color: #0c4a6e;
    font-size: 0.9rem;
    font-weight: 600;
}

.help-card {
    background: #fff;
    border: 1px solid var(--slate-200);
    border-radius: 14px;
    padding: 1rem 1.1rem;
    margin-bottom: 0.85rem;
}

.help-card h4 {
    margin: 0 0 0.45rem;
    color: var(--slate-900);
    font-size: 0.98rem;
}

.help-card p, .help-card li {
    color: var(--slate-700);
    font-size: 0.88rem;
    line-height: 1.6;
}

div.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    border: none;
    border-radius: 10px;
    font-weight: 700;
    box-shadow: 0 8px 18px rgba(14, 165, 233, 0.25);
}

div.stButton > button[kind="primary"]:hover {
    background: linear-gradient(135deg, #0369a1, #0284c7);
}

[data-testid="stMain"] div.stTextInput input,
[data-testid="stMain"] .stTextInput input {
    background-color: #ffffff !important;
    color: #0f172a !important;
    caret-color: #0f172a !important;
    border-radius: 10px !important;
    border: 1px solid #cbd5e1 !important;
    outline: none !important;
    box-shadow: none !important;
}

[data-testid="stMain"] div.stTextInput input::placeholder {
    color: #94a3b8 !important;
}

[data-testid="stMain"] div.stTextInput input:focus {
    border-color: #38bdf8 !important;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15) !important;
}

[data-testid="stMain"] div.stTextInput label {
    color: #334155 !important;
}

[data-testid="stMain"] input[type="text"] {
    background-color: #ffffff !important;
    color: #0f172a !important;
    -webkit-text-fill-color: #0f172a !important;
}

/* 高级筛选：多选框、日期等 */
[data-testid="stMain"] [data-testid="stMultiSelect"] label,
[data-testid="stMain"] [data-testid="stDateInput"] label,
[data-testid="stMain"] [data-testid="stExpander"] label {
    color: #334155 !important;
}

[data-testid="stMain"] [data-testid="stMultiSelect"] [data-baseweb="select"] > div,
[data-testid="stMain"] [data-baseweb="select"] > div {
    background-color: #ffffff !important;
    color: #0f172a !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 10px !important;
}

[data-testid="stMain"] [data-testid="stMultiSelect"] input,
[data-testid="stMain"] [data-baseweb="select"] input {
    background-color: #ffffff !important;
    color: #0f172a !important;
    caret-color: #0f172a !important;
    -webkit-text-fill-color: #0f172a !important;
}

[data-testid="stMain"] [data-testid="stMultiSelect"] [data-baseweb="tag"],
[data-testid="stMain"] [data-baseweb="tag"] {
    background-color: #e0f2fe !important;
    color: #0c4a6e !important;
    border: 1px solid #bae6fd !important;
}

[data-testid="stMain"] [data-testid="stMultiSelect"] [data-baseweb="tag"] span,
[data-testid="stMain"] [data-baseweb="tag"] span {
    color: #0c4a6e !important;
}

[data-testid="stMain"] [data-testid="stDateInput"] input,
[data-testid="stMain"] [data-testid="stDateInput"] [data-baseweb="input"] {
    background-color: #ffffff !important;
    color: #0f172a !important;
    -webkit-text-fill-color: #0f172a !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 10px !important;
}

[data-testid="stMain"] [data-testid="stMultiSelect"] svg,
[data-testid="stMain"] [data-testid="stDateInput"] svg {
    fill: #64748b !important;
}
</style>
"""


def inject_styles() -> None:
    import streamlit as st

    st.markdown(THEME_CSS, unsafe_allow_html=True)


def render_hero(title: str, subtitle: str, badges: list[tuple[str, bool]] | None = None) -> None:
    import streamlit.components.v1 as components

    hero_h = 168
    spacer_h = 52
    components.html(
        f"""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#0c4a6e;font-family:'Segoe UI','Microsoft YaHei',sans-serif;">
          <div style="
            height:{hero_h}px;
            background:linear-gradient(135deg,#0c1929 0%,#1e3a5f 52%,#0c4a6e 100%);
            text-align:center;
            overflow:hidden;
            box-sizing:border-box;
          ">
            <div style="height:{spacer_h}px;line-height:0;font-size:0;">&nbsp;</div>
            <div style="font-size:27px;font-weight:700;color:#f8fafc;line-height:1.35;margin:0;">
              {html.escape(title)}
            </div>
            <div style="margin-top:10px;font-size:15px;color:#cbd5e1;line-height:1.5;">
              {html.escape(subtitle)}
            </div>
            <div style="height:{spacer_h}px;line-height:0;font-size:0;">&nbsp;</div>
          </div>
        </body></html>
        """,
        height=hero_h,
        scrolling=False,
    )


def render_section(title: str, desc: str = "") -> None:
    import streamlit as st

    desc_html = f'<div class="section-desc">{html.escape(desc)}</div>' if desc else ""
    st.markdown(
        f'<div class="section-title">{html.escape(title)}</div>{desc_html}',
        unsafe_allow_html=True,
    )


def render_kpi_cards(items: list[tuple[str, str, str]]) -> None:
    import streamlit as st

    cards = []
    for label, value, sub in items:
        cards.append(
            f"""
            <div class="kpi-card">
                <div class="kpi-label">{html.escape(label)}</div>
                <div class="kpi-value">{html.escape(value)}</div>
                <div class="kpi-sub">{html.escape(sub)}</div>
            </div>
            """
        )
    st.markdown(f'<div class="kpi-grid">{"".join(cards)}</div>', unsafe_allow_html=True)


def render_results_banner(count: int, mode_label: str) -> None:
    import streamlit as st

    st.markdown(
        f"""
        <div class="results-banner">
            <span>共找到 {count} 条相关片段</span>
            <span>模式 · {html.escape(mode_label)}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def highlight_html(text: str, query: str, width: int = 280) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    terms = [tok for tok in jieba.lcut_for_search(query) if len(tok.strip()) >= 2]
    pos = -1
    for term in terms:
        idx = text.find(term)
        if idx >= 0:
            pos = idx
            break
    if pos < 0:
        snippet = text[:width] + ("…" if len(text) > width else "")
    else:
        start = max(0, pos - width // 3)
        snippet = text[start : start + width]
        if start > 0:
            snippet = "…" + snippet
        if start + width < len(text):
            snippet += "…"
    escaped = html.escape(snippet)
    for term in sorted(set(terms), key=len, reverse=True):
        if not term:
            continue
        escaped = escaped.replace(html.escape(term), f"<mark>{html.escape(term)}</mark>")
    return escaped


def render_hit_card(
    rank: int,
    filename: str,
    relevance_pct: float,
    semantic_rank: int | None,
    keyword_rank: int | None,
    section: str,
    airport_labels: list[str],
    weather_types: list[str],
    impacts: list[str],
    event_date: str | None,
    excerpt: str,
) -> None:
    import streamlit as st

    tags: list[str] = []
    for label in airport_labels[:4]:
        tags.append(f'<span class="tag-pill airport">{html.escape(label)}</span>')
    for label in weather_types[:4]:
        tags.append(f'<span class="tag-pill weather">{html.escape(label)}</span>')
    for label in impacts[:4]:
        tags.append(f'<span class="tag-pill impact">{html.escape(label)}</span>')
    if event_date:
        tags.append(f'<span class="tag-pill date">{html.escape(event_date)}</span>')
    if semantic_rank:
        tags.append(f'<span class="tag-pill rank">语义 #{semantic_rank}</span>')
    if keyword_rank:
        tags.append(f'<span class="tag-pill rank">关键词 #{keyword_rank}</span>')

    section_html = (
        f'<div class="hit-sub">章节 · {html.escape(section)}</div>' if section else ""
    )
    st.markdown(
        f"""
        <div class="hit-card">
            <div class="hit-head">
                <div class="hit-rank">{rank:02d}</div>
                <div>
                    <div class="hit-title">{html.escape(filename)}</div>
                    {section_html}
                </div>
                <div class="hit-score-box">
                    <div class="hit-score-val">{relevance_pct:.0f}%</div>
                    <div class="hit-score-label">相关度</div>
                </div>
            </div>
            <div class="relevance-track">
                <div class="relevance-fill" style="width:{max(4, relevance_pct)}%;"></div>
            </div>
            <div class="tag-row">{"".join(tags)}</div>
            <div class="hit-excerpt">{excerpt}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_doc_card(filename: str, meta_line: str) -> None:
    import streamlit as st

    st.markdown(
        f"""
        <div class="doc-card">
            <div class="doc-card-title">{html.escape(filename)}</div>
            <div class="doc-card-meta">{html.escape(meta_line)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_sidebar_brand() -> None:
    import streamlit as st

    st.markdown(
        """
        <div class="sidebar-brand">
            <div class="sidebar-brand-title">航空气象复盘</div>
            <div class="sidebar-brand-sub">智能检索知识库</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_status_pill(ok: bool, text: str) -> None:
    import streamlit as st

    cls = "ok" if ok else "warn"
    st.markdown(
        f'<div class="status-pill {cls}"><span class="status-dot"></span>{html.escape(text)}</div>',
        unsafe_allow_html=True,
    )


def panel_open(title: str, desc: str = "") -> None:
    import streamlit as st

    desc_html = (
        f'<div class="panel-card-desc">{html.escape(desc)}</div>' if desc else ""
    )
    st.markdown(
        f"""
        <div class="panel-card">
            <div class="panel-card-title">{html.escape(title)}</div>
            {desc_html}
        """,
        unsafe_allow_html=True,
    )


def panel_close() -> None:
    import streamlit as st

    st.markdown("</div>", unsafe_allow_html=True)
