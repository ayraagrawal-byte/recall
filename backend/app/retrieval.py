from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.embeddings import create_embedding
from app.models import Chunk


def search_chunks(query: str, limit: int = 5):
    query_embedding = create_embedding(query)

    db = SessionLocal()

    try:
        results = (
            db.query(Chunk)
            .options(joinedload(Chunk.document))
            .filter(Chunk.embedding.is_not(None))
            .order_by(
                Chunk.embedding.cosine_distance(query_embedding)
            )
            .limit(limit)
            .all()
        )

        return [
            {
                "content": chunk.content,
                "page_number": chunk.page_number,
                "filename": chunk.document.filename
            }
            for chunk in results
        ]

    finally:
        db.close()


if __name__ == "__main__":
    query = input("Ask Recall: ")

    results = search_chunks(query)

    for chunk in results:
        print("\n--------------------")
        print(f"Source: {chunk['filename']}")
        print(f"Page: {chunk['page_number']}")
        print(chunk["content"][:500])