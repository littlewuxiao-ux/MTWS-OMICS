"""航空气象复盘智能搜索系统 — Streamlit 入口。"""
from __future__ import annotations

import os
import socket
import sys
from datetime import date
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ui_styles import (
    highlight_html,
    inject_styles,
    panel_close,
    panel_open,
    render_doc_card,
    render_hero,
    render_hit_card,
    render_kpi_cards,
    render_results_banner,
    render_section,
    render_sidebar_brand,
    render_status_pill,
)
from config import DOCUMENTS_DIR
from core.index import ReviewIndex
from core.metadata import all_airport_options, all_impact_options, all_weather_options
from tools.download_model import is_model_ready

SEARCH_MODES = {
    "hybrid": "混合搜索",
    "semantic": "仅语义",
    "keyword": "仅关键词",
}

INDEX_CACHE_VERSION = "6"


@st.cache_resource(show_spinner="正在加载检索索引…")
def get_index(_cache_version: str = INDEX_CACHE_VERSION) -> ReviewIndex:
    return ReviewIndex()


def reload_review_index() -> None:
    from core.embedder import reset_embedder

    get_index.clear()
    reset_embedder()


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def open_local_file(path_str: str) -> None:
    path = Path(path_str)
    if not path.exists():
        st.warning(f"原文不存在：{path}")
        return
    try:
        os.startfile(str(path))
    except AttributeError:
        import subprocess

        subprocess.run(["xdg-open", str(path)], check=False)


def read_file_bytes(path_str: str) -> bytes | None:
    path = Path(path_str)
    if not path.exists():
        return None
    return path.read_bytes()


def _init_search_from_query() -> bool:
    qp = st.query_params
    q = (qp.get("q") or "").strip()
    auto = str(qp.get("auto") or "").strip() == "1"
    if q:
        last = st.session_state.get("_last_url_query", "")
        if q != last:
            st.session_state["search_query"] = q
            st.session_state["_last_url_query"] = q
            st.session_state.pop("_review_auto_searched", None)
    if auto and q and not st.session_state.get("_review_auto_searched"):
        st.session_state["_review_auto_searched"] = True
        return True
    return False


def page_search(index: ReviewIndex) -> None:
    auto_search = _init_search_from_query()
    st.markdown(
        """
        <div class="panel-notice">
            <div class="panel-notice-label">复盘智能搜索说明</div>
            <p>输入自然语言或专业术语，可按机场、天气、运行影响等维度进一步筛选。</p>
            <p>混合模式同时启用语义理解（BGE-M3）与关键词匹配（BM25），适合值班席快速检索历史案例。</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    mode_key = st.radio(
        "搜索模式",
        options=list(SEARCH_MODES.keys()),
        format_func=lambda k: SEARCH_MODES[k],
        horizontal=True,
        key="search_mode",
    )
    query = st.text_input(
        "搜索内容",
        placeholder="例如：去年深圳雷雨导致大面积延误的情况",
        key="search_query",
    )

    with st.expander("高级筛选", expanded=False):
        col1, col2 = st.columns(2)
        with col1:
            airports = st.multiselect("机场", options=all_airport_options())
            weather_types = st.multiselect("天气类型", options=all_weather_options())
        with col2:
            impacts = st.multiselect("系统影响", options=all_impact_options())
            dcol1, dcol2 = st.columns(2)
            with dcol1:
                date_from = st.date_input("起始日期", value=None, key="date_from")
            with dcol2:
                date_to = st.date_input("结束日期", value=None, key="date_to")

    do_search = st.button("开始搜索", type="primary", use_container_width=True)

    if do_search or auto_search:
        if not query.strip():
            st.info("请输入搜索内容。")
            return
        with st.spinner("正在加载语义模型并检索…"):
            hits = index.search(
                query=query,
                airports=airports or None,
                weather_types=weather_types or None,
                impacts=impacts or None,
                date_from=date_from.isoformat() if isinstance(date_from, date) else None,
                date_to=date_to.isoformat() if isinstance(date_to, date) else None,
                mode=mode_key or "hybrid",
            )
        if not hits:
            st.warning("未找到匹配结果，可尝试放宽筛选条件或先入库更多复盘。")
            return

        mode_label = SEARCH_MODES.get(mode_key or "hybrid", "混合搜索")
        render_results_banner(len(hits), mode_label)

        for i, hit in enumerate(hits, start=1):
            render_hit_card(
                rank=i,
                filename=hit.filename,
                relevance_pct=hit.relevance_pct,
                semantic_rank=hit.semantic_rank,
                keyword_rank=hit.keyword_rank,
                section=hit.section,
                airport_labels=hit.airport_labels,
                weather_types=hit.weather_types,
                impacts=hit.impacts,
                event_date=hit.event_date,
                excerpt=highlight_html(hit.text, query),
            )
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                st.button(
                    "打开原文",
                    key=f"open_{hit.chunk_id}",
                    on_click=open_local_file,
                    args=(hit.source_path,),
                    use_container_width=True,
                )
            with btn_col2:
                file_bytes = read_file_bytes(hit.source_path)
                if file_bytes:
                    st.download_button(
                        "下载原文",
                        data=file_bytes,
                        file_name=hit.filename,
                        key=f"dl_{hit.chunk_id}",
                        use_container_width=True,
                    )


def page_ingest(index: ReviewIndex) -> None:
    render_section(
        "文档入库",
        "支持 Word / PDF / PPT / TXT。上传后自动解析、提取标签并写入检索索引。",
    )

    panel_open("上传复盘材料")
    uploaded = st.file_uploader(
        "拖拽或选择文件",
        type=["txt", "md", "docx", "pdf", "pptx"],
        accept_multiple_files=True,
        label_visibility="collapsed",
    )
    st.caption("拖拽或选择文件")
    if uploaded and st.button("确认入库", type="primary", use_container_width=True):
        success, failed = 0, []
        for file in uploaded:
            target = DOCUMENTS_DIR / file.name
            target.write_bytes(file.getvalue())
            try:
                index.ingest_file(target, move_into_library=False)
                success += 1
            except Exception as exc:
                failed.append(f"{file.name}: {exc}")
        reload_review_index()
        st.success(f"成功入库 {success} 份文档。")
        for msg in failed:
            st.error(msg)
    panel_close()

    panel_open("批量扫描", f"自动扫描目录中的新文件：{DOCUMENTS_DIR}")
    if st.button("扫描并入库新文档", use_container_width=True):
        with st.spinner("正在扫描目录…"):
            ingested = ReviewIndex().ingest_directory()
        reload_review_index()
        if ingested:
            st.success(f"新入库 {len(ingested)} 份：{', '.join(d.filename for d in ingested)}")
        else:
            st.info("目录中没有待入库的新文档。")
    panel_close()


def page_manage(index: ReviewIndex) -> None:
    render_section("库管理", "查看已索引复盘文档、元数据标签与索引状态。")

    stats = index.stats()
    render_kpi_cards(
        [
            ("文档总数", str(stats["documents"]), "已入库复盘材料"),
            ("检索片段", str(stats["chunks"]), "可搜索的文本块"),
            (
                "语义引擎",
                "在线" if stats.get("semantic_enabled") else "离线",
                "BGE-M3 语义向量",
            ),
        ]
    )

    docs = index.list_documents()
    if not docs:
        st.info("索引库为空。请先在「文档入库」页上传复盘材料。")
        return

    for doc in docs:
        meta_parts = []
        if doc.airport_labels:
            meta_parts.append("机场：" + "、".join(doc.airport_labels))
        if doc.weather_types:
            meta_parts.append("天气：" + "、".join(doc.weather_types))
        if doc.impacts:
            meta_parts.append("影响：" + "、".join(doc.impacts))
        if doc.event_date:
            meta_parts.append(f"日期：{doc.event_date}")
        meta_parts.append(f"字数 {doc.char_count}")
        meta_parts.append(f"入库 {doc.indexed_at}")

        render_doc_card(doc.filename, " · ".join(meta_parts))
        col_a, col_b = st.columns([1, 1])
        with col_a:
            st.button(
                "打开原文",
                key=f"mgr_open_{doc.doc_id}",
                on_click=open_local_file,
                args=(doc.source_path,),
                use_container_width=True,
            )
        with col_b:
            if st.button("删除索引", key=f"mgr_del_{doc.doc_id}", use_container_width=True):
                index.delete_document(doc.doc_id)
                reload_review_index()
                st.rerun()


def page_help() -> None:
    render_section("展示与部署", "面向值班席位推广、局域网演示与独立安装说明。")
    ip = local_ip()

    st.markdown(
        f"""
        <div class="help-card">
            <h4>给别人演示</h4>
            <p>1. 保持服务运行（start.bat / start_lan.bat）<br>
            2. 本机访问 <b>http://localhost:8501</b><br>
            3. 同网段席位访问 <b>http://{ip}:8501</b></p>
        </div>
        <div class="help-card">
            <h4>席位电脑（局域网共用）</h4>
            <p>在一台主机运行服务，各席位浏览器访问局域网地址。
            其他席位请使用「下载原文」查看复盘文件。</p>
        </div>
        <div class="help-card">
            <h4>独立安装</h4>
            <p>复制整个 review-search 文件夹（含 models 与 data），
            安装 Python 依赖后双击 start.bat 即可。</p>
        </div>
        <div class="help-card">
            <h4>搜索模式</h4>
            <ul>
                <li><b>混合搜索</b>：语义 + 关键词，推荐日常使用</li>
                <li><b>仅语义</b>：适合口语化、自然语言提问</li>
                <li><b>仅关键词</b>：适合四字码、专有名词精确查找</li>
            </ul>
        </div>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(
        page_title="航空气象复盘智能搜索",
        page_icon="✈",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    inject_styles()
    index = get_index()
    stats = index.stats()
    semantic_on = bool(stats.get("semantic_enabled"))
    semantic_loaded = bool(getattr(index.embedder, "loaded", False))

    with st.sidebar:
        render_sidebar_brand()
        page = st.radio(
            "功能",
            options=["智能搜索", "文档入库", "库管理", "展示说明"],
            label_visibility="collapsed",
        )
        st.markdown("<div style='height:0.4rem'></div>", unsafe_allow_html=True)
        render_status_pill(
            semantic_on,
            "语义引擎在线" if semantic_on else "语义引擎离线（仅关键词）",
        )
        if not semantic_on and is_model_ready():
            err = get_index().embedder._error or ""
            if err:
                st.caption(f"离线原因：{err[:120]}")
            else:
                st.caption("模型文件已就绪；若仍离线请点下方按钮或运行 fix-torch.bat")
            if st.button("重新加载语义引擎", use_container_width=True):
                reload_review_index()
                st.rerun()
        elif semantic_on and stats.get("model_path"):
            st.caption(f"模型 {stats.get('model_path')}")
            if not semantic_loaded:
                st.caption("首次语义搜索时将载入模型（约 1 分钟，请稍候）")
        st.caption(f"文档 {stats['documents']} 份 · 片段 {stats['chunks']} 个")
        st.divider()
        lan_url = f"http://{local_ip()}:8501"
        st.markdown(
            f"""
            <div class="sidebar-lan">
                <div class="sidebar-lan-label">局域网访问</div>
                <div class="sidebar-lan-url">{lan_url}</div>
                <div class="sidebar-lan-hint">席位电脑浏览器打开此地址</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    render_hero(
        "航空气象复盘智能搜索系统",
        "历史复盘知识库 · 语义 + 关键词混合检索 · 全离线运行",
        badges=[],
    )

    if page == "智能搜索":
        page_search(index)
    elif page == "文档入库":
        page_ingest(index)
    elif page == "库管理":
        page_manage(index)
    else:
        page_help()


if __name__ == "__main__":
    main()
