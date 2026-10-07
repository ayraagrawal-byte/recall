from app.retrieval import search_chunks
from app.bm25_retrieval import search_chunks_bm25
from app.reranker import rerank_chunks
from app.query_expansion import expand_query


def search_chunks_v2(query: str, candidate_limit: int = 20, limit: int = 5):
    expanded_query = expand_query(query)

    # Vector search keeps the original natural-language question.
    vector_results = search_chunks(query, limit=candidate_limit)

    # BM25 gets the expanded query to improve lexical retrieval.
    bm25_results = search_chunks_bm25(
        expanded_query,
        limit=candidate_limit
    )

    # Save retrieval ranks so we know how each chunk was found.
    vector_ranks = {
        result["id"]: rank
        for rank, result in enumerate(vector_results, start=1)
    }

    bm25_ranks = {
        result["id"]: rank
        for rank, result in enumerate(bm25_results, start=1)
    }

    candidates = {}

    # Merge vector results.
    for result in vector_results:
        candidates[result["id"]] = {
            "id": result["id"],
            "content": result["content"],
            "page_number": result["page_number"],
            "filename": result["filename"],
            "vector_rank": vector_ranks.get(result["id"]),
            "bm25_rank": bm25_ranks.get(result["id"]),
        }

    # Merge BM25 results.
    for result in bm25_results:
        if result["id"] not in candidates:
            candidates[result["id"]] = {
                "id": result["id"],
                "content": result["content"],
                "page_number": result["page_number"],
                "filename": result["filename"],
                "vector_rank": vector_ranks.get(result["id"]),
                "bm25_rank": bm25_ranks.get(result["id"]),
            }
        else:
            candidates[result["id"]]["bm25_rank"] = bm25_ranks.get(
                result["id"]
            )

    candidate_list = list(candidates.values())

    # Rerank using the ORIGINAL question.
    reranked = rerank_chunks(
        query,
        candidate_list,
        limit=len(candidate_list)
    )

    selected = []
    seen_ids = set()

    def add(result):
        if result["id"] not in seen_ids and len(selected) < limit:
            selected.append(result)
            seen_ids.add(result["id"])

    # 3 strongest cross-encoder results.
    for result in reranked[:3]:
        add(result)

    # Preserve strongest BM25 result.
    if bm25_results:
        bm25_id = bm25_results[0]["id"]
        add(candidates[bm25_id])

    # Preserve strongest vector result.
    if vector_results:
        vector_id = vector_results[0]["id"]
        add(candidates[vector_id])

    # Fill empty positions if there were duplicates.
    for result in reranked:
        add(result)

    return selected[:limit]