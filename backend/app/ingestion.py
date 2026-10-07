import pymupdf
import os

from app.database import SessionLocal
from app.models import Document, Chunk
from app.embeddings import create_embedding


def extract_pages(pdf_path: str):
    document = pymupdf.open(pdf_path)

    pages = []

    for page_number, page in enumerate(document):
        text = page.get_text()

        pages.append({
            "page_number": page_number + 1,
            "text": text
        })

    document.close()

    return pages

def chunk_pages(pages, chunk_size=1000, overlap=200):
    chunks = []

    for page in pages:
        text = page["text"]
        start = 0

        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            if chunk_text.strip():
                chunks.append({
                    "page_number": page["page_number"],
                    "content": chunk_text
                })

            start += chunk_size - overlap

    return chunks

def ingest_document(pdf_path: str):
    pages = extract_pages(pdf_path)
    chunks = chunk_pages(pages)

    db = SessionLocal()

    try:
        document = Document(
            filename=os.path.basename(pdf_path)
        )

        db.add(document)
        db.flush()
        for chunk in chunks:
            db_chunk = Chunk(
                document_id=document.id,
                content=chunk["content"],
                page_number=chunk["page_number"],
                embedding=create_embedding(chunk["content"])
                )
            db.add(db_chunk)
        db.commit()

        return document.id

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()

if __name__ == "__main__":
    document_id = ingest_document("sample_data/sample.pdf")

    print(f"Document stored with ID: {document_id}")