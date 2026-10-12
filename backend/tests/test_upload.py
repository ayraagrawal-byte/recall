from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_reject_non_pdf():
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only PDF files are supported."


def test_missing_file():
    response = client.post("/api/v1/documents/upload")

    assert response.status_code == 422


def test_successful_upload():
    with (
        patch("app.main.SessionLocal") as mock_session,
        patch("app.main.ingest_document", return_value=99)
    ):
        db = mock_session.return_value
        db.query.return_value.filter.return_value.first.return_value = None

        fake_document = db.get.return_value
        fake_document.id = 99

        response = client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "test.pdf",
                    b"%PDF-1.4\nfake test content",
                    "application/pdf"
                )
            }
        )

    assert response.status_code == 200
    assert response.json() == {
        "id": 99,
        "filename": "test.pdf",
        "status": "indexed"
    }
    assert fake_document.filename == "test.pdf"
    db.commit.assert_called_once()