from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_empty_question():
    response = client.post(
        "/api/v1/query",
        json={"question": ""}
    )

    assert response.status_code == 422


def test_whitespace_question():
    response = client.post(
        "/api/v1/query",
        json={"question": "   "}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Question cannot be empty."


def test_successful_query():
    fake_result = {
        "answer": "The study included 85 participants.",
        "citations": [
            {"filename": "sample1.pdf", "page": 2}
        ]
    }

    with patch("app.main.answer_question", return_value=fake_result):
        response = client.post(
            "/api/v1/query",
            json={"question": "How many participants were included?"}
        )

    assert response.status_code == 200
    assert response.json() == fake_result


def test_generation_failure():
    with patch(
        "app.main.answer_question",
        side_effect=RuntimeError("Ollama unavailable")
    ):
        response = client.post(
            "/api/v1/query",
            json={"question": "What did the study find?"}
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Recall could not generate an answer. Please try again."
    )