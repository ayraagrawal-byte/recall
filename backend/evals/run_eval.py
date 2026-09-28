import json

from app.retrieval import search_chunks


def load_eval_questions():
    with open("evals/eval_questions.json", "r") as file:
        return json.load(file)


def run_eval():
    questions = load_eval_questions()

    total_answerable = 0
    page_hits = 0

    for item in questions:
        question = item["question"]
        expected_pages = item["expected_pages"]
        answerable = item["answerable"]

        chunks = search_chunks(question, limit=5)

        retrieved_pages = []

        for chunk in chunks:
            page = chunk["page_number"]

            if page not in retrieved_pages:
                retrieved_pages.append(page)

        retrieval_distances = [
            chunk["distance"]
            for chunk in chunks
        ]        

        if answerable:
            total_answerable += 1

            page_hit = any(
                page in expected_pages
                for page in retrieved_pages
            )

            if page_hit:
                page_hits += 1
        else:
            page_hit = None

        print("\n========================================")
        print(f"Question {item['id']}: {question}")
        print(f"Expected pages: {expected_pages}")
        print(f"Retrieved pages: {retrieved_pages}")
        print("Distances:", [round(distance, 4) for distance in retrieval_distances])

        if retrieval_distances:
            print(f"Best distance: {min(retrieval_distances):.4f}")

        if page_hit is True:
            print("Retrieval: PASS")
        elif page_hit is False:
            print("Retrieval: FAIL")
        else:
            print("Retrieval: N/A (unanswerable question)")

    print("\n========================================")
    print("RETRIEVAL SUMMARY")
    print("========================================")
    print(f"Page hits: {page_hits}/{total_answerable}")

    if total_answerable > 0:
        hit_rate = page_hits / total_answerable
        print(f"Page hit rate: {hit_rate:.2%}")


if __name__ == "__main__":
    run_eval()