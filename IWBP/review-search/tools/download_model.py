"""下载 BGE-M3 模型到 models/bge-m3/（支持 ModelScope 镜像）。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "models" / "bge-m3"
WEIGHT_FILES = ("pytorch_model.bin", "model.safetensors")


def is_model_ready(target: Path = TARGET) -> bool:
    for name in WEIGHT_FILES:
        path = target / name
        if path.exists() and path.stat().st_size > 500_000_000:
            return True
    return False


def download_via_modelscope() -> None:
    from modelscope import snapshot_download

    print("正在从 ModelScope 下载 BAAI/bge-m3 …")
    cache_dir = snapshot_download("BAAI/bge-m3", local_dir=str(TARGET))
    print(f"模型已保存到：{cache_dir}")


def download_via_huggingface() -> None:
    from sentence_transformers import SentenceTransformer

    print("正在从 HuggingFace 下载 BAAI/bge-m3 …")
    model = SentenceTransformer("BAAI/bge-m3")
    TARGET.mkdir(parents=True, exist_ok=True)
    model.save(str(TARGET))
    print(f"模型已保存到：{TARGET}")


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    if is_model_ready():
        print(f"模型已就绪：{TARGET}")
        return

    if any(TARGET.iterdir()):
        print(f"检测到未完成的模型下载，正在续传…")

    try:
        download_via_modelscope()
        if is_model_ready():
            return
        raise RuntimeError("ModelScope 下载结束，但权重文件仍不完整")
    except Exception as exc:
        print(f"ModelScope 下载失败：{exc}")

    try:
        download_via_huggingface()
        if is_model_ready():
            return
        raise RuntimeError("HuggingFace 下载结束，但权重文件仍不完整")
    except Exception as exc:
        print("自动下载失败。请在有网络的机器执行本脚本，再将 models/bge-m3/ 拷贝入内网。")
        print(f"错误：{exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
