
from unittest.mock import MagicMock, patch

import requests

from app import conversation_memory


def test_no_history_returns_original_question():
    question = "What were the main findings?"

    with patch.object(conversation_memory.requests, "post") as mock_post:
        result = conversation_memory.rewrite_question(question, [])

    assert result == question
    mock_post.assert_not_called()


def test_follow_up_question_uses_context():
    question = "What were its limitations?"
    history = [
        {
            "role": "user",
            "content": "What did the gaze-following study find?",
        },
        {
            "role": "assistant",
            "content": "The study investigated infant gaze following.",
        },
    ]

    mock_response = MagicMock()
    mock_response.json.return_value = {
        "response": "What were the limitations of the gaze-following study?"
    }

    with patch.object(
        conversation_memory.requests, "post", return_value=mock_response
    ) as mock_post:
        result = conversation_memory.rewrite_question(question, history)

    assert result == "What were the limitations of the gaze-following study?"

    sent_payload = mock_post.call_args.kwargs["json"]
    assert question in sent_payload["prompt"]
    assert "gaze-following study" in sent_payload["prompt"]
    assert sent_payload["model"] == "gemma3:4b"
    assert sent_payload["stream"] is False


def test_ollama_failure_returns_original_question():
    question = "What were its limitations?"
    history = [{"role": "user", "content": "Summarize the study."}]

    with patch.object(
        conversation_memory.requests,
        "post",
        side_effect=requests.ConnectionError("Ollama unavailable"),
    ):
        result = conversation_memory.rewrite_question(question, history)

    assert result == question


def test_invalid_model_response_returns_original_question():
    question = "What were its limitations?"
    history = [{"role": "user", "content": "Summarize the study."}]

    for model_output in ["", "   ", "x" * 501]:
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": model_output}

        with patch.object(
            conversation_memory.requests,
            "post",
            return_value=mock_response,
        ):
            result = conversation_memory.rewrite_question(question, history)

        assert result == question


def test_prepare_retrieval_question_uses_history():
    question = "What were its limitations?"
    history = [
        {"role": "user", "content": "Summarize the gaze-following study."}
    ]

    with (
        patch.object(
            conversation_memory,
            "get_recent_history",
            return_value=history,
        ) as mock_history,
        patch.object(
            conversation_memory,
            "rewrite_question",
            return_value="What were the limitations of the gaze-following study?",
        ) as mock_rewrite,
    ):
        result = conversation_memory.prepare_retrieval_question(question, 42)

    assert result == "What were the limitations of the gaze-following study?"
    mock_history.assert_called_once_with(42)
    mock_rewrite.assert_called_once_with(question, history)
