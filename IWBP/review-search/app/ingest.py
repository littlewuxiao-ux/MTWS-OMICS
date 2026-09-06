"""命令行批量入库：python -m app.ingest"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DOCUMENTS_DIR
from core.index import ReviewIndex


def main() -> None:
    index = ReviewIndex()
    ingested = index.ingest_directory(DOCUMENTS_DIR)
    if not ingested:
        print("没有新文档需要入库。")
        print(f"请将复盘文件放入：{DOCUMENTS_DIR}")
        return
    print(f"成功入库 {len(ingested)} 份文档：")
    for doc in ingested:
        print(f"  - {doc.filename} | 机场 {doc.airport_labels} | 天气 {doc.weather_types}")


if __name__ == "__main__":
    main()
