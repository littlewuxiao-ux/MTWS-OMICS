"""将长文档切分为适合检索的文本块。"""
from __future__ import annotations

from dataclasses import dataclass

from config import CHUNK_OVERLAP, CHUNK_SIZE


@dataclass
class TextChunk:
    chunk_index: int
    text: str
    section: str = ""


def _merge_paragraphs(paragraphs: list[str]) -> list[str]:
    merged: list[str] = []
    buffer = ""
    for para in paragraphs:
        if not para:
            if buffer:
                merged.append(buffer.strip())
                buffer = ""
            continue
        candidate = f"{buffer}\n{para}".strip() if buffer else para
        if len(candidate) <= CHUNK_SIZE:
            buffer = candidate
        else:
            if buffer:
                merged.append(buffer.strip())
            if len(para) <= CHUNK_SIZE:
                buffer = para
            else:
                start = 0
                while start < len(para):
                    merged.append(para[start : start + CHUNK_SIZE].strip())
                    start += CHUNK_SIZE - CHUNK_OVERLAP
                buffer = ""
    if buffer:
        merged.append(buffer.strip())
    return [m for m in merged if m]


def chunk_text(text: str) -> list[TextChunk]:
    if not text.strip():
        return []

    sections: list[tuple[str, str]] = []
    current_section = ""
    current_lines: list[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        is_heading = (
            stripped
            and len(stripped) <= 40
            and (
                stripped.endswith(("：", ":"))
                or re_heading_like(stripped)
            )
        )
        if is_heading:
            if current_lines:
                sections.append((current_section, "\n".join(current_lines)))
                current_lines = []
            current_section = stripped.rstrip("：:")
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_section, "\n".join(current_lines)))

    if not sections:
        sections = [("", text)]

    chunks: list[TextChunk] = []
    idx = 0
    for section, body in sections:
        paragraphs = [p.strip() for p in body.split("\n") if p.strip()]
        for piece in _merge_paragraphs(paragraphs):
            chunks.append(TextChunk(chunk_index=idx, text=piece, section=section))
            idx += 1

    if len(chunks) <= 1:
        return chunks

    overlapped: list[TextChunk] = []
    for i, chunk in enumerate(chunks):
        text_value = chunk.text
        if i > 0 and CHUNK_OVERLAP > 0:
            prev_tail = chunks[i - 1].text[-CHUNK_OVERLAP:]
            if prev_tail and prev_tail not in text_value[:CHUNK_OVERLAP + 20]:
                text_value = f"{prev_tail}\n{text_value}"
        overlapped.append(
            TextChunk(chunk_index=i, text=text_value.strip(), section=chunk.section)
        )
    return overlapped


def re_heading_like(text: str) -> bool:
    keywords = ("分析", "总结", "概况", "影响", "过程", "预报", "实况", "措施", "复盘")
    return any(k in text for k in keywords)
