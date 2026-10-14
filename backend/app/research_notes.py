from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select

from app.database import SessionLocal
from app.models import (
    Collection,
    Document,
    ResearchNote,
    collection_documents,
    utc_now,
)

router = APIRouter(
    prefix="/api/v1/notes",
    tags=["Research Notes"],
)


class NoteCreate(BaseModel):
    document_id: int = Field(gt=0)
    collection_id: int | None = Field(default=None, gt=0)
    page_number: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=20000)

    @field_validator("title", "content")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text cannot be empty")
        return value


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=20000)
    page_number: int | None = Field(default=None, gt=0)
    collection_id: int | None = Field(default=None, gt=0)

    @field_validator("title", "content")
    @classmethod
    def validate_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Title and content cannot be null")
        value = value.strip()
        if not value:
            raise ValueError("Text cannot be empty")
        return value


def serialize_note(note: ResearchNote) -> dict:
    return {
        "id": note.id,
        "document_id": note.document_id,
        "collection_id": note.collection_id,
        "page_number": note.page_number,
        "title": note.title,
        "content": note.content,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
    }


def validate_reference(db, document_id, collection_id):
    if db.get(Document, document_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if collection_id is None:
        return

    if db.get(Collection, collection_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Collection not found",
        )

    membership = db.execute(
        select(collection_documents.c.document_id)
        .where(
            collection_documents.c.collection_id == collection_id,
            collection_documents.c.document_id == document_id,
        )
    ).first()

    if membership is None:
        raise HTTPException(
            status_code=400,
            detail="Document is not part of this collection",
        )


@router.post("", status_code=201)
def create_note(payload: NoteCreate):
    with SessionLocal() as db:
        validate_reference(
            db,
            payload.document_id,
            payload.collection_id,
        )

        note = ResearchNote(**payload.model_dump())

        db.add(note)
        db.commit()
        db.refresh(note)

        return serialize_note(note)


@router.get("")
def list_notes(
    document_id: int | None = Query(default=None, gt=0),
    collection_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, max_length=200),
):
    with SessionLocal() as db:
        statement = select(ResearchNote)

        if document_id is not None:
            statement = statement.where(
                ResearchNote.document_id == document_id
            )

        if collection_id is not None:
            statement = statement.where(
                ResearchNote.collection_id == collection_id
            )

        if search and search.strip():
            term = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    ResearchNote.title.ilike(term),
                    ResearchNote.content.ilike(term),
                )
            )

        statement = statement.order_by(
            ResearchNote.updated_at.desc(),
            ResearchNote.id.desc(),
        )

        notes = db.scalars(statement).all()
        return [serialize_note(note) for note in notes]


@router.get("/{note_id}")
def get_note(note_id: int):
    with SessionLocal() as db:
        note = db.get(ResearchNote, note_id)

        if note is None:
            raise HTTPException(
                status_code=404,
                detail="Note not found",
            )

        return serialize_note(note)


@router.patch("/{note_id}")
def update_note(note_id: int, payload: NoteUpdate):
    with SessionLocal() as db:
        note = db.get(ResearchNote, note_id)

        if note is None:
            raise HTTPException(
                status_code=404,
                detail="Note not found",
            )

        changes = payload.model_dump(exclude_unset=True)

        if "collection_id" in changes:
            validate_reference(
                db,
                note.document_id,
                changes["collection_id"],
            )

        for field, value in changes.items():
            setattr(note, field, value)

        if changes:
            note.updated_at = utc_now()

        db.commit()
        db.refresh(note)

        return serialize_note(note)


@router.delete("/{note_id}")
def delete_note(note_id: int):
    with SessionLocal() as db:
        note = db.get(ResearchNote, note_id)

        if note is None:
            raise HTTPException(
                status_code=404,
                detail="Note not found",
            )

        db.delete(note)
        db.commit()

        return {
            "deleted": True,
            "note_id": note_id,
        }
