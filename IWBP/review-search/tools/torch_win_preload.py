"""Windows: 在其他库占用 DLL 前预加载 c10.dll（缓解 WinError 1114）。"""
from __future__ import annotations

import os
import platform
from importlib.util import find_spec


def preload_c10() -> None:
    if platform.system() != "Windows":
        return
    try:
        import ctypes

        spec = find_spec("torch")
        if not spec or not spec.origin:
            return
        dll_path = os.path.join(os.path.dirname(spec.origin), "lib", "c10.dll")
        if os.path.exists(dll_path):
            ctypes.CDLL(os.path.normpath(dll_path))
    except Exception:
        pass
