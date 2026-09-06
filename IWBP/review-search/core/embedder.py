"""BGE-M3 语义向量封装，优先加载本地离线模型（首次搜索时才载入内存）。"""
from __future__ import annotations

from functools import lru_cache

from config import BGE_M3_HF, BGE_M3_LOCAL


class ModelUnavailableError(RuntimeError):
    pass


class Embedder:
    def __init__(self) -> None:
        self._model = None
        self.model_path = ""
        self._error = ""
        self._path_ready = False
        self._init_path()

    def _resolve_model_path(self) -> str | None:
        if BGE_M3_LOCAL.exists() and any(BGE_M3_LOCAL.iterdir()):
            return str(BGE_M3_LOCAL)
        return None

    def _init_path(self) -> None:
        path = self._resolve_model_path()
        if not path:
            self._error = (
                f"未找到本地模型目录 {BGE_M3_LOCAL}。"
                "请运行 python tools/download_model.py 下载 BGE-M3。"
            )
            return
        self.model_path = path
        self._path_ready = True

    @property
    def available(self) -> bool:
        """本地模型文件是否就绪（不要求已载入内存）。"""
        return self._path_ready

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def warm_up(self) -> bool:
        try:
            self._ensure_loaded()
            return True
        except ModelUnavailableError:
            return False

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        if not self._path_ready:
            raise ModelUnavailableError(
                self._error
                or "语义模型不可用。请将 BGE-M3 放入 models/bge-m3/ 后重试。"
            )
        try:
            from tools.torch_win_preload import preload_c10

            preload_c10()
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.model_path)
        except Exception as exc:
            self._error = str(exc)
            self._path_ready = False
            raise ModelUnavailableError(self._error) from exc

    def _load(self):
        self._ensure_loaded()
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        vectors = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def embed_query(self, text: str) -> list[float]:
        model = self._load()
        vector = model.encode(
            text,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vector.tolist()


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    return Embedder()


def reset_embedder() -> Embedder:
    """清空单例缓存并重新加载模型（模型拷贝后或首次加载失败时用）。"""
    get_embedder.cache_clear()
    return get_embedder()
