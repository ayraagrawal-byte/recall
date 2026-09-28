from app.retrieval import search_chunks
from app.bm25_retrieval import search_chunks_bm25


QUESTION = "How many participants were included in the study?"
TARGET_CHUNK_ID = 7


def find_rank(results, target_id):
    for rank, result in enumerate(results, start=1):
        if result["id"] == target_id:
            return rank, result

    return None, None


vector_results = search_chunks(QUESTION, limit=39)
bm25_results = search_chunks_bm25(QUESTION, limit=39)

vector_rank, vector_chunk = find_rank(
    vector_results,
    TARGET_CHUNK_ID
)

bm25_rank, bm25_chunk = find_rank(
    bm25_results,
    TARGET_CHUNK_ID
)

print("Target chunk:", TARGET_CHUNK_ID)

print("\nVector")
print("Rank:", vector_rank)
print(
    "Distance:",
    vector_chunk["distance"] if vector_chunk else None
)

print("\nBM25")
print("Rank:", bm25_rank)
print(
    "Score:",
    bm25_chunk["score"] if bm25_chunk else None
)