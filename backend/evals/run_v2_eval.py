import json
import time
from pathlib import Path

from app.retrieval_v2 import search_chunks_v2


EVAL_FILE = Path(__file__).parent / "eval_questions.json"


def load_questions():
    with open(EVAL_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def find_first_rank(retrieved_chunk_ids, valid_chunk_ids):
    for rank, chunk_id in enumerate(retrieved_chunk_ids, start=1):
        if chunk_id in valid_chunk_ids:
            return rank

    return None


def evaluate():
    questions = load_questions()

    answerable_questions = [
        item for item in questions
        if item["answerable"]
    ]

    # -----------------------------
    # Primary / strict metrics
    # -----------------------------

    primary_recall_at_1 = 0
    primary_recall_at_3 = 0
    primary_recall_at_5 = 0
    primary_reciprocal_rank_total = 0

    # -----------------------------
    # Evidence metrics
    # -----------------------------

    evidence_recall_at_1 = 0
    evidence_recall_at_3 = 0
    evidence_recall_at_5 = 0
    evidence_reciprocal_rank_total = 0

    # -----------------------------
    # Document / page metrics
    # -----------------------------

    document_at_1 = 0
    document_at_3 = 0
    document_at_5 = 0

    page_hits = 0

    latencies = []

    for index, item in enumerate(answerable_questions, start=1):
        question = item["question"]

        primary_chunks = item["primary_chunk_ids"]
        expected_chunks = item["expected_chunk_ids"]

        expected_pages = item["expected_pages"]
        expected_document = item["expected_document"]

        start_time = time.perf_counter()

        results = search_chunks_v2(
            question,
            candidate_limit=20,
            limit=5
        )

        latency = time.perf_counter() - start_time
        latencies.append(latency)

        retrieved_chunk_ids = [
            result["id"]
            for result in results
        ]

        retrieved_documents = [
            result["filename"]
            for result in results
        ]

        # -----------------------------
        # Primary / strict chunk rank
        # -----------------------------

        primary_rank = find_first_rank(
            retrieved_chunk_ids,
            primary_chunks
        )

        if primary_rank is not None:
            primary_reciprocal_rank_total += 1 / primary_rank

            if primary_rank <= 1:
                primary_recall_at_1 += 1

            if primary_rank <= 3:
                primary_recall_at_3 += 1

            if primary_rank <= 5:
                primary_recall_at_5 += 1

        # -----------------------------
        # Evidence chunk rank
        # -----------------------------

        evidence_rank = find_first_rank(
            retrieved_chunk_ids,
            expected_chunks
        )

        if evidence_rank is not None:
            evidence_reciprocal_rank_total += 1 / evidence_rank

            if evidence_rank <= 1:
                evidence_recall_at_1 += 1

            if evidence_rank <= 3:
                evidence_recall_at_3 += 1

            if evidence_rank <= 5:
                evidence_recall_at_5 += 1

        # -----------------------------
        # Document retrieval
        # -----------------------------

        if expected_document in retrieved_documents[:1]:
            document_at_1 += 1

        if expected_document in retrieved_documents[:3]:
            document_at_3 += 1

        if expected_document in retrieved_documents[:5]:
            document_at_5 += 1

        # -----------------------------
        # Page retrieval
        # -----------------------------

        page_hit = any(
            result["filename"] == expected_document
            and result["page_number"] in expected_pages
            for result in results
        )

        if page_hit:
            page_hits += 1

        # -----------------------------
        # Per-question output
        # -----------------------------

        print("\n========================================")
        print(f"Q{index}: {question}")
        print(f"Expected document: {expected_document}")
        print(f"Primary chunks: {primary_chunks}")
        print(f"Evidence chunks: {expected_chunks}")
        print(f"Expected pages: {expected_pages}")

        print(f"\nPrimary chunk rank: {primary_rank}")
        print(f"Evidence chunk rank: {evidence_rank}")

        print(
            f"Page hit: "
            f"{'PASS' if page_hit else 'FAIL'}"
        )

        print(f"Latency: {latency:.3f}s")

        print("\nTop 5:")

        for rank, result in enumerate(results, start=1):
            rerank_score = result.get("rerank_score")

            if rerank_score is not None:
                rerank_text = f"{rerank_score:.4f}"
            else:
                rerank_text = "N/A"

            print(
                f"{rank}. "
                f"{result['filename']} | "
                f"Chunk {result['id']} | "
                f"Page {result['page_number']} | "
                f"Rerank {rerank_text}"
            )

            print(
                result["content"][:350]
                .replace("\n", " ")
            )

            print()

    # -----------------------------
    # Final metrics
    # -----------------------------

    total = len(answerable_questions)

    primary_mrr = (
        primary_reciprocal_rank_total / total
    )

    evidence_mrr = (
        evidence_reciprocal_rank_total / total
    )

    average_latency = (
        sum(latencies) / len(latencies)
        if latencies
        else 0
    )

    print("\n========================================")
    print("V2 RETRIEVAL SUMMARY")
    print("========================================")

    print(f"Questions: {total}")

    # -----------------------------
    # Primary metrics
    # -----------------------------

    print("\n--- PRIMARY / STRICT ---")

    print(
        f"Primary Recall@1: "
        f"{primary_recall_at_1}/{total} "
        f"({primary_recall_at_1 / total:.2%})"
    )

    print(
        f"Primary Recall@3: "
        f"{primary_recall_at_3}/{total} "
        f"({primary_recall_at_3 / total:.2%})"
    )

    print(
        f"Primary Recall@5: "
        f"{primary_recall_at_5}/{total} "
        f"({primary_recall_at_5 / total:.2%})"
    )

    print(f"Primary MRR: {primary_mrr:.4f}")

    # -----------------------------
    # Evidence metrics
    # -----------------------------

    print("\n--- EVIDENCE ---")

    print(
        f"Evidence Recall@1: "
        f"{evidence_recall_at_1}/{total} "
        f"({evidence_recall_at_1 / total:.2%})"
    )

    print(
        f"Evidence Recall@3: "
        f"{evidence_recall_at_3}/{total} "
        f"({evidence_recall_at_3 / total:.2%})"
    )

    print(
        f"Evidence Recall@5: "
        f"{evidence_recall_at_5}/{total} "
        f"({evidence_recall_at_5 / total:.2%})"
    )

    print(f"Evidence MRR: {evidence_mrr:.4f}")

    # -----------------------------
    # Document / page metrics
    # -----------------------------

    print("\n--- DOCUMENT / PAGE ---")

    print(
        f"Document Hit@1: "
        f"{document_at_1}/{total} "
        f"({document_at_1 / total:.2%})"
    )

    print(
        f"Document Hit@3: "
        f"{document_at_3}/{total} "
        f"({document_at_3 / total:.2%})"
    )

    print(
        f"Document Hit@5: "
        f"{document_at_5}/{total} "
        f"({document_at_5 / total:.2%})"
    )

    print(
        f"Evidence Page Hit@5: "
        f"{page_hits}/{total} "
        f"({page_hits / total:.2%})"
    )

    print(
        f"Average retrieval latency: "
        f"{average_latency:.3f}s"
    )


if __name__ == "__main__":
    evaluate()