"""复盘推荐 API — 供气象智能业务工作台调用。"""
import os
import sys
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.index import ReviewIndex
from core.recommend import build_detail_search_query, recommend

SEARCH_UI_BASE = os.environ.get("REVIEW_SEARCH_UI_BASE", "http://localhost:8501")


@lru_cache(maxsize=1)
def get_index() -> ReviewIndex:
    return ReviewIndex()


app = FastAPI(title="复盘推荐 API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _parse_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _snippet(text: str, limit: int = 160) -> str:
    compact = " ".join(str(text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


@app.get("/api/health")
def health() -> dict:
    stats = get_index().stats()
    return {
        "ok": True,
        "documents": stats.get("documents", 0),
        "chunks": stats.get("chunks", 0),
        "semantic_enabled": bool(stats.get("semantic_enabled")),
    }


@app.get("/api/recommend")
def api_recommend(
    airports: str | None = Query(None, description="逗号分隔 ICAO，如 ZGSZ,ZBAA"),
    weather: str | None = Query(None, description="逗号分隔报文恶劣天气码，如 TS,FG"),
    phenomena: str | None = Query(None, description="逗号分隔机场警报现象类型，如 雷暴,低能见度"),
    top_k: int = Query(5, ge=1, le=10),
) -> dict:
    airport_list = [a.upper() for a in _parse_csv(airports)]
    weather_list = [w.upper() for w in _parse_csv(weather)]
    phenomenon_list = _parse_csv(phenomena)

    query, used_airports, used_weather, used_phenomena, hits = recommend(
        get_index(),
        airports=airport_list or None,
        weather_codes=weather_list or None,
        alert_phenomena=phenomenon_list or None,
        top_k=top_k,
    )

    items = []
    for hit in hits:
        detail_query = build_detail_search_query(hit, context_airports=used_airports)
        search_url = f"{SEARCH_UI_BASE}/?q={quote(detail_query)}&auto=1"
        items.append(
            {
                "chunk_id": hit.chunk_id,
                "doc_id": hit.doc_id,
                "filename": hit.filename,
                "title": hit.filename,
                "section": hit.section,
                "snippet": _snippet(hit.text),
                "relevance_pct": hit.relevance_pct,
                "event_date": hit.event_date,
                "airports": hit.airports,
                "airport_labels": hit.airport_labels,
                "weather_types": hit.weather_types,
                "impacts": hit.impacts,
                "detail_query": detail_query,
                "search_url": search_url,
                "source_path": hit.source_path,
            }
        )

    return {
        "ok": True,
        "query": query,
        "airports": used_airports,
        "weather": used_weather,
        "phenomena": used_phenomena,
        "count": len(items),
        "items": items,
    }
