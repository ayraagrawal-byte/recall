
"use client";

import dynamic from "next/dynamic";
import CollectionManager from "./components/CollectionManager";
import ResearchNotes from "./components/ResearchNotes";
import SavedBookmarks from "./components/SavedBookmarks";
import AppearanceSwitcher from "./components/AppearanceSwitcher";
import UiIcon from "./components/UiIcon";
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
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface)] p-6">
      <div className="text-xs font-medium text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-xs text-[var(--text-muted)]">
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
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
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
    const panel = messagesRef.current;
    if (panel && followLatestRef.current) {
      panel.scrollTop = panel.scrollHeight;
    }
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
    followLatestRef.current = true;

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
    followLatestRef.current = true;

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
    followLatestRef.current = true;

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
      <div className="recall-desk-citations mt-6 border-t border-[var(--border-soft)] pt-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          SOURCE REGISTER
        </div>

        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => {
            const matches = papers.filter(
              (item) => item.filename === citation.filename
            );

            const paper = matches.length === 1 ? matches[0] : null;

            const label = citation.filename +
              (citation.page == null ? "" : ` · p. ${citation.page}`);

            const key = `${paper?.id ?? "missing"}:${citation.page ?? "none"}:${citation.evidence ?? ""}`;
            const isSaved = bookmarkSavedKeys.has(key);
            const isSaving = bookmarkSavingKey === key;
            const hasEvidence = Boolean(citation.evidence?.trim());

            if (!paper) {
              return (
                <span
                  key={`${label}-${index}`}
                  className="rounded-sm bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
                  title={matches.length > 1
                    ? "Multiple PDFs share this filename; unable to identify the source"
                    : "Original PDF unavailable"}
                >
                  {label} · {matches.length > 1 ? "ambiguous PDF" : "unavailable"}
                </span>
              );
            }

            return (
              <div key={`${label}-${index}`} className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setOpenEvidence({ paper, citation })}
                    className="recall-desk-reference max-w-full truncate border-b border-[var(--accent-border)] px-1 py-1.5 text-left text-xs font-medium text-[var(--accent-text)] hover:bg-[var(--accent-soft)]"
                    title={`View evidence in ${label}`}
                  >
                    {`[${String(index + 1).padStart(2, "0")}]`} {label} <UiIcon name="arrow-up-right" size={14} className="ml-1 inline-block align-text-bottom" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveCitationBookmark(paper, citation, key)}
                    disabled={isSaved || bookmarkSavingKey !== null}
                    className="recall-desk-bookmark px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
                    title={hasEvidence
                      ? "Save citation and evidence excerpt"
                      : "Save source reference (no evidence excerpt provided)"}
                  >
                    {isSaved ? "Saved" : isSaving ? "Saving..." : "Save Bookmark"}
                  </button>
                </div>
                {bookmarkError?.key === key && (
                  <p role="alert" className="text-xs text-[var(--danger)]">
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
    <div className="recall-app min-h-screen lg:flex">
      {/* SIDEBAR */}

      <aside className="recall-sidebar border-b border-[var(--border-soft)] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0">
        <div className="flex items-center justify-between px-6 py-6">
          <div>
            <div className="text-2xl font-semibold tracking-[-0.06em]">
              recall
              <span className="text-[var(--copper-light)]">
                .
              </span>
            </div>

            <div className="mt-1 text-[10px] uppercase tracking-[0.23em] text-[var(--sidebar-muted)]">
              Research workspace
            </div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <AppearanceSwitcher />
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
              className={`w-full min-w-fit rounded-md px-4 py-3 text-left text-sm transition ${
                view === item
                  ? "recall-nav-active font-semibold"
                  : "recall-nav-inactive"
              }`}
            >
              <span className="mr-3 inline-flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
                {index === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="9" rx="1" />
                    <rect x="14" y="3" width="7" height="5" rx="1" />
                    <rect x="14" y="12" width="7" height="9" rx="1" />
                    <rect x="3" y="16" width="7" height="5" rx="1" />
                  </svg>
                ) : index === 1 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2Z" />
                    <path d="M4 17a2 2 0 0 1 2-2h13" />
                    <path d="M8 7h7" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-5 3v-6.5a7.5 7.5 0 1 1 18-4Z" />
                    <path d="M8 10h8M8 14h5" />
                  </svg>
                )}
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
        </nav>

        <div className="hidden min-h-0 flex-1 flex-col border-t border-white/10 px-4 py-5 lg:flex">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sidebar-muted)]">
              Recent research
            </span>

            <span className="text-xs text-[var(--text-muted)]">
              {conversations.length}
            </span>
          </div>

          <button
            onClick={newChat}
            disabled={asking}
            className="mb-3 rounded-sm border border-white/20 px-3 py-2 text-left text-xs font-medium hover:bg-white/10 disabled:opacity-50"
          >
            + New research question
          </button>

          <div className="space-y-1 overflow-y-auto">
            {loadingHistory && (
              <p className="px-2 text-xs text-[var(--sidebar-muted)]">
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
                className={`group flex items-center gap-1 rounded-sm ${
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
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs text-[var(--sidebar-muted)] disabled:opacity-50"
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
                  className="px-2 text-[var(--sidebar-muted)] hover:text-rose-200 disabled:opacity-50"
                >
                  <UiIcon name="close" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden border-t border-white/10 px-6 py-5 text-xs text-[var(--sidebar-muted)] lg:block">
          Your research, remembered.
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className={`recall-main min-w-0 flex-1 ${view === "ask" ? "recall-desk-main" : ""}`}>
        <header className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface)] px-5 py-5 backdrop-blur md:px-9">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
              Workspace / {view}
            </div>

            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--foreground)]">
              {viewTitle[view]}
            </h1>
          </div>

          <button
            type="button"
            onClick={newChat}
            disabled={asking}
            className="rounded-md bg-[var(--primary)] px-4 py-2.5 text-xs font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            + New question
          </button>
        </header>

        <div className={`mx-auto max-w-6xl px-5 py-8 md:px-9 md:py-10 ${view === "ask" ? "recall-desk-body" : ""}`}>
          {/* OVERVIEW */}
          {view === "overview" && (
            <div className="recall-research-index space-y-10">
              <section className="recall-index-masthead border-b border-[var(--border-soft)] pb-8">
                <div className="recall-index-overline"><span>THE RESEARCH INDEX</span><span className="recall-index-rule" aria-hidden="true"/><span>YOUR WORKSPACE</span></div>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <h2 className="recall-index-display max-w-2xl text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.07] tracking-tight text-[var(--foreground)]">
                      A record of your thinking.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-7 text-[var(--text-muted)]">
                      Return to an inquiry, follow a source, or start a new question. Your research stays connected to its evidence.
                    </p>
                  </div>
                  <button type="button" onClick={newChat} className="recall-index-action inline-flex items-center gap-2 border-b border-[var(--accent-border)] pb-2 text-sm font-semibold text-[var(--accent-text)] hover:text-[var(--foreground)]">
                    Begin an inquiry <UiIcon name="arrow-up-right" size={17} />
                  </button>
                </div>
              </section>

              <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)]">
                <div className="min-w-0">
                  <div className="recall-index-section-heading flex items-center justify-between gap-3">
                    <div className="recall-section-identity"><span className="recall-section-kicker">SECTION 01 / INQUIRIES</span><h3>Ongoing inquiries</h3></div>
                    <span className="recall-index-counter">{loadingHistory ? "…" : conversations.length} THREADS</span>
                  </div>
                  {historyError && <p role="alert" className="py-4 text-sm text-[var(--danger)]">{historyError}</p>}
                  {loadingHistory && <p className="py-5 text-sm text-[var(--text-muted)]">Loading your research history…</p>}
                  {!loadingHistory && conversations.length === 0 && (
                    <div className="py-7 text-sm text-[var(--text-muted)]">No inquiries yet. Start with a question about one of your papers.</div>
                  )}
                  <div className="recall-index-list">
                    {conversations.slice(0, 6).map((conversation, index) => (
                      <button key={conversation.id} type="button" onClick={() => void openConversation(conversation.id)} className="recall-index-entry group flex w-full items-center gap-4 py-4 text-left">
                        <span className="recall-index-number shrink-0">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--foreground)]" title={conversation.title}>{conversation.title}</span>
                          <span className="mt-1 block text-xs text-[var(--text-muted)]">Last explored {dateLabel(conversation.updated_at)}</span>
                        </span>
                        <span className="text-[var(--accent-text)] opacity-60 transition-opacity group-hover:opacity-100"><UiIcon name="arrow-up-right" size={17}/></span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="recall-index-section-heading flex items-center justify-between gap-3">
                    <div className="recall-section-identity"><span className="recall-section-kicker">SECTION 02 / WORKSPACE</span><h3>On your desk</h3></div>
                  </div>
                  <dl className="recall-index-tally grid grid-cols-2 gap-3 border-b border-[var(--border-soft)] py-6">
                    <div><dt>INDEXED PAPERS</dt><dd>{loadingPapers ? "—" : papers.length}</dd></div>
                    <div><dt>SAVED INQUIRIES</dt><dd>{loadingHistory ? "—" : conversations.length}</dd></div>
                  </dl>
                  <p className="py-5 text-sm leading-7 text-[var(--text-muted)]">Every answer can be traced to the original document and revisited in the evidence reader.</p>
                  <button type="button" onClick={() => setView("library")} className="recall-index-action inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-text)] hover:underline">
                    Browse the archive <UiIcon name="arrow-right" size={16}/>
                  </button>
                </div>
              </section>

              <section>
                <div className="recall-index-section-heading flex items-center justify-between gap-3">
                  <div className="recall-section-identity"><span className="recall-section-kicker">SECTION 03 / LIBRARY</span><h3>Recently indexed</h3></div>
                  <button type="button" onClick={() => setView("library")} className="text-xs font-semibold text-[var(--accent-text)] hover:underline">All papers <UiIcon name="arrow-right" size={13} className="ml-1 inline-block align-middle"/></button>
                </div>
                {paperError && <p role="alert" className="py-4 text-sm text-[var(--danger)]">{paperError}</p>}
                {!loadingPapers && papers.length === 0 && <p className="py-6 text-sm text-[var(--text-muted)]">Your archive is empty. Add a paper in the Library.</p>}
                <div className="recall-index-list">
                  {latestPapers.map((paper, index) => (
                    <a key={paper.id} href={paperUrl(paper)} target="_blank" rel="noopener noreferrer" className="recall-index-entry group flex items-center gap-4 py-4">
                      <span className="recall-index-number shrink-0">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--foreground)]" title={paper.filename}>{paper.filename}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">PDF · Indexed {dateLabel(paper.created_at)}</span></span>
                      <span className="text-[var(--accent-text)] opacity-60 group-hover:opacity-100"><UiIcon name="arrow-up-right" size={17}/></span>
                    </a>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* PAPER LIBRARY */}
          {view === "library" && (
            <div className="recall-archive space-y-9">
              <div className="border-b border-[var(--border-soft)] pb-7">
                <div className="recall-index-overline"><span>THE ARCHIVE</span><span className="recall-index-rule" aria-hidden="true"/><span>DOCUMENTS / SOURCES</span></div>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="recall-index-display text-[clamp(2.2rem,4vw,3.8rem)] leading-[1.08] tracking-tight">Your research library.</h2>
                    <p className="mt-3 max-w-lg text-sm leading-7 text-[var(--text-muted)]">Every inquiry starts somewhere. Browse the papers behind your findings.</p>
                  </div>
                  <span className="recall-index-counter">{loadingPapers ? "…" : papers.length} DOCUMENTS INDEXED</span>
                </div>
              </div>
              <div className="grid gap-9 xl:grid-cols-[minmax(0,1fr)_290px]">
                <section className="min-w-0">
                  <div className="recall-index-section-heading"><div className="recall-section-identity"><span className="recall-section-kicker">SECTION 01 / DOCUMENTS</span><h3>Document register</h3></div></div>
                  <label htmlFor="paper-search" className="mt-5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Find a document</label>
                  <div className="mt-2 flex items-center border-b border-[var(--border-soft)] bg-[var(--surface)] px-3 py-1 focus-within:border-[var(--accent)]">
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-[var(--text-muted)]"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
                    <input id="paper-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search filenames…" className="w-full min-w-0 bg-transparent px-3 py-3 text-sm outline-none" />
                    {search && <button type="button" onClick={() => setSearch("")} className="px-2 text-xs text-[var(--accent-text)] hover:underline">Clear</button>}
                  </div>
                  {paperError && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{paperError}</p>}
                  {loadingPapers ? <p className="py-8 text-sm text-[var(--text-muted)]">Loading documents…</p> : filteredPapers.length ? (
                    <div className="recall-index-list mt-4">
                      {filteredPapers.map((paper, index) => (
                        <div key={paper.id} className="recall-index-entry group flex items-center gap-3 py-4 sm:gap-4">
                          <span className="recall-index-number shrink-0">{String(index + 1).padStart(2, "0")}</span>
                          <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-[var(--foreground)]">{paper.filename}</p><p className="mt-1 text-xs text-[var(--text-muted)]">PDF · Indexed {dateLabel(paper.created_at)}</p></div>
                          <a href={paperUrl(paper)} target="_blank" rel="noopener noreferrer" className="recall-index-action inline-flex shrink-0 items-center gap-1 border-b border-[var(--accent-border)] py-1 text-xs font-semibold text-[var(--accent-text)]">Open <UiIcon name="arrow-up-right" size={14}/></a>
                        </div>
                      ))}
                    </div>
                  ) : <p className="py-8 text-sm text-[var(--text-muted)]">{papers.length ? "No matching papers. Try a different search." : "No papers indexed yet. Add your first document."}</p>}
                </section>
                <div className="recall-archive-upload min-w-0">
                  <div className="recall-index-section-heading"><div className="recall-section-identity"><span className="recall-section-kicker">SECTION 02 / UPLOAD</span><h3>New source</h3></div></div>
                  <div className="recall-archive-upload-content mt-5">
                <section className="recall-archive-upload-form">
                  <h3 className="text-lg font-semibold">
                    Add a paper
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Upload a PDF to extract text,
                    generate embeddings, and make it
                    searchable in Recall.
                  </p>

                  <label className="mt-5 flex cursor-pointer flex-col items-center border border-dashed border-[var(--accent-border)] bg-[var(--surface-soft)] px-4 py-7 text-center hover:bg-[var(--accent-soft)]">
                    <span className="text-2xl text-[var(--accent-text)]">
                      <UiIcon name="arrow-up" size={26} />
                    </span>

                    <span className="mt-2 text-sm font-semibold">
                      Choose a PDF
                    </span>

                    <span className="mt-1 max-w-full break-all text-xs text-[var(--text-muted)]">
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
                    className="mt-4 w-full rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                  >
                    {uploading
                      ? "Indexing paper..."
                      : "Upload & index"}
                  </button>

                  {uploadError && (
                    <p
                      role="alert"
                      className="mt-3 text-sm text-[var(--danger)]"
                    >
                      {uploadError}
                    </p>
                  )}

                  {uploadSuccess && (
                    <p
                      role="status"
                      className="mt-3 text-sm text-[var(--success)]"
                    >
                      {uploadSuccess}
                    </p>
                  )}
                </section>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ASK RECALL */}

          {view === "ask" && (
            <div className={`recall-chat-layout recall-desk-grid grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px] ${openEvidence ? "recall-evidence-split" : ""}`}>
              <section className="recall-chat recall-desk-inquiry flex min-h-0 flex-col overflow-hidden border border-[var(--border-soft)] bg-[var(--surface)]">
                <div className="recall-desk-header flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-3 md:px-6">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      RESEARCH / CURRENT INQUIRY
                    </div>

                    <h2 className="recall-desk-title mt-1 max-w-full text-xl font-medium leading-snug text-[var(--foreground)]">
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

                  <div className="recall-desk-scope flex min-w-0 items-center gap-3">
                    <span className="recall-desk-index hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)] md:inline">SOURCE SET</span>
                  <div className="recall-scope min-w-0">
                    <label
                      htmlFor="recall-collection"
                      className="sr-only"
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
                      className="w-full min-w-0 border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent-border)] disabled:opacity-50"
                    >
                      <option value="">All Documents</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name} ({collection.document_count} papers)
                        </option>
                      ))}
                    </select>

                    {collectionError && (
                      <p className="mt-2 text-xs text-[var(--danger)]">
                        {collectionError}
                      </p>
                    )}

                    {selectedCollectionId !== null && (
                      <p className="sr-only">
                        Answers will use the selected research collection.
                      </p>
                    )}
                  </div>
                  </div>
                </div>

                <div
                  ref={messagesRef}
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    followLatestRef.current =
                      element.scrollHeight - element.scrollTop - element.clientHeight < 110;
                  }}
                  className="recall-messages recall-desk-messages min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 py-5 md:px-8 md:py-7"
                  aria-live="polite"
                >
                  {messages.length === 0 ? (
                    <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
                      <div className="mb-5 rounded-md bg-[var(--accent-soft)] px-5 py-4 text-3xl text-[var(--accent-text)]">
                        <UiIcon name="sparkles" size={28} />
                      </div>

                      <h3 className="text-2xl font-semibold tracking-tight">
                        Start with a question.
                      </h3>

                      <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
                        Explore methods, findings,
                        and limitations across the
                        papers in your library.
                        Recall will cite its sources.
                      </p>

                      <button
                        onClick={() =>
                          setView("library")
                        }
                        className="mt-5 text-sm font-semibold text-[var(--accent-text)] hover:underline"
                      >
                        Browse your papers <UiIcon name="arrow-right" size={15} className="ml-1 inline-block align-text-bottom" />
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
                              ? "max-w-[90%] rounded-md rounded-tr-sm recall-user-bubble bg-[var(--primary)] px-5 py-4 text-sm leading-7 text-[var(--on-primary)]"
                              : "recall-desk-answer w-full border-l-2 border-[var(--accent-border)] pl-4 pr-1 py-1 text-sm leading-7 text-[var(--foreground)] md:pl-5"
                          }
                        >
                          {message.role ===
                            "assistant" && (
                            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                              RECALL / FINDINGS
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

                  <div aria-hidden="true" />
                </div>

                {queryError && (
                  <p
                    role="alert"
                    className="mx-6 mb-3 rounded-sm bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
                  >
                    {queryError}
                  </p>
                )}

                <form
                  onSubmit={ask}
                  className="recall-composer recall-desk-composer border-t border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 md:px-6"
                >


                  <label
                    htmlFor="recall-question"
                    className="sr-only"
                  >
                    Your question
                  </label>

                  <textarea
                    id="recall-question"
                    rows={2}
                    maxLength={2000}
                    disabled={asking}
                    value={question}
                    onChange={(event) =>
                      setQuestion(
                        event.target.value
                      )
                    }
                    placeholder="What were the limitations of the gaze-following study?"
                    className="recall-desk-textarea w-full resize-y border-0 bg-transparent px-1 py-2 text-sm outline-none focus:ring-0 disabled:opacity-50"
                  />

                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-xs text-[var(--text-muted)]">
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
                      className="bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
                    >
                      {asking
                        ? "Thinking..."
                        : <>Ask Recall <UiIcon name="arrow-right" size={16} className="ml-1 inline-block align-text-bottom" /></>}
                    </button>
                  </div>
                </form>
              </section>

              {/* RESEARCH CONTEXT */}

              <aside className="recall-desk-rail min-h-0 space-y-5">
                  {openEvidence ? (
                    <PdfEvidenceViewer
                      embedded
                      key={`${openEvidence.paper.id}-${openEvidence.citation.page}-${openEvidence.citation.evidence ?? ""}`}
                      url={`${API}/api/v1/documents/${openEvidence.paper.id}/pdf`}
                      filename={openEvidence.paper.filename}
                      initialPage={openEvidence.citation.page}
                      evidence={openEvidence.citation.evidence}
                      onClose={() => setOpenEvidence(null)}
                    />
                  ) : (
                    <>
                <div className="recall-desk-rail-intro border-b border-[var(--border-soft)] pb-4">
                  <h3 className="text-sm font-semibold">
                    Evidence desk
                  </h3>

                  <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">
                    Sources, annotations and collections for your research.
                  </p>

                  <div className="mt-3 flex items-baseline gap-2">
                    <div className="text-xl font-semibold text-[var(--accent-text)]">
                      {papers.length}
                    </div>

                    <div className="text-xs text-[var(--text-muted)]">
                      Indexed papers available
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setView("library")
                    }
                    className="mt-3 inline-flex text-xs font-semibold text-[var(--accent-text)] hover:underline"
                  >
                    Manage library <UiIcon name="arrow-right" size={15} className="ml-1 inline-block align-text-bottom" />
                  </button>
                </div>

                <div className="recall-tools space-y-3">
                  <div className="px-1 pb-1">
                    <h3 className="text-sm font-semibold">Research tools</h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Your notes, evidence and collections, in one place.</p>
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
                </div>
                    </>
                  )}
                </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
