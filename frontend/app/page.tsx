
"use client";

import dynamic from "next/dynamic";
import CollectionManager from "./components/CollectionManager";
import ResearchNotes from "./components/ResearchNotes";
import SavedBookmarks from "./components/SavedBookmarks";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

const PdfEvidenceViewer = dynamic(
  () => import("./components/PdfEvidenceViewer"),
  { ssr: false }
);

type Paper = {
  id: number;
  filename: string;
  created_at: string;
};

type ResearchCollection = {
  id: number;
  name: string;
  description: string | null;
  document_count: number;
  documents: {
    id: number;
    filename: string;
  }[];
};

type Citation = {
  filename: string;
  page: number | null;
  evidence?: string | null;
};

type SavedMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

type Conversation = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
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

type View = "overview" | "library" | "ask";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const ACTIVE_KEY = "recall-active-conversation";

const viewTitle: Record<View, string> = {
  overview: "Research overview",
  library: "Paper library",
  ask: "Ask Recall",
};

function dateLabel(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Recently added"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e1e7dd] bg-white p-6">
      <div className="text-xs font-medium text-stone-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-[#183e2c]">
        {value}
      </div>
      <div className="mt-2 text-xs text-stone-400">
        {note}
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");

  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<number | null>(null);
  const [collectionError, setCollectionError] = useState("");
  const [loadingCollections, setLoadingCollections] = useState(true);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperError, setPaperError] = useState("");
  const [loadingPapers, setLoadingPapers] = useState(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [queryError, setQueryError] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [search, setSearch] = useState("");

  const [bookmarkSavingKey, setBookmarkSavingKey] = useState<string | null>(null);
  const [bookmarkSavedKeys, setBookmarkSavedKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [bookmarkError, setBookmarkError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [bookmarkRefreshToken, setBookmarkRefreshToken] = useState(0);

  const [openEvidence, setOpenEvidence] = useState<{
    paper: Paper;
    citation: Citation;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const askingRef = useRef(false);
  const collectionConversationIdRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadCollections() {
      try {
        const response = await fetch(`${API}/api/v1/collections`);
        if (!response.ok) {
          throw new Error("Could not load collections.");
        }

        const data: ResearchCollection[] = await response.json();
        setCollections(data);
      } catch (error) {
        setCollectionError(
          error instanceof Error ? error.message : "Collections unavailable."
        );
      } finally {
        setLoadingCollections(false);
      }
    }

    void loadCollections();
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages]);

  async function loadPapers() {
    try {
      const response = await fetch(`${API}/api/v1/documents`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load papers");
      }

      const data = (await response.json()) as Paper[];
      setPapers(data);
      setPaperError("");
    } catch {
      setPaperError(
        "Unable to load papers. Check that the Recall API is running."
      );
    } finally {
      setLoadingPapers(false);
    }
  }

  async function loadConversations() {
    try {
      const response = await fetch(`${API}/api/v1/conversations`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load conversations");
      }

      const data = (await response.json()) as Conversation[];

      setConversations(data);
      setHistoryError("");

      return data;
    } catch {
      setHistoryError("Unable to load research history.");
      return null;
    } finally {
      setLoadingHistory(false);
    }
  }

  async function openConversation(id: number) {
    if (askingRef.current) return;

    collectionConversationIdRef.current = null;
    setSelectedCollectionId(null);

    const requestId = ++requestIdRef.current;

    activeIdRef.current = id;
    setActiveId(id);
    setMessages([]);
    setQuestion("");
    setQueryError("");
    setView("ask");

    window.localStorage.setItem(ACTIVE_KEY, String(id));

    try {
      const response = await fetch(
        `${API}/api/v1/conversations/${id}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to open conversation");
      }

      const data = (await response.json()) as Conversation & {
        messages: SavedMessage[];
      };

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
        setQueryError("Unable to open this conversation.");
      }
    }
  }

  useEffect(() => {
    async function initialize() {
      await Promise.all([
        loadPapers(),
        loadConversations().then((chats) => {
          if (!chats) return;

          const saved = window.localStorage.getItem(ACTIVE_KEY);
          const id = saved ? Number(saved) : null;

          if (
            id !== null &&
            chats.some((conversation) => conversation.id === id)
          ) {
            void openConversation(id);
          }
        }),
      ]);
    }

    void initialize();
    // Initialization is intentionally one-time.
  }, []);

  function newChat() {
    if (askingRef.current) return;

    collectionConversationIdRef.current = null;

    requestIdRef.current += 1;
    activeIdRef.current = null;

    setActiveId(null);
    setMessages([]);
    setQuestion("");
    setQueryError("");
    setView("ask");

    window.localStorage.removeItem(ACTIVE_KEY);
  }

  async function deleteChat(id: number) {
    if (askingRef.current) return;

    if (
      !window.confirm(
        "Delete this conversation and all its messages?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/v1/conversations/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== id)
      );

      if (activeIdRef.current === id) {
        newChat();
      }
    } catch {
      setHistoryError("Could not delete this conversation.");
    }
  }

  async function uploadPaper() {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Choose a PDF file.");
      }

      const form = new FormData();
      form.append("file", selectedFile);

      const response = await fetch(
        `${API}/api/v1/documents/upload`,
        {
          method: "POST",
          body: form,
        }
      );

      const data = (await response.json()) as {
        detail?: string;
        filename?: string;
      };

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      setUploadSuccess(
        `${data.filename || selectedFile.name} is indexed and ready.`
      );

      setSelectedFile(null);

      if (fileRef.current) {
        fileRef.current.value = "";
      }

      await loadPapers();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = question.trim();

    if (!text || askingRef.current) return;

    const conversationId =
      selectedCollectionId === null
        ? activeIdRef.current
        : collectionConversationIdRef.current;
    const userKey = `user-${Date.now()}`;
    const assistantKey = `assistant-${Date.now()}`;

    askingRef.current = true;
    setAsking(true);
    setQueryError("");
    setQuestion("");

    setMessages((previous) => [
      ...previous,
      {
        key: userKey,
        role: "user",
        content: text,
        citations: [],
      },
      {
        key: assistantKey,
        role: "assistant",
        content: "",
        citations: [],
      },
    ]);

    let savedId: number | null = null;

    function updateAssistant(
      update: (message: ChatItem) => ChatItem
    ) {
      setMessages((previous) =>
        previous.map((message) =>
          message.key === assistantKey
            ? update(message)
            : message
        )
      );
    }

    function processEvent(item: StreamEvent) {
      if (item.type === "token") {
        updateAssistant((message) => ({
          ...message,
          content: message.content + item.content,
        }));
      }

      if (item.type === "replace") {
        updateAssistant((message) => ({
          ...message,
          content: item.content,
        }));
      }

      if (item.type === "citations") {
        updateAssistant((message) => ({
          ...message,
          citations: item.content,
        }));
      }

      if (item.type === "saved") {
        savedId = item.conversation_id;
      }

      if (item.type === "error") {
        throw new Error(item.content);
      }
    }

    try {
      const response = await fetch(
        `${API}/api/v1/query/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: text,
            conversation_id: conversationId,
            collection_id: selectedCollectionId,
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(
          "Recall could not answer your question."
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
          if (line.trim()) {
            processEvent(
              JSON.parse(line) as StreamEvent
            );
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        processEvent(
          JSON.parse(buffer) as StreamEvent
        );
      }

      if (savedId === null) {
        throw new Error(
          "Answer generated, but saving was not confirmed."
        );
      }

      const confirmedId: number = savedId;

      if (selectedCollectionId !== null) {
        collectionConversationIdRef.current = confirmedId;
      }

      activeIdRef.current = confirmedId;
      setActiveId(confirmedId);

      window.localStorage.setItem(
        ACTIVE_KEY,
        String(confirmedId)
      );

      await loadConversations();
    } catch (error) {
      setQueryError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

      if (savedId === null) {
        updateAssistant((message) => ({
          ...message,
          content:
            message.content ||
            "The answer could not be completed.",
        }));
      }
    } finally {
      askingRef.current = false;
      setAsking(false);
    }
  }

  function paperUrl(
    paper: Paper,
    page?: number | null
  ) {
    const suffix =
      page == null ? "" : `#page=${page}`;

    return `${API}/api/v1/documents/${paper.id}/pdf${suffix}`;
  }

  async function saveCitationBookmark(
    paper: Paper,
    citation: Citation,
    key: string
  ) {
    if (bookmarkSavingKey !== null || bookmarkSavedKeys.has(key)) return;

    setBookmarkSavingKey(key);
    setBookmarkError(null);

    const excerpt = citation.evidence?.trim();
    const reference = citation.page == null
      ? paper.filename
      : `${paper.filename}, page ${citation.page}`;

    const evidence = excerpt ||
      `Source reference: ${reference}. No quoted evidence excerpt was provided.`;

    try {
      const response = await fetch(`${API}/api/v1/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: paper.id,
          collection_id: null,
          page_number: citation.page,
          evidence,
          label: `Recall citation: ${paper.filename}`.slice(0, 255),
        }),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const result = await response.json();
          if (typeof result.detail === "string") {
            detail = result.detail;
          }
        } catch {
          // Keep the HTTP status if the response is not JSON.
        }
        throw new Error(detail);
      }

      setBookmarkSavedKeys((previous) => new Set(previous).add(key));
      setBookmarkRefreshToken((previous) => previous + 1);
    } catch (error) {
      setBookmarkError({
        key,
        message: error instanceof Error
          ? error.message
          : "Could not save bookmark.",
      });
    } finally {
      setBookmarkSavingKey(null);
    }
  }

  function sources(citations: Citation[]) {
    if (!citations.length) return null;

    return (
      <div className="mt-5 border-t border-stone-200 pt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
          Evidence &amp; sources
        </div>

        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => {
            const matches = papers.filter(
              (item) => item.filename === citation.filename
            );

            const paper = matches.length === 1 ? matches[0] : null;

            const label = citation.filename +
              (citation.page == null ? "" : ` ? p. ${citation.page}`);

            const key = `${paper?.id ?? "missing"}:${citation.page ?? "none"}:${citation.evidence ?? ""}`;
            const isSaved = bookmarkSavedKeys.has(key);
            const isSaving = bookmarkSavingKey === key;
            const hasEvidence = Boolean(citation.evidence?.trim());

            if (!paper) {
              return (
                <span
                  key={`${label}-${index}`}
                  className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500"
                  title={matches.length > 1
                    ? "Multiple PDFs share this filename; unable to identify the source"
                    : "Original PDF unavailable"}
                >
                  {label} ? {matches.length > 1 ? "ambiguous PDF" : "unavailable"}
                </span>
              );
            }

            return (
              <div key={`${label}-${index}`} className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setOpenEvidence({ paper, citation })}
                    className="max-w-full truncate rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                    title={`View evidence in ${label}`}
                  >
                    {label} ?
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveCitationBookmark(paper, citation, key)}
                    disabled={isSaved || bookmarkSavingKey !== null}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title={hasEvidence
                      ? "Save citation and evidence excerpt"
                      : "Save source reference (no evidence excerpt provided)"}
                  >
                    {isSaved ? "Saved ?" : isSaving ? "Saving..." : "Save Bookmark"}
                  </button>
                </div>
                {bookmarkError?.key === key && (
                  <p role="alert" className="text-xs text-rose-700">
                    {bookmarkError.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const filteredPapers = papers
    .filter((paper) =>
      paper.filename
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort((a, b) => b.id - a.id);

  const latestPapers = [...papers]
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#18251f] lg:flex">
      {/* SIDEBAR */}

      <aside className="border-b border-[#e3e8e0] bg-[#112d25] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0">
        <div className="flex items-center justify-between px-6 py-6">
          <div>
            <div className="text-2xl font-semibold tracking-[-0.06em]">
              recall
              <span className="text-[#b8df99]">
                .
              </span>
            </div>

            <div className="mt-1 text-[10px] uppercase tracking-[0.23em] text-[#9cb7aa]">
              Research workspace
            </div>
          </div>

          <span className="rounded-md border border-white/20 px-2 py-1 text-[10px] text-[#c5d8c8]">
            2.0
          </span>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-4 lg:block lg:space-y-1"
          aria-label="Main navigation"
        >
          {(
            ["overview", "library", "ask"] as View[]
          ).map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`w-full min-w-fit rounded-xl px-4 py-3 text-left text-sm transition ${
                view === item
                  ? "bg-[#d9efc4] font-semibold text-[#193428]"
                  : "text-[#b7cbc0] hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="mr-3 opacity-75">
                {["â—«", "â–¤", "âœ³"][index]}
              </span>

              {
                [
                  "Overview",
                  "Paper library",
                  "Ask Recall",
                ][index]
              }
            </button>
          ))}

          <div className="hidden px-4 pb-2 pt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7f9c8f] lg:block">
            Coming next
          </div>

          <div className="hidden cursor-not-allowed rounded-xl px-4 py-3 text-sm text-[#718d80] lg:block">
            â‡„ <span className="ml-2">Compare papers</span>
          </div>

          <div className="hidden cursor-not-allowed rounded-xl px-4 py-3 text-sm text-[#718d80] lg:block">
            â–« <span className="ml-2">Collections</span>
          </div>
        </nav>

        <div className="hidden min-h-0 flex-1 flex-col border-t border-white/10 px-4 py-5 lg:flex">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#91ad9e]">
              Recent research
            </span>

            <span className="text-xs text-[#91ad9e]">
              {conversations.length}
            </span>
          </div>

          <button
            onClick={newChat}
            disabled={asking}
            className="mb-3 rounded-lg border border-white/20 px-3 py-2 text-left text-xs font-medium hover:bg-white/10 disabled:opacity-50"
          >
            + New research question
          </button>

          <div className="space-y-1 overflow-y-auto">
            {loadingHistory && (
              <p className="px-2 text-xs text-[#a8bcb1]">
                Loading...
              </p>
            )}

            {historyError && (
              <p className="px-2 text-xs text-rose-200">
                {historyError}
              </p>
            )}

            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center gap-1 rounded-lg ${
                  activeId === conversation.id
                    ? "bg-white/15"
                    : "hover:bg-white/10"
                }`}
              >
                <button
                  disabled={asking}
                  onClick={() =>
                    void openConversation(
                      conversation.id
                    )
                  }
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs text-[#dce8df] disabled:opacity-50"
                  title={conversation.title}
                >
                  {conversation.title}
                </button>

                <button
                  disabled={asking}
                  onClick={() =>
                    void deleteChat(conversation.id)
                  }
                  aria-label={`Delete ${conversation.title}`}
                  title="Delete conversation"
                  className="px-2 text-[#9eb6a9] hover:text-rose-200 disabled:opacity-50"
                >
                  Ã—
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden border-t border-white/10 px-6 py-5 text-xs text-[#8eac9d] lg:block">
          Your research, remembered.
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-[#e3e8e0] bg-white/80 px-5 py-5 backdrop-blur md:px-9">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#789184]">
              Workspace / {view}
            </div>

            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              {viewTitle[view]}
            </h1>
          </div>

          <button
            type="button"
            onClick={newChat}
            disabled={asking}
            className="rounded-xl bg-[#173e31] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#275442] disabled:opacity-50"
          >
            + New question
          </button>
        </header>

        <div className="mx-auto max-w-6xl px-5 py-8 md:px-9 md:py-10">
          {/* OVERVIEW */}

          {view === "overview" && (
            <div className="space-y-7">
              <div className="rounded-[24px] bg-[#dcebcf] p-7 md:p-10">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#52755b]">
                  Your research command center
                </div>

                <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] md:text-5xl">
                  Think across papers.
                  <br />
                  <span className="text-[#5e805f]">
                    Keep the evidence.
                  </span>
                </h2>

                <p className="mt-4 max-w-lg text-sm leading-6 text-[#4f6755]">
                  A home for your literature, questions,
                  and source-grounded discoveries.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    onClick={newChat}
                    className="rounded-xl bg-[#173e31] px-5 py-3 text-sm font-semibold text-white hover:bg-[#285641]"
                  >
                    Ask your papers â†—
                  </button>

                  <button
                    onClick={() => setView("library")}
                    className="rounded-xl border border-[#aac4a5] bg-white/50 px-5 py-3 text-sm font-semibold text-[#214534] hover:bg-white"
                  >
                    Explore library
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Indexed papers"
                  value={
                    loadingPapers
                      ? "â€”"
                      : String(papers.length)
                  }
                  note="In your research library"
                />

                <Stat
                  label="Research threads"
                  value={
                    loadingHistory
                      ? "â€”"
                      : String(conversations.length)
                  }
                  note="Saved conversations"
                />

                <Stat
                  label="Source-backed answers"
                  value="On"
                  note="Citations linked to PDFs"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                <section className="rounded-2xl border border-[#e1e7dd] bg-white p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Recently indexed papers
                      </h3>

                      <p className="mt-1 text-xs text-stone-500">
                        Jump back into your reading.
                      </p>
                    </div>

                    <button
                      onClick={() => setView("library")}
                      className="text-xs font-semibold text-[#3d7153] hover:underline"
                    >
                      View library â†’
                    </button>
                  </div>

                  {paperError && (
                    <p className="text-sm text-rose-700">
                      {paperError}
                    </p>
                  )}

                  {!loadingPapers &&
                    papers.length === 0 && (
                      <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-500">
                        Your library is empty. Add a PDF
                        from the Paper library.
                      </p>
                    )}

                  {latestPapers.map((paper) => (
                    <a
                      key={paper.id}
                      href={paperUrl(paper)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 border-t border-stone-100 py-4 hover:text-[#3c7955]"
                    >
                      <div className="rounded-lg bg-[#edf2e9] px-3 py-3 text-xs font-bold text-[#507b59]">
                        PDF
                      </div>

                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-sm font-medium"
                          title={paper.filename}
                        >
                          {paper.filename}
                        </div>

                        <div className="mt-1 text-xs text-stone-400">
                          {dateLabel(paper.created_at)}
                        </div>
                      </div>

                      <span className="text-stone-400">
                        â†—
                      </span>
                    </a>
                  ))}
                </section>

                <section className="rounded-2xl border border-[#e1e7dd] bg-white p-6">
                  <h3 className="text-lg font-semibold">
                    Pick up where you left off
                  </h3>

                  <p className="mb-4 mt-1 text-xs text-stone-500">
                    Your most recent research threads.
                  </p>

                  {conversations
                    .slice(0, 5)
                    .map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() =>
                          void openConversation(
                            conversation.id
                          )
                        }
                        className="block w-full border-t border-stone-100 py-4 text-left hover:text-[#3c7955]"
                      >
                        <div className="truncate text-sm font-medium">
                          {conversation.title}
                        </div>

                        <div className="mt-1 text-xs text-stone-400">
                          {dateLabel(
                            conversation.updated_at
                          )}
                        </div>
                      </button>
                    ))}

                  {!loadingHistory &&
                    conversations.length === 0 && (
                      <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-500">
                        No research threads yet. Start
                        by asking a question.
                      </p>
                    )}
                </section>
              </div>
            </div>
          )}

          {/* PAPER LIBRARY */}

          {view === "library" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6e9176]">
                    Your sources
                  </div>

                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    A library built for inquiry.
                  </h2>

                  <p className="mt-2 text-sm text-stone-500">
                    Find, open, and add research PDFs.
                  </p>
                </div>

                <span className="rounded-full bg-[#e6efe1] px-3 py-1.5 text-xs font-semibold text-[#3d6548]">
                  {papers.length} indexed
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <section className="rounded-2xl border border-[#e1e7dd] bg-white p-6">
                  <label
                    htmlFor="paper-search"
                    className="mb-2 block text-xs font-semibold text-stone-600"
                  >
                    Search your library
                  </label>

                  <input
                    id="paper-search"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search paper filenames..."
                    className="w-full rounded-xl border border-stone-200 bg-[#fafbf9] px-4 py-3 text-sm outline-none focus:border-[#609474]"
                  />

                  {paperError && (
                    <p
                      role="alert"
                      className="mt-4 text-sm text-rose-700"
                    >
                      {paperError}
                    </p>
                  )}

                  {loadingPapers ? (
                    <p className="mt-6 text-sm text-stone-500">
                      Loading papers...
                    </p>
                  ) : filteredPapers.length ? (
                    <div className="mt-4 divide-y divide-stone-100">
                      {filteredPapers.map((paper) => (
                        <div
                          key={paper.id}
                          className="flex items-center gap-3 py-4"
                        >
                          <div className="rounded-xl bg-[#eaf2e6] p-3 text-xs font-bold text-[#4b7b56]">
                            PDF
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="break-all text-sm font-semibold">
                              {paper.filename}
                            </p>

                            <p className="mt-1 text-xs text-stone-400">
                              Indexed{" "}
                              {dateLabel(
                                paper.created_at
                              )}
                            </p>
                          </div>

                          <a
                            href={paperUrl(paper)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold hover:border-[#86ae8d] hover:text-[#387449]"
                          >
                            Open â†—
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-stone-500">
                      {papers.length
                        ? "No matching papers."
                        : "No papers indexed yet."}
                    </p>
                  )}
                </section>

                <section className="h-fit rounded-2xl border border-[#e1e7dd] bg-white p-6">
                  <h3 className="text-lg font-semibold">
                    Add a paper
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    Upload a PDF to extract text,
                    generate embeddings, and make it
                    searchable in Recall.
                  </p>

                  <label className="mt-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#b8ceba] bg-[#f7faf5] px-4 py-9 text-center hover:bg-[#eef5eb]">
                    <span className="text-2xl text-[#5c8766]">
                      â†‘
                    </span>

                    <span className="mt-2 text-sm font-semibold">
                      Choose a PDF
                    </span>

                    <span className="mt-1 max-w-full break-all text-xs text-stone-500">
                      {selectedFile?.name ||
                        "PDF files only"}
                    </span>

                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      disabled={uploading}
                      className="hidden"
                      onChange={(event) => {
                        setSelectedFile(
                          event.target.files?.[0] ||
                            null
                        );
                        setUploadError("");
                        setUploadSuccess("");
                      }}
                    />
                  </label>

                  <button
                    onClick={() =>
                      void uploadPaper()
                    }
                    disabled={
                      !selectedFile || uploading
                    }
                    className="mt-4 w-full rounded-xl bg-[#173e31] px-4 py-3 text-sm font-semibold text-white hover:bg-[#275442] disabled:opacity-50"
                  >
                    {uploading
                      ? "Indexing paper..."
                      : "Upload & index"}
                  </button>

                  {uploadError && (
                    <p
                      role="alert"
                      className="mt-3 text-sm text-rose-700"
                    >
                      {uploadError}
                    </p>
                  )}

                  {uploadSuccess && (
                    <p
                      role="status"
                      className="mt-3 text-sm text-emerald-800"
                    >
                      {uploadSuccess}
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ASK RECALL */}

          {view === "ask" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_250px]">
              <section className="flex min-h-[680px] flex-col rounded-2xl border border-[#e1e7dd] bg-white">
                <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b9274]">
                      Evidence-grounded assistant
                    </div>

                    <h2 className="mt-1 text-xl font-semibold">
                      {activeId
                        ? conversations.find(
                            (conversation) =>
                              conversation.id ===
                              activeId
                          )?.title ||
                          "Research conversation"
                        : "New research question"}
                    </h2>
                  </div>

                  <span className="rounded-full bg-[#e7f1e3] px-3 py-1 text-[11px] font-semibold text-[#47744e]">
                    Local RAG
                  </span>
                </div>

                <div
                  className="min-h-[380px] flex-1 space-y-6 overflow-y-auto px-5 py-7 md:px-7"
                  aria-live="polite"
                >
                  {messages.length === 0 ? (
                    <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
                      <div className="mb-5 rounded-2xl bg-[#e5f0dc] px-5 py-4 text-3xl text-[#47714f]">
                        âœ³
                      </div>

                      <h3 className="text-2xl font-semibold tracking-tight">
                        Start with a question.
                      </h3>

                      <p className="mt-3 max-w-sm text-sm leading-6 text-stone-500">
                        Explore methods, findings,
                        and limitations across the
                        papers in your library.
                        Recall will cite its sources.
                      </p>

                      <button
                        onClick={() =>
                          setView("library")
                        }
                        className="mt-5 text-sm font-semibold text-[#487f59] hover:underline"
                      >
                        Browse your papers â†’
                      </button>
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
                          className={
                            message.role === "user"
                              ? "max-w-[90%] rounded-2xl rounded-tr-sm bg-[#173e31] px-5 py-4 text-sm leading-7 text-white"
                              : "w-full rounded-2xl border border-[#e6ebe2] bg-[#f9fbf7] px-5 py-5 text-sm leading-7 text-[#26372b]"
                          }
                        >
                          {message.role ===
                            "assistant" && (
                            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#64876d]">
                              Recall Â· Research answer
                            </div>
                          )}

                          <p className="whitespace-pre-wrap break-words">
                            {message.content ||
                              (asking
                                ? "Searching your research..."
                                : "")}
                          </p>

                          {message.role ===
                            "assistant" &&
                            sources(
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
                    className="mx-6 mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                  >
                    {queryError}
                  </p>
                )}

                <form
                  onSubmit={ask}
                  className="border-t border-stone-100 p-5"
                >
                  <div className="mb-4">
                    <label
                      htmlFor="recall-collection"
                      className="mb-2 block text-xs font-semibold text-stone-600"
                    >
                      Search within
                    </label>

                    <select
                      id="recall-collection"
                      value={selectedCollectionId ?? ""}
                      disabled={asking || loadingCollections}
                      onChange={(event) => {
                        const id = event.target.value
                          ? Number(event.target.value)
                          : null;

                        setSelectedCollectionId(id);
                        collectionConversationIdRef.current = null;
                        requestIdRef.current += 1;
                        setActiveId(null);
                        activeIdRef.current = null;
                        setMessages([]);
                        setQueryError("");
                        window.localStorage.removeItem(ACTIVE_KEY);
                      }}
                      className="w-full rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700 outline-none focus:border-[#609474] disabled:opacity-50"
                    >
                      <option value="">All Documents</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name} ({collection.document_count} papers)
                        </option>
                      ))}
                    </select>

                    {collectionError && (
                      <p className="mt-2 text-xs text-rose-700">
                        {collectionError}
                      </p>
                    )}

                    {selectedCollectionId !== null && (
                      <p className="mt-2 text-xs text-stone-500">
                        Answers will use the selected research collection.
                      </p>
                    )}
                  </div>

                  <SavedBookmarks
                    papers={papers}
                    refreshToken={bookmarkRefreshToken}
                    onOpenPdf={(paper, page) =>
                      setOpenEvidence({
                        paper,
                        citation: {
                          filename: paper.filename,
                          page,
                          evidence: null,
                        },
                      })
                    }
                  />

                  <ResearchNotes
                    papers={papers}
                    collections={collections}
                    onOpenPdf={(paper, page) =>
                      setOpenEvidence({
                        paper,
                        citation: {
                          filename: paper.filename,
                          page,
                          evidence: null,
                        },
                      })
                    }
                  />

                  <CollectionManager
                    collections={collections}
                    onCollectionsChanged={setCollections}
                  />
                  <label
                    htmlFor="recall-question"
                    className="mb-2 block text-xs font-semibold text-stone-600"
                  >
                    Your question
                  </label>

                  <textarea
                    id="recall-question"
                    rows={3}
                    maxLength={2000}
                    disabled={asking}
                    value={question}
                    onChange={(event) =>
                      setQuestion(
                        event.target.value
                      )
                    }
                    placeholder="What were the limitations of the gaze-following study?"
                    className="w-full resize-none rounded-xl border border-stone-200 bg-[#fafbf9] p-4 text-sm outline-none focus:border-[#609474] disabled:opacity-50"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-stone-400">
                      {asking
                        ? "Retrieving evidence and generating..."
                        : "Grounded in indexed PDFs"}
                    </span>

                    <button
                      type="submit"
                      disabled={
                        asking ||
                        !question.trim()
                      }
                      className="rounded-xl bg-[#173e31] px-5 py-3 text-sm font-semibold text-white hover:bg-[#275442] disabled:opacity-50"
                    >
                      {asking
                        ? "Thinking..."
                        : "Ask Recall â†’"}
                    </button>
                  </div>
                </form>
              </section>

              {/* RESEARCH CONTEXT */}

              <aside className="space-y-5">
                <div className="rounded-2xl border border-[#e1e7dd] bg-white p-5">
                  <h3 className="text-sm font-semibold">
                    Research context
                  </h3>

                  <p className="mt-2 text-xs leading-6 text-stone-500">
                    Recall searches your indexed
                    papers and returns
                    evidence-backed answers.
                  </p>

                  <div className="mt-4 rounded-xl bg-[#eef5e9] p-4">
                    <div className="text-2xl font-semibold text-[#315a3b]">
                      {papers.length}
                    </div>

                    <div className="mt-1 text-xs text-[#53745a]">
                      Indexed papers available
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setView("library")
                    }
                    className="mt-4 text-xs font-semibold text-[#467850] hover:underline"
                  >
                    Manage library â†’
                  </button>
                </div>

                <div className="rounded-2xl border border-[#e1e7dd] bg-white p-5">
                  <h3 className="text-sm font-semibold">
                    Recent threads
                  </h3>

                  {historyError && (
                    <p className="mt-3 text-xs text-rose-700">
                      {historyError}
                    </p>
                  )}

                  {conversations
                    .slice(0, 6)
                    .map((conversation) => (
                      <button
                        key={conversation.id}
                        disabled={asking}
                        onClick={() =>
                          void openConversation(
                            conversation.id
                          )
                        }
                        className="block w-full truncate border-b border-stone-100 py-3 text-left text-xs text-stone-600 hover:text-[#41754f] disabled:opacity-50"
                        title={
                          conversation.title
                        }
                      >
                        {conversation.title}
                      </button>
                    ))}

                  {conversations.length === 0 && (
                    <p className="mt-3 text-xs text-stone-500">
                      Your conversations will
                      appear here.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      {/* IN-APP PDF EVIDENCE VIEWER */}

      {openEvidence && (
        <PdfEvidenceViewer
          key={`${openEvidence.paper.id}-${openEvidence.citation.page}-${openEvidence.citation.evidence ?? ""}`}
          url={`${API}/api/v1/documents/${openEvidence.paper.id}/pdf`}
          filename={openEvidence.paper.filename}
          initialPage={openEvidence.citation.page}
          evidence={openEvidence.citation.evidence}
          onClose={() =>
            setOpenEvidence(null)
          }
        />
      )}
    </div>
  );
}
