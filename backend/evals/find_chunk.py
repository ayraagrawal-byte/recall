from app.database import SessionLocal
from app.models import Chunk


def find_chunks(search_text: str):
    db = SessionLocal()

    try:
        chunks = db.query(Chunk).all()

        for chunk in chunks:
            if search_text.lower() in chunk.content.lower():
                print("\n========================================")
                print(f"Chunk ID: {chunk.id}")
                print(f"Page: {chunk.page_number}")
                print(chunk.content)

    finally:
        db.close()


if __name__ == "__main__":
    find_chunks("undergraduate")