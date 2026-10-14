"use client";

import { useCallback, useEffect, useState } from "react";

type Paper = {
  id: number;
  filename: string;
  created_at: string;
};

type Bookmark = {
  id: number;
  document_id: number;
  collection_id: number | null;
  page_number: number | null;
  evidence: string;
  label: string | null;
  created_at: string;
};

type Props = {
  papers: Paper[];
  refreshToken: number;
  onOpenPdf: (paper: Paper, page: number | null) => void;
};

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function SavedBookmarks({
  papers,
  refreshToken,
  onOpenPdf,
}: Props) {
  const [open, setOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBookmarks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/api/v1/bookmarks`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Loading failed: HTTP ${response.status}`);
      }

      const data: Bookmark[] = await response.json();
      setBookmarks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load bookmarks."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadBookmarks();
    }
  }, [open, refreshToken, loadBookmarks]);

  const visible = bookmarks.filter((bookmark) => {
    const paper = papers.find(
      (item) => item.id === bookmark.document_id
    );

    const text = [
      bookmark.label ?? "",
      bookmark.evidence,
      paper?.filename ?? "",
    ].join(" ").toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  async function saveLabel(bookmark: Bookmark) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API}/api/v1/bookmarks/${bookmark.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: editLabel.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Update failed: HTTP ${response.status}`);
      }

      const updated: Bookmark = await response.json();

      setBookmarks((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setEditingId(null);
      setSuccess("Bookmark label updated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update label."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeBookmark(bookmark: Bookmark) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API}/api/v1/bookmarks/${bookmark.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(`Deletion failed: HTTP ${response.status}`);
      }

      setBookmarks((previous) =>
        previous.filter((item) => item.id !== bookmark.id)
      );

      setDeletingId(null);
      setSuccess("Bookmark removed. Original PDF preserved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Deletion failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-[var(--foreground)]"
      >
        <span>Saved Bookmarks ({bookmarks.length})</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Save and revisit evidence from Recall's cited answers.
          </p>

          <div className="flex gap-2">
            <input
              aria-label="Search bookmarks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search evidence, labels or PDFs..."
              className="min-w-0 flex-1 rounded-sm border border-[var(--border-soft)] p-3 text-sm"
            />
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void loadBookmarks()}
              className="rounded-sm border border-[var(--border-soft)] px-3 py-2 text-xs disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <p className="text-xs text-[var(--text-muted)]">
              Loading bookmarks...
            </p>
          )}

          {!loading && visible.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No matching bookmarks yet.
            </p>
          )}

          {!loading && visible.map((bookmark) => {
            const paper = papers.find(
              (item) => item.id === bookmark.document_id
            );

            return (
              <article
                key={bookmark.id}
                className="rounded-md border border-[var(--border-soft)] p-4"
              >
                {editingId === bookmark.id ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold">
                      Bookmark label
                      <input
                        value={editLabel}
                        maxLength={255}
                        disabled={busy}
                        onChange={(event) =>
                          setEditLabel(event.target.value)
                        }
                        className="mt-2 w-full rounded-sm border border-[var(--border-soft)] p-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveLabel(bookmark)}
                        className="rounded-sm bg-[var(--primary)] px-3 py-2 text-xs text-[var(--on-primary)] disabled:opacity-50"
                      >
                        Save label
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded-sm border border-[var(--border-soft)] px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <h4 className="text-sm font-semibold text-[var(--foreground)]">
                    {bookmark.label || "Saved evidence"}
                  </h4>
                )}

                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {paper?.filename ?? `Document ${bookmark.document_id}`}
                  {bookmark.page_number !== null
                    ? ` · Page ${bookmark.page_number}`
                    : ""}
                </p>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)]">
                  {bookmark.evidence}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!paper}
                    onClick={() => {
                      if (paper) {
                        onOpenPdf(paper, bookmark.page_number);
                      }
                    }}
                    className="rounded-sm bg-[var(--primary)] px-3 py-2 text-xs text-[var(--on-primary)] disabled:opacity-50"
                  >
                    Open PDF
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(bookmark.id);
                      setEditLabel(bookmark.label ?? "");
                      setDeletingId(null);
                    }}
                    className="rounded-sm border border-[var(--border-soft)] px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Edit label
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDeletingId(bookmark.id);
                      setEditingId(null);
                    }}
                    className="rounded-sm border border-[var(--danger-border)] px-3 py-2 text-xs text-[var(--danger)] disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>

                {deletingId === bookmark.id && (
                  <div className="mt-3 rounded-sm border border-[var(--danger-border)] p-3">
                    <p className="text-xs text-[var(--danger)]">
                      Remove this saved bookmark? The original PDF
                      and your research notes will not be deleted.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeBookmark(bookmark)}
                        className="rounded-sm bg-[var(--danger-solid)] px-3 py-2 text-xs text-white disabled:opacity-50"
                      >
                        Confirm remove
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeletingId(null)}
                        className="rounded-sm border border-[var(--border-soft)] px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {error && (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="text-xs text-[var(--accent-text)]">
              {success}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
