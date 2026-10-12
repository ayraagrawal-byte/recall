
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

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
};

type Conversation = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

type ConversationDetail = Conversation & {
  messages: Message[];
};

type ChatItem = {
  key: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

type StreamEvent =
  | { type: "token"; content: string }
  | { type: "replace"; content: string }
  | { type: "citations"; content: Citation[] }
  | { type: "saved"; conversation_id: number }
  | { type: "error"; content: string };

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsError, setDocumentsError] = useState("");
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  const [conversations, setConversations] = useState<
    Conversation[]
  >([]);
  const [activeConversationId, setActiveConversationId] =
    useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [queryError, setQueryError] = useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages]);

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

  async function loadConversations() {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/conversations`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to load conversations.");
      }

      const data: Conversation[] = await response.json();
      setConversations(data);
      setHistoryError("");
      return data;
    } catch {
      setHistoryError(
        "Could not load chat history. Check that FastAPI is running."
      );
      return null;
    } finally {
      setLoadingHistory(false);
    }
  }

  async function openConversation(
    conversationId: number
  ) {
    if (asking) return;

    const requestId = ++requestIdRef.current;

    setActiveConversationId(conversationId);
    activeIdRef.current = conversationId;
    setMessages([]);
    setQuestion("");
    setQueryError("");

    try {
      const response = await fetch(
        `${API_URL}/api/v1/conversations/${conversationId}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Could not open conversation.");
      }

      const data: ConversationDetail =
        await response.json();

      if (requestId !== requestIdRef.current) return;

      setMessages(
        data.messages.map((message) => ({
          key: `saved-${message.id}`,
          role: message.role,
          content: message.content,
          citations: message.citations ?? [],
        }))
      );
    } catch {
      if (requestId === requestIdRef.current) {
        setQueryError("Could not load this conversation.");
      }
    }
  }

  useEffect(() => {
    async function initialize() {
      await loadDocuments();

      const chats = await loadConversations();

      if (!chats) return;

      const savedId = window.localStorage.getItem(
        "recall-active-conversation"
      );

      const preferredId = savedId
        ? Number(savedId)
        : null;

      const selected =
        chats.find(
          (chat) => chat.id === preferredId
        ) ?? null;

      if (selected) {
        await openConversation(selected.id);
      }
    }

    initialize();
    // Initial loading only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNewChat() {
    if (asking) return;

    requestIdRef.current += 1;
    activeIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    setQuestion("");
    setQueryError("");

    window.localStorage.removeItem(
      "recall-active-conversation"
    );
  }

  async function handleDeleteChat(
    conversationId: number
  ) {
    if (asking) return;

    const confirmed = window.confirm(
      "Delete this conversation and all its messages?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/api/v1/conversations/${conversationId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Could not delete conversation.");
      }

      setConversations((previous) =>
        previous.filter(
          (chat) => chat.id !== conversationId
        )
      );

      if (activeIdRef.current === conversationId) {
        handleNewChat();
      }
    } catch {
      setHistoryError(
        "Could not delete the conversation."
      );
    }
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      if (
        !selectedFile.name
          .toLowerCase()
          .endsWith(".pdf")
      ) {
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
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Upload failed."
        );
      }

      setUploadSuccess(
        `Successfully indexed ${data.filename}`
      );

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadDocuments();
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

  async function handleAsk(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || asking) return;

    const conversationId = activeIdRef.current;
    const userKey = `pending-user-${Date.now()}`;
    const assistantKey = `pending-assistant-${Date.now()}`;

    setAsking(true);
    setQueryError("");
    setQuestion("");

    setMessages((previous) => [
      ...previous,
      {
        key: userKey,
        role: "user",
        content: trimmedQuestion,
        citations: [],
      },
      {
        key: assistantKey,
        role: "assistant",
        content: "",
        citations: [],
      },
    ]);

    let savedConversationId: number | null = null;
    let streamError = false;

    function updateAssistant(
      updater: (message: ChatItem) => ChatItem
    ) {
      setMessages((previous) =>
        previous.map((message) =>
          message.key === assistantKey
            ? updater(message)
            : message
        )
      );
    }

    function processEvent(event: StreamEvent) {
      if (event.type === "token") {
        updateAssistant((message) => ({
          ...message,
          content: message.content + event.content,
        }));
      }

      if (event.type === "replace") {
        updateAssistant((message) => ({
          ...message,
          content: event.content,
        }));
      }

      if (event.type === "citations") {
        updateAssistant((message) => ({
          ...message,
          citations: event.content,
        }));
      }

      if (event.type === "saved") {
        savedConversationId = event.conversation_id;
      }

      if (event.type === "error") {
        streamError = true;
        throw new Error(event.content);
      }
    }

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
            conversation_id: conversationId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Recall could not answer your question."
        );
      }

      if (!response.body) {
        throw new Error(
          "Streaming is not supported."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          processEvent(
            JSON.parse(line) as StreamEvent
          );
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        processEvent(
          JSON.parse(buffer) as StreamEvent
        );
      }

      if (savedConversationId === null) {
        throw new Error(
          "The answer was generated but its save was not confirmed."
        );
      }

      const confirmedId: number =
        savedConversationId;

      activeIdRef.current = confirmedId;
      setActiveConversationId(confirmedId);

      window.localStorage.setItem(
        "recall-active-conversation",
        String(confirmedId)
      );

      await loadConversations();
    } catch (error) {
      setQueryError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

      if (savedConversationId === null) {
        updateAssistant((message) => ({
          ...message,
          content:
            message.content ||
            "The answer could not be completed.",
        }));
      }

      if (streamError) {
        console.error(
          "Recall streaming error."
        );
      }
    } finally {
      setAsking(false);
    }
  }

  function renderCitations(
    citations: Citation[]
  ) {
    if (citations.length === 0) return null;

    return (
      <div className="mt-4">
        <h5 className="text-sm font-semibold text-slate-700">
          Sources
        </h5>

        <ul className="mt-2 space-y-2">
          {citations.map((citation, index) => {
            const document = documents.find(
              (doc) =>
                doc.filename === citation.filename
            );

            const pdfUrl = document
              ? `${API_URL}/api/v1/documents/${document.id}/pdf${
                  citation.page !== null
                    ? `#page=${citation.page}`
                    : ""
                }`
              : null;

            return (
              <li
                key={`${citation.filename}-${citation.page}-${index}`}
              >
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800 transition-colors hover:bg-indigo-100"
                  >
                    <span className="break-all">
                      {citation.filename}
                      {citation.page !== null
                        ? ` — Page ${citation.page}`
                        : ""}
                    </span>

                    <span className="ml-3">
                      ↗
                    </span>
                  </a>
                ) : (
                  <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-500">
                    {citation.filename}
                    {citation.page !== null
                      ? ` — Page ${citation.page}`
                      : ""}
                    {" (document unavailable)"}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
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

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* CHAT HISTORY SIDEBAR */}
          <aside className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <button
                type="button"
                onClick={handleNewChat}
                disabled={asking}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                + New chat
              </button>

              <div className="mt-6 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Recent chats
                </h2>
                <span className="text-xs text-slate-400">
                  {conversations.length}
                </span>
              </div>

              {historyError && (
                <p className="mt-3 text-xs text-red-600">
                  {historyError}
                </p>
              )}

              {loadingHistory ? (
                <p className="mt-4 text-sm text-slate-500">
                  Loading chats...
                </p>
              ) : conversations.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Your saved conversations will appear here.
                </p>
              ) : (
                <ul className="mt-4 max-h-[450px] space-y-2 overflow-y-auto">
                  {conversations.map(
                    (conversation) => (
                      <li
                        key={conversation.id}
                        className={`flex items-center gap-2 rounded-xl p-2 ${
                          activeConversationId ===
                          conversation.id
                            ? "bg-indigo-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={asking}
                          onClick={() => {
                            window.localStorage.setItem(
                              "recall-active-conversation",
                              String(conversation.id)
                            );

                            openConversation(
                              conversation.id
                            );
                          }}
                          className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 disabled:opacity-50"
                          title={conversation.title}
                        >
                          {conversation.title}
                        </button>

                        <button
                          type="button"
                          disabled={asking}
                          onClick={() =>
                            handleDeleteChat(
                              conversation.id
                            )
                          }
                          className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Delete ${conversation.title}`}
                          title="Delete conversation"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </aside>

          {/* MAIN CHAT AREA */}
          <section className="lg:col-span-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-xl font-semibold">
                  Ask Recall
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ask questions grounded in your research papers.
                </p>
              </div>

              <div
                className="mt-5 min-h-[300px] max-h-[550px] space-y-5 overflow-y-auto pr-1"
                aria-live="polite"
              >
                {messages.length === 0 ? (
                  <div className="flex min-h-[250px] flex-col items-center justify-center text-center">
                    <div className="mb-3 text-3xl">
                      ✦
                    </div>
                    <h3 className="text-lg font-semibold">
                      What would you like to research?
                    </h3>
                    <p className="mt-2 max-w-xs text-sm text-slate-500">
                      Ask a question about your uploaded PDFs.
                      Your answers and citations will be saved here.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.key}
                      className={
                        message.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      <div
                        className={`max-w-full rounded-2xl px-4 py-3 ${
                          message.role === "user"
                            ? "bg-indigo-600 text-white"
                            : "w-full bg-slate-50 text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm leading-7">
                          {message.content ||
                            (asking
                              ? "Generating answer..."
                              : "")}
                        </p>

                        {message.role ===
                          "assistant" &&
                          renderCitations(
                            message.citations
                          )}
                      </div>
                    </div>
                  ))
                )}

                <div ref={bottomRef} />
              </div>

              {queryError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600"
                >
                  {queryError}
                </p>
              )}

              <form
                onSubmit={handleAsk}
                className="mt-5 border-t border-slate-100 pt-5"
              >
                <textarea
                  value={question}
                  onChange={(event) =>
                    setQuestion(event.target.value)
                  }
                  placeholder="Ask about your research..."
                  rows={3}
                  maxLength={2000}
                  disabled={asking}
                  className="w-full resize-none rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-500 disabled:opacity-60"
                />

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {asking
                      ? "Searching and generating..."
                      : "Answers are grounded in your PDFs"}
                  </span>

                  <button
                    type="submit"
                    disabled={
                      asking || !question.trim()
                    }
                    className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {asking
                      ? "Thinking..."
                      : "Ask Recall →"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* DOCUMENT LIBRARY */}
          <aside className="space-y-6 lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Upload a paper
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Add a PDF to your research library.
              </p>

              <label className="mt-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center hover:border-indigo-300">
                <span className="text-2xl">
                  ↑
                </span>
                <span className="mt-2 text-sm font-medium">
                  Choose a PDF
                </span>
                <span className="mt-1 max-w-full break-all text-xs text-slate-500">
                  {selectedFile?.name ??
                    "PDF files only"}
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={uploading}
                  className="hidden"
                  onChange={(event) => {
                    setSelectedFile(
                      event.target.files?.[0] ??
                        null
                    );
                    setUploadError("");
                    setUploadSuccess("");
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleUpload}
                disabled={
                  !selectedFile || uploading
                }
                className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading
                  ? "Processing PDF..."
                  : "Upload document"}
              </button>

              {uploading && (
                <p className="mt-3 text-sm text-slate-500">
                  Extracting text, generating embeddings,
                  and indexing your paper...
                </p>
              )}

              {uploadError && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {uploadError}
                </p>
              )}

              {uploadSuccess && (
                <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  {uploadSuccess}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Your documents
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {documents.length}
                </span>
              </div>

              {documentsError && (
                <p className="mt-4 text-sm text-red-600">
                  {documentsError}
                </p>
              )}

              {loadingDocuments ? (
                <p className="mt-4 text-sm text-slate-500">
                  Loading documents...
                </p>
              ) : documents.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No documents uploaded yet.
                </p>
              ) : (
                <ul className="mt-4 max-h-[450px] space-y-2 overflow-y-auto">
                  {documents.map((document) => (
                    <li
                      key={document.id}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="break-all text-sm font-medium text-slate-700">
                        {document.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Indexed document
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
