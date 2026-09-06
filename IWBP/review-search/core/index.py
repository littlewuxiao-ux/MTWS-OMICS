"""复盘索引：Chroma 向量库 + BM25 混合检索。"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import chromadb
import jieba
from rank_bm25 import BM25Okapi

from config import (
    CHROMA_DIR,
    COLLECTION_NAME,
    DOCUMENTS_DIR,
    META_FILE,
    RRF_K,
    TOP_K_BM25,
    TOP_K_FINAL,
    TOP_K_VECTOR,
)
from core.chunker import TextChunk, chunk_text
from core.embedder import ModelUnavailableError, get_embedder
from core.metadata import DocumentMeta, build_metadata
from parsers import parse_document


@dataclass
class SearchHit:
    chunk_id: str
    doc_id: str
    filename: str
    source_path: str
    text: str
    section: str
    score: float
    relevance_pct: float
    semantic_rank: int | None
    keyword_rank: int | None
    airports: list[str]
    airport_labels: list[str]
    weather_types: list[str]
    impacts: list[str]
    event_date: str | None


class ReviewIndex:
    def __init__(self) -> None:
        DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        META_FILE.parent.mkdir(parents=True, exist_ok=True)

        self.client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        self.embedder = get_embedder()
        self._docs: dict[str, DocumentMeta] = {}
        self._chunk_records: list[dict[str, Any]] = []
        self._bm25: BM25Okapi | None = None
        self._load_meta()

    def _load_meta(self) -> None:
        if not META_FILE.exists():
            self._docs = {}
            self._chunk_records = []
            self._bm25 = None
            return
        data = json.loads(META_FILE.read_text(encoding="utf-8"))
        self._docs = {
            doc_id: DocumentMeta.from_dict(item)
            for doc_id, item in (data.get("documents") or {}).items()
        }
        self._chunk_records = list(data.get("chunks") or [])
        self._rebuild_bm25()

    def _save_meta(self) -> None:
        payload = {
            "documents": {doc_id: meta.to_dict() for doc_id, meta in self._docs.items()},
            "chunks": self._chunk_records,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        META_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _tokenize(self, text: str) -> list[str]:
        return [tok for tok in jieba.lcut_for_search(text) if tok.strip()]

    def _rebuild_bm25(self) -> None:
        if not self._chunk_records:
            self._bm25 = None
            return
        corpus = [self._tokenize(item["text"]) for item in self._chunk_records]
        self._bm25 = BM25Okapi(corpus)

    def list_documents(self) -> list[DocumentMeta]:
        return sorted(self._docs.values(), key=lambda d: d.indexed_at, reverse=True)

    def get_document(self, doc_id: str) -> DocumentMeta | None:
        return self._docs.get(doc_id)

    def ingest_file(self, source_path: Path, move_into_library: bool = True) -> DocumentMeta:
        source_path = Path(source_path)
        if not source_path.exists():
            raise FileNotFoundError(f"文件不存在: {source_path}")

        if move_into_library:
            target = DOCUMENTS_DIR / source_path.name
            if source_path.resolve() != target.resolve():
                target.write_bytes(source_path.read_bytes())
            stored_path = target
        else:
            stored_path = source_path

        text = parse_document(stored_path)
        if not text.strip():
            raise ValueError(f"未能从文档提取文本: {stored_path.name}")

        doc_id = str(uuid.uuid4())
        meta = build_metadata(
            doc_id=doc_id,
            filename=stored_path.name,
            source_path=str(stored_path),
            text=text,
        )
        chunks = chunk_text(text)
        if not chunks:
            raise ValueError(f"文档切分后为空: {stored_path.name}")

        self._index_chunks(meta, chunks)
        self._docs[doc_id] = meta
        self._save_meta()
        return meta

    def rebuild_vector_index(self) -> int:
        """为已有片段补建语义向量（模型就绪后执行一次）。"""
        if not self.embedder.available:
            raise ModelUnavailableError(self.embedder._error or "语义模型不可用")
        if not self._chunk_records:
            return 0

        try:
            self.collection.delete(where={"chunk_id": {"$ne": ""}})
        except Exception:
            try:
                existing = self.collection.get(include=[])
                if existing.get("ids"):
                    self.collection.delete(ids=existing["ids"])
            except Exception:
                pass

        batch_size = 32
        total = 0
        for start in range(0, len(self._chunk_records), batch_size):
            batch = self._chunk_records[start : start + batch_size]
            chunk_ids = [item["chunk_id"] for item in batch]
            texts = [item["text"] for item in batch]
            metadatas = [
                {
                    "chunk_id": item["chunk_id"],
                    "doc_id": item["doc_id"],
                    "filename": item["filename"],
                    "source_path": item["source_path"],
                    "section": item.get("section") or "",
                    "chunk_index": idx,
                    "airports": ",".join(item.get("airports") or []),
                    "airport_labels": ",".join(item.get("airport_labels") or []),
                    "weather_types": ",".join(item.get("weather_types") or []),
                    "impacts": ",".join(item.get("impacts") or []),
                    "event_date": item.get("event_date") or "",
                }
                for idx, item in enumerate(batch)
            ]
            embeddings = self.embedder.embed_documents(texts)
            self.collection.add(
                ids=chunk_ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
            )
            total += len(batch)
        return total

    def ingest_directory(self, directory: Path | None = None) -> list[DocumentMeta]:
        directory = directory or DOCUMENTS_DIR
        ingested: list[DocumentMeta] = []
        existing_names = {doc.filename for doc in self._docs.values()}
        for path in sorted(directory.iterdir()):
            if not path.is_file() or path.name.startswith("."):
                continue
            if path.suffix.lower() not in {".txt", ".md", ".docx", ".pdf", ".pptx"}:
                continue
            if path.name in existing_names:
                continue
            try:
                ingested.append(self.ingest_file(path, move_into_library=False))
            except Exception:
                continue
        return ingested

    def _index_chunks(self, meta: DocumentMeta, chunks: list[TextChunk]) -> None:
        chunk_ids: list[str] = []
        texts: list[str] = []
        metadatas: list[dict[str, Any]] = []

        for chunk in chunks:
            chunk_id = f"{meta.doc_id}:{chunk.chunk_index}"
            chunk_ids.append(chunk_id)
            texts.append(chunk.text)
            metadatas.append(
                {
                    "chunk_id": chunk_id,
                    "doc_id": meta.doc_id,
                    "filename": meta.filename,
                    "source_path": meta.source_path,
                    "section": chunk.section or "",
                    "chunk_index": chunk.chunk_index,
                    "airports": ",".join(meta.airports),
                    "airport_labels": ",".join(meta.airport_labels),
                    "weather_types": ",".join(meta.weather_types),
                    "impacts": ",".join(meta.impacts),
                    "event_date": meta.event_date or "",
                }
            )
            self._chunk_records.append(
                {
                    "chunk_id": chunk_id,
                    "doc_id": meta.doc_id,
                    "filename": meta.filename,
                    "source_path": meta.source_path,
                    "section": chunk.section or "",
                    "text": chunk.text,
                    "airports": meta.airports,
                    "airport_labels": meta.airport_labels,
                    "weather_types": meta.weather_types,
                    "impacts": meta.impacts,
                    "event_date": meta.event_date,
                }
            )

        try:
            embeddings = self.embedder.embed_documents(texts)
            self.collection.add(
                ids=chunk_ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
            )
        except ModelUnavailableError:
            pass
        self._rebuild_bm25()

    def delete_document(self, doc_id: str) -> None:
        if doc_id not in self._docs:
            return
        chunk_ids = [
            item["chunk_id"] for item in self._chunk_records if item["doc_id"] == doc_id
        ]
        if chunk_ids:
            self.collection.delete(ids=chunk_ids)
        self._chunk_records = [
            item for item in self._chunk_records if item["doc_id"] != doc_id
        ]
        self._docs.pop(doc_id, None)
        self._rebuild_bm25()
        self._save_meta()

    def search(
        self,
        query: str,
        airports: list[str] | None = None,
        weather_types: list[str] | None = None,
        impacts: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        top_k: int = TOP_K_FINAL,
        mode: str = "hybrid",
    ) -> list[SearchHit]:
        query = query.strip()
        if not query or not self._chunk_records:
            return []

        allowed_ids = self._filter_chunk_ids(
            airports=airports,
            weather_types=weather_types,
            impacts=impacts,
            date_from=date_from,
            date_to=date_to,
        )
        if not allowed_ids:
            return []

        bm25_rank = self._bm25_search(query, allowed_ids)
        keyword_rank = {cid: i for i, cid in enumerate(bm25_rank, start=1)}

        try:
            vector_rank = self._vector_search(query, allowed_ids)
            semantic_rank = {cid: i for i, cid in enumerate(vector_rank, start=1)}
            semantic_available = True
        except ModelUnavailableError:
            vector_rank = []
            semantic_rank = {}
            semantic_available = False

        if mode == "keyword":
            fused = [
                (chunk_id, 1.0 / (RRF_K + rank))
                for rank, chunk_id in enumerate(bm25_rank, start=1)
            ]
        elif mode == "semantic" and semantic_available:
            fused = [
                (chunk_id, 1.0 / (RRF_K + rank))
                for rank, chunk_id in enumerate(vector_rank, start=1)
            ]
        elif mode == "semantic":
            fused = [
                (chunk_id, 1.0 / (RRF_K + rank))
                for rank, chunk_id in enumerate(bm25_rank, start=1)
            ]
        elif semantic_available:
            fused = self._rrf_fuse(vector_rank, bm25_rank)
        else:
            fused = [
                (chunk_id, 1.0 / (RRF_K + rank))
                for rank, chunk_id in enumerate(bm25_rank, start=1)
            ]

        fused = fused[:top_k]
        max_score = fused[0][1] if fused else 1.0
        hits: list[SearchHit] = []
        chunk_map = {item["chunk_id"]: item for item in self._chunk_records}
        for chunk_id, score in fused:
            record = chunk_map.get(chunk_id)
            if not record:
                continue
            hits.append(
                SearchHit(
                    chunk_id=chunk_id,
                    doc_id=record["doc_id"],
                    filename=record["filename"],
                    source_path=record["source_path"],
                    text=record["text"],
                    section=record.get("section") or "",
                    score=score,
                    relevance_pct=round((score / max_score) * 100, 1) if max_score else 0.0,
                    semantic_rank=semantic_rank.get(chunk_id),
                    keyword_rank=keyword_rank.get(chunk_id),
                    airports=list(record.get("airports") or []),
                    airport_labels=list(record.get("airport_labels") or []),
                    weather_types=list(record.get("weather_types") or []),
                    impacts=list(record.get("impacts") or []),
                    event_date=record.get("event_date"),
                )
            )
        return hits

    def _filter_chunk_ids(
        self,
        airports: list[str] | None,
        weather_types: list[str] | None,
        impacts: list[str] | None,
        date_from: str | None,
        date_to: str | None,
    ) -> set[str]:
        allowed = {item["chunk_id"] for item in self._chunk_records}
        if airports:
            airport_set = set(airports)
            allowed = {
                cid
                for cid in allowed
                for item in [self._chunk_by_id(cid)]
                if item
                and (
                    airport_set.intersection(item.get("airports") or [])
                    or airport_set.intersection(item.get("airport_labels") or [])
                )
            }
        if weather_types:
            weather_set = set(weather_types)
            allowed = {
                cid
                for cid in allowed
                for item in [self._chunk_by_id(cid)]
                if item and weather_set.intersection(item.get("weather_types") or [])
            }
        if impacts:
            impact_set = set(impacts)
            allowed = {
                cid
                for cid in allowed
                for item in [self._chunk_by_id(cid)]
                if item and impact_set.intersection(item.get("impacts") or [])
            }
        if date_from or date_to:
            filtered: set[str] = set()
            for cid in allowed:
                item = self._chunk_by_id(cid)
                if not item:
                    continue
                event_date = item.get("event_date")
                if not event_date:
                    continue
                if date_from and event_date < date_from:
                    continue
                if date_to and event_date > date_to:
                    continue
                filtered.add(cid)
            allowed = filtered
        return allowed

    def _chunk_by_id(self, chunk_id: str) -> dict[str, Any] | None:
        for item in self._chunk_records:
            if item["chunk_id"] == chunk_id:
                return item
        return None

    def _vector_search(self, query: str, allowed_ids: set[str]) -> list[str]:
        query_vec = self.embedder.embed_query(query)
        result = self.collection.query(
            query_embeddings=[query_vec],
            n_results=min(TOP_K_VECTOR, max(len(allowed_ids), 1)),
            include=["metadatas"],
        )
        ranked: list[str] = []
        ids = (result.get("ids") or [[]])[0]
        for chunk_id in ids:
            if chunk_id in allowed_ids:
                ranked.append(chunk_id)
        return ranked

    def _bm25_search(self, query: str, allowed_ids: set[str]) -> list[str]:
        if not self._bm25:
            return []
        tokens = self._tokenize(query)
        if not tokens:
            return []
        scores = self._bm25.get_scores(tokens)
        ranked_pairs = sorted(
            (
                (self._chunk_records[i]["chunk_id"], float(scores[i]))
                for i in range(len(self._chunk_records))
                if self._chunk_records[i]["chunk_id"] in allowed_ids
            ),
            key=lambda x: x[1],
            reverse=True,
        )
        return [chunk_id for chunk_id, _ in ranked_pairs[:TOP_K_BM25]]

    @staticmethod
    def _rrf_fuse(*ranked_lists: list[str]) -> list[tuple[str, float]]:
        scores: dict[str, float] = {}
        for ranked in ranked_lists:
            for rank, chunk_id in enumerate(ranked, start=1):
                scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)
        return sorted(scores.items(), key=lambda x: x[1], reverse=True)

    def stats(self) -> dict[str, int | str | bool]:
        return {
            "documents": len(self._docs),
            "chunks": len(self._chunk_records),
            "semantic_enabled": self.embedder.available,
            "model_path": self.embedder.model_path or "未加载",
        }


def highlight_snippet(text: str, query: str, width: int = 220) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    terms = [tok for tok in jieba.lcut_for_search(query) if len(tok.strip()) >= 2]
    pos = -1
    for term in terms:
        idx = text.find(term)
        if idx >= 0:
            pos = idx
            break
    if pos < 0:
        return text[:width] + ("…" if len(text) > width else "")
    start = max(0, pos - width // 3)
    snippet = text[start : start + width]
    if start > 0:
        snippet = "…" + snippet
    if start + width < len(text):
        snippet += "…"
    return snippet
