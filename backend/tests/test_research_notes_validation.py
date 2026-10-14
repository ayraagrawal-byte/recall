from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models import Collection, Document
from app.research_notes import (
    NoteCreate,
    NoteUpdate,
    serialize_note,
    validate_reference,
)


def valid_payload():
    return {
        "document_id": 2,
        "collection_id": 1,
        "page_number": 1,
        "title": "Infant cognition",
        "content": "Research findings about infant perception.",
    }


def test_valid_note_creation():
    note = NoteCreate(**valid_payload())
    assert note.document_id == 2
    assert note.collection_id == 1
    assert note.page_number == 1


def test_note_without_collection_or_page():
    note = NoteCreate(
        document_id=2,
        title="General note",
        content="A note about this PDF.",
    )
    assert note.collection_id is None
    assert note.page_number is None


def test_title_and_content_are_trimmed():
    payload = valid_payload()
    payload["title"] = "  Infant cognition  "
    payload["content"] = "  Important finding  "

    note = NoteCreate(**payload)

    assert note.title == "Infant cognition"
    assert note.content == "Important finding"


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", "   "),
        ("content", "   "),
        ("title", ""),
        ("content", ""),
    ],
)
def test_empty_or_whitespace_text_rejected(field, value):
    payload = valid_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        NoteCreate(**payload)


@pytest.mark.parametrize("page", [0, -1])
def test_invalid_page_rejected(page):
    payload = valid_payload()
    payload["page_number"] = page

    with pytest.raises(ValidationError):
        NoteCreate(**payload)


def test_invalid_document_id_rejected():
    payload = valid_payload()
    payload["document_id"] = 0

    with pytest.raises(ValidationError):
        NoteCreate(**payload)


def test_invalid_collection_id_rejected():
    payload = valid_payload()
    payload["collection_id"] = -1

    with pytest.raises(ValidationError):
        NoteCreate(**payload)


def test_partial_update():
    update = NoteUpdate(title="Updated title")

    assert update.model_dump(exclude_unset=True) == {
        "title": "Updated title"
    }


def test_optional_references_can_be_cleared():
    update = NoteUpdate(
        collection_id=None,
        page_number=None,
    )

    assert update.model_dump(exclude_unset=True) == {
        "collection_id": None,
        "page_number": None,
    }


@pytest.mark.parametrize("field", ["title", "content"])
def test_required_text_cannot_be_cleared(field):
    with pytest.raises(ValidationError):
        NoteUpdate(**{field: None})


def test_missing_document_returns_404():
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as error:
        validate_reference(db, 999999, None)

    assert error.value.status_code == 404


def test_missing_collection_returns_404():
    db = MagicMock()

    def get_model(model, id):
        if model is Document:
            return object()
        if model is Collection:
            return None
        return None

    db.get.side_effect = get_model

    with pytest.raises(HTTPException) as error:
        validate_reference(db, 2, 999999)

    assert error.value.status_code == 404


def test_document_outside_collection_rejected():
    db = MagicMock()
    db.get.return_value = object()
    db.execute.return_value.first.return_value = None

    with pytest.raises(HTTPException) as error:
        validate_reference(db, 2, 1)

    assert error.value.status_code == 400


def test_valid_collection_membership():
    db = MagicMock()
    db.get.return_value = object()
    db.execute.return_value.first.return_value = (2,)

    validate_reference(db, 2, 1)

    db.execute.assert_called_once()


def test_note_serialization():
    note = SimpleNamespace(
        id=15,
        document_id=2,
        collection_id=1,
        page_number=3,
        title="Test note",
        content="Research evidence",
        created_at=None,
        updated_at=None,
    )

    result = serialize_note(note)

    assert result["id"] == 15
    assert result["document_id"] == 2
    assert result["collection_id"] == 1
    assert result["page_number"] == 3
    assert result["title"] == "Test note"
    assert result["content"] == "Research evidence"
