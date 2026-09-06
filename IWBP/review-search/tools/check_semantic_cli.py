"""语义搜索环境诊断（供 check-semantic.bat 调用）。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    print("Python:", sys.executable)

    from tools.torch_win_preload import preload_c10

    preload_c10()

    try:
        import torch

        print("[OK] torch", torch.__version__)
    except Exception as exc:
        print("[X] torch 无法加载:", exc)
        print("    请运行 fix-torch.bat 或安装 VC++ 2015-2022 x64")
        return 1

    from tools.download_model import is_model_ready

    if not is_model_ready():
        print("[X] 模型权重不完整")
        return 1

    from core.embedder import get_embedder

    embedder = get_embedder()
    if embedder.available and embedder.warm_up():
        print("[OK] 语义引擎可加载")
        print("模型路径:", embedder.model_path)
        return 0

    print("[X] 加载失败:", embedder._error)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
