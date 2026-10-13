
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import Message


client = TestClient(app)


def read_events(response):
    return [
        json.loads(line)
        for line in response.text.splitlines()
        if line.strip()
    ]


def test_stream_rejects_empty_question():
    response = client.post(
        "/api/v1/query/stream",
        json={"question": "   "},
    )

    assert response.status_code == 400


def test_stream_rejects_unknown_conversation():
    with patch("app.main.SessionLocal") as mock_session:
        db = mock_session.return_value.__enter__.return_value
        db.get.return_value = None

        response = client.post(
            "/api/v1/query/stream",
            json={
                "question": "What did the study find?",
                "conversation_id": 999999,
            },
        )

    assert response.status_code == 404


def test_stream_saves_original_question_and_citations():
    original_question = "What were its limitations?"
    rewritten_question = (
        "What were the limitations of the gaze-following study?"
    )

    fake_events = [
        {"type": "token", "content": "The study "},
        {"type": "token", "content": "had limitations."},
        {
            "type": "citations",
            "content": [
                {"filename": "study.pdf", "page": 3}
            ],
        },
    ]

    with (
        patch(
            "app.main.prepare_retrieval_question",
            return_value=rewritten_question,
        ) as mock_rewrite,
        patch(
            "app.main.stream_answer",
            return_value=iter(fake_events),
        ) as mock_stream,
        patch("app.main.SessionLocal") as mock_session,
    ):
        db = mock_session.return_value.__enter__.return_value

        def fake_flush():
            # Simulate the database assigning an ID
            # to the newly created conversation.
            conversation = db.add.call_args.args[0]
            conversation.id = 42

        db.flush.side_effect = fake_flush

        response = client.post(
            "/api/v1/query/stream",
            json={"question": original_question},
        )

        events = read_events(response)

        assert response.status_code == 200

        assert events[-1] == {
            "type": "saved",
            "conversation_id": 42,
        }

        mock_rewrite.assert_called_once_with(
            original_question,
            None,
        )

        mock_stream.assert_called_once_with(
            rewritten_question
        )

        saved_messages = db.add_all.call_args.args[0]

        assert len(saved_messages) == 2

        assert isinstance(saved_messages[0], Message)
        assert isinstance(saved_messages[1], Message)

        assert saved_messages[0].role == "user"
        assert saved_messages[0].content == original_question
        assert saved_messages[0].citations == []

        assert saved_messages[1].role == "assistant"
        assert saved_messages[1].content == (
            "The study had limitations."
        )
        assert saved_messages[1].citations == [
            {"filename": "study.pdf", "page": 3}
        ]

        db.commit.assert_called_once()


def test_stream_does_not_save_incomplete_answer():
    fake_events = [
        {
            "type": "token",
            "content": "Incomplete answer",
        }
    ]

    with (
        patch(
            "app.main.prepare_retrieval_question",
            return_value="Question",
        ),
        patch(
            "app.main.stream_answer",
            return_value=iter(fake_events),
        ),
        patch("app.main.SessionLocal") as mock_session,
    ):
        response = client.post(
            "/api/v1/query/stream",
            json={"question": "Question"},
        )

        events = read_events(response)

        assert response.status_code == 200

        assert not any(
            event["type"] == "saved"
            for event in events
        )

        db = mock_session.return_value.__enter__.return_value
        db.commit.assert_not_called()


def test_stream_handles_generation_failure():
    def failing_stream(question):
        raise RuntimeError("Model unavailable")
        yield

    with (
        patch(
            "app.main.prepare_retrieval_question",
            return_value="Question",
        ),
        patch(
            "app.main.stream_answer",
            side_effect=failing_stream,
        ),
        patch("app.main.SessionLocal") as mock_session,
    ):
        response = client.post(
            "/api/v1/query/stream",
            json={"question": "Question"},
        )

        events = read_events(response)

        assert response.status_code == 200
        assert events[-1]["type"] == "error"

        assert not any(
            event["type"] == "saved"
            for event in events
        )

        db = mock_session.return_value.__enter__.return_value
        db.commit.assert_not_called()
