"""航空气象复盘智能搜索系统 — 全局配置。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DOCUMENTS_DIR = DATA_DIR / "documents"
CHROMA_DIR = DATA_DIR / "chroma"
META_FILE = DATA_DIR / "index_meta.json"
MODELS_DIR = ROOT / "models"
BGE_M3_LOCAL = MODELS_DIR / "bge-m3"
BGE_M3_HF = "BAAI/bge-m3"

SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx", ".pdf", ".pptx"}

CHUNK_SIZE = 600
CHUNK_OVERLAP = 100
TOP_K_VECTOR = 30
TOP_K_BM25 = 30
TOP_K_FINAL = 10
RRF_K = 60

COLLECTION_NAME = "review_chunks"
