"""今日相关复盘推荐：将 METAR/TAF 天气码映射为知识库标签并检索。"""
from __future__ import annotations

from core.index import ReviewIndex, SearchHit

# 处置屏「机场警报」现象类型 → 复盘库 weather_types 标签（与 index.html AIRPORT_ALERT_PHENOMENA 一致）
ALERT_PHENOMENON_TO_INDEX: dict[str, list[str]] = {
    "热带气旋": ["台风", "热带气旋"],
    "雷暴": ["雷暴", "雷雨", "对流"],
    "强降水": ["暴雨", "强降雨"],
    "冰雹": ["冰雹"],
    "小雹（霰）": ["冰雹"],
    "雪": ["降雪", "冰雪"],
    "雨夹雪": ["降雪", "冰雪"],
    "冻降水": ["结冰", "冰雪"],
    "沙暴": ["沙尘"],
    "尘暴": ["沙尘"],
    "火山灰": ["沙尘"],
    "米雪": ["降雪", "冰雪"],
    "冰粒": ["结冰", "冰雪"],
    "冰晶": ["结冰"],
    "强地面风和阵风": ["大风"],
    "低能见度": ["低能见度", "大雾", "雾"],
    "低云": ["低能见度"],
    "炎热天气": [],
    "极寒天气": ["冰雪", "结冰"],
}

WX_CODE_TO_WEATHER: dict[str, list[str]] = {
    "TS": ["雷暴", "雷雨", "对流"],
    "TSRA": ["雷暴", "雷雨", "对流"],
    "VCTS": ["雷暴", "雷雨", "对流"],
    "RA": ["暴雨", "强降雨"],
    "SHRA": ["暴雨", "强降雨", "对流"],
    "+RA": ["暴雨", "强降雨"],
    "SN": ["降雪", "冰雪"],
    "SHSN": ["降雪", "冰雪"],
    "FG": ["雾", "大雾", "低能见度"],
    "BR": ["雾", "低能见度"],
    "FZ": ["结冰", "冰雪"],
    "FZRA": ["结冰"],
    "FZFG": ["结冰", "雾"],
    "DU": ["沙尘"],
    "SA": ["沙尘"],
    "HZ": ["霾"],
    "SQ": ["大风", "对流"],
    "GR": ["冰雹"],
    "GS": ["冰雹"],
    "WIND": ["大风"],
}


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def map_alert_phenomena(phenomena: list[str] | None) -> list[str]:
    if not phenomena:
        return []
    found: list[str] = []
    for raw in phenomena:
        key = str(raw or "").strip()
        if not key:
            continue
        for label in ALERT_PHENOMENON_TO_INDEX.get(key, [key]):
            if label not in found:
                found.append(label)
    return found


def map_weather_codes(codes: list[str] | None) -> list[str]:
    if not codes:
        return []
    found: list[str] = []
    seen: set[str] = set()
    for raw in codes:
        key = str(raw or "").strip().upper()
        if not key:
            continue
        for label in WX_CODE_TO_WEATHER.get(key, []):
            if label not in seen:
                seen.add(label)
                found.append(label)
    return found


def build_detail_search_query(
    hit: SearchHit,
    context_airports: list[str] | None = None,
) -> str:
    """单条复盘详情页搜索词：仅用该文档相关机场与天气，不用整屏上下文。"""
    parts: list[str] = []
    ctx = {str(a).strip().upper() for a in (context_airports or []) if str(a).strip()}

    labels = [str(x).strip() for x in (hit.airport_labels or []) if str(x).strip()]
    if labels:
        parts.extend(labels[:2])
    else:
        airports = [str(a).strip().upper() for a in (hit.airports or []) if str(a).strip()]
        if ctx:
            matched = [a for a in airports if a in ctx]
            if matched:
                airports = matched
        parts.extend(airports[:2])

    for label in (hit.weather_types or [])[:3]:
        text = str(label).strip()
        if text and text not in parts:
            parts.append(text)

    if not parts:
        stem = str(hit.filename or "").rsplit(".", 1)[0].strip()
        parts.append(stem or "航空气象复盘")

    return " ".join(parts)


def build_recommend_query(
    airports: list[str] | None,
    weather_codes: list[str] | None,
    weather_types: list[str] | None,
    alert_phenomena: list[str] | None = None,
) -> str:
    parts: list[str] = []
    for ap in (airports or [])[:8]:
        code = str(ap).strip().upper()
        if code:
            parts.append(code)
    for label in (alert_phenomena or [])[:6]:
        text = str(label).strip()
        if text:
            parts.append(text)
    for label in (weather_types or [])[:6]:
        if label not in parts:
            parts.append(label)
    for code in (weather_codes or [])[:6]:
        token = str(code).strip().upper()
        if token:
            parts.append(token)
    return " ".join(parts) or "航空气象恶劣天气复盘"


def recommend(
    index: ReviewIndex,
    airports: list[str] | None = None,
    weather_codes: list[str] | None = None,
    alert_phenomena: list[str] | None = None,
    top_k: int = 5,
) -> tuple[str, list[str], list[str], list[str], list[SearchHit]]:
    """按机场、机场警报现象、报文恶劣天气码推荐复盘片段，逐步放宽筛选。"""
    airports = [str(a).strip().upper() for a in (airports or []) if str(a).strip()]
    weather_codes = [str(w).strip().upper() for w in (weather_codes or []) if str(w).strip()]
    alert_phenomena = [str(p).strip() for p in (alert_phenomena or []) if str(p).strip()]
    weather_types = _unique(
        map_alert_phenomena(alert_phenomena) + map_weather_codes(weather_codes)
    )
    query = build_recommend_query(airports, weather_codes, weather_types, alert_phenomena)
    top_k = max(1, min(int(top_k or 5), 10))

    attempts: list[dict] = [
        {"airports": airports or None, "weather_types": weather_types or None},
        {"airports": airports or None, "weather_types": None},
        {"airports": None, "weather_types": weather_types or None},
        {"airports": None, "weather_types": None},
    ]

    seen: set[str] = set()
    hits: list[SearchHit] = []
    for attempt in attempts:
        if not attempt["airports"] and not attempt["weather_types"] and hits:
            break
        batch = index.search(
            query=query,
            airports=attempt["airports"],
            weather_types=attempt["weather_types"],
            top_k=top_k,
            mode="hybrid",
        )
        for hit in batch:
            if hit.chunk_id in seen:
                continue
            seen.add(hit.chunk_id)
            hits.append(hit)
            if len(hits) >= top_k:
                return query, airports, weather_codes, alert_phenomena, hits[:top_k]

    return query, airports, weather_codes, alert_phenomena, hits[:top_k]
