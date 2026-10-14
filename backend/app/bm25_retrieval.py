from rank_bm25 import BM25Okapi
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models import Chunk


def tokenize(text: str):
    return text.lower().split()


def search_chunks_bm25(
    query: str,
    limit: int = 5,
    document_ids: list[int] | None = None,
):
    """
    Search indexed chunks using BM25.

    When document_ids is provided, search only those documents.
    When omitted, search all indexed documents.
    """
    if document_ids is not None and not document_ids:
        return []

    if limit <= 0:
        return []

    db = SessionLocal()

    try:
        query_builder = (
            db.query(Chunk)
            .options(joinedload(Chunk.document))
            .filter(Chunk.embedding.is_not(None))
        )

        if document_ids is not None:
            query_builder = query_builder.filter(
                Chunk.document_id.in_(document_ids)
            )

        chunks = query_builder.all()

        if not chunks:
            return []

        tokenized_chunks = [
            tokenize(chunk.content)
            for chunk in chunks
        ]

        bm25 = BM25Okapi(tokenized_chunks)

        scores = bm25.get_scores(tokenize(query))

        ranked_results = sorted(
            zip(chunks, scores),
            key=lambda result: result[1],
            reverse=True,
        )[:limit]

        return [
            {
                "id": chunk.id,
                "content": chunk.content,
                "page_number": chunk.page_number,
                "filename": chunk.document.filename,
                "score": float(score),
            }
            for chunk, score in ranked_results
        ]

    finally:
        db.close()


if __name__ == "__main__":
    query = input("Ask Recall: ")

    results = search_chunks_bm25(query, limit=20)

    for rank, chunk in enumerate(results, start=1):
        print("\n--------------------")
        print(f"Rank: {rank}")
        print(f"Source: {chunk['filename']}")
        print(f"Page: {chunk['page_number']}")
        print(f"BM25 score: {chunk['score']:.4f}")
        print(chunk["content"][:300])
