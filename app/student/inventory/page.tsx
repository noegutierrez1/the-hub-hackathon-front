"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingAnimation from "@/components/LoadingAnimation";
import HexPanel from "../../components/HexPanel";

type ShelfSummary = {
  id: string;
  name: string | null;
  locationDescription: string | null;
};

type ItemLocation = {
  centerX: number;
  centerY: number;
  radius: number;
  imageWidth: number;
  imageHeight: number;
};

type StudentInventoryItem = {
  id: string;
  shelfId: string | null;
  shelf: ShelfSummary | null;
  name: string;
  brand: string;
  quantity: number;
  category: string | null;
  type: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  description: string | null;
  photoUrl: string | null;
  size: string | null;
  location: ItemLocation | null;
};

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "dry", label: "Dry" },
  { value: "refrigerated", label: "Refrigerated" },
  { value: "frozen", label: "Frozen" },
  { value: "beverage", label: "Beverage" },
  { value: "produce", label: "Produce" },
  { value: "hygiene", label: "Hygiene" },
  { value: "other", label: "Other" },
];

const CATEGORY_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  dry: { bg: "rgba(180,120,20,0.18)", color: "#d97706" },
  refrigerated: { bg: "rgba(37,99,235,0.18)", color: "#3b82f6" },
  frozen: { bg: "rgba(99,102,241,0.18)", color: "#818cf8" },
  beverage: { bg: "rgba(6,182,212,0.18)", color: "#22d3ee" },
  produce: { bg: "rgba(22,163,74,0.18)", color: "#4ade80" },
  hygiene: { bg: "rgba(139,92,246,0.18)", color: "#a78bfa" },
  other: { bg: "rgba(107,114,128,0.18)", color: "#9ca3af" },
};

function getCategoryStyle(category: string | null) {
  const key = category?.trim().toLowerCase() ?? "other";
  return CATEGORY_BADGE_STYLES[key] ?? CATEGORY_BADGE_STYLES.other;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnknownDisplayValue(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return "";
  const withoutUnknownPrefix = text.replace(/^unknown[\s:-]*/i, "").trim();
  const normalizedOriginal = normalizeText(text);
  const normalizedCleaned = normalizeText(withoutUnknownPrefix);
  if (
    normalizedOriginal === "unknown" ||
    normalizedOriginal === "unknown brand" ||
    normalizedOriginal === "unknown item" ||
    normalizedCleaned === "unknown" ||
    normalizedCleaned === "unknown brand" ||
    normalizedCleaned === "unknown item"
  ) {
    return "";
  }
  return withoutUnknownPrefix || text;
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word.length > 2
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase()
    )
    .join(" ");
}

function buildDisplayProductTitle(item: Pick<StudentInventoryItem, "brand" | "name">) {
  const rawBrand = (item.brand || "").trim();
  const rawName = (item.name || "").trim();
  const cleanBrand = normalizeUnknownDisplayValue(rawBrand);
  const cleanName = normalizeUnknownDisplayValue(rawName);
  const nameStartedAsUnknown = /^unknown\b/i.test(rawName);
  const displayName =
    cleanName && nameStartedAsUnknown ? toTitleCase(cleanName) : cleanName;
  const combined = [cleanBrand, displayName].filter(Boolean).join(" ").trim();
  return combined || "Unknown item";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /res\.cloudinary\.com\//i.test(url) && /\/image\/upload\//i.test(url);
}

function isPreCroppedCloudinaryUrl(url: string | null | undefined): boolean {
  if (!isCloudinaryUrl(url)) return false;
  return /\/image\/upload\/[^/]*\bc_crop\b/i.test(url as string);
}

function buildCloudinaryCropUrl(
  photoUrl: string | null,
  location: ItemLocation | null,
  options: {
    padding?: number;
    minSize?: number;
    outputSize?: number;
    maxFraction?: number;
  } = {}
): string | null {
  if (!photoUrl || !isCloudinaryUrl(photoUrl)) return null;
  if (isPreCroppedCloudinaryUrl(photoUrl)) return photoUrl;
  if (!location) return null;

  const { centerX, centerY, radius, imageWidth, imageHeight } = location;
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius) ||
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    radius <= 0
  ) {
    return null;
  }

  const padding = options.padding ?? 1.2;
  const minSize = options.minSize ?? 96;
  const outputSize = options.outputSize ?? 480;
  const maxFraction = options.maxFraction ?? 0.45;
  const smallerSide = Math.min(imageWidth, imageHeight);
  const hardMax = Math.max(minSize, Math.floor(smallerSide * maxFraction));
  const boxFromRadius = radius * 2 * padding;
  const cropSize = Math.max(
    1,
    Math.min(Math.round(Math.max(boxFromRadius, minSize)), hardMax, Math.floor(smallerSide))
  );
  const maxX = Math.max(0, Math.floor(imageWidth) - cropSize);
  const maxY = Math.max(0, Math.floor(imageHeight) - cropSize);
  const cropX = clamp(Math.round(centerX - cropSize / 2), 0, maxX);
  const cropY = clamp(Math.round(centerY - cropSize / 2), 0, maxY);
  const transforms = [
    `c_crop,x_${cropX},y_${cropY},w_${cropSize},h_${cropSize}`,
    `c_fill,w_${outputSize},h_${outputSize}`,
    "q_auto,f_auto",
  ].join("/");
  return (photoUrl as string).replace(/\/image\/upload\//, `/image/upload/${transforms}/`);
}

function resolveItemImageUrl(
  item: Pick<StudentInventoryItem, "photoUrl" | "location">,
  options?: { outputSize?: number; padding?: number; minSize?: number; maxFraction?: number }
): { src: string | null; isServerCropped: boolean } {
  const cloudinaryCrop = buildCloudinaryCropUrl(item.photoUrl, item.location, options);
  if (cloudinaryCrop) return { src: cloudinaryCrop, isServerCropped: true };
  return { src: item.photoUrl ?? null, isServerCropped: false };
}

function effectiveLocation(item: {
  photoUrl: string | null;
  location: ItemLocation | null;
}): ItemLocation | null {
  if (isPreCroppedCloudinaryUrl(item.photoUrl)) return null;
  if (isCloudinaryUrl(item.photoUrl) && item.location) return null;
  return item.location;
}

function initialZoomLevelFor(item: {
  photoUrl: string | null;
  location: ItemLocation | null;
}): number {
  return effectiveLocation(item) ? 1.35 : 1.8;
}

function buildZoomStyle(location: ItemLocation | null) {
  if (!location) {
    return { objectPosition: "50% 50%", transformOrigin: "50% 50%", transform: "scale(1)" } as const;
  }
  const xPct = clamp((location.centerX / location.imageWidth) * 100, 0, 100);
  const yPct = clamp((location.centerY / location.imageHeight) * 100, 0, 100);
  const diameter = Math.max(1, location.radius * 2);
  const reference = Math.max(1, Math.min(location.imageWidth, location.imageHeight));
  const zoomScale = clamp((reference / diameter) * 0.65, 1.2, 3.6);
  return {
    objectPosition: `${xPct}% ${yPct}%`,
    transformOrigin: `${xPct}% ${yPct}%`,
    transform: `scale(${zoomScale.toFixed(2)})`,
  } as const;
}

function buildModalZoomStyle(location: ItemLocation | null, zoomLevel: number) {
  if (!location) {
    return {
      objectPosition: "50% 50%",
      transformOrigin: "50% 50%",
      transform: `scale(${zoomLevel.toFixed(2)})`,
    } as const;
  }
  const baseStyle = buildZoomStyle(location);
  const baseScaleMatch = baseStyle.transform.match(/scale\(([^)]+)\)/);
  const baseScale = baseScaleMatch?.[1] ? Number(baseScaleMatch[1]) : 1;
  const effectiveScale = clamp(baseScale * zoomLevel, 1, 8);
  return {
    objectPosition: baseStyle.objectPosition,
    transformOrigin: baseStyle.transformOrigin,
    transform: `scale(${effectiveScale.toFixed(2)})`,
  } as const;
}

