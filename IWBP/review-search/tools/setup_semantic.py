"""一次性启用语义搜索：补全模型后入库新文档并重建向量索引。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DOCUMENTS_DIR
from core.embedder import get_embedder
from core.index import ReviewIndex
from tools.download_model import is_model_ready, main as download_model


def main() -> None:
    if not is_model_ready():
        print("1/3 下载语义模型…")
        download_model()
    else:
        print("1/3 语义模型已就绪")

    embedder = get_embedder()
    if not embedder.available:
        print("语义模型仍不可用，请检查 models/bge-m3/")
        sys.exit(1)
    print(f"语义模型：{embedder.model_path}")

    index = ReviewIndex()
    print("2/3 扫描并入库新文档…")
    ingested = index.ingest_directory(DOCUMENTS_DIR)
    if ingested:
        print(f"新入库 {len(ingested)} 份：")
        for doc in ingested:
            print(f"  - {doc.filename}")
    else:
        print("没有新文档需要入库")

    print("3/3 重建语义向量索引…")
    total = index.rebuild_vector_index()
    stats = index.stats()
    print(f"完成：文档 {stats['documents']} 份，片段 {stats['chunks']} 个，向量 {total} 条")
    print("请运行 start.bat 启动搜索界面")


if __name__ == "__main__":
    main()
