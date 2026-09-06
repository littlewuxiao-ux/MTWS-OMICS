#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 OurAirports 公开数据生成 index.html 可用的 icao-airport-overrides.json。

数据源（默认在线拉取）:
  https://davidmegginson.github.io/ourairports-data/airports.csv

用法:
  python tools/build_icao_overrides.py
  python tools/build_icao_overrides.py -i airports.csv -o icao-airport-overrides.json
  python tools/build_icao_overrides.py --types large_airport,medium_airport,small_airport

生成格式: {"ZBAA":[40.08,116.59], ...}  （与页面内 normalizeOverrideEntry 一致）
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

DEFAULT_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"

# 默认只含大型/中型机场，控制体积；需全量可加 small_airport 或 --types-all
DEFAULT_TYPES = frozenset({"large_airport", "medium_airport"})

ALL_RUNWAY_TYPES = frozenset(
    {"large_airport", "medium_airport", "small_airport", "seaplane_base", "balloonport"}
)


def _script_root() -> Path:
    return Path(__file__).resolve().parent.parent


def open_csv_rows(url: Optional[str], local: Optional[Path]) -> Iterator[dict]:
    if local:
        f = local.open("r", encoding="utf-8", newline="")
        yield from csv.DictReader(f)
        f.close()
        return
    assert url
    req = urllib.request.Request(url, headers={"User-Agent": "icao-overrides-builder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = io.TextIOWrapper(resp, encoding="utf-8", newline="")
        yield from csv.DictReader(text)


def row_airport_code(row: dict) -> Optional[str]:
    """优先 icao_code，其次 gps_code、ident；要求四位字母数字。"""
    for key in ("icao_code", "gps_code", "ident"):
        raw = (row.get(key) or "").strip().upper()
        if len(raw) == 4 and raw.isalnum():
            return raw
    return None


def row_lat_lon(row: dict) -> Optional[Tuple[float, float]]:
    try:
        lat = float(row.get("latitude_deg") or "")
        lon = float(row.get("longitude_deg") or "")
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    return (round(lat, 5), round(lon, 5))


def build_overrides(
    rows: Iterator[dict],
    types_allow: frozenset,
    *,
    skip_closed: bool = True,
) -> tuple[Dict[str, list[float]], int]:
    out: Dict[str, list[float]] = {}
    dup_conflict = 0
    for row in rows:
        ap_type = (row.get("type") or "").strip()
        if skip_closed and ap_type == "closed":
            continue
        if types_allow and ap_type not in types_allow:
            continue
        code = row_airport_code(row)
        if not code:
            continue
        ll = row_lat_lon(row)
        if not ll:
            continue
        lat, lon = ll
        if code in out:
            old = out[code]
            if old != [lat, lon]:
                dup_conflict += 1
            continue
        out[code] = [lat, lon]
    return out, dup_conflict


def main() -> int:
    root = _script_root()
    parser = argparse.ArgumentParser(description="从 OurAirports CSV 生成 icao-airport-overrides.json")
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        help="本地 airports.csv（不传则从 --url 下载）",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_CSV_URL,
        help="OurAirports airports.csv 地址",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=root / "icao-airport-overrides.json",
        help="输出的 JSON 路径（默认项目根目录）",
    )
    parser.add_argument(
        "--types-all",
        action="store_true",
        help="包含 large/medium/small/seaplane_base/balloonport（文件会更大）",
    )
    parser.add_argument(
        "--types",
        default=None,
        help="逗号分隔的 type 过滤，如 large_airport,medium_airport（覆盖默认）",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=None,
        help="JSON 缩进（默认紧凑一行，便于体积；调试可用 2）",
    )
    args = parser.parse_args()

    if args.types_all:
        types_allow = ALL_RUNWAY_TYPES
    elif args.types:
        types_allow = frozenset(t.strip() for t in args.types.split(",") if t.strip())
    else:
        types_allow = DEFAULT_TYPES

    try:
        rows = open_csv_rows(None if args.input else args.url, args.input)
        data, conflicts = build_overrides(rows, types_allow)
    except urllib.error.URLError as e:
        print(f"下载失败: {e}", file=sys.stderr)
        print("可先浏览器下载 airports.csv 后使用: python tools/build_icao_overrides.py -i airports.csv", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"读取失败: {e}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=args.indent, separators=(",", ":") if args.indent is None else None)

    print(f"写入 {args.output}，共 {len(data)} 条 ICAO（类型过滤: {', '.join(sorted(types_allow))}）")
    if conflicts:
        print(f"提示: 有 {conflicts} 条重复 ICAO 行坐标不一致，已保留首次出现", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