async function readInventoryPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();
  if (!rawText) return { json: null, text: "" };
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { json: parsed, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function StudentInventoryPage() {
  const [items, setItems] = useState<StudentInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoomItem, setZoomItem] = useState<StudentInventoryItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.8);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dataconnect/inventory-items?limit=500", { method: "GET" });
      const { json, text } = await readInventoryPayload(response);
      const payload = (json || {}) as { items?: StudentInventoryItem[]; error?: string };
      if (!response.ok) {
        const details =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON from inventory API."
            : text.slice(0, 160));
        throw new Error(details || `Failed to load inventory (${response.status}).`);
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setLastUpdated(new Date());
    } catch (loadError) {
      setItems([]);
      setError(
        loadError instanceof Error ? loadError.message : "Could not load student inventory right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => { void loadInventory(); }, 0);
    return () => { clearTimeout(timerId); };
  }, [loadInventory]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    return items.filter((item) => {
      if (selectedCategory !== "all") {
        const itemCategory = item.category?.trim().toLowerCase() || "other";
        if (itemCategory !== selectedCategory.toLowerCase()) return false;
      }
      if (!normalizedSearch) return true;
      const haystack = normalizeText(
        [item.brand, item.name, item.type, item.category, item.size, item.description]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(normalizedSearch);
    });
  }, [items, searchTerm, selectedCategory]);

  const totalUnits = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.quantity, 0),
    [filteredItems]
  );

  const closeZoomModal = () => {
    setZoomItem(null);
    setZoomLevel(1.8);
  };

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        background: "var(--fp-page-bg)",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {/* Header */}
        <HexPanel
          contentStyle={{ padding: "18px 22px" }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--fp-text-muted)",
              margin: "0 0 4px",
            }}
          >
            The Hub · Pantry
          </p>
          <h1
            style={{
              color: "var(--fp-text-primary)",
              fontSize: "clamp(20px, 4vw, 28px)",
              fontWeight: 800,
              margin: 0,
            }}
          >
            Available Inventory
          </h1>
        </HexPanel>

        {/* Alerts */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid rgba(220,38,38,0.4)",
              background: "rgba(220,38,38,0.08)",
              color: "#fca5a5",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {/* Search + filter */}
        <HexPanel
          fill="var(--fp-surface-secondary)"
          contentStyle={{
            padding: "14px 18px",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <label
            style={{
              flex: "1 1 200px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--fp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product, brand, type…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 13px",
                borderRadius: 9,
                border: "1px solid var(--fp-input-border)",
                background: "var(--fp-input-bg)",
                color: "var(--fp-text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </label>

          <label
            style={{
              flex: "0 1 180px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--fp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Category
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 13px",
                borderRadius: 9,
                border: "1px solid var(--fp-input-border)",
                background: "var(--fp-input-bg)",
                color: "var(--fp-text-primary)",
                fontSize: 14,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              flex: "1 1 auto",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ fontSize: 13, color: "var(--fp-text-secondary)", margin: 0 }}>
                {isLoading
                  ? "Loading…"
                  : `${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"} · ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`}
              </p>
              {lastUpdated && !isLoading && (
                <p style={{ fontSize: 11, color: "var(--fp-text-muted)", margin: 0 }}>
                  Last updated: {timeAgo(lastUpdated)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadInventory()}
              disabled={isLoading}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "1px solid var(--fp-input-border)",
                background: "var(--fp-input-bg)",
                color: "var(--fp-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              Refresh
            </button>
          </div>
        </HexPanel>

        {/* Grid */}
        {filteredItems.length > 0 ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {filteredItems.map((item) => {
              const productTitle = buildDisplayProductTitle(item);
              const isOutOfStock = item.quantity <= 0;
              const { src: cardImageSrc, isServerCropped: cardUsesServerCrop } =
                resolveItemImageUrl(item, { outputSize: 480, padding: 1.2, minSize: 96 });
              const cardZoomStyle = cardUsesServerCrop
                ? buildZoomStyle(null)
                : buildZoomStyle(effectiveLocation(item));
              const catStyle = getCategoryStyle(item.category);
              const categoryLabel =
                (item.category?.trim() || "other")
                  .charAt(0)
                  .toUpperCase() +
                (item.category?.trim() || "other").slice(1).toLowerCase();

              return (
                <article
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md"
                  style={{
                    borderColor: "var(--fp-panel-border)",
                    background: "var(--fp-surface-secondary)",
                  }}
                >
                  {/* Image area */}
                  <div
                    className="relative flex h-40 items-center justify-center p-2"
                    style={{
                      borderBottom: "1px solid var(--fp-panel-border)",
                      background: "var(--fp-surface-primary)",
                    }}
                  >
                    {/* Category badge — top right */}
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        background: catStyle.bg,
                        color: catStyle.color,
                      }}
                    >
                      {categoryLabel}
                    </span>

                    {/* Zoom button */}
                    <button
                      type="button"
                      onClick={() => {
                        setZoomItem(item);
                        setZoomLevel(initialZoomLevelFor(item));
                      }}
                      className="absolute left-2 top-2 rounded-full border border-slate-300 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-white"
                    >
                      Zoom
                    </button>

                    {cardImageSrc ? (
                      <div className="h-full w-full overflow-hidden rounded-lg bg-white">
                        <Image
                          src={cardImageSrc}
                          alt={`${productTitle} photo`}
                          width={300}
                          height={220}
                          unoptimized={cardUsesServerCrop}
                          className="h-full w-full object-contain"
                          style={cardZoomStyle}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-xs text-slate-400">
                        No photo
                      </div>
                    )}
                  </div>

                  {/* Info area */}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <h2
                      className="line-clamp-2 min-h-10 text-base font-semibold leading-6"
                      style={{ color: "var(--fp-text-primary)" }}
                    >
                      {productTitle}
                    </h2>
                    <p className="text-sm" style={{ color: "var(--fp-text-muted)" }}>
                      {item.size || "Size not listed"}
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--fp-text-secondary)" }}>
                      Qty: {item.quantity}
                      {isOutOfStock ? " · Out of stock" : ""}
                    </p>
                    {item.updatedAt && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--fp-text-muted)", marginTop: "auto", paddingTop: 4 }}
                      >
                        Updated {timeAgo(new Date(item.updatedAt))}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid var(--fp-panel-border)",
              background: "var(--fp-surface-secondary)",
              padding: "48px 16px",
              textAlign: "center",
            }}
          >
            {isLoading ? (
              <LoadingAnimation
                message="Loading inventory…"
                className="py-2"
                iconClassName="h-20 w-20"
                messageClassName="mt-2 text-sm font-medium text-slate-300"
              />
            ) : (
              <>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--fp-text-primary)",
                    margin: "0 0 6px",
                  }}
                >
                  No items match your search.
                </p>
                <p style={{ fontSize: 13, color: "var(--fp-text-muted)", margin: 0 }}>
                  Try a different category or clear the search box.
                </p>
              </>
            )}
          </div>
        )}

        {/* Zoom modal */}
        {zoomItem?.photoUrl
          ? (() => {
              const { src: modalImageSrc, isServerCropped: modalUsesServerCrop } =
                resolveItemImageUrl(zoomItem, {
                  outputSize: 1200,
                  padding: 1.35,
                  minSize: 160,
                  maxFraction: 0.6,
                });
              const modalSrc = modalImageSrc ?? zoomItem.photoUrl;
              const modalStyle = modalUsesServerCrop
                ? {
                    objectPosition: "50% 50%",
                    transformOrigin: "50% 50%",
                    transform: `scale(${zoomLevel.toFixed(2)})`,
                  }
                : buildModalZoomStyle(effectiveLocation(zoomItem), zoomLevel);
              const autoFocused =
                modalUsesServerCrop || Boolean(effectiveLocation(zoomItem));

              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
                  style={{ background: "rgba(10,18,30,0.85)" }}
                >
                  <div
                    className="w-full max-w-4xl rounded-2xl p-4 shadow-2xl"
                    style={{
                      border: "1px solid var(--fp-panel-border)",
                      background: "var(--fp-surface-primary)",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--fp-text-primary)",
                            margin: 0,
                          }}
                        >
                          {buildDisplayProductTitle(zoomItem)}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--fp-text-muted)", margin: 0 }}>
                          {autoFocused
                            ? "Auto-focused on item. Slide to zoom further."
                            : "Showing the full shelf photo. Slide to zoom."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeZoomModal}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          border: "1px solid var(--fp-input-border)",
                          background: "var(--fp-input-bg)",
                          color: "var(--fp-text-secondary)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Close
                      </button>
                    </div>

                    <div
                      className="relative h-[68vh] overflow-hidden rounded-xl p-4"
                      style={{
                        border: "1px solid var(--fp-panel-border)",
                        background: "var(--fp-surface-secondary)",
                      }}
                    >
                      <Image
                        src={modalSrc!}
                        alt={`${buildDisplayProductTitle(zoomItem)} zoomed photo`}
                        width={1600}
                        height={1200}
                        unoptimized={modalUsesServerCrop}
                        className="h-full w-full object-contain transition-transform duration-150"
                        style={modalStyle}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label
                        style={{
                          display: "flex",
                          flex: 1,
                          alignItems: "center",
                          gap: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--fp-text-secondary)",
                        }}
                      >
                        Zoom
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={0.05}
                          value={zoomLevel}
                          onChange={(e) => setZoomLevel(Number(e.target.value))}
                          style={{ flex: 1 }}
                        />
                      </label>
                      <span
                        style={{
                          width: 56,
                          borderRadius: 6,
                          border: "1px solid var(--fp-input-border)",
                          background: "var(--fp-input-bg)",
                          padding: "4px 8px",
                          textAlign: "center",
                          fontSize: 11,
                          color: "var(--fp-text-secondary)",
                        }}
                      >
                        {zoomLevel.toFixed(2)}x
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(initialZoomLevelFor(zoomItem))}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: "1px solid var(--fp-input-border)",
                          background: "var(--fp-input-bg)",
                          color: "var(--fp-text-secondary)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          : null}
      </div>
    </div>
  );
}
