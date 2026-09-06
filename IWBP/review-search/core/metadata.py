"""从文件名与正文提取复盘元数据（规则引擎，无需联网）。"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime


AIRPORT_ALIASES: dict[str, str] = {
    "深圳": "ZGSZ",
    "宝安": "ZGSZ",
    "白云": "ZGGG",
    "广州": "ZGGG",
    "鄂州": "ZHEC",
    "花湖": "ZHEC",
    "北京": "ZBAA",
    "首都": "ZBAA",
    "大兴": "ZBAD",
    "上海": "ZSSS",
    "虹桥": "ZSSS",
    "浦东": "ZSPD",
    "成都": "ZUUU",
    "双流": "ZUUU",
    "天府": "ZUTF",
    "杭州": "ZSHC",
    "武汉": "ZHHH",
    "西安": "ZLXY",
    "重庆": "ZUCK",
    "昆明": "ZPPP",
    "南京": "ZSNJ",
    "厦门": "ZSAM",
    "青岛": "ZSQD",
    "大连": "ZYTL",
    "海口": "ZJHK",
    "三亚": "ZJSY",
    "珠海": "ZGSD",
    "桂林": "ZGKL",
    "长沙": "ZGHA",
    "郑州": "ZHCC",
    "天津": "ZBTJ",
    "沈阳": "ZYTX",
    "哈尔滨": "ZYHB",
    "乌鲁木齐": "ZWWW",
    "兰州": "ZLLL",
    "贵阳": "ZUGY",
    "南宁": "ZGNN",
    "拉萨": "ZULS",
}

WEATHER_TYPES = [
    "雷雨",
    "雷暴",
    "对流",
    "台风",
    "热带气旋",
    "低能见度",
    "大雾",
    "雾",
    "冰雪",
    "降雪",
    "结冰",
    "大风",
    "风切变",
    "沙尘",
    "霾",
    "暴雨",
    "强降雨",
    "冰雹",
]

IMPACTS = [
    "流控",
    "备降",
    "延误",
    "绕飞",
    "取消",
    "返航",
    "大面积",
    "限制",
]

DATE_PATTERNS = [
    re.compile(r"(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})"),
    re.compile(r"(20\d{2})(\d{2})(\d{2})"),
]


@dataclass
class DocumentMeta:
    doc_id: str
    filename: str
    source_path: str
    airports: list[str] = field(default_factory=list)
    airport_labels: list[str] = field(default_factory=list)
    weather_types: list[str] = field(default_factory=list)
    impacts: list[str] = field(default_factory=list)
    event_date: str | None = None
    char_count: int = 0
    indexed_at: str = ""

    def to_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "filename": self.filename,
            "source_path": self.source_path,
            "airports": self.airports,
            "airport_labels": self.airport_labels,
            "weather_types": self.weather_types,
            "impacts": self.impacts,
            "event_date": self.event_date,
            "char_count": self.char_count,
            "indexed_at": self.indexed_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DocumentMeta":
        return cls(
            doc_id=data["doc_id"],
            filename=data["filename"],
            source_path=data["source_path"],
            airports=list(data.get("airports") or []),
            airport_labels=list(data.get("airport_labels") or []),
            weather_types=list(data.get("weather_types") or []),
            impacts=list(data.get("impacts") or []),
            event_date=data.get("event_date"),
            char_count=int(data.get("char_count") or 0),
            indexed_at=data.get("indexed_at") or "",
        )


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def extract_airports(text: str) -> tuple[list[str], list[str]]:
    labels: list[str] = []
    icaos: list[str] = []
    for label, icao in AIRPORT_ALIASES.items():
        if label in text:
            labels.append(label)
            icaos.append(icao)
    for match in re.finditer(r"\b([A-Z]{4})\b", text):
        code = match.group(1)
        if code.startswith("Z") or code.startswith("R"):
            icaos.append(code)
    return _unique(icaos), _unique(labels)


def extract_weather_types(text: str) -> list[str]:
    found = [w for w in WEATHER_TYPES if w in text]
    return _unique(found)


def extract_impacts(text: str) -> list[str]:
    found = [w for w in IMPACTS if w in text]
    return _unique(found)


def extract_event_date(filename: str, text: str) -> str | None:
    for source in (filename, text[:3000]):
        for pattern in DATE_PATTERNS:
            match = pattern.search(source)
            if not match:
                continue
            year, month, day = match.groups()
            try:
                dt = datetime(int(year), int(month), int(day))
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def build_metadata(doc_id: str, filename: str, source_path: str, text: str) -> DocumentMeta:
    probe = f"{filename}\n{text[:4000]}"
    airports, labels = extract_airports(probe)
    return DocumentMeta(
        doc_id=doc_id,
        filename=filename,
        source_path=source_path,
        airports=airports,
        airport_labels=labels,
        weather_types=extract_weather_types(probe),
        impacts=extract_impacts(probe),
        event_date=extract_event_date(filename, text),
        char_count=len(text),
        indexed_at=datetime.now().isoformat(timespec="seconds"),
    )


def all_airport_options() -> list[str]:
    return _unique(list(AIRPORT_ALIASES.keys()) + list(AIRPORT_ALIASES.values()))


def all_weather_options() -> list[str]:
    return WEATHER_TYPES.copy()


def all_impact_options() -> list[str]:
    return IMPACTS.copy()
