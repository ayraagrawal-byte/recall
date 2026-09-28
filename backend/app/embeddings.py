from sentence_transformers import SentenceTransformer
from app.database import SessionLocal
from app.models import Chunk


model = SentenceTransformer("all-MiniLM-L6-v2")


def create_embedding(text: str):
    embedding = model.encode(text)

    return embedding.tolist()


def embed_chunks():
    db = SessionLocal()

    try:
        chunks = db.query(Chunk).filter(
            Chunk.embedding.is_(None)
        ).all()

        print(f"Found {len(chunks)} chunks to embed")

        for chunk in chunks:
            chunk.embedding = create_embedding(chunk.content)

        db.commit()

        print("Embeddings saved.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    embed_chunks()        