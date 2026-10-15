<div align="center">

# recall.

### Research answers you can trace back to the source.

A full-stack research workspace that combines retrieval-augmented generation (RAG), hybrid document search, and a source-linked PDF reader. Upload papers, ask research questions, and inspect the evidence behind each answer.

**[Explore the controlled demo](https://recall-research-workspace-demo.vercel.app)** Â· **[Inside Recall: AI execution replay](https://recall-research-workspace-demo.vercel.app/inside-recall)**

</div>

> **Demo vs. live system:** The public Vercel experience is a controlled portfolio demo with fictional sample PDFs and an authentic **recorded** RAG execution. It does **not** run live Ollama inference or accept public uploads. The complete RAG pipeline runs locally with FastAPI, PostgreSQL/pgvector, and Ollama.

## Why Recall?

Reading research papers often means moving between PDFs, notes, search results, and AI-generated summaries, with no easy way to verify where a claim came from. Recall keeps the research workflow in one place: ask a question, inspect the relevant source passages, and open the cited PDF page directly from the answer.

## Features

| Research workspace | AI and evidence workflow |
| --- | --- |
| PDF upload, ingestion, and searchable document library | Hybrid retrieval using vector search and BM25 |
| Research collections and collection-scoped questions | Query expansion and cross-encoder reranking |
| Multi-turn conversations and saved history | Ollama-generated answers streamed to the interface |
| Research notes and citation bookmarks | Source citations linked to an integrated PDF evidence reader |
| Light, dark, and system appearance | **Inside Recall:** interactive replay of a captured RAG execution |

### Inside Recall: an inspectable AI pipeline

The portfolio demo includes an interactive execution explorer with five stages:

1. **Question:** the input sent to Recall.
2. **Retrieval:** the ranked chunks selected from the indexed PDFs, including available vector/BM25 ranks and recorded reranker scores.
3. **Context:** the source excerpts supplied to the language model.
4. **Generation:** a time-based replay of actual recorded output events.
5. **Evidence:** supporting citations and links to the sample PDFs.

This is a replay of a real local run, **not** a live query or a simulation of the model's private reasoning. The bundled sample documents are explicitly fictional teaching examples, not published scientific studies. Scores and timings are shown only when recorded, not invented.

## Architecture

```mermaid
flowchart TD
    U[Researcher] --> UI[Next.js + React + TypeScript]
    UI --> API[FastAPI]
    API --> INGEST[PDF parsing and chunking]
    INGEST --> EMB[Sentence embeddings]
    EMB --> DB[(PostgreSQL + pgvector)]
    API --> Q[Question and collection scope]
    Q --> V[Vector retrieval]
    Q --> BM[Expanded-query BM25]
    V --> R[Merge candidates + cross-encoder rerank]
    BM --> R
    R --> CTX[Selected evidence + grounded prompt]
    CTX --> LLM[Ollama / gemma3:4b]
    LLM --> API
    API --> UI
    UI --> PDF[Source-linked PDF viewer]
```

For the public demo, the Next.js frontend uses curated example data and bundled PDFs. The **Inside Recall** page loads a sanitized JSON capture of a real local execution and replays it in-browser; no hosted model, public database, or public document ingestion endpoint is required.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| API | Python, FastAPI, streaming responses |
| Database | PostgreSQL 16, pgvector, SQLAlchemy |
| Retrieval | Sentence Transformers, semantic vector search, BM25, query expansion, cross-encoder reranking |
| PDF processing | PyMuPDF for extraction, React-PDF / PDF.js for viewing |
| Generation | Ollama, `gemma3:4b` in the current backend configuration |
| Development & testing | Docker Compose, pytest, TypeScript, Next.js build |
| Public demo hosting | Vercel (frontend-only, controlled mode) |

## Local setup

**Prerequisites:** Python, Node.js/npm, Docker Desktop with Docker Compose, and [Ollama](https://ollama.com/). A machine capable of running the local language model is required for live generation.

```powershell
# Clone the repository and switch to the live-development branch
git clone https://github.com/ayraagrawal-byte/recall.git
cd recall
git switch recall-2.0

# Start PostgreSQL with the pgvector extension
docker compose up -d
```

Create `backend/.env` using the credentials and database name defined in `docker-compose.yml` (do not commit this file):

```env
DATABASE_URL=postgresql+psycopg://recall:recall@localhost:5432/recall
```

Then install backend dependencies and create the schema:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python create_tables.py
python create_chat_tables.py

# In a separate terminal: pull the model used in the checked-in RAG module
ollama pull gemma3:4b

# Start the API from the backend directory
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```powershell
cd frontend
npm install
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000"
Remove-Item Env:NEXT_PUBLIC_RECALL_MODE -ErrorAction SilentlyContinue
npm run dev
```

Open `http://localhost:3000`. The live API is available at `http://127.0.0.1:8000/docs` when the backend is running. The example database credentials above are **local development credentials only**; use unique, secret credentials for any real deployment.

### Run the controlled demo locally

```powershell
cd frontend
$env:NEXT_PUBLIC_RECALL_MODE = "demo"
Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
npm run dev
```

In demo mode, visitors explore preloaded content without needing FastAPI, PostgreSQL, or Ollama. The execution replay is at `/inside-recall`.

## Tests

Run backend tests from the backend directory:

```powershell
cd backend
pytest -q
```

Check the frontend from `frontend/`:

```powershell
npx tsc --noEmit
npm run build
```

> Commands and infrastructure requirements above describe the checked-in repository. Depending on your local environment, database extensions or schema setup may need additional configuration.

## Repository layout

```text
recall/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ app/                 # FastAPI, ingestion, retrieval, RAG, research tools
â”‚   â”œâ”€â”€ tests/               # Backend tests
â”‚   â””â”€â”€ requirements.txt
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ app/                 # Research Index, Library, Desk, Inside Recall
â”‚   â””â”€â”€ public/
â”‚       â”œâ”€â”€ demo-papers/     # Fictional, shareable example PDFs
â”‚       â””â”€â”€ demo-traces/     # Approved execution replay and index
â””â”€â”€ docker-compose.yml      # Local PostgreSQL + pgvector
```

## Privacy and demo limitations

- Public demo documents are fictional examples and must not be confused with real research findings.
- Public AI responses are curated examples or **recorded** executions; arbitrary prompts do not trigger live model inference.
- Public file uploading is disabled. Local mode supports ingestion of user-supplied PDFs.
- Do not commit `.env`, research uploads, database files, API keys, or unapproved trace captures.
- The local development API and Docker database are **not production-hardened**; protect them with authentication, authorization, and network restrictions before exposing them publicly.

## Roadmap

The core research experience and controlled portfolio demo are implemented. Possible future improvements include authenticated multi-user access, evaluation dashboards, and secured, rate-limited live AI hosting. These are not part of the current public demo.

---

<div align="center">

**recall.** â€” Your research, remembered.

</div>
