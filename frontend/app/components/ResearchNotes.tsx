"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Paper = {
  id: number;
  filename: string;
  created_at: string;
};

type Collection = {
  id: number;
  name: string;
  description: string | null;
  document_count: number;
  documents: { id: number; filename: string }[];
};

type Note = {
  id: number;
  document_id: number;
  collection_id: number | null;
  page_number: number | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  papers: Paper[];
  collections: Collection[];
  onOpenPdf: (paper: Paper, page: number | null) => void;
};

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function ResearchNotes({
  papers,
  collections,
  onOpenPdf,
}: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [documentId, setDocumentId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editPage, setEditPage] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/api/v1/notes`);

      if (!response.ok) {
        throw new Error(`Could not load notes (HTTP ${response.status}).`);
      }

      const data: Note[] = await response.json();
      setNotes(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notes."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadNotes();
    }
  }, [open, loadNotes]);

  const eligibleCollections = useMemo(() => {
    if (!documentId) return [];

    return collections.filter((collection) =>
      collection.documents.some(
        (document) => document.id === Number(documentId)
      )
    );
  }, [collections, documentId]);

  const visibleNotes = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return notes;

    return notes.filter((note) => {
      const filename =
        papers.find((paper) => paper.id === note.document_id)
          ?.filename ?? "";

      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        filename.toLowerCase().includes(query)
      );
    });
  }, [notes, papers, search]);

  async function createNote() {

    if (!documentId || !title.trim() || !content.trim() || saving) {
      return;
    }

    const page = pageNumber.trim()
      ? Number(pageNumber)
      : null;

    if (
      page !== null &&
      (!Number.isSafeInteger(page) || page < 1)
    ) {
      setError("Page number must be a positive whole number.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/api/v1/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: Number(documentId),
          collection_id: collectionId ? Number(collectionId) : null,
          page_number: page,
          title: title.trim(),
          content: content.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Could not create note (HTTP ${response.status}).`
        );
      }

      const created: Note = await response.json();

      setNotes((previous) => [created, ...previous]);
      setTitle("");
      setContent("");
      setPageNumber("");
      setSuccess("Research note saved successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save note."
      );
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(note: Note) {
    if (saving || editingSaving || deleting) return;
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditPage(note.page_number?.toString() ?? "");
    setDeletingId(null);
    setError("");
    setSuccess("");
  }

  async function saveEdit(noteId: number) {
    if (saving || editingSaving || deleting) return;

    const newTitle = editTitle.trim();
    const newContent = editContent.trim();
    const newPage = editPage.trim() ? Number(editPage) : null;

    if (!newTitle || !newContent) {
      setError("Title and content are required.");
      return;
    }

    if (
      newPage !== null &&
      (!Number.isSafeInteger(newPage) || newPage < 1)
    ) {
      setError("Page must be a positive whole number.");
      return;
    }

    setEditingSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/api/v1/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          page_number: newPage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update failed (HTTP ${response.status}).`);
      }

      const updated: Note = await response.json();

      setNotes((previous) =>
        previous.map((note) =>
          note.id === noteId ? updated : note
        )
      );

      setEditingId(null);
      setSuccess("Research note updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditingSaving(false);
    }
  }

  async function deleteNote(note: Note) {
    if (saving || editingSaving || deleting) return;

    if (deleteConfirmation !== note.title) {
      setError("Enter the exact note title to confirm deletion.");
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/api/v1/notes/${note.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Deletion failed (HTTP ${response.status}).`);
      }

      setNotes((previous) =>
        previous.filter((item) => item.id !== note.id)
      );

      setDeletingId(null);
      setDeleteConfirmation("");
      setSuccess("Note deleted. Its PDF was not affected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-[#e1e7dd] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#183e2c]"
        aria-expanded={open}
      >
        <span>Research Notes</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-xs leading-5 text-stone-500">
            Save your thoughts, observations, and findings alongside
            your research PDFs.
          </p>

          <div className="space-y-3 rounded-xl bg-[#f5f8f3] p-4">
            <h3 className="text-sm font-semibold text-[#183e2c]">
              New research note
            </h3>

            <label
              htmlFor="note-document"
              className="block text-xs font-semibold text-stone-600"
            >
              Research paper
            </label>

            <select
              id="note-document"
              required
              value={documentId}
              onChange={(event) => {
                setDocumentId(event.target.value);
                setCollectionId("");
              }}
              className="w-full rounded-lg border border-stone-200 bg-white p-3 text-sm"
            >
              <option value="">Select a PDF</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.filename}
                </option>
              ))}
            </select>

            <label
              htmlFor="note-collection"
              className="block text-xs font-semibold text-stone-600"
            >
              Research collection (optional)
            </label>

            <select
              id="note-collection"
              value={collectionId}
              disabled={!documentId}
              onChange={(event) => setCollectionId(event.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white p-3 text-sm disabled:opacity-50"
            >
              <option value="">No collection</option>
              {eligibleCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>

            <label
              htmlFor="note-page"
              className="block text-xs font-semibold text-stone-600"
            >
              PDF page (optional)
            </label>

            <input
              id="note-page"
              type="number"
              min="1"
              step="1"
              value={pageNumber}
              onChange={(event) => setPageNumber(event.target.value)}
              placeholder="e.g. 4"
              className="w-full rounded-lg border border-stone-200 bg-white p-3 text-sm"
            />

            <label
              htmlFor="note-title"
              className="block text-xs font-semibold text-stone-600"
            >
              Note title
            </label>

            <input
              id="note-title"
              required
              maxLength={255}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Key findings"
              className="w-full rounded-lg border border-stone-200 bg-white p-3 text-sm"
            />

            <label
              htmlFor="note-content"
              className="block text-xs font-semibold text-stone-600"
            >
              Your notes
            </label>

            <textarea
              id="note-content"
              required
              maxLength={20000}
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write your research observations..."
              className="w-full resize-y rounded-lg border border-stone-200 bg-white p-3 text-sm"
            />

            <button
              type="button"
              onClick={() => void createNote()}
              disabled={
                saving ||
                !documentId ||
                !title.trim() ||
                !content.trim()
              }
              className="rounded-lg bg-[#173e31] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save research note"}
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#183e2c]">
                Saved notes ({notes.length})
              </h3>

              <button
                type="button"
                onClick={() => void loadNotes()}
                disabled={loading}
                className="text-xs font-semibold text-[#467850] disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <input
              aria-label="Search research notes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes or papers..."
              className="w-full rounded-lg border border-stone-200 p-3 text-sm"
            />

            {loading && (
              <p className="text-xs text-stone-500">Loading notes...</p>
            )}

            {!loading && visibleNotes.length === 0 && (
              <p className="text-xs text-stone-500">
                No matching notes yet.
              </p>
            )}

            {!loading && visibleNotes.map((note) => {
              const paper = papers.find(
                (item) => item.id === note.document_id
              );

              const collection = collections.find(
                (item) => item.id === note.collection_id
              );

              return (
                <article
                  key={note.id}
                  className="rounded-xl border border-stone-200 p-4"
                >
                  {editingId === note.id ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold">
                        Title
                        <input
                          value={editTitle}
                          maxLength={255}
                          disabled={editingSaving}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
                        />
                      </label>

                      <label className="block text-xs font-semibold">
                        PDF page (optional)
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={editPage}
                          disabled={editingSaving}
                          onChange={(event) => setEditPage(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
                        />
                      </label>

                      <label className="block text-xs font-semibold">
                        Content
                        <textarea
                          value={editContent}
                          maxLength={20000}
                          rows={4}
                          disabled={editingSaving}
                          onChange={(event) => setEditContent(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
                        />
                      </label>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={editingSaving || !editTitle.trim() || !editContent.trim()}
                          onClick={() => void saveEdit(note.id)}
                          className="rounded-lg bg-[#173e31] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {editingSaving ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          disabled={editingSaving}
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-stone-200 px-3 py-2 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#183e2c]">
                          {note.title}
                        </h4>
                        <button
                          type="button"
                          disabled={saving || editingSaving || deleting}
                          onClick={() => beginEdit(note)}
                          className="text-xs font-semibold text-[#467850] disabled:opacity-50"
                        >
                          Edit
                        </button>
                      </div>

                  <p className="mt-2 text-xs text-stone-500">
                    {paper?.filename ?? `Document ${note.document_id}`}
                    {note.page_number !== null
                      ? ` · Page ${note.page_number}`
                      : ""}
                  </p>

                  {collection && (
                    <p className="mt-1 text-xs text-[#467850]">
                      {collection.name}
                    </p>
                  )}

                  {paper && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPdf(paper, note.page_number)
                      }
                      className="mt-3 inline-flex items-center rounded-lg border border-[#c8dacb] bg-[#eef5e9] px-3 py-2 text-xs font-semibold text-[#315a3b] hover:bg-[#e0eddd]"
                    >
                      Open PDF
                      {note.page_number !== null
                        ? ` - Page ${note.page_number}`
                        : ""}
                    </button>
                  )}

                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                    {note.content}
                  </p>

                  <div className="mt-4 border-t border-stone-100 pt-3">
                    {deletingId === note.id ? (
                      <div className="space-y-2 rounded-lg border border-rose-200 p-3">
                        <p className="text-xs text-rose-700">
                          Type the exact note title to confirm deletion.
                          The linked PDF will be preserved.
                        </p>

                        <input
                          aria-label="Confirm note title"
                          value={deleteConfirmation}
                          disabled={deleting}
                          onChange={(event) =>
                            setDeleteConfirmation(event.target.value)
                          }
                          placeholder={note.title}
                          className="w-full rounded-lg border border-stone-200 p-2 text-sm"
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={deleting || deleteConfirmation !== note.title}
                            onClick={() => void deleteNote(note)}
                            className="rounded-lg bg-rose-700 px-3 py-2 text-xs text-white disabled:opacity-50"
                          >
                            {deleting ? "Deleting..." : "Confirm delete"}
                          </button>

                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => {
                              setDeletingId(null);
                              setDeleteConfirmation("");
                            }}
                            className="rounded-lg border border-stone-200 px-3 py-2 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving || editingSaving || deleting}
                        onClick={() => {
                          setEditingId(null);
                          setDeletingId(note.id);
                          setDeleteConfirmation("");
                          setError("");
                        }}
                        className="text-xs font-semibold text-rose-700 disabled:opacity-50"
                      >
                        Delete note
                      </button>
                    )}
                  </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="text-xs text-green-700">
              {success}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
