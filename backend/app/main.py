
import json
import os
import shutil
import tempfile
import requests
from pathlib import Path
from app.comparison import compare_papers

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.conversations import router as conversations_router
from app.conversation_memory import prepare_retrieval_question
from app.database import SessionLocal
from app.ingestion import ingest_document
from app.models import Document, Conversation, Message, utc_now
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
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(conversations_router)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None


class Citation(BaseModel):
    filename: str
    page: int | None
    evidence: str | None = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]

class CompareRequest(BaseModel):
    document_ids: list[int] = Field(min_length=2, max_length=2)


class ComparisonSection(BaseModel):
    answer: str
    citations: list[Citation]


class CompareResponse(BaseModel):
    paper_a: dict
    paper_b: dict
    sections: dict[str, ComparisonSection]

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

    try:
        result = answer_question(question)

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

            # Use the existing RAG pipeline.
            for event in stream_answer(retrieval_question):
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


@app.post(
    "/api/v1/compare",
    response_model=CompareResponse,
)
def compare_documents(request: CompareRequest):
    first_id, second_id = request.document_ids

    if first_id == second_id:
        raise HTTPException(
            status_code=400,
            detail="Select two different papers.",
        )

    with SessionLocal() as db:
        first = db.get(Document, first_id)
        second = db.get(Document, second_id)

        if first is None or second is None:
            raise HTTPException(
                status_code=404,
                detail="One or both papers were not found.",
            )

        paper_a = {
            "id": first.id,
            "filename": first.filename,
        }

        paper_b = {
            "id": second.id,
            "filename": second.filename,
        }

    try:
        return compare_papers(paper_a, paper_b)

    except requests.RequestException:
        raise HTTPException(
            status_code=503,
            detail=(
                "The local Ollama model is unavailable "
                "or the comparison timed out."
            ),
        )
