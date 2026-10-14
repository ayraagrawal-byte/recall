from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models import Collection, Document


router = APIRouter(
    prefix="/api/v1/collections",
    tags=["Research Collections"],
)


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


def serialize_document(document):
    return {
        "id": document.id,
        "filename": document.filename,
        "created_at": document.created_at,
    }


def serialize_collection(collection):
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "created_at": collection.created_at,
        "document_count": len(collection.documents),
        "documents": [
            serialize_document(document)
            for document in collection.documents
        ],
    }


def get_collection(db, collection_id):
    collection = (
        db.query(Collection)
        .options(selectinload(Collection.documents))
        .filter(Collection.id == collection_id)
        .first()
    )

    if collection is None:
        raise HTTPException(
            status_code=404,
            detail="Collection not found.",
        )

    return collection


@router.post("", status_code=201)
def create_collection(request: CollectionCreate):
    name = request.name.strip()

    if not name:
        raise HTTPException(
            status_code=422,
            detail="Collection name cannot be blank.",
        )

    with SessionLocal() as db:
        collection = Collection(
            name=name,
            description=request.description,
        )

        db.add(collection)
        db.commit()

        collection = get_collection(db, collection.id)
        return serialize_collection(collection)


@router.get("")
def list_collections():
    with SessionLocal() as db:
        collections = (
            db.query(Collection)
            .options(selectinload(Collection.documents))
            .order_by(Collection.created_at.desc(), Collection.id.desc())
            .all()
        )

        return [
            serialize_collection(collection)
            for collection in collections
        ]


@router.get("/{collection_id}")
def read_collection(collection_id: int):
    with SessionLocal() as db:
        collection = get_collection(db, collection_id)
        return serialize_collection(collection)


@router.patch("/{collection_id}")
def update_collection(
    collection_id: int,
    request: CollectionUpdate,
):
    with SessionLocal() as db:
        collection = get_collection(db, collection_id)

        updates = request.model_dump(exclude_unset=True)

        if "name" in updates:
            name = updates["name"]

            if name is None or not name.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Collection name cannot be blank.",
                )

            collection.name = name.strip()

        if "description" in updates:
            collection.description = updates["description"]

        db.commit()

        collection = get_collection(db, collection_id)
        return serialize_collection(collection)


@router.delete("/{collection_id}")
def delete_collection(collection_id: int):
    with SessionLocal() as db:
        collection = get_collection(db, collection_id)

        db.delete(collection)
        db.commit()

        return {
            "message": "Collection deleted. Documents were preserved."
        }


@router.post(
    "/{collection_id}/documents/{document_id}",
    status_code=200,
)
def add_document_to_collection(
    collection_id: int,
    document_id: int,
):
    with SessionLocal() as db:
        collection = get_collection(db, collection_id)

        document = db.get(Document, document_id)

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Document not found.",
            )

        if any(
            existing.id == document_id
            for existing in collection.documents
        ):
            raise HTTPException(
                status_code=409,
                detail="Document already belongs to this collection.",
            )

        collection.documents.append(document)
        db.commit()

        collection = get_collection(db, collection_id)
        return serialize_collection(collection)


@router.delete("/{collection_id}/documents/{document_id}")
def remove_document_from_collection(
    collection_id: int,
    document_id: int,
):
    with SessionLocal() as db:
        collection = get_collection(db, collection_id)

        document = next(
            (
                item
                for item in collection.documents
                if item.id == document_id
            ),
            None,
        )

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Document is not in this collection.",
            )

        collection.documents.remove(document)
        db.commit()

        collection = get_collection(db, collection_id)
        return serialize_collection(collection)
