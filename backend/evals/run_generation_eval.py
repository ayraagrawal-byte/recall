import json
import time
from pathlib import Path

from app.rag import answer_question


EVAL_FILE = Path(__file__).parent / "eval_questions.json"
OUTPUT_FILE = Path(__file__).parent / "generation_results.json"


def load_questions():
    with open(EVAL_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def main():
    questions = load_questions()
    results = []

    for index, item in enumerate(questions, start=1):
        question = item["question"]

        print("\n" + "=" * 70)
        print(f"Q{index}: {question}")
        print("=" * 70)

        start_time = time.perf_counter()

        try:
            result = answer_question(question)

            latency = time.perf_counter() - start_time

            record = {
                "question_number": index,
                "question": question,
                "answerable": item["answerable"],
                "expected_facts": item["expected_facts"],
                "answer": result["answer"].strip(),
                "citations": result["citations"],
                "latency_seconds": round(latency, 3)
            }

            results.append(record)

            print("\nExpected facts:")
            if item["expected_facts"]:
                for fact in item["expected_facts"]:
                    print(f"- {fact}")
            else:
                print("- UNANSWERABLE")

            print("\nRecall answer:")
            print(record["answer"])

            print("\nSources:")
            for citation in record["citations"]:
                print(citation)

            print(f"\nLatency: {latency:.3f}s")

        except Exception as error:
            print(f"\nERROR: {error}")

            results.append({
                "question_number": index,
                "question": question,
                "answerable": item["answerable"],
                "expected_facts": item["expected_facts"],
                "answer": None,
                "citations": [],
                "error": str(error)
            })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(
            results,
            file,
            indent=2,
            ensure_ascii=False
        )

    print("\n" + "=" * 70)
    print("GENERATION EVALUATION COMPLETE")
    print("=" * 70)
    print(f"Questions tested: {len(results)}")
    print(f"Results saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()