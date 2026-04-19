"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import LoadingAnimation from "@/components/LoadingAnimation";

type ShelfSummary = {
  id: string;
  name: string | null;
  locationDescription: string | null;
};

type InventoryItem = {
  id: string;
  shelfId: string | null;
  shelf: ShelfSummary | null;
  name: string;
  brand: string;
  quantity: number;
  category: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  description: string | null;
  photoUrl: string | null;
  size: string | null;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

async function readInventoryPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();
  if (!rawText) {
    return { json: null, text: "" };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { json: parsed, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

export default function AdminStockPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShelfId, setSelectedShelfId] = useState("all");

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/dataconnect/inventory-items?limit=500", {
        method: "GET",
      });

      const { json, text } = await readInventoryPayload(response);
      const payload = (json || {}) as {
        items?: InventoryItem[];
        error?: string;
      };

      if (!response.ok) {
        const details =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON from inventory API."
            : text.slice(0, 160));

        throw new Error(details || `Failed to load inventory (${response.status}).`);
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      setItems([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load admin inventory right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => {
      void loadInventory();
    }, 0);

    return () => {
      clearTimeout(timerId);
    };
  }, [loadInventory]);

  const shelfGroups = useMemo(() => {
    const map = new Map<
      string,
      { id: string; label: string; location: string | null; itemCount: number; totalUnits: number }
    >();

    for (const item of items) {
      const id = item.shelfId || "unassigned";
      const defaultLabel = item.shelfId ? `Shelf ${item.shelfId.slice(0, 8)}` : "Unassigned";
      const label = item.shelf?.name || defaultLabel;
      const location = item.shelf?.locationDescription || null;

      const current = map.get(id);
      if (!current) {
        map.set(id, {
          id,
          label,
          location,
          itemCount: 1,
          totalUnits: item.quantity,
        });
        continue;
      }

      current.itemCount += 1;
      current.totalUnits += item.quantity;
      if (!current.location && location) {
        current.location = location;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.itemCount - a.itemCount);
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return items.filter((item) => {
      if (selectedShelfId !== "all") {
        const itemShelf = item.shelfId || "unassigned";
        if (itemShelf !== selectedShelfId) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = normalizeText(
        [
          item.brand,
          item.name,
          item.category,
          item.size,
          item.description,
          item.shelf?.name,
          item.shelf?.locationDescription,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return haystack.includes(normalizedSearch);
    });
  }, [items, searchTerm, selectedShelfId]);

  const summary = useMemo(() => {
    const totalUnits = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
    return {
      totalItems: filteredItems.length,
      totalUnits,
    };
  }, [filteredItems]);

  const runDelete = useCallback(
    async (scope: "all" | "item" | "shelf", value?: string) => {
      if (isDeleting) {
        return;
      }

      setError("");
      setStatus("");

      if (scope === "all") {
        const confirmed = window.confirm(
          "Delete ALL inventory items? This action cannot be undone."
        );
        if (!confirmed) {
          return;
        }
      }

      if (scope === "item" && value) {
        const confirmed = window.confirm("Delete this inventory item?");
        if (!confirmed) {
          return;
        }
      }

      if (scope === "shelf" && value && value !== "unassigned") {
        const confirmed = window.confirm(
          "Delete all inventory items in this shelf group?"
        );
        if (!confirmed) {
          return;
        }
      }

      if (scope === "shelf" && value === "unassigned") {
        const confirmed = window.confirm(
          "Delete all unassigned inventory items?"
        );
        if (!confirmed) {
          return;
        }
      }

      setIsDeleting(true);
      try {
        const query =
          scope === "all"
            ? "scope=all"
            : scope === "item"
              ? `scope=item&itemId=${encodeURIComponent(value || "")}`
              : value === "unassigned"
                ? "scope=shelf&shelfId="
                : `scope=shelf&shelfId=${encodeURIComponent(value || "")}`;

        if (scope === "shelf" && value === "unassigned") {
          const ids = items.filter((item) => !item.shelfId).map((item) => item.id);
          let deleted = 0;

          for (const id of ids) {
            const response = await fetch(
              `/api/dataconnect/inventory-items?scope=item&itemId=${encodeURIComponent(id)}`,
              { method: "DELETE" }
            );

            if (response.ok) {
              deleted += 1;
            }
          }

          await loadInventory();
          setStatus(`Deleted ${deleted} unassigned item${deleted === 1 ? "" : "s"}.`);
          return;
        }

        const response = await fetch(`/api/dataconnect/inventory-items?${query}`, {
          method: "DELETE",
        });

        const { json, text } = await readInventoryPayload(response);
        const payload = (json || {}) as {
          deletedCount?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || text.slice(0, 160) || "Delete request failed.");
        }

        await loadInventory();
        const deletedCount = payload.deletedCount ?? 0;
        setStatus(`Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}.`);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete inventory items."
        );
      } finally {
        setIsDeleting(false);
      }
    },
    [isDeleting, items, loadInventory]
  );

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <main className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl md:p-8">
        <p className="inline-flex rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">
          Admin Inventory
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-4xl">
          Inventory Group Manager
        </h1>
        <p className="mt-3 text-sm text-slate-300 md:text-base">
          Search inventory, jump to a shelf group, and delete single items, shelf groups, or all inventory.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {isLoading
            ? "Loading inventory..."
            : `${summary.totalItems} items • ${summary.totalUnits} units shown`}
        </p>

        <section className="mt-5 rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_auto]">
            <label className="text-sm font-semibold text-slate-200">
              Search inventory
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by item, brand, category, shelf..."
                className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/60"
              />
            </label>

            <label className="text-sm font-semibold text-slate-200">
              Shelf group
              <select
                value={selectedShelfId}
                onChange={(event) => setSelectedShelfId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/60"
              >
                <option value="all">All shelves</option>
                {shelfGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} ({group.itemCount})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                disabled={isDeleting || isLoading || items.length === 0}
                onClick={() => void runDelete("all")}
                className="w-full rounded-lg border border-red-300/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete All Items
              </button>
            </div>
          </div>

          {shelfGroups.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {shelfGroups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-emerald-100">{group.label}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {group.itemCount} items • {group.totalUnits} units
                    {group.location ? ` • ${group.location}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedShelfId(group.id)}
                      className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-300/60"
                    >
                      View Group
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void runDelete("shelf", group.id)}
                      className="rounded-md border border-red-300/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete Group
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {status ? (
          <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {status}
          </p>
        ) : null}

        <section className="mt-5 rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <div className="overflow-auto rounded-lg border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-slate-800/70 text-slate-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Shelf</th>
                  <th className="px-3 py-2 font-semibold">Photo</th>
                  <th className="px-3 py-2 font-semibold">Brand</th>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Updated</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-900/60 text-slate-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-5 text-center text-slate-400">
                      <LoadingAnimation
                        message="Loading inventory..."
                        className="py-2"
                        iconClassName="h-20 w-20"
                        messageClassName="mt-2 text-sm font-medium text-slate-300"
                      />
                    </td>
                  </tr>
                ) : filteredItems.length ? (
                  filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-emerald-100">
                        {item.shelf?.name || (item.shelfId ? `Shelf ${item.shelfId.slice(0, 8)}` : "Unassigned")}
                      </td>
                      <td className="px-3 py-2">
                        {item.photoUrl ? (
                          <Image
                            src={item.photoUrl}
                            alt={`${item.name} photo`}
                            width={52}
                            height={52}
                            className="h-12 w-12 rounded-md border border-white/10 object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.brand}</td>
                      <td className="px-3 py-2 text-slate-100">{item.name}</td>
                      <td className="px-3 py-2">{item.category || "other"}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2 text-slate-300">{formatTimestamp(item.updatedAt)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void runDelete("item", item.id)}
                          className="rounded-md border border-red-300/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-3 py-5 text-center text-slate-400">
                      No inventory items match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-emerald-300/60"
          >
            Admin Dashboard
          </Link>
          <Link
            href="/inventory"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-emerald-300/60"
          >
            AI Inventory Upload
          </Link>
        </div>
      </main>
    </div>
  );
}
