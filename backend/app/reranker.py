from sentence_transformers import CrossEncoder



model = CrossEncoder(
    "cross-encoder/ms-marco-MiniLM-L-6-v2"
)


def rerank_chunks(query: str, candidates, limit: int = 5):
    pairs = [
        [query, candidate["content"]]
        for candidate in candidates
    ]

    scores = model.predict(pairs)

    ranked = []

    for candidate, score in zip(candidates, scores):
        result = candidate.copy()
        result["rerank_score"] = float(score)
        ranked.append(result)

    ranked.sort(
        key=lambda result: result["rerank_score"],
        reverse=True
    )

    return ranked[:limit]