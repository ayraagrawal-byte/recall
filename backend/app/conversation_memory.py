
import requests

from app.database import SessionLocal
from app.models import Message

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"

MAX_HISTORY_MESSAGES = 6


def get_recent_history(conversation_id: int | None):
    """
    Retrieve recent messages from an existing conversation.
    """
    if conversation_id is None:
        return []

    with SessionLocal() as db:
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.id.desc())
            .limit(MAX_HISTORY_MESSAGES)
            .all()
        )

        return [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in reversed(messages)
        ]


def rewrite_question(question: str, history: list[dict]):
    """
    Rewrite a context-dependent follow-up into a
    standalone question for retrieval.

    This does not answer the question.
    """
    if not history:
        return question

    history_text = "\n".join(
        f"{message['role']}: {message['content'][:1200]}"
        for message in history
    )

    prompt = f"""
You rewrite follow-up questions for a research-paper
search system.

Your task is ONLY to rewrite the user's latest question
into a standalone search question.

Rules:
1. Use conversation history only to resolve references
   such as "it", "they", "that study", or "those results".
2. Preserve the user's original intent.
3. Do not answer the question.
4. Do not add facts, results, or assumptions.
5. If the question is already standalone, return it unchanged.
6. If the reference is ambiguous, do not guess.
7. Return ONLY the rewritten question.

Conversation history:
{history_text}

Latest question:
{question}

Standalone question:
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 120,
                    "temperature": 0,
                },
            },
            timeout=60,
        )

        response.raise_for_status()

        rewritten = response.json().get(
            "response", ""
        ).strip()

        if not rewritten:
            return question

        # Avoid accidentally passing a long explanation
        # into the retrieval system.
        if len(rewritten) > 500:
            return question

        return rewritten.strip('"').strip()

    except requests.RequestException:
        # The original question still works if
        # question rewriting fails.
        return question


def prepare_retrieval_question(
    question: str,
    conversation_id: int | None,
):
    history = get_recent_history(conversation_id)

    rewritten = rewrite_question(question, history)

    print(
        f"[Recall] Original question: {question}",
        flush=True,
    )
    print(
        f"[Recall] Retrieval question: {rewritten}",
        flush=True,
    )

    return rewritten
