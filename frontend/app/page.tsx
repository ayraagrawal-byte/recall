
"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type Document = {
  id: number;
  filename: string;
  created_at: string;
};

type Citation = {
  filename: string;
  page: number | null;
};

type QueryResult = {
  answer: string;
  citations: Citation[];
};

const API_URL = "http://127.0.0.1:8000";

export default function Home() {
  // Document library
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState("");
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  // Question answering
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [queryError, setQueryError] = useState("");

  // PDF uploading
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load indexed documents when the dashboard opens.
  useEffect(() => {
    async function loadDocuments() {
      try {
        const response = await fetch(
          `${API_URL}/api/v1/documents`
        );

        if (!response.ok) {
          throw new Error("Failed to load documents.");
        }

        const data: Document[] = await response.json();

        setDocuments(data);
        setDocumentsError("");
      } catch {
        setDocumentsError(
          "Could not load documents. Check that FastAPI is running."
        );
      } finally {
        setLoadingDocuments(false);
      }
    }

    loadDocuments();
  }, []);

  // Upload a PDF and refresh the document library.
  async function handleUpload() {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please select a PDF file.");
      }

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `${API_URL}/api/v1/documents/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data.detail === "string"
            ? data.detail
            : "Upload failed.";

        throw new Error(message);
      }

      setUploadSuccess(
        `Successfully indexed ${data.filename}`
      );

      setSelectedFile(null);

      // Clear the native file input.
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Refresh the document library.
      try {
        const documentsResponse = await fetch(
          `${API_URL}/api/v1/documents`
        );

        if (!documentsResponse.ok) {
          throw new Error("Failed to refresh documents.");
        }

        const updatedDocuments: Document[] =
          await documentsResponse.json();

        setDocuments(updatedDocuments);
        setDocumentsError("");
      } catch {
        setDocumentsError(
          "The upload succeeded, but the document library could not refresh. Reload the page to try again."
        );
      }
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Could not upload the document."
      );
    } finally {
      setUploading(false);
    }
  }

  // Ask a question using Recall's RAG pipeline.
 
async function handleAsk(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const trimmedQuestion = question.trim();

  if (!trimmedQuestion || asking) return;

  setAsking(true);
  setQueryError("");
  setResult({
    answer: "",
    citations: [],
  });

  try {
    const response = await fetch(
      `${API_URL}/api/v1/query/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        "Recall could not answer your question."
      );
    }

    if (!response.body) {
      throw new Error("Streaming is not supported.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");

      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const event = JSON.parse(line);

        if (event.type === "token") {
          setResult((previous) => ({
            answer: (previous?.answer ?? "") + event.content,
            citations: previous?.citations ?? [],
          }));
        }

        if (event.type === "replace") {
          setResult((previous) => ({
            answer: event.content,
            citations: previous?.citations ?? [],
          }));
        }

        if (event.type === "citations") {
          setResult((previous) => ({
            answer: previous?.answer ?? "",
            citations: event.content,
          }));
        }

        if (event.type === "error") {
          throw new Error(event.content);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const event = JSON.parse(buffer);

      if (event.type === "error") {
        throw new Error(event.content);
      }

      if (event.type === "token") {
        setResult((previous) => ({
          answer: (previous?.answer ?? "") + event.content,
          citations: previous?.citations ?? [],
        }));
      }

      if (event.type === "replace") {
        setResult((previous) => ({
          answer: event.content,
          citations: previous?.citations ?? [],
        }));
      }

      if (event.type === "citations") {
        setResult((previous) => ({
          answer: previous?.answer ?? "",
          citations: event.content,
        }));
      }
    }
  } catch (error) {
    setQueryError(
      error instanceof Error
        ? error.message
        : "Something went wrong."
    );
  } finally {
    setAsking(false);
  }
}


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Recall.
            </h1>

            <p className="text-sm text-slate-500">
              Your research, remembered.
            </p>
          </div>

          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Research workspace
          </span>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section>
          <h2 className="text-3xl font-semibold tracking-tight">
            Your research workspace
          </h2>

          <p className="mt-2 text-slate-500">
            Upload research papers, ask questions, and find answers
            grounded in your documents.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* LEFT SIDEBAR */}
          <section className="space-y-6 lg:col-span-1">
            {/* PDF UPLOAD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">
                Upload a paper
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Add a PDF to your research library.
              </p>

              <label className="mt-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center hover:border-indigo-300">
                <span className="text-3xl">↑</span>

                <span className="mt-2 text-sm font-medium">
                  Choose a PDF
                </span>

                <span className="mt-1 max-w-full break-all text-xs text-slate-500">
                  {selectedFile?.name ?? "PDF files only"}
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={uploading}
                  className="hidden"
                  onChange={(event) => {
                    setSelectedFile(
                      event.target.files?.[0] ?? null
                    );
                    setUploadError("");
                    setUploadSuccess("");
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading
                  ? "Processing PDF..."
                  : "Upload document"}
              </button>

              {uploading && (
                <p
                  role="status"
                  className="mt-3 text-sm text-slate-500"
                >
                  Extracting text, generating embeddings,
                  and indexing your paper. This may take a while.
                </p>
              )}

              {uploadError && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600"
                >
                  {uploadError}
                </p>
              )}

              {uploadSuccess && (
                <p
                  role="status"
                  className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700"
                >
                  {uploadSuccess}
                </p>
              )}
            </div>

            {/* DOCUMENT LIBRARY */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Your documents
                </h3>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {documents.length}
                </span>
              </div>

              {documentsError && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {documentsError}
                </p>
              )}

              {loadingDocuments ? (
                <p className="mt-5 text-sm text-slate-500">
                  Loading documents...
                </p>
              ) : documents.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">
                  Your indexed papers will appear here.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {documents.map((document) => (
                    <li
                      key={document.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <span className="text-lg">📄</span>

                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-slate-800">
                          {document.filename}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Indexed document
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* QUESTION AREA */}
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="text-xl font-semibold">
                Ask Recall
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Get answers supported by your research papers.
              </p>

              <form
                className="mt-6 space-y-4"
                onSubmit={handleAsk}
              >
                <textarea
                  value={question}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  placeholder="What did the researchers find?"
                  rows={4}
                  maxLength={2000}
                  disabled={asking}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm outline-none transition-colors focus:border-indigo-500 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={!question.trim() || asking}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {asking
                    ? "Searching your research..."
                    : "Ask question →"}
                </button>
              </form>

              {asking && (
                <p
                  role="status"
                  className="mt-4 text-sm text-slate-500"
                >
                  Retrieving relevant passages and generating your answer...
                </p>
              )}

              {queryError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600"
                >
                  {queryError}
                </p>
              )}

              {/* ANSWER */}
              <div
                className="mt-8 border-t border-slate-100 pt-6"
                aria-live="polite"
              >
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  Answer
                </h4>

                {result ? (
                  <div className="mt-4 space-y-5">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {result.answer}
                    </p>

                    {result.citations.length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold">
                          Sources
                        </h5>

                        <ul className="mt-2 space-y-2">
                          {result.citations.map(
                            (citation, index) => (
                              <li
                                key={`${citation.filename}-${citation.page}-${index}`}
                                className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800"
                              >
                                {citation.filename}

                                {citation.page !== null
                                  ? ` — Page ${citation.page}`
                                  : ""}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    {asking
                      ? "Preparing your answer..."
                      : "Your answer and supporting citations will appear here."}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
