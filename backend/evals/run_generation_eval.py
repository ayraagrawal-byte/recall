import json
from pathlib import Path

from app.rag import answer_question


EVAL_FILE = Path(__file__).parent / "eval_questions.json"


def load_questions():
    with open(EVAL_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def evaluate():
    questions = load_questions()

    for index, item in enumerate(questions, start=1):
        question = item["question"]

        print("\n========================================")
        print(f"Q{index}: {question}")
        print("Answerable:", item["answerable"])
        print("Expected facts:", item["expected_facts"])

        result = answer_question(question)

        print("\nRecall:")
        print(result["answer"])

        print("\nSources:")
        for citation in result["citations"]:
            print(citation)


if __name__ == "__main__":
    evaluate()