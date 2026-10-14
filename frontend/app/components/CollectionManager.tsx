"use client";

import { useState } from "react";

type Collection = {
  id: number;
  name: string;
  description: string | null;
  document_count: number;
  documents: {
    id: number;
    filename: string;
  }[];
};

type Paper = {
  id: number;
  filename: string;
};

type Props = {
  collections: Collection[];
  onCollectionsChanged: (collections: Collection[]) => void;
};

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function CollectionManager({
  collections,
  onCollectionsChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [availablePapers, setAvailablePapers] = useState<Paper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [updatingPaperId, setUpdatingPaperId] = useState<number | null>(null);

  async function createCollection() {
    const trimmedName = name.trim();

    if (!trimmedName || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/api/v1/collections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Could not create collection (HTTP ${response.status}).`
        );
      }

      setSuccess(`Created "${trimmedName}".`);
      setName("");
      setDescription("");

      const refresh = await fetch(`${API}/api/v1/collections`);

      if (!refresh.ok) {
        throw new Error(
          "Collection created, but refreshing the list failed."
        );
      }

      const updated: Collection[] = await refresh.json();
      onCollectionsChanged(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setSaving(false);
    }
  }

  async function renameCollection(id: number) {
    const trimmedName = editName.trim();

    if (!trimmedName || renaming) return;

    setRenaming(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API}/api/v1/collections/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmedName }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Could not rename collection (HTTP ${response.status}).`
        );
      }

      const refresh = await fetch(`${API}/api/v1/collections`);

      if (!refresh.ok) {
        throw new Error(
          "Rename succeeded, but refreshing collections failed."
        );
      }

      const updated: Collection[] = await refresh.json();
      onCollectionsChanged(updated);

      setEditingId(null);
      setEditName("");
      setSuccess(`Renamed collection to "${trimmedName}".`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Rename failed."
      );
    } finally {
      setRenaming(false);
    }
  }

  async function openPaperManager(collectionId: number) {
    if (expandedId === collectionId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(collectionId);
    setPaperError("");
    setLoadingPapers(true);

    try {
      const response = await fetch(`${API}/api/v1/documents`);

      if (!response.ok) {
        throw new Error(
          `Could not load PDFs (HTTP ${response.status}).`
        );
      }

      const data: Paper[] = await response.json();
      setAvailablePapers(data);
    } catch (err) {
      setPaperError(
        err instanceof Error ? err.message : "Could not load PDFs."
      );
    } finally {
      setLoadingPapers(false);
    }
  }

  async function updatePaperMembership(
    collectionId: number,
    paperId: number,
    isMember: boolean
  ) {
    if (updatingPaperId !== null) return;

    setUpdatingPaperId(paperId);
    setPaperError("");
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API}/api/v1/collections/${collectionId}/documents/${paperId}`,
        { method: isMember ? "DELETE" : "POST" }
      );

      if (!response.ok) {
        throw new Error(
          `Could not update PDF membership (HTTP ${response.status}).`
        );
      }

      const refresh = await fetch(`${API}/api/v1/collections`);

      if (!refresh.ok) {
        throw new Error(
          "Membership updated, but collection refresh failed."
        );
      }

      const updated: Collection[] = await refresh.json();
      onCollectionsChanged(updated);

      setSuccess(
        isMember
          ? "PDF removed from collection. Original PDF preserved."
          : "PDF added to collection."
      );
    } catch (err) {
      setPaperError(
        err instanceof Error
          ? err.message
          : "Could not update PDF membership."
      );
    } finally {
      setUpdatingPaperId(null);
    }
  }

  async function deleteCollection(collection: Collection) {
    if (deleting || updatingPaperId !== null || renaming || saving) return;

    if (deleteConfirmation !== collection.name) {
      setError("Type the exact collection name to confirm.");
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      // Recheck the collection before deleting.
      const check = await fetch(
        `${API}/api/v1/collections/${collection.id}`
      );

      if (!check.ok) {
        throw new Error("Could not verify collection before deletion.");
      }

      const current: Collection = await check.json();

      if (current.document_count !== 0 ||
          (current.documents?.length ?? 0) !== 0) {
        throw new Error(
          "Remove all PDFs from this collection before deleting it."
        );
      }

      if (current.name !== deleteConfirmation) {
        throw new Error(
          "Collection name changed. Please confirm again."
        );
      }

      const response = await fetch(
        `${API}/api/v1/collections/${collection.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(
          `Could not delete collection (HTTP ${response.status}).`
        );
      }

      setDeletingId(null);
      setDeleteConfirmation("");
      setExpandedId(null);
      setSuccess(`Deleted collection "${collection.name}".`);

      const refresh = await fetch(`${API}/api/v1/collections`);

      if (!refresh.ok) {
        throw new Error(
          "Collection deleted, but refreshing the list failed."
        );
      }

      const updated: Collection[] = await refresh.json();
      onCollectionsChanged(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Deletion failed."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[#e1e7dd] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#183e2c]"
        aria-expanded={open}
      >
        <span>Manage research collections</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-stone-500">
            {collections.length} collection(s)
          </div>

          {collections.map((collection) => (
            <div
              key={collection.id}
              className="rounded-lg bg-[#f5f8f3] p-3"
            >
              {editingId === collection.id ? (
                <div className="space-y-2">
                  <label
                    htmlFor={`edit-collection-${collection.id}`}
                    className="block text-xs font-semibold text-stone-600"
                  >
                    Collection name
                  </label>

                  <input
                    id={`edit-collection-${collection.id}`}
                    value={editName}
                    maxLength={120}
                    disabled={renaming}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white p-2 text-sm"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!editName.trim() || renaming}
                      onClick={() => void renameCollection(collection.id)}
                      className="rounded-lg bg-[#173e31] px-3 py-2 text-xs text-white disabled:opacity-50"
                    >
                      {renaming ? "Saving..." : "Save"}
                    </button>

                    <button
                      type="button"
                      disabled={renaming}
                      onClick={() => {
                        setEditingId(null);
                        setEditName("");
                      }}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-[#183e2c]">
                      {collection.name}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {collection.document_count} papers
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={renaming}
                    onClick={() => {
                      setEditingId(collection.id);
                      setEditName(collection.name);
                      setError("");
                      setSuccess("");
                    }}
                    className="shrink-0 text-xs font-semibold text-[#467850] hover:underline disabled:opacity-50"
                  >
                    Edit name
                  </button>
                </div>
              )}

              <div className="mt-3">
                {deletingId === collection.id ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-xs font-semibold text-rose-800">
                      Delete this collection?
                    </p>

                    <p className="mt-2 text-xs text-rose-700">
                      Only empty collections can be deleted.
                      Type the exact collection name to confirm.
                    </p>

                    <input
                      aria-label="Confirm collection name"
                      value={deleteConfirmation}
                      disabled={deleting}
                      onChange={(event) =>
                        setDeleteConfirmation(event.target.value)
                      }
                      placeholder={collection.name}
                      className="mt-3 w-full rounded-lg border border-rose-200 bg-white p-2 text-sm"
                    />

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={
                          deleting ||
                          collection.document_count !== 0 ||
                          deleteConfirmation !== collection.name
                        }
                        onClick={() => void deleteCollection(collection)}
                        className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {deleting ? "Deleting..." : "Confirm delete"}
                      </button>

                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setDeletingId(null);
                          setDeleteConfirmation("");
                          setError("");
                        }}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>

                    {collection.document_count !== 0 && (
                      <p className="mt-2 text-xs text-rose-700">
                        Remove all PDFs using Manage PDFs first.
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      deleting ||
                      updatingPaperId !== null ||
                      renaming ||
                      saving
                    }
                    onClick={() => {
                      setDeletingId(collection.id);
                      setDeleteConfirmation("");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50"
                  >
                    Delete collection
                  </button>
                )}
              </div>

              <div className="mt-3 border-t border-stone-200 pt-3">
                <button
                  type="button"
                  disabled={updatingPaperId !== null || deleting}
                  onClick={() => void openPaperManager(collection.id)}
                  className="text-xs font-semibold text-[#467850] hover:underline disabled:opacity-50"
                  aria-expanded={expandedId === collection.id}
                >
                  {expandedId === collection.id
                    ? "Hide PDFs"
                    : "Manage PDFs"}
                </button>

                {expandedId === collection.id && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-stone-500">
                      Add or remove indexed PDFs. Your original files
                      and embeddings are never deleted.
                    </p>

                    {loadingPapers && (
                      <p className="text-xs text-stone-500">
                        Loading indexed PDFs...
                      </p>
                    )}

                    {!loadingPapers &&
                      availablePapers.map((paper) => {
                        const isMember = (collection.documents ?? [])
                          .some((item) => item.id === paper.id);

                        const updating = updatingPaperId === paper.id;

                        return (
                          <div
                            key={paper.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
                          >
                            <div className="min-w-0">
                              <p
                                className="truncate text-xs font-medium text-stone-700"
                                title={paper.filename}
                              >
                                {paper.filename}
                              </p>

                              <p className="mt-1 text-xs text-stone-400">
                                {isMember
                                  ? "In this collection"
                                  : "Not in this collection"}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={updatingPaperId !== null}
                              onClick={() =>
                                void updatePaperMembership(
                                  collection.id,
                                  paper.id,
                                  isMember
                                )
                              }
                              className={
                                "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 " +
                                (isMember
                                  ? "border border-stone-200 bg-white text-rose-700"
                                  : "bg-[#173e31] text-white")
                              }
                            >
                              {updating
                                ? "Updating..."
                                : isMember
                                  ? "Remove"
                                  : "Add"}
                            </button>
                          </div>
                        );
                      })}

                    {!loadingPapers &&
                      availablePapers.length === 0 &&
                      !paperError && (
                        <p className="text-xs text-stone-500">
                          No indexed PDFs available.
                        </p>
                      )}

                    {paperError && (
                      <p role="alert" className="text-xs text-rose-700">
                        {paperError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="border-t border-stone-100 pt-3">
            <label
              htmlFor="new-collection-name"
              className="block text-xs font-semibold text-stone-600"
            >
              New collection
            </label>

            <input
              id="new-collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Developmental Psychology"
              maxLength={120}
              className="mt-2 w-full rounded-lg border border-stone-200 p-3 text-sm outline-none focus:border-[#609474]"
            />

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 p-3 text-sm outline-none focus:border-[#609474]"
            />

            <button
              type="button"
              disabled={!name.trim() || saving}
              onClick={() => void createCollection()}
              className="mt-2 rounded-lg bg-[#173e31] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create collection"}
            </button>
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
    </div>
  );
}
