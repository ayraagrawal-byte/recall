import json
from pathlib import Path

from app.hybrid_retrieval import get_candidates
from app.reranker import rerank_chunks


EVAL_FILE = Path(__file__).parent / "eval_questions.json"


def load_questions():
    with open(EVAL_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def evaluate():
    questions = load_questions()

    page_hits = 0
    page_total = 0

    chunk_hits = 0
    chunk_total = 0

    for index, item in enumerate(questions, start=1):
        question = item["question"]
        expected_pages = item["expected_pages"]
        expected_chunk_ids = item.get(
            "expected_chunk_ids",
            []
        )

        candidates = get_candidates(
            question,
            limit=20
        )

        results = rerank_chunks(
            question,
            candidates,
            limit=5
        )

        retrieved_pages = sorted(
            set(
                result["page_number"]
                for result in results
            )
        )

        retrieved_chunk_ids = [
            result["id"]
            for result in results
        ]

        print("\n========================================")
        print(f"Q{index}: {question}")
        print(f"Retrieved chunks: {retrieved_chunk_ids}")
        print(f"Retrieved pages: {retrieved_pages}")

        if item["answerable"]:
            page_total += 1

            page_hit = any(
                page in retrieved_pages
                for page in expected_pages
            )

            if page_hit:
                page_hits += 1

            print(
                "Evidence-page hit:",
                "PASS" if page_hit else "FAIL"
            )

        else:
            print("Evidence-page hit: N/A")

        if expected_chunk_ids:
            chunk_total += 1

            chunk_hit = any(
                chunk_id in retrieved_chunk_ids
                for chunk_id in expected_chunk_ids
            )

            if chunk_hit:
                chunk_hits += 1

            print(
                "Evidence-chunk hit:",
                "PASS" if chunk_hit else "FAIL"
            )

        else:
            print("Evidence-chunk hit: N/A")

        print("\nTop 5:")

        for rank, result in enumerate(
            results,
            start=1
        ):
            print(
                f"{rank}. "
                f"Chunk {result['id']} | "
                f"Page {result['page_number']} | "
                f"Rerank {result['rerank_score']:.4f}"
            )

    print("\n========================================")
    print("HYBRID + RERANKER SUMMARY")
    print("========================================")

    print(
        f"Evidence-page hits: "
        f"{page_hits}/{page_total}"
    )

    if page_total:
        print(
            f"Evidence-page hit rate: "
            f"{page_hits / page_total:.2%}"
        )

    print(
        f"Verified evidence-chunk hits: "
        f"{chunk_hits}/{chunk_total}"
    )

    if chunk_total:
        print(
            f"Verified evidence-chunk hit rate: "
            f"{chunk_hits / chunk_total:.2%}"
        )


if __name__ == "__main__":
    evaluate()