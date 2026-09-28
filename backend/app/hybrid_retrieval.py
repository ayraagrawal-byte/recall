from app.bm25_retrieval import search_chunks_bm25
from app.retrieval import search_chunks
from app.reranker import rerank_chunks

def get_candidates(query: str, limit: int = 20):
    vector_results = search_chunks(query, limit=limit)
    bm25_results = search_chunks_bm25(query, limit=limit)

    candidates = {}

    for result in vector_results:
        chunk_id = result["id"]

        candidates[chunk_id] = {
            "id": chunk_id,
            "content": result["content"],
            "page_number": result["page_number"],
            "filename": result["filename"],
            "vector_distance": result["distance"],
            "bm25_score": None
        }

    for result in bm25_results:
        chunk_id = result["id"]

        if chunk_id in candidates:
            candidates[chunk_id]["bm25_score"] = result["score"]

        else:
            candidates[chunk_id] = {
                "id": chunk_id,
                "content": result["content"],
                "page_number": result["page_number"],
                "filename": result["filename"],
                "vector_distance": None,
                "bm25_score": result["score"]
            }

    return list(candidates.values())

if __name__ == "__main__":
    query = input("Ask Recall: ")

    candidates = get_candidates(query, limit=20)

    print(f"\nCandidate count: {len(candidates)}")

    results = rerank_chunks(
        query,
        candidates,
        limit=5
    )

    for rank, result in enumerate(results, start=1):
        print("\n--------------------")
        print(f"Rank: {rank}")
        print(f"Chunk ID: {result['id']}")
        print(f"Page: {result['page_number']}")
        print(f"Rerank score: {result['rerank_score']:.4f}")
        print(f"Vector distance: {result['vector_distance']}")
        print(f"BM25 score: {result['bm25_score']}")
        print(result["content"][:500])