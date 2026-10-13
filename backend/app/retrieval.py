
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.embeddings import create_embedding
from app.models import Chunk


def search_chunks(
    query: str,
    limit: int = 5,
    document_ids: list[int] | None = None,
):
    """
    Search indexed PDF chunks by semantic similarity.

    If document_ids is provided, search only those documents.
    Existing calls without document_ids behave exactly as before.
    """
    if document_ids is not None and not document_ids:
        return []

    query_embedding = create_embedding(query)

    distance = Chunk.embedding.cosine_distance(
        query_embedding
    ).label("distance")

    db = SessionLocal()

    try:
        query_builder = (
            db.query(Chunk, distance)
            .options(joinedload(Chunk.document))
            .filter(Chunk.embedding.is_not(None))
        )

        if document_ids is not None:
            query_builder = query_builder.filter(
                Chunk.document_id.in_(document_ids)
            )

        results = (
            query_builder
            .order_by(distance)
            .limit(limit)
            .all()
        )

        return [
            {
                "id": chunk.id,
                "content": chunk.content,
                "page_number": chunk.page_number,
                "filename": chunk.document.filename,
                "distance": float(distance_value),
            }
            for chunk, distance_value in results
        ]

    finally:
        db.close()


def search_comparison_chunks(
    query: str,
    document_ids: list[int],
    limit_per_document: int = 5,
):
    """
    Retrieve evidence independently from each selected paper.

    This ensures that one paper cannot dominate the results
    simply because its chunks have lower vector distances.
    """
    if len(document_ids) != 2:
        raise ValueError(
            "Paper comparison requires exactly two documents."
        )

    if document_ids[0] == document_ids[1]:
        raise ValueError(
            "Select two different documents."
        )

    if limit_per_document < 1:
        raise ValueError(
            "limit_per_document must be at least 1."
        )

    results = []

    for document_id in document_ids:
        chunks = search_chunks(
            query=query,
            limit=limit_per_document,
            document_ids=[document_id],
        )

        results.extend(chunks)

    return results


if __name__ == "__main__":
    query = input("Ask Recall: ")

    results = search_chunks(query, limit=39)

    for rank, chunk in enumerate(results, start=1):
        print("\n--------------------")
        print(f"Rank: {rank}")
        print(f"Source: {chunk['filename']}")
        print(f"Page: {chunk['page_number']}")
        print(f"Distance: {chunk['distance']:.4f}")
        print(chunk["content"][:300])
        print(f"Chunk ID: {chunk['id']}")
