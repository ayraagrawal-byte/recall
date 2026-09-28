from app.database import SessionLocal
from app.embeddings import create_embedding
from app.models import Chunk


def search_chunks(query: str, limit: int = 5):
    query_embedding = create_embedding(query)

    db = SessionLocal()

    try:
        results = (
            db.query(Chunk)
            .filter(Chunk.embedding.is_not(None))
            .order_by(
                Chunk.embedding.cosine_distance(query_embedding)
            )
            .limit(limit)
            .all()
        )

        return results

    finally:
        db.close()


if __name__ == "__main__":
    query = input("Ask Recall: ")

    results = search_chunks(query)

    for chunk in results:
        print("\n--------------------")
        print(f"Page: {chunk.page_number}")
        print(chunk.content[:500])