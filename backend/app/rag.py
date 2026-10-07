import re
import requests

from app.retrieval_v2 import search_chunks_v2


OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"


def build_citations(chunks):
    citations = []

    for chunk in chunks:
        citation = {
            "filename": chunk["filename"],
            "page": chunk["page_number"]
        }

        if citation not in citations:
            citations.append(citation)

    return citations


def parse_response(response_text, chunks):
    source_match = re.search(
        r"SOURCES:\s*\[([0-9,\s]*)\]",
        response_text,
        re.IGNORECASE
    )

    # Remove the SOURCES line from the answer shown to the user.
    answer = re.sub(
        r"\n?\s*SOURCES:\s*\[[0-9,\s]*\]\s*$",
        "",
        response_text,
        flags=re.IGNORECASE
    ).strip()

    citations = []

    if source_match:
        source_ids = source_match.group(1)

        for source_id in source_ids.split(","):
            source_id = source_id.strip()

            if not source_id:
                continue

            index = int(source_id) - 1

            # Only accept IDs that correspond to retrieved chunks.
            if 0 <= index < len(chunks):
                chunk = chunks[index]

                citation = {
                    "filename": chunk["filename"],
                    "page": chunk["page_number"]
                }

                if citation not in citations:
                    citations.append(citation)

    return answer, citations


def answer_question(question: str):
    chunks = search_chunks_v2(
        question,
        candidate_limit=20,
        limit=5
    )

    context_parts = []

    for index, chunk in enumerate(chunks, start=1):
        context_parts.append(
            f"""
Source ID: {index}
Source: {chunk["filename"]}
Page: {chunk["page_number"]}
Content:
{chunk["content"]}
"""
        )

    context = "\n".join(context_parts)

    prompt = f"""
You are answering a question about research papers.

Use ONLY the provided context. Do not use outside knowledge.

Instructions:
1. Read all of the provided context before answering.
2. Identify the passage that most directly answers the exact question.
3. Base your answer on that passage rather than on related background,
   predictions, discussion, or results from other measures.
4. For questions asking for a number, age, count, time, percentage,
   or other specific value, copy the value directly from the passage
   that explicitly reports it. Do not infer or calculate a different value.
5. Distinguish the study's actual results from predictions,
   background research, discussion, and results from other measures.
6. If the question asks about an overall result, do not substitute
   a subgroup, age-related, or interaction effect for the overall result.
7. If multiple passages seem relevant, prefer the passage that most
   directly and explicitly answers the specific question.
8. Make sure the final answer includes every part of the question
   that is directly supported by the context.
9. If the context truly does not contain enough information, say exactly:
   "The provided context does not contain enough information."
10. Do not guess or fill in missing information.
11. Keep the final answer concise.
12. After your answer, write a new line in exactly this format:
    SOURCES: [1, 2]
    Include only the Source IDs that directly support your answer.
13. Do not include a Source ID unless its content directly supports
    information in your answer.

Question:
{question}

Context:
{context}

Answer:
"""

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 250
            }
        },
        timeout=120
    )

    response.raise_for_status()

    raw_response = response.json()["response"]

    answer, citations = parse_response(
        raw_response,
        chunks
    )

    return {
        "answer": answer,
        "citations": citations
    }


if __name__ == "__main__":
    question = input("Ask Recall: ")

    result = answer_question(question)

    print("\nRecall:")
    print(result["answer"])

    print("\nSources:")
    for citation in result["citations"]:
        print(citation)