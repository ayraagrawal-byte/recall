
import pytest

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

from app.main import app
from app.models import Base, Conversation, Message


@pytest.fixture
def test_client():
    # Temporary in-memory database.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Only create the tables needed for these tests.
    Conversation.__table__.create(engine)
    Message.__table__.create(engine)

    TestingSession = sessionmaker(
        bind=engine,
        expire_on_commit=False,
    )

    # Patch the database session used by conversation routes.
    with patch(
        "app.conversations.SessionLocal",
        TestingSession,
    ):
        with TestClient(app) as client:
            yield client

    engine.dispose()


def test_create_conversation(test_client):
    response = test_client.post(
        "/api/v1/conversations"
    )

    assert response.status_code == 200

    data = response.json()

    assert isinstance(data["id"], int)
    assert data["title"] == "New conversation"
    assert "created_at" in data
    assert "updated_at" in data


def test_list_conversations(test_client):
    test_client.post("/api/v1/conversations")
    test_client.post("/api/v1/conversations")

    response = test_client.get(
        "/api/v1/conversations"
    )

    assert response.status_code == 200

    conversations = response.json()

    assert len(conversations) == 2
    assert all(
        "id" in conversation
        for conversation in conversations
    )


def test_get_conversation_with_messages(test_client):
    created = test_client.post(
        "/api/v1/conversations"
    ).json()

    conversation_id = created["id"]

    save_response = test_client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={
            "question": "What did the study find?",
            "answer": "The study found a significant effect.",
            "citations": [
                {"filename": "study.pdf", "page": 3}
            ],
        },
    )

    assert save_response.status_code == 200

    response = test_client.get(
        f"/api/v1/conversations/{conversation_id}"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == conversation_id
    assert len(data["messages"]) == 2

    assert data["messages"][0]["role"] == "user"
    assert data["messages"][0]["content"] == (
        "What did the study find?"
    )

    assert data["messages"][1]["role"] == "assistant"
    assert data["messages"][1]["content"] == (
        "The study found a significant effect."
    )

    assert data["messages"][1]["citations"] == [
        {"filename": "study.pdf", "page": 3}
    ]


def test_save_exchange_updates_title(test_client):
    created = test_client.post(
        "/api/v1/conversations"
    ).json()

    conversation_id = created["id"]

    response = test_client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={
            "question": "What is gaze following?",
            "answer": "Gaze following is a social attention behavior.",
            "citations": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "saved"

    conversation = test_client.get(
        f"/api/v1/conversations/{conversation_id}"
    ).json()

    assert conversation["title"] == (
        "What is gaze following?"
    )

    assert len(conversation["messages"]) == 2


def test_delete_conversation(test_client):
    created = test_client.post(
        "/api/v1/conversations"
    ).json()

    conversation_id = created["id"]

    response = test_client.delete(
        f"/api/v1/conversations/{conversation_id}"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "deleted"

    get_response = test_client.get(
        f"/api/v1/conversations/{conversation_id}"
    )

    assert get_response.status_code == 404
