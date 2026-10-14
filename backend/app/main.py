
import json
import os
import shutil
import tempfile
import requests
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.conversations import router as conversations_router
from app.collections import router as collections_router
from app.conversation_memory import prepare_retrieval_question
from app.database import SessionLocal
from app.ingestion import ingest_document
from app.models import Document, Collection, Conversation, Message, utc_now
from app.rag import answer_question, stream_answer


# Store uploaded PDFs outside the app source directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


app = FastAPI(
    title="Recall API",
    description="Ask questions about indexed research papers.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(conversations_router)
app.include_router(collections_router)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
    collection_id: int | None = Field(default=None, gt=0)


class Citation(BaseModel):
    filename: str
    page: int | None
    evidence: str | None = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]

@app.get("/")
def root():
    return {"message": "Recall API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/api/v1/documents")
def list_documents():
    db = SessionLocal()

    try:
        documents = db.query(Document).all()

        return [
            {
                "id": document.id,
                "filename": document.filename,
                "created_at": document.created_at,
            }
            for document in documents
        ]

    finally:
        db.close()


@app.post("/api/v1/documents/upload")
def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="A filename is required.",
        )

    original_filename = Path(
        file.filename.replace("\\", "/")
    ).name

    if not original_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    # Check for an existing document.
    db = SessionLocal()

    try:
        existing_document = (
            db.query(Document)
            .filter(Document.filename == original_filename)
            .first()
        )

    finally:
        db.close()

    if existing_document:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A document named '{original_filename}' "
                "is already indexed."
            ),
        )

    temp_path = None
    document_id = None

    try:
        # Save the incoming PDF temporarily for ingestion.
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".pdf",
        ) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name

        # Confirm the file is actually a PDF.
        with open(temp_path, "rb") as pdf_file:
            if pdf_file.read(5) != b"%PDF-":
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded file is not a valid PDF.",
                )

        # Preserve the existing ingestion pipeline.
        document_id = ingest_document(temp_path)

        # Store the original PDF using its database ID.
        permanent_path = UPLOAD_DIR / f"{document_id}.pdf"
        shutil.copy2(temp_path, permanent_path)

        # Replace the temporary filename in the database.
        db = SessionLocal()

        try:
            document = db.get(Document, document_id)

            if document is None:
                raise RuntimeError(
                    "Document was not found after ingestion."
                )

            document.filename = original_filename
            db.commit()

        finally:
            db.close()

        return {
            "id": document_id,
            "filename": original_filename,
            "status": "indexed",
        }

    except HTTPException:
        raise

    except Exception:
        # Remove an orphaned stored file if an error occurred.
        if document_id is not None:
            stored_path = UPLOAD_DIR / f"{document_id}.pdf"

            if stored_path.exists():
                stored_path.unlink()

        raise HTTPException(
            status_code=500,
            detail="Failed to process PDF.",
        )

    finally:
        file.file.close()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/v1/documents/{document_id}/pdf")
def view_document_pdf(document_id: int):
    db = SessionLocal()

    try:
        document = db.get(Document, document_id)

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Document not found.",
            )

        filename = document.filename

    finally:
        db.close()

    pdf_path = UPLOAD_DIR / f"{document_id}.pdf"

    if not pdf_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "The original PDF is not available for "
                "this document. It may have been indexed "
                "before permanent PDF storage was enabled."
            ),
        )

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="inline",
    )


def resolve_collection_document_ids(collection_id: int | None):
    """
    None means unrestricted search.
    An empty list means the collection has no documents.
    """
    if collection_id is None:
        return None

    with SessionLocal() as db:
        collection = db.get(Collection, collection_id)

        if collection is None:
            raise HTTPException(
                status_code=404,
                detail="Collection not found.",
            )

        document_ids = [
            document.id
            for document in collection.documents
        ]

        if not document_ids:
            raise HTTPException(
                status_code=400,
                detail="This collection contains no documents.",
            )

        return document_ids


@app.post(
    "/api/v1/query",
    response_model=QueryResponse,
    response_model_exclude_none=True,
)
def query_recall(request: QueryRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    document_ids = resolve_collection_document_ids(
        request.collection_id
    )

    try:
        if document_ids is None:
            result = answer_question(question)
        else:
            result = answer_question(
                question,
                document_ids=document_ids,
            )

    except Exception:
        raise HTTPException(
            status_code=503,
            detail=(
                "Recall could not generate an answer. "
                "Please try again."
            ),
        )

    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"],
    )


@app.post("/api/v1/query/stream")
def query_recall_stream(request: QueryRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    document_ids = resolve_collection_document_ids(
        request.collection_id
    )

    # Validate the conversation before starting the stream.
    if request.conversation_id is not None:
        with SessionLocal() as db:
            conversation = db.get(
                Conversation,
                request.conversation_id,
            )

            if conversation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found.",
                )

    def event_generator():
        answer_parts = []
        citations = []
        completed = False

        try:
            # Rewrite follow-up questions using saved history.
            retrieval_question = prepare_retrieval_question(
                question,
                request.conversation_id,
            )

            # Preserve the original behavior when no collection is selected.
            if document_ids is None:
                rag_events = stream_answer(retrieval_question)
            else:
                rag_events = stream_answer(
                    retrieval_question,
                    document_ids=document_ids,
                )

            for event in rag_events:
                event_type = event.get("type")
                content = event.get("content")

                if event_type == "token":
                    answer_parts.append(content)

                elif event_type == "replace":
                    answer_parts = [content]

                elif event_type == "citations":
                    citations = content
                    completed = True

                yield json.dumps(event) + "\n"

            # Save only after generation completes successfully.
            if completed:
                final_answer = "".join(answer_parts).strip()

                if final_answer:
                    with SessionLocal() as db:
                        if request.conversation_id is None:
                            conversation = Conversation(
                                title=question[:255],
                            )
                            db.add(conversation)
                            db.flush()
                        else:
                            conversation = db.get(
                                Conversation,
                                request.conversation_id,
                            )

                            if conversation is None:
                                raise RuntimeError(
                                    "Conversation no longer exists."
                                )

                            if conversation.title == "New conversation":
                                conversation.title = question[:255]

                        db.add_all([
                            Message(
                                conversation_id=conversation.id,
                                role="user",
                                content=question,
                                citations=[],
                            ),
                            Message(
                                conversation_id=conversation.id,
                                role="assistant",
                                content=final_answer,
                                citations=citations,
                            ),
                        ])

                        conversation.updated_at = utc_now()
                        db.commit()
                        conversation_id = conversation.id

                    yield json.dumps({
                        "type": "saved",
                        "conversation_id": conversation_id,
                    }) + "\n"

        except Exception:
            yield json.dumps({
                "type": "error",
                "content": (
                    "Recall could not complete or save this answer. "
                    "Please try again."
                ),
            }) + "\n"

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )
