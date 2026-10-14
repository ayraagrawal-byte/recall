
import json
import re
import time

import requests

from app.retrieval_v2 import search_chunks_v2


OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"


def build_citations(chunks):
    citations = []

    for chunk in chunks:
        citation = {
            "filename": chunk["filename"],
            "page": chunk["page_number"],
            "evidence": chunk["content"],
        }

        if citation not in citations:
            citations.append(citation)

    return citations


def parse_response(response_text, chunks):
    source_match = re.search(
        r"SOURCES:\s*\[([0-9,\s]*)\]",
        response_text,
        re.IGNORECASE,
    )

    answer = re.sub(
        r"\n?\s*SOURCES:\s*\[[0-9,\s]*\]\s*$",
        "",
        response_text,
        flags=re.IGNORECASE,
    ).strip()

    citations = []

    if source_match:
        source_ids = source_match.group(1)

        for source_id in source_ids.split(","):
            source_id = source_id.strip()

            if not source_id:
                continue

            index = int(source_id) - 1

            if 0 <= index < len(chunks):
                chunk = chunks[index]

                citation = {
                    "filename": chunk["filename"],
                    "page": chunk["page_number"],
                    "evidence": chunk["content"],
                }

                if citation not in citations:
                    citations.append(citation)

    return answer, citations


def build_prompt(question, chunks):
    """
    Build the same grounded prompt for both regular
    and streaming responses.
    """
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

    return f"""
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


def answer_question(
    question: str,
    document_ids: list[int] | None = None,
):
    """
    Standard non-streaming RAG answer.
    Used by the existing /api/v1/query endpoint.
    """
    start_time = time.perf_counter()

    # STEP 1: Retrieve relevant passages.
    chunks = search_chunks_v2(
        question,
        candidate_limit=20,
        limit=5,
        document_ids=document_ids,
    )

    retrieval_time = time.perf_counter() - start_time

    print(
        f"[Recall] Retrieval: {retrieval_time:.2f}s",
        flush=True,
    )

    # STEP 2: Build the grounded prompt.
    prompt = build_prompt(question, chunks)

    # STEP 3: Generate the answer.
    generation_start = time.perf_counter()

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 250,
            },
        },
        timeout=120,
    )

    response.raise_for_status()

    generation_time = time.perf_counter() - generation_start

    print(
        f"[Recall] Generation: {generation_time:.2f}s",
        flush=True,
    )

    # STEP 4: Parse answer and citations.
    raw_response = response.json()["response"]

    answer, citations = parse_response(
        raw_response,
        chunks,
    )

    total_time = time.perf_counter() - start_time

    print(
        f"[Recall] Total: {total_time:.2f}s",
        flush=True,
    )

    return {
        "answer": answer,
        "citations": citations,
    }


def stream_answer(
    question: str,
    document_ids: list[int] | None = None,
):
    """
    Stream Ollama-generated answer text while preserving
    Recall's existing source citation filtering.

    Debug logs show whether Ollama generates chunks
    progressively or all at once.
    """
    start_time = time.perf_counter()

    # STEP 1: Retrieve relevant passages.
    chunks = search_chunks_v2(
        question,
        candidate_limit=20,
        limit=5,
        document_ids=document_ids,
    )

    retrieval_time = time.perf_counter() - start_time

    print(
        f"[Recall] Streaming retrieval: {retrieval_time:.2f}s",
        flush=True,
    )

    # STEP 2: Build the same prompt as regular answering.
    prompt = build_prompt(question, chunks)

    # STEP 3: Start streaming from Ollama.
    generation_start = time.perf_counter()

    full_response = ""
    visible_answer = ""

    with requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": True,
            "options": {
                "num_predict": 250,
            },
        },
        stream=True,
        timeout=120,
    ) as response:

        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue

            payload = json.loads(line)

            token = payload.get("response", "")
            full_response += token

            # DEBUG: Print each chunk as Ollama sends it.
            if token:
                print(
                    f"[Recall] Ollama chunk: {token!r}",
                    flush=True,
                )

            # Keep the last 50 characters buffered to
            # avoid showing the SOURCES metadata.
            safe_length = max(
                0,
                len(full_response) - 50,
            )

            safe_text = full_response[:safe_length]

            if len(safe_text) > len(visible_answer):
                delta = safe_text[len(visible_answer):]
                visible_answer = safe_text

                yield {
                    "type": "token",
                    "content": delta,
                }

    generation_time = time.perf_counter() - generation_start

    print(
        f"[Recall] Streaming generation: "
        f"{generation_time:.2f}s",
        flush=True,
    )

    # STEP 4: Parse the final answer and citations.
    answer, citations = parse_response(
        full_response,
        chunks,
    )

    # Send any remaining answer text without the SOURCES line.
    if answer.startswith(visible_answer):
        remainder = answer[len(visible_answer):]

        if remainder:
            yield {
                "type": "token",
                "content": remainder,
            }
    else:
        # Correct the frontend if the model's formatting
        # made the streamed text differ from the final answer.
        yield {
            "type": "replace",
            "content": answer,
        }

    # STEP 5: Send supporting citations.
    yield {
        "type": "citations",
        "content": citations,
    }

    total_time = time.perf_counter() - start_time

    print(
        f"[Recall] Streaming total: {total_time:.2f}s",
        flush=True,
    )


if __name__ == "__main__":
    question = input("Ask Recall: ")

    result = answer_question(question)

    print("\nRecall:")
    print(result["answer"])

    print("\nSources:")

    for citation in result["citations"]:
        print(citation)
