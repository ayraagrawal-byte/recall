import requests

from app.retrieval import search_chunks


OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"

def build_citations(chunks):
    citations = []

    for chunk in chunks:
        citation = f"[{chunk['filename']}, p. {chunk['page_number']}]"

        if citation not in citations:
            citations.append(citation)

    return citations

def answer_question(question: str):
    chunks = search_chunks(question, limit=5)

    context_parts = []

    for chunk in chunks:
        context_parts.append(
            f"""
Source: {chunk["filename"]}
Page: {chunk["page_number"]}
Content:
{chunk["content"]}
"""
        )

    context = "\n".join(context_parts)

    prompt = f"""
Answer the question using only the provided research paper context.

If the context does not contain enough information to answer the
question, say that the provided context does not contain enough
information.

Do not use outside knowledge.

Keep the answer concise.
Do not generate citations or source references.
The application will attach verified sources separately.

Question:
{question}

Context:
{context}
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

    answer = response.json()["response"]
    citations = build_citations(chunks)

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