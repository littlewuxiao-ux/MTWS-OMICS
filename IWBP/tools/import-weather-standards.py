"""从 docs/天气标准/*.xls 生成 data/weather-standards.json（公司报文分类标准）。"""
from __future__ import annotations

import json
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "天气标准"
OUT = ROOT / "data" / "weather-standards.json"


def read_rows(path: Path) -> list[list[str]]:
    book = xlrd.open_workbook(str(path), encoding_override="gbk")
    sh = book.sheet_by_index(0)
    rows: list[list[str]] = []
    for r in range(sh.nrows):
        rows.append([str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)])
    return rows


def parse_global(rows: list[list[str]]) -> dict:
    header = rows[0]
    out: dict = {"_columns": header[1:5]}
    for row in rows[1:]:
        name = row[0]
        if not name:
            continue
        red, yellow, green, unit = row[1:5]

        def parse_threshold(raw: str) -> float:
            s = str(raw).strip().replace("≤", "").replace("≥", "").replace("＜", "").replace("＞", "")
            return float(s)

        entry = {
            "red": parse_threshold(red),
            "yellow": parse_threshold(yellow),
            "green": parse_threshold(green),
            "unit": unit,
        }
        if name == "能见度":
            out["visibilityM"] = entry
        elif name == "跑道视程":
            out["rvrM"] = entry
        elif name == "云底高":
            out["cloudBase30m"] = entry
        elif name == "平均风速" and unit == "m/s":
            out["windAvgMps"] = entry
        elif name == "平均风速" and unit == "kt":
            out["windAvgKt"] = entry
        elif name == "阵风风速" and unit == "m/s":
            out["gustMps"] = entry
        elif name == "阵风风速" and unit == "kt":
            out["gustKt"] = entry
        elif name.startswith("温度（高"):
            out["tempHighC"] = entry
        elif name.startswith("温度（低"):
            out["tempLowC"] = entry
    return out


def parse_phenomena(rows: list[list[str]]) -> list[dict]:
    items: list[dict] = []
    # A1:C127 → 表头 + 126 条现象（第 4 列恶劣天气可选）
    for row in rows[1:127]:
        if len(row) < 3 or not row[0]:
            continue
        code, label, level = row[0], row[1], row[2].upper()
        bad = row[3].upper() if len(row) > 3 else "N"
        items.append(
            {
                "code": code.upper(),
                "label": label,
                "level": level if level in {"R", "Y", "G"} else "G",
                "badWeather": bad == "Y",
            }
        )
    return items


def main() -> None:
    global_file = next(DOCS.glob("*全局*.xls"), None) or DOCS / "全局标准.xls"
    wx_file = next(DOCS.glob("*天气现象*.xls"), None) or DOCS / "天气现象基础表.xls"
    payload = {
        "version": 1,
        "source": "docs/天气标准",
        "levelLegend": {"R": "红色", "Y": "黄色", "G": "绿色"},
        "badWeatherLegend": {"Y": "是", "N": "否"},
        "global": parse_global(read_rows(global_file)),
        "phenomena": parse_phenomena(read_rows(wx_file)),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(payload['phenomena'])} phenomena)")


if __name__ == "__main__":
    main()
