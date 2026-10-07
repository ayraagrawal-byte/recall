from app.database import SessionLocal
from app.models import Chunk


def find_chunks(search_text: str):
    db = SessionLocal()

    try:
        chunks = db.query(Chunk).all()
        found = False

        for chunk in chunks:
            if search_text.lower() in chunk.content.lower():
                found = True

                print("\n========================================")
                print(f"Chunk ID: {chunk.id}")
                print(f"Document ID: {chunk.document_id}")
                print(f"Document: {chunk.document.filename}")
                print(f"Page: {chunk.page_number}")
                print("----------------------------------------")
                print(chunk.content)

        if not found:
            print(f'No chunks found containing "{search_text}".')

    finally:
        db.close()


if __name__ == "__main__":
    search_text = input("Search text: ")
    find_chunks(search_text)