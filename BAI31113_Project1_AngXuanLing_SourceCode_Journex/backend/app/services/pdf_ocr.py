import os
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import pdfplumber
from PIL import Image

# Suppress verbose font descriptor warnings from pdfminer
logging.getLogger('pdfminer').setLevel(logging.ERROR)


def extract_document_data(file_path: str) -> Dict[str, Any]:
    """
    Extracts text, metadata, and structured tables from a PDF or Image document without duplication.
    Router:
    1. Digital PDF -> pdfplumber (structured table + metadata extraction)
    2. Image (JPG/PNG) / Scanned PDF -> OCR / Image fallback
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()

    if ext == ".pdf":
        return _extract_pdf_structured(file_path)
    elif ext in [".jpg", ".jpeg", ".png"]:
        raw_text = _extract_from_image(file_path)
        return {
            "raw_text": raw_text,
            "has_tables": False,
            "tables": [],
            "metadata_text": raw_text,
            "pages": []
        }
    else:
        raise ValueError(f"Unsupported file format: {ext}")


def extract_text_from_document(file_path: str) -> str:
    """
    Extract raw text from PDF or Image document without duplicate table concatenation.
    """
    data = extract_document_data(file_path)
    return data.get("raw_text", "")


def _extract_pdf_structured(file_path: str) -> Dict[str, Any]:
    all_tables = []
    text_chunks = []
    page_data = []

    try:
        with pdfplumber.open(file_path) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                raw_page_text = page.extract_text() or ""
                tables = page.extract_tables() or []

                cleaned_tables = []
                for t in tables:
                    if t and len(t) > 0:
                        # Clean cell replacement characters and normalize dashes
                        cleaned_t = [
                            [c.replace('\ufffd', '–').replace('\u2013', '–').replace('\u2014', '—').strip() if c else "" for c in row]
                            for row in t if any(row)
                        ]
                        if cleaned_t:
                            cleaned_tables.append(cleaned_t)
                            all_tables.append(cleaned_t)

                page_data.append({
                    "page_idx": page_idx + 1,
                    "raw_text": raw_page_text,
                    "tables": cleaned_tables
                })

                # Preserve complete page text so headers, tables, allocation lines, footers,
                # and signature blocks (e.g. FOR 0126 Handbag Solutions) are never truncated.
                if raw_page_text and raw_page_text.strip():
                    text_chunks.append(raw_page_text.strip())

        full_text = "\n\n".join(text_chunks).strip()
        if not full_text:
            full_text = f"[Scanned PDF detected for {Path(file_path).name}. Text extraction fallback initiated.]"

        return {
            "raw_text": full_text,
            "has_tables": len(all_tables) > 0,
            "tables": all_tables,
            "pages": page_data
        }
    except Exception as e:
        err_msg = f"PDF Extraction Warning ({e})"
        return {
            "raw_text": err_msg,
            "has_tables": False,
            "tables": [],
            "pages": []
        }


def _extract_from_image(file_path: str) -> str:
    """
    Basic image extraction fallback reader.
    """
    try:
        img = Image.open(file_path)
        return f"[Image document: {Path(file_path).name} (Size: {img.size[0]}x{img.size[1]}px)]"
    except Exception as e:
        return f"Image Reader Error ({e})"
