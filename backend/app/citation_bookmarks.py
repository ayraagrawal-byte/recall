from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select

from app.database import SessionLocal
from app.models import (
    CitationBookmark,
    Collection,
    Document,
    collection_documents,
)

router = APIRouter(
    prefix="/api/v1/bookmarks",
    tags=["Citation Bookmarks"],
)


class BookmarkCreate(BaseModel):
    document_id: int = Field(gt=0)
    collection_id: int | None = Field(default=None, gt=0)
    page_number: int | None = Field(default=None, gt=0)
    evidence: str = Field(min_length=1, max_length=20000)
    label: str | None = Field(default=None, max_length=255)

    @field_validator("evidence")
    @classmethod
    def validate_evidence(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Evidence cannot be empty")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class BookmarkUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


def serialize_bookmark(bookmark: CitationBookmark) -> dict:
    return {
        "id": bookmark.id,
        "document_id": bookmark.document_id,
        "collection_id": bookmark.collection_id,
        "page_number": bookmark.page_number,
        "evidence": bookmark.evidence,
        "label": bookmark.label,
        "created_at": bookmark.created_at,
    }


def validate_reference(db, document_id: int, collection_id: int | None):
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
        select(collection_documents.c.document_id).where(
            collection_documents.c.collection_id == collection_id,
            collection_documents.c.document_id == document_id,
        )
    ).first()

    if membership is None:
        raise HTTPException(
            status_code=400,
            detail="Document is not in this collection",
        )


@router.post("", status_code=201)
def create_bookmark(payload: BookmarkCreate):
    with SessionLocal() as db:
        validate_reference(
            db,
            payload.document_id,
            payload.collection_id,
        )

        bookmark = CitationBookmark(**payload.model_dump())

        db.add(bookmark)
        db.commit()
        db.refresh(bookmark)

        return serialize_bookmark(bookmark)


@router.get("")
def list_bookmarks(
    document_id: int | None = Query(default=None, gt=0),
    collection_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, max_length=200),
):
    with SessionLocal() as db:
        statement = select(CitationBookmark)

        if document_id is not None:
            statement = statement.where(
                CitationBookmark.document_id == document_id
            )

        if collection_id is not None:
            statement = statement.where(
                CitationBookmark.collection_id == collection_id
            )

        if search and search.strip():
            term = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    CitationBookmark.evidence.ilike(term),
                    CitationBookmark.label.ilike(term),
                )
            )

        statement = statement.order_by(
            CitationBookmark.created_at.desc(),
            CitationBookmark.id.desc(),
        )

        bookmarks = db.scalars(statement).all()

        return [
            serialize_bookmark(bookmark)
            for bookmark in bookmarks
        ]


@router.get("/{bookmark_id}")
def get_bookmark(bookmark_id: int):
    with SessionLocal() as db:
        bookmark = db.get(CitationBookmark, bookmark_id)

        if bookmark is None:
            raise HTTPException(
                status_code=404,
                detail="Bookmark not found",
            )

        return serialize_bookmark(bookmark)


@router.patch("/{bookmark_id}")
def update_bookmark(bookmark_id: int, payload: BookmarkUpdate):
    with SessionLocal() as db:
        bookmark = db.get(CitationBookmark, bookmark_id)

        if bookmark is None:
            raise HTTPException(
                status_code=404,
                detail="Bookmark not found",
            )

        changes = payload.model_dump(exclude_unset=True)

        if "label" in changes:
            bookmark.label = changes["label"]

        db.commit()
        db.refresh(bookmark)

        return serialize_bookmark(bookmark)


@router.delete("/{bookmark_id}")
def delete_bookmark(bookmark_id: int):
    with SessionLocal() as db:
        bookmark = db.get(CitationBookmark, bookmark_id)

        if bookmark is None:
            raise HTTPException(
                status_code=404,
                detail="Bookmark not found",
            )

        db.delete(bookmark)
        db.commit()

        return {
            "deleted": True,
            "bookmark_id": bookmark_id,
        }
