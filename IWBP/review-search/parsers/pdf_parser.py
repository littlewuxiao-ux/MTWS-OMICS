from pathlib import Path

import fitz


def parse_pdf(path: Path) -> str:
    doc = fitz.open(str(path))
    parts: list[str] = []
    try:
        for page in doc:
            text = page.get_text("text").strip()
            if text:
                parts.append(text)
    finally:
        doc.close()
    return "\n\n".join(parts)
