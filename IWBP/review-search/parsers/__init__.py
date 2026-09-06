"""文档解析器：按扩展名分发到具体实现。"""
from pathlib import Path

from .docx_parser import parse_docx
from .pdf_parser import parse_pdf
from .pptx_parser import parse_pptx
from .txt_parser import parse_txt

PARSERS = {
    ".txt": parse_txt,
    ".md": parse_txt,
    ".docx": parse_docx,
    ".pdf": parse_pdf,
    ".pptx": parse_pptx,
}


def parse_document(path: Path) -> str:
    ext = path.suffix.lower()
    parser = PARSERS.get(ext)
    if not parser:
        raise ValueError(f"不支持的文件格式: {ext}")
    text = parser(path)
    return normalize_text(text)


def normalize_text(text: str) -> str:
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    cleaned: list[str] = []
    for line in lines:
        if not line:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue
        cleaned.append(line)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()
    return "\n".join(cleaned)
