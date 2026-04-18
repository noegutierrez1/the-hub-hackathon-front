"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShelfSummary = {
  id: string;
  name: string | null;
  locationDescription: string | null;
};

type StudentInventoryItem = {
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

export default function StudentInventoryPage() {
  const [items, setItems] = useState<StudentInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
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
        items?: StudentInventoryItem[];
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
          : "Could not load student inventory right now."
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

  const inventorySummary = useMemo(() => {
    const totalUnits = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
    return {
      totalItems: filteredItems.length,
      totalUnits,
    };
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <main className="mx-auto w-full max-w-6xl space-y-5 rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Student View
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-4xl">
              Current Hub Inventory
            </h1>
            <p className="mt-2 text-sm text-slate-300 md:text-base">
              Inventory grouped by shelf upload so you can find specific stock faster.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {isLoading
                ? "Loading latest inventory..."
                : `${inventorySummary.totalItems} items • ${inventorySummary.totalUnits} units shown`}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-xs">
            <Link
              href="/"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
            >
              Home
            </Link>
            <Link
              href="/hours"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
            >
              Hours
            </Link>
            <Link
              href="/events"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
            >
              Events
            </Link>
            <button
              type="button"
              onClick={() => void loadInventory()}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
            >
              Refresh
            </button>
          </nav>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
            <label className="text-sm font-semibold text-slate-200">
              Search inventory
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by item, brand, category, shelf..."
                className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
              />
            </label>

            <label className="text-sm font-semibold text-slate-200">
              Shelf group
              <select
                value={selectedShelfId}
                onChange={(event) => setSelectedShelfId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
              >
                <option value="all">All shelves</option>
                {shelfGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} ({group.itemCount} items)
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shelfGroups.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {shelfGroups.map((group) => {
                const isActive = selectedShelfId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedShelfId(group.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      isActive
                        ? "border-cyan-300/70 bg-cyan-300/20 text-cyan-100"
                        : "border-white/20 bg-slate-900 text-slate-200 hover:border-cyan-300/60"
                    }`}
                  >
                    {group.label} • {group.itemCount}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedShelfId("all")}
                className="rounded-full border border-white/20 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-cyan-300/60"
              >
                Clear shelf filter
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-slate-800/70 text-slate-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Shelf</th>
                  <th className="px-3 py-2 font-semibold">Brand</th>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-900/60 text-slate-200">
                {filteredItems.length ? (
                  filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-cyan-100">
                        {item.shelf?.name || (item.shelfId ? `Shelf ${item.shelfId.slice(0, 8)}` : "Unassigned")}
                      </td>
                      <td className="px-3 py-2">{item.brand}</td>
                      <td className="px-3 py-2 text-slate-100">{item.name}</td>
                      <td className="px-3 py-2">{item.category || "other"}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{item.size || "-"}</td>
                      <td className="px-3 py-2 text-emerald-200">{formatTimestamp(item.updatedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-slate-400">
                      {isLoading
                        ? "Loading inventory..."
                        : "No inventory items match your current filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-sm text-slate-400">Live data source: /api/dataconnect/inventory-items</p>
      </main>
    </div>
  );
}
