import os
import shutil
import tempfile
from fastapi.middleware.cors import CORSMiddleware
import json

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from app.rag import stream_answer

from app.database import SessionLocal
from app.ingestion import ingest_document
from app.models import Document
from app.rag import answer_question

app = FastAPI(
    title="Recall API",
    description="Ask questions about indexed research papers.",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

class Citation(BaseModel):
    filename: str
    page: int | None


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
                "created_at": document.created_at
            }
            for document in documents
        ]

    finally:
        db.close()

@app.post("/api/v1/documents/upload")
def upload_document(file: UploadFile = File(...)):
    # Make sure the uploaded file has a filename.
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="A filename is required."
        )

    # Only allow PDF files.
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    # Check whether a document with this filename already exists.
    db = SessionLocal()

    try:
        existing_document = (
            db.query(Document)
            .filter(Document.filename == file.filename)
            .first()
        )
    finally:
        db.close()

    if existing_document:
        raise HTTPException(
            status_code=409,
            detail=f"A document named '{file.filename}' is already indexed."
        )

    temp_path = None

    try:
        # Save the uploaded PDF temporarily.
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".pdf"
        ) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name

        # Extract, chunk, embed, and store the document.
        document_id = ingest_document(temp_path)

        # ingest_document() sees the temporary filename,
        # so replace it with the user's original filename.
        db = SessionLocal()

        try:
            document = db.get(Document, document_id)

            if document is None:
                raise RuntimeError(
                    "Document was not found after ingestion."
                )

            document.filename = file.filename
            db.commit()

        finally:
            db.close()

        return {
            "id": document_id,
            "filename": file.filename,
            "status": "indexed"
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {error}"
        )

    finally:
        file.file.close()

        # Always remove the temporary PDF.
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)     


@app.post("/api/v1/query", response_model=QueryResponse)
def query_recall(request: QueryRequest):

    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    try:
        result = answer_question(question)

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Recall could not generate an answer. Please try again."
        )

    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"]
    )


@app.post("/api/v1/query/stream")
def query_recall_stream(request: QueryRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    def event_generator():
        try:
            for event in stream_answer(question):
                yield json.dumps(event) + "\n"
        except Exception:
            yield json.dumps({
                "type": "error",
                "content": "Recall could not generate an answer."
            }) + "\n"

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"}
    )
