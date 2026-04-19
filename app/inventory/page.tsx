"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import LoadingAnimation from "@/components/LoadingAnimation";
import HexPanel from "../components/HexPanel";

type AnalyzeResponse = {
  text?: string;
  error?: string;
};

type CloudinaryUploadResponse = {
  secureUrl?: string;
  error?: string;
};

type SaveInventoryResponse = {
  savedCount?: number;
  metadata?: {
    requestedCount?: number;
    withLocationCount?: number;
    persistenceMode?: string;
  };
  error?: string;
};

type ItemLocation = {
  centerX: number;
  centerY: number;
  radius: number;
  imageWidth: number;
  imageHeight: number;
};

type RawInventoryItem = {
  sku?: string;
  brand: string;
  name: string;
  description: string;
  size: string;
  quantity: number;
  visibleQuantity: number;
  quantityEstimated: boolean;
  category: string;
  type: string;
  confidence: "high" | "medium" | "low" | string;
  location: ItemLocation | null;
};

type InventorySnapshot = {
  sceneSummary: string;
  inventoryItems: RawInventoryItem[];
  notes: string[];
};

type ImageDimensions = {
  width: number;
  height: number;
};

type UploadImageStatus = "pending" | "processing" | "done" | "error";

type SelectedUploadImage = {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadImageStatus;
  detectedCount: number;
  errorMessage: string | null;
};

type AnalyzeOneResult = {
  rows: Array<Record<string, unknown>>;
  detectedCount: number;
  notes: string[];
};

// Canonical output vocabulary — the prompt and all downstream checks share this
// list so there is exactly one source of truth for what the model is allowed to
// emit for `type` and `category`. Nothing else in this file hardcodes product
// words or keyword patterns.
const ALLOWED_TYPES: string[] = [
  "cereal",
  "granola",
  "oatmeal",
  "chips",
  "crackers",
  "cookies",
  "snack bar",
  "candy",
  "dried fruit",
  "nuts",
  "trail mix",
  "popcorn",
  "pasta",
  "rice",
  "grain",
  "beans",
  "lentils",
  "canned soup",
  "canned vegetable",
  "canned fruit",
  "canned meat",
  "sauce",
  "condiment",
  "peanut butter",
  "jam",
  "bread",
  "tortilla",
  "baking",
  "seasoning",
  "sugar",
  "flour",
  "oil",
  "tea",
  "coffee",
  "juice",
  "soda",
  "water",
  "milk",
  "plant milk",
  "yogurt",
  "cheese",
  "egg",
  "produce",
  "frozen meal",
  "frozen vegetable",
  "frozen fruit",
  "hygiene",
  "toiletry",
  "paper goods",
  "cleaning",
  "other",
];

const ALLOWED_CATEGORIES: string[] = [
  "dry",
  "refrigerated",
  "frozen",
  "beverage",
  "produce",
  "hygiene",
  "other",
];

function normalizeType(value: string): string {
  const trimmed = (value || "").trim().toLowerCase();
  return ALLOWED_TYPES.includes(trimmed) ? trimmed : "other";
}

function normalizeCategory(value: string): string {
  const trimmed = (value || "").trim().toLowerCase();
  return ALLOWED_CATEGORIES.includes(trimmed) ? trimmed : "other";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeWords(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

// Remove any of the given (possibly multi-word) phrases from a string. Longer
// phrases are removed first so that a phrase like "snack bar" is not broken by
// pre-removing "bar".
function stripPhrases(source: string, phrases: string[]): string {
  let padded = ` ${(source || "").toLowerCase()} `;
  const sorted = [...phrases]
    .map((phrase) => (phrase || "").trim().toLowerCase())
    .filter((phrase) => phrase.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    padded = padded.replace(
      new RegExp(`\\s${escapeRegex(phrase)}\\s`, "g"),
      " "
    );
  }
  return padded.replace(/\s+/g, " ").trim();
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// A name is "bare" when, after removing enumerated type words and the
// placeholder word "unknown", there is no content left. This catches
// names like "", "Unknown", "Unknown cereal", "Cereal", "Snack Bar",
// "Dried Fruit" without maintaining any keyword list — the only inputs
// are ALLOWED_TYPES (the model's declared vocabulary).
function nameIsBareLabel(name: string): boolean {
  const trimmed = (name || "").trim().toLowerCase();
  if (!trimmed) return true;
  const stripped = stripPhrases(trimmed, [...ALLOWED_TYPES, "unknown"]);
  return stripped.length === 0;
}

function buildInventoryPrompt(imageWidth: number, imageHeight: number) {
  const typeEnum = ALLOWED_TYPES.join("|");
  const categoryEnum = ALLOWED_CATEGORIES.join("|");
  return `
You are cataloguing the inventory of a university basic-needs food pantry from a shelf photo.
Accuracy matters more than completeness. It is better to label an item as unknown than to invent a product.

Return ONLY valid JSON. No markdown. No code fences.

Schema:
{
  "sceneSummary": "string",
  "inventoryItems": [
    {
      "sku": "string or null",
      "name": "string",
      "brand": "string",
      "description": "short identifying description",
      "size": "required size/count (estimate if not visible)",
      "visibleQuantity": 1,
      "quantity": 1,
      "quantityEstimated": false,
      "category": "${categoryEnum}",
      "type": "${typeEnum}",
      "confidence": "high|medium|low",
      "location": {
        "centerX": 0,
        "centerY": 0,
        "radius": 0,
        "imageWidth": ${imageWidth},
        "imageHeight": ${imageHeight}
      }
    }
  ],
  "notes": ["string"]
}

Identification rules (STRICT):
- Only use words you can literally read off the package. If the label text is not legible, the name MUST be exactly "Unknown <type>" (for example "Unknown dried fruit", "Unknown cereal", "Unknown snack bar"). Do not compose plausible-sounding product names from colors, shapes, or adjacent items.
- The "name" field must NEVER be a bare category word like "Cereal", "Chips", "Snack", "Food", "Item", or "Product". Those are types, not names. If you cannot read a real product name, use "Unknown <type>" instead.
- Never combine a real brand with an invented product word (e.g. a brand logo plus a guessed flavor is NOT allowed). Either copy the full product name verbatim, or fall back to "Unknown <type>".
- brand MUST be copied verbatim from the package if visible; otherwise set brand to "" (empty string). Never guess a brand.

Type classification rules (CRITICAL — do NOT let shelf context override package content):
- type MUST describe what is physically inside THIS package, judged from THIS package's shape, material, imagery, and readable words. Shelf context (what's next to it, what the shelf is "usually" stocked with) is IRRELEVANT for choosing type.
- Before you pick type, identify the package FORMAT:
    * rigid rectangular box with cereal-style imagery or a "cereal" / "flakes" / "bran" / "granola" / "oats" word on it → cereal / granola / oatmeal as appropriate.
    * soft plastic pouch or resealable bag with fruit imagery (berries, raisins, mango, apricots, etc.) → "dried fruit" (NOT cereal), even if it sits on a cereal shelf.
    * soft bag with nuts / trail mix imagery → "nuts" or "trail mix".
    * individually wrapped bar → "snack bar" or "candy".
    * crinkly chip bag → "chips".
    * can / tin → canned soup/vegetable/fruit/meat as appropriate.
    * jar → peanut butter / jam / sauce / condiment as appropriate.
    * bottle/carton with liquid → beverage / milk / juice / water.
- Use type "cereal" ONLY when the package is a cereal-style box OR bag whose own label imagery or words clearly indicate cereal/flakes/bran/O's. A soft pouch of fruit on a cereal shelf is NOT cereal.
- category MUST match type: dry, refrigerated, frozen, beverage, produce, hygiene, or other. Dried fruit / nuts / trail mix / cereal / chips / bars / pasta / rice / canned goods are all "dry". Yogurt / cheese / milk / egg are "refrigerated". Frozen meal/fruit/vegetable are "frozen". Soda / juice / water / tea / coffee / plant milk in a beverage container are "beverage".

- description should mention the package FORMAT first (box, pouch, can, jar, bottle, bar wrapper) plus color, imagery, and only label words that you can actually read (e.g. "soft blue pouch with berry illustration; label text too small to read"). Never include invented flavor, brand, or product details.
- confidence must honestly reflect how readable the label is:
  * "high": brand AND product name are clearly readable in the image.
  * "medium": product type is clearly visible but brand or exact name is partial/blurry.
  * "low": type itself is a guess from shape/color.
  Never use "high" for an item whose name you had to infer.

Counting rules:
- One row per DISTINCT product (same brand + same product + same size). Combine all units of that product into a single row.
- visibleQuantity = the number of units you can directly see in the photo (front-facing units PLUS any back-row units whose tops, corners, or partial labels are visible peeking behind/above the front row).
- quantity = best-estimate TOTAL number of units stocked, including ones fully hidden behind the visible front row. Pantry shelves are almost always stocked multiple deep — DEFAULT to assuming there are hidden units behind the front row unless the image proves otherwise.

Depth estimation procedure (follow in order):
  1. Start from the assumption that this is a stocked pantry shelf and rows are typically 2–3 deep.
  2. Look for positive depth evidence — box tops peeking over the front row, corners/edges of matching packages beside the front row, a back wall that is clearly far behind the front row, or the shelf above/below showing obvious depth. ANY of these = treat the product as at least 2 rows deep. Multiple tops visible = 3 rows deep. Stacks clearly filling to the back wall = assume filled (2–4 rows depending on apparent depth).
  3. Only reduce below 2 rows when you have NEGATIVE evidence: you can plainly see empty shelf liner behind the front row, the back wall is directly touching the rear of the front-row packages, or a clear gap/daylight between the front row and the back wall with nothing in between.
  4. If you genuinely cannot tell (shelf is dark, back is occluded, etc.), default to assuming ~2 rows deep rather than 1. Under-counting a well-stocked pantry is worse than slightly over-counting.

- So: quantity = visibleQuantity × estimated number of rows deep. Typical outcomes:
    * Clear evidence of back-row items → quantity ≈ visibleQuantity × 2 (or 3 if multiple back rows are evident).
    * No evidence either way on a normally stocked shelf → quantity ≈ visibleQuantity × 2.
    * Clearly empty behind → quantity = visibleQuantity.
- quantity MUST be >= visibleQuantity.
- quantityEstimated = true whenever quantity > visibleQuantity; false only when you have direct evidence nothing is behind.
- Cap the behind-front-row multiplier at 4 rows deep.
- When quantity is estimated, briefly note the reasoning in description (e.g. "5 visible in front, matching box tops peek behind → estimated ~10 total (2 rows deep)").
- quantity and visibleQuantity must be positive integers.
- size is REQUIRED. If package size/count is not readable, estimate and suffix with "(estimated)".

Location rules:
- location is required and must be in source-image pixel coordinates.
- centerX in [0, ${imageWidth}], centerY in [0, ${imageHeight}]. imageWidth/imageHeight must equal ${imageWidth}x${imageHeight}.
- radius should roughly enclose the single product you detected (not the whole shelf row).

If the shelf contains NO identifiable pantry items, return "inventoryItems": [] and explain why in "notes".
`.trim();
}

function ensurePackageDetails(value: unknown) {
  const text = String(value ?? "").trim();
  if (text) {
    return text;
  }

  return "1 unit (estimated)";
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocation(value: unknown): ItemLocation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const centerX = toFiniteNumber(record.centerX ?? record.center_x ?? record.cx ?? record.x);
  const centerY = toFiniteNumber(record.centerY ?? record.center_y ?? record.cy ?? record.y);
  const radius = toFiniteNumber(record.radius ?? record.r);
  const imageWidth = toFiniteNumber(
    record.imageWidth ?? record.image_width ?? record.sourceWidth ?? record.originalWidth
  );
  const imageHeight = toFiniteNumber(
    record.imageHeight ?? record.image_height ?? record.sourceHeight ?? record.originalHeight
  );

  const normalizedWithoutDimensions =
    imageWidth == null &&
    imageHeight == null &&
    centerX != null &&
    centerY != null &&
    radius != null &&
    centerX >= 0 &&
    centerX <= 1 &&
    centerY >= 0 &&
    centerY <= 1 &&
    radius > 0 &&
    radius <= 1;

  if (
    centerX == null ||
    centerY == null ||
    radius == null ||
    radius <= 0 ||
    (!normalizedWithoutDimensions && imageWidth == null) ||
    (!normalizedWithoutDimensions && imageHeight == null) ||
    (!normalizedWithoutDimensions && imageWidth != null && imageWidth <= 0) ||
    (!normalizedWithoutDimensions && imageHeight != null && imageHeight <= 0)
  ) {
    return null;
  }

  return {
    centerX,
    centerY,
    radius,
    imageWidth: normalizedWithoutDimensions ? 1 : (imageWidth as number),
    imageHeight: normalizedWithoutDimensions ? 1 : (imageHeight as number),
  };
}

function normalizeLocationToRealDimensions(
  location: ItemLocation,
  realDimensions: ImageDimensions
): ItemLocation {
  const declaredWidth = location.imageWidth > 0 ? location.imageWidth : realDimensions.width;
  const declaredHeight = location.imageHeight > 0 ? location.imageHeight : realDimensions.height;

  const scaleX = realDimensions.width / declaredWidth;
  const scaleY = realDimensions.height / declaredHeight;
  const scaleForRadius = Math.max(scaleX, scaleY);

  return {
    centerX: location.centerX * scaleX,
    centerY: location.centerY * scaleY,
    radius: location.radius * scaleForRadius,
    imageWidth: realDimensions.width,
    imageHeight: realDimensions.height,
  };
}

function parseInventoryJson(raw: string): InventorySnapshot {
  const sanitized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  const parsed = JSON.parse(sanitized) as Partial<InventorySnapshot>;

  const items = Array.isArray(parsed.inventoryItems)
    ? parsed.inventoryItems.map((item) => {
        const record = item as unknown as Record<string, unknown>;
        const parsedQuantity = Number(
          record.quantity ?? record.estimatedQuantityVisible ?? 1
        );
        const parsedVisibleQuantity = Number(
          record.visibleQuantity ??
            record.visible_quantity ??
            record.estimatedQuantityVisible ??
            record.quantity ??
            1
        );

        const totalQuantity = Number.isFinite(parsedQuantity)
          ? Math.max(1, Math.round(parsedQuantity))
          : 1;
        const visibleQuantity = Number.isFinite(parsedVisibleQuantity)
          ? Math.max(1, Math.round(parsedVisibleQuantity))
          : totalQuantity;

        const normalizedVisible = Math.min(visibleQuantity, totalQuantity);
        const rawEstimatedFlag = record.quantityEstimated;
        const quantityEstimated =
          typeof rawEstimatedFlag === "boolean"
            ? rawEstimatedFlag
            : totalQuantity > normalizedVisible;

        return {
          name: String(record.name ?? record.itemName ?? "Unknown item"),
          sku:
            record.sku == null || String(record.sku).trim() === ""
              ? ""
              : String(record.sku),
          brand: String(record.brand ?? "").trim(),
          description: String(record.description ?? "").trim(),
          size: ensurePackageDetails(record.size ?? record.packageDetails),
          quantity: totalQuantity,
          visibleQuantity: normalizedVisible,
          quantityEstimated,
          category: normalizeCategory(String(record.category ?? "")),
          type: normalizeType(String(record.type ?? "")),
          confidence: String(record.confidence ?? "low").trim().toLowerCase(),
          location: parseLocation(record.location),
        };
      })
    : [];

  const notes = Array.isArray(parsed.notes) ? parsed.notes.map((note) => String(note)) : [];

  return {
    sceneSummary: String(parsed.sceneSummary ?? ""),
    inventoryItems: items,
    notes,
  };
}

function toBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const base64 = value.split(",")[1];
      if (!base64) {
        reject(new Error("Could not read image data."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const width = Number(image.naturalWidth || 0);
      const height = Number(image.naturalHeight || 0);
      if (width > 0 && height > 0) {
        resolve({ width, height });
        return;
      }
      reject(new Error("Could not read image dimensions."));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image for dimensions."));
    };

    image.src = objectUrl;
  });
}

async function readApiPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();
  if (!rawText) {
    return { json: null, text: "" };
  }

  try {
    return { json: JSON.parse(rawText) as Record<string, unknown>, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

async function uploadPhotoToCloudinary(
  imageBase64: string,
  mimeType: string,
  shelfName: string
) {
  const uploadResponse = await fetch("/api/cloudinary/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType, shelfName }),
  });

  const { json, text } = await readApiPayload(uploadResponse);
  const payload = (json || {}) as CloudinaryUploadResponse;

  if (!uploadResponse.ok) {
    const detail = text.trim().startsWith("<!DOCTYPE")
      ? "Received HTML instead of JSON from Cloudinary upload."
      : text.slice(0, 160);
    throw new Error(
      payload.error || `Cloudinary upload failed (${uploadResponse.status}). ${detail}`
    );
  }

  if (!payload.secureUrl) {
    throw new Error("Cloudinary upload succeeded but did not return a secure URL.");
  }

  return payload.secureUrl;
}

function createUploadImageId(file: File, index: number) {
  return `${file.name}-${file.lastModified}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

// Detection is "suspect" — and therefore sent through a tighter-crop refinement
// pass — when structural checks fail. No keyword lists: just checks against
// ALLOWED_TYPES (the canonical vocabulary) and the confidence level the model
// itself reported.
function isSuspectDetection(item: {
  name: string;
  brand: string;
  confidence: string;
}): boolean {
  const brand = (item.brand || "").trim();
  const confidence = (item.confidence || "").trim().toLowerCase();

  if (nameIsBareLabel(item.name)) return true;
  if (confidence === "low" || confidence === "medium") return true;
  if (!brand && confidence !== "high") return true;
  return false;
}

// If a detected name has no content beyond enumerated type words / "unknown",
// rewrite to the canonical "Unknown <type>" fallback so downstream UI and
// dedup behave predictably. Dynamic — uses ALLOWED_TYPES only.
function normalizeBareName(item: RawInventoryItem): RawInventoryItem {
  if (!nameIsBareLabel(item.name)) return item;
  const type = normalizeType(item.type);
  const fallback = type === "other" ? "Unknown item" : `Unknown ${type}`;
  if ((item.name || "").trim().toLowerCase() === fallback.toLowerCase()) {
    return item;
  }
  return {
    ...item,
    name: fallback,
    confidence: "low",
  };
}

type SaveRow = Record<string, unknown>;

// Content tokens for dedup: everything left over after stripping the brand
// phrase and any enumerated type word / "unknown" placeholder. Pure numbers
// and very short tokens are discarded. No filler list.
function dedupContentTokens(row: SaveRow): Set<string> {
  const name = String(row.name ?? "");
  const brand = String(row.brand ?? "");
  const phrasesToStrip = [brand, ...ALLOWED_TYPES, "unknown"];
  const residual = stripPhrases(name, phrasesToStrip);
  const tokens = tokenizeWords(residual).filter(
    (token) => token.length >= 3 && !/^\d+$/.test(token)
  );
  return new Set(tokens);
}

function normalizeSizeKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/\(estimated\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeRowGroup(rows: SaveRow[]): SaveRow {
  const withBrand = rows.filter(
    (row) => String(row.brand ?? "").trim().length > 0
  );
  const brandPool = withBrand.length ? withBrand : rows;
  const primary = brandPool.reduce((a, b) =>
    String(a.name ?? "").length >= String(b.name ?? "").length ? a : b
  );

  const biggestPhoto = rows.reduce((a, b) =>
    Number(a.locationRadius ?? 0) >= Number(b.locationRadius ?? 0) ? a : b
  );

  const totalQuantity = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.quantity ?? 0)),
    0
  );

  const descriptions = rows
    .map((row) => String(row.description ?? "").trim())
    .filter((value) => value.length > 0);
  const longestDescription = descriptions.reduce(
    (a, b) => (a.length >= b.length ? a : b),
    ""
  );

  return {
    ...primary,
    quantity: Math.max(1, Math.round(totalQuantity)),
    description: longestDescription || primary.description,
    photoUrl: biggestPhoto.photoUrl ?? primary.photoUrl,
    locationCenterX: biggestPhoto.locationCenterX ?? primary.locationCenterX,
    locationCenterY: biggestPhoto.locationCenterY ?? primary.locationCenterY,
    locationRadius: biggestPhoto.locationRadius ?? primary.locationRadius,
    imageWidth: biggestPhoto.imageWidth ?? primary.imageWidth,
    imageHeight: biggestPhoto.imageHeight ?? primary.imageHeight,
  };
}

// Greedy agglomerative dedup per (type, size) bucket using Jaccard similarity
// on content tokens. Two rows merge when they share enough content tokens and
// do not come from distinct non-empty brands. No hardcoded filler words: the
// only phrases stripped before token comparison are the canonical type words
// from ALLOWED_TYPES and the per-row brand string.
function mergeDuplicateRows(rows: SaveRow[]): {
  merged: SaveRow[];
  mergedGroupCount: number;
  mergedExtraRowCount: number;
} {
  const SIMILARITY_THRESHOLD = 0.5;
  const buckets = new Map<string, SaveRow[]>();
  for (const row of rows) {
    const type = normalizeType(String(row.type ?? ""));
    const sizeKey = normalizeSizeKey(String(row.size ?? ""));
    const bucketKey = `${type}|${sizeKey}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(row);
  }

  let mergedGroupCount = 0;
  let mergedExtraRowCount = 0;
  const merged: SaveRow[] = [];

  type Cluster = {
    rows: SaveRow[];
    tokens: Set<string>;
    brands: Set<string>;
  };

  for (const bucket of buckets.values()) {
    const clusters: Cluster[] = [];
    for (const row of bucket) {
      const tokens = dedupContentTokens(row);
      const brand = String(row.brand ?? "").trim().toLowerCase();

      let bestCluster: Cluster | null = null;
      let bestSim = 0;
      for (const cluster of clusters) {
        // Don't fuse distinct real brands.
        if (brand && cluster.brands.size > 0 && !cluster.brands.has(brand)) {
          continue;
        }
        const sim = jaccardSimilarity(tokens, cluster.tokens);
        if (sim >= SIMILARITY_THRESHOLD && sim > bestSim) {
          bestCluster = cluster;
          bestSim = sim;
        }
      }

      if (bestCluster) {
        bestCluster.rows.push(row);
        for (const token of tokens) bestCluster.tokens.add(token);
        if (brand) bestCluster.brands.add(brand);
      } else {
        clusters.push({
          rows: [row],
          tokens: new Set(tokens),
          brands: brand ? new Set([brand]) : new Set(),
        });
      }
    }

    for (const cluster of clusters) {
      if (cluster.rows.length === 1) {
        merged.push(cluster.rows[0]);
        continue;
      }
      mergedGroupCount += 1;
      mergedExtraRowCount += cluster.rows.length - 1;
      merged.push(mergeRowGroup(cluster.rows));
    }
  }

  return { merged, mergedGroupCount, mergedExtraRowCount };
}

async function cropImageToBase64(
  file: File,
  location: ItemLocation,
  outputSize = 768
): Promise<{ base64: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not load image for cropping."));
      element.src = objectUrl;
    });

    const naturalWidth = image.naturalWidth || location.imageWidth;
    const naturalHeight = image.naturalHeight || location.imageHeight;
    const scaleX = naturalWidth / location.imageWidth;
    const scaleY = naturalHeight / location.imageHeight;

    const boxRadius = Math.max(location.radius * 1.6, 80);
    const boxMax = Math.min(naturalWidth, naturalHeight);
    const cropSize = Math.max(64, Math.min(Math.round(boxRadius * 2 * scaleX), boxMax));

    const centerPxX = location.centerX * scaleX;
    const centerPxY = location.centerY * scaleY;

    const maxX = Math.max(0, naturalWidth - cropSize);
    const maxY = Math.max(0, naturalHeight - cropSize);
    const cropX = Math.max(0, Math.min(maxX, Math.round(centerPxX - cropSize / 2)));
    const cropY = Math.max(0, Math.min(maxY, Math.round(centerPxY - cropSize / 2)));

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available for cropping.");
    }
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize
    );

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) {
      throw new Error("Could not encode cropped image as base64.");
    }

    return { base64, mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildRefinementPrompt() {
  const typeEnum = ALLOWED_TYPES.join("|");
  const categoryEnum = ALLOWED_CATEGORIES.join("|");
  return `
You are looking at a tightly cropped image of a SINGLE product from a university food pantry shelf.
Forget any prior labels — classify this item fresh from what you can actually see.

Return ONLY valid JSON, no markdown, with this exact schema:
{
  "name": "string",
  "brand": "string",
  "description": "string",
  "size": "string",
  "category": "${categoryEnum}",
  "type": "${typeEnum}",
  "confidence": "high|medium|low"
}

Rules:
- Only use words you can literally read off the package. If the product name is not legible, the "name" field MUST be exactly "Unknown <type>" (for example "Unknown dried fruit", "Unknown snack bar"). Do not compose plausible product names from colors or shapes.
- The "name" field must NEVER be a bare category word like "Cereal", "Chips", "Snack", "Food", "Item", or "Product". Use "Unknown <type>" instead.
- Never combine a visible brand with a guessed product word. Either copy the full readable product name, or fall back to "Unknown <type>".
- brand: copy verbatim from the label if readable; otherwise "". Never guess a brand.
- type MUST describe what THIS package physically contains, judged from its format, imagery, and readable words only. Ignore what kind of shelf it came from.
    * rigid rectangular box with cereal/flakes/bran/granola/O's imagery or wording → cereal / granola / oatmeal.
    * soft plastic pouch / resealable bag with fruit imagery (berries, raisins, mango, apricots) → "dried fruit" (NOT cereal).
    * soft bag with nuts or trail mix imagery → nuts / trail mix.
    * individually wrapped bar → snack bar / candy.
    * crinkly chip bag → chips.
    * can/tin → canned soup/vegetable/fruit/meat as appropriate.
    * jar → peanut butter / jam / sauce / condiment.
    * bottle/carton of liquid → beverage / milk / juice / water.
- Use type "cereal" ONLY when the package itself looks like cereal (cereal-style box or bag with cereal imagery/wording). A soft fruit pouch is not cereal even if cropped from a cereal shelf.
- category MUST match type (dry / refrigerated / frozen / beverage / produce / hygiene / other).
- description: start with the package format (box, pouch, can, jar, bottle, bar wrapper), then describe colors, imagery, and readable label words only. Do not fabricate flavor or brand details.
- confidence "high" is allowed ONLY when brand AND full product name are readable.
- If you are unsure, prefer "Unknown <type>" with low confidence over any guess.
`.trim();
}

type RefinementResult = {
  name: string;
  brand: string;
  description: string;
  size: string;
  category: string;
  type: string;
  confidence: string;
};

function parseRefinementJson(raw: string): RefinementResult | null {
  const sanitized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(sanitized) as Record<string, unknown>;
    return {
      name: String(parsed.name ?? "").trim(),
      brand: String(parsed.brand ?? "").trim(),
      description: String(parsed.description ?? "").trim(),
      size: ensurePackageDetails(parsed.size),
      category: normalizeCategory(String(parsed.category ?? "")),
      type: normalizeType(String(parsed.type ?? "")),
      confidence: String(parsed.confidence ?? "low").trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function refineDetectedItem(
  file: File,
  location: ItemLocation,
  _previousItem: RawInventoryItem
): Promise<RefinementResult | null> {
  void _previousItem;
  const { base64, mimeType } = await cropImageToBase64(file, location, 768);
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildRefinementPrompt(),
      imageBase64: base64,
      mimeType,
      responseMimeType: "application/json",
    }),
  });

  const { json, text } = await readApiPayload(response);
  const payload = (json || {}) as AnalyzeResponse;

  if (!response.ok) {
    const detail = text.trim().startsWith("<!DOCTYPE")
      ? "Received HTML instead of JSON from refinement analyzer."
      : text.slice(0, 160);
    throw new Error(payload.error || `Refinement failed (${response.status}). ${detail}`);
  }

  return parseRefinementJson(payload.text || "");
}

function confidenceRank(value: string): number {
  const lowered = (value || "").trim().toLowerCase();
  if (lowered === "high") return 3;
  if (lowered === "medium") return 2;
  if (lowered === "low") return 1;
  return 0;
}

// Compare the original shelf-wide detection with the tight-crop refinement.
// Inter-pass disagreement is how we detect unreliable guesses, instead of
// maintaining hardcoded hallucination / keyword lists. If the two passes
// disagree strongly on name tokens AND on type, the shelf-wide pass was
// almost certainly wrong about this item.
function passesDisagreeStrongly(
  original: RawInventoryItem,
  refined: RefinementResult
): boolean {
  const originalTokens = new Set(
    tokenizeWords(original.name).filter((token) => token.length >= 3)
  );
  const refinedTokens = new Set(
    tokenizeWords(refined.name).filter((token) => token.length >= 3)
  );
  const similarity = jaccardSimilarity(originalTokens, refinedTokens);
  const typesDiffer = normalizeType(original.type) !== normalizeType(refined.type);

  if (typesDiffer && similarity < 0.3) return true;

  const refinedIsMoreConfident =
    confidenceRank(refined.confidence) > confidenceRank(original.confidence);
  if (
    refinedIsMoreConfident &&
    !nameIsBareLabel(original.name) &&
    similarity < 0.2
  ) {
    return true;
  }

  return false;
}

function mergeRefinedItem(
  original: RawInventoryItem,
  refined: RefinementResult
): { item: RawInventoryItem; improved: boolean } {
  const originalRank = confidenceRank(original.confidence);
  const refinedRank = confidenceRank(refined.confidence);

  const refinedNameIsUsable =
    Boolean(refined.name) && !nameIsBareLabel(refined.name);
  const refinedBrandIsReadable = Boolean(refined.brand.trim());
  const originalNameWasBare = nameIsBareLabel(original.name);

  // Strong disagreement between the two passes — the shelf-wide guess is
  // almost certainly unreliable. Prefer the tight-crop refinement, but if its
  // own name is still a bare label, collapse to the canonical unknown form.
  if (passesDisagreeStrongly(original, refined)) {
    const fallbackType = normalizeType(refined.type || original.type);
    return {
      item: {
        ...original,
        name: refinedNameIsUsable
          ? refined.name
          : fallbackType === "other"
            ? "Unknown item"
            : `Unknown ${fallbackType}`,
        brand: refinedBrandIsReadable ? refined.brand : "",
        description: refined.description || original.description,
        size: refined.size || original.size,
        category: normalizeCategory(refined.category || original.category),
        type: fallbackType,
        confidence:
          refinedNameIsUsable && refinedBrandIsReadable
            ? refined.confidence
            : "low",
      },
      improved: true,
    };
  }

  // Original was a bare placeholder — always adopt the refined result.
  if (originalNameWasBare) {
    const fallbackType = normalizeType(refined.type || original.type);
    return {
      item: {
        ...original,
        name: refinedNameIsUsable
          ? refined.name
          : fallbackType === "other"
            ? "Unknown item"
            : `Unknown ${fallbackType}`,
        brand: refinedBrandIsReadable ? refined.brand : original.brand,
        description: refined.description || original.description,
        size: refined.size || original.size,
        category: normalizeCategory(refined.category || original.category),
        type: fallbackType,
        confidence:
          refinedNameIsUsable && refinedBrandIsReadable
            ? refined.confidence
            : "low",
      },
      improved: true,
    };
  }

  const shouldAdoptRefined =
    refinedRank >= originalRank && (refinedNameIsUsable || refinedBrandIsReadable);

  if (!shouldAdoptRefined) {
    return { item: original, improved: false };
  }

  return {
    item: {
      ...original,
      name: refinedNameIsUsable ? refined.name : original.name,
      brand: refinedBrandIsReadable ? refined.brand : original.brand,
      description: refined.description || original.description,
      size: refined.size || original.size,
      category: normalizeCategory(refined.category || original.category),
      type: normalizeType(refined.type || original.type),
      confidence: refined.confidence || original.confidence,
    },
    improved: true,
  };
}

async function analyzeOneImage(file: File, shelfName: string): Promise<AnalyzeOneResult> {
  const dimensions = await readImageDimensions(file);
  const imageBase64 = await toBase64Data(file);

  const analyzeResponse = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildInventoryPrompt(dimensions.width, dimensions.height),
      imageBase64,
      mimeType: file.type || "image/jpeg",
      responseMimeType: "application/json",
    }),
  });

  const { json, text } = await readApiPayload(analyzeResponse);
  const payload = (json || {}) as AnalyzeResponse;

  if (!analyzeResponse.ok) {
    const detail = text.trim().startsWith("<!DOCTYPE")
      ? "Received HTML instead of JSON from analyzer."
      : text.slice(0, 160);
    throw new Error(payload.error || `Analyzer failed (${analyzeResponse.status}). ${detail}`);
  }

  const snapshot = parseInventoryJson(payload.text || "");

  if (!snapshot.inventoryItems.length) {
    return { rows: [], detectedCount: 0, notes: snapshot.notes };
  }

  const refinedItems: RawInventoryItem[] = [];
  const refinementNotes: string[] = [];
  let refinedCount = 0;

  for (const item of snapshot.inventoryItems) {
    if (!isSuspectDetection(item) || !item.location) {
      refinedItems.push(item);
      continue;
    }

    const scaledLocation = normalizeLocationToRealDimensions(item.location, dimensions);

    try {
      const refined = await refineDetectedItem(file, scaledLocation, item);
      if (refined) {
        const { item: merged, improved } = mergeRefinedItem(item, refined);
        refinedItems.push(merged);
        if (improved) {
          refinedCount += 1;
        }
      } else {
        refinedItems.push(item);
      }
    } catch (refineError) {
      const message =
        refineError instanceof Error ? refineError.message : "unknown error";
      refinementNotes.push(
        `Could not re-verify "${item.name || "an item"}" — ${message}`
      );
      refinedItems.push(item);
    }
  }

  const shelfPhotoUrl = await uploadPhotoToCloudinary(
    imageBase64,
    file.type || "image/jpeg",
    shelfName
  );

  const sanitizedItems = refinedItems.map(normalizeBareName);
  const bareNameRewriteCount = sanitizedItems.reduce(
    (count, item, index) => count + (item === refinedItems[index] ? 0 : 1),
    0
  );

  let estimatedQuantityCount = 0;
  let extraUnitsBehindFront = 0;

  const rows = sanitizedItems.map((item) => {
    const location = item.location
      ? normalizeLocationToRealDimensions(item.location, dimensions)
      : null;

    const totalQuantity = Math.max(1, item.quantity || 1);
    const visibleQuantity = Math.min(
      totalQuantity,
      Math.max(1, item.visibleQuantity || 1)
    );
    const quantityIsEstimated =
      item.quantityEstimated && totalQuantity > visibleQuantity;

    if (quantityIsEstimated) {
      estimatedQuantityCount += 1;
      extraUnitsBehindFront += totalQuantity - visibleQuantity;
    }

    const descriptionMentionsEstimate = /estimate|behind|back row|stacked/i.test(
      item.description || ""
    );

    const enrichedDescription = quantityIsEstimated && !descriptionMentionsEstimate
      ? `${item.description ? item.description + " " : ""}Estimated total ${totalQuantity} units (${visibleQuantity} visible in front, ~${totalQuantity - visibleQuantity} inferred behind).`.trim()
      : item.description;

    return {
      sku: item.sku || null,
      shelfId: null,
      name: item.name,
      brand: item.brand,
      quantity: totalQuantity,
      size: item.size,
      category: item.category,
      type: item.type,
      description: enrichedDescription,
      photoUrl: shelfPhotoUrl,
      locationCenterX: location?.centerX ?? null,
      locationCenterY: location?.centerY ?? null,
      locationRadius: location?.radius ?? null,
      imageWidth: location?.imageWidth ?? null,
      imageHeight: location?.imageHeight ?? null,
    };
  });

  const combinedNotes = snapshot.notes.slice();
  if (refinedCount > 0) {
    combinedNotes.push(
      `Re-verified ${refinedCount} uncertain item${refinedCount === 1 ? "" : "s"} with a tighter crop.`
    );
  }
  if (bareNameRewriteCount > 0) {
    combinedNotes.push(
      `Rewrote ${bareNameRewriteCount} placeholder name${bareNameRewriteCount === 1 ? "" : "s"} (e.g. bare category word or "Unknown") to a canonical "Unknown <type>" fallback.`
    );
  }
  if (estimatedQuantityCount > 0) {
    combinedNotes.push(
      `Estimated ${extraUnitsBehindFront} extra unit${extraUnitsBehindFront === 1 ? "" : "s"} stacked behind the front row across ${estimatedQuantityCount} product${estimatedQuantityCount === 1 ? "" : "s"}.`
    );
  }
  combinedNotes.push(...refinementNotes);

  return {
    rows,
    detectedCount: sanitizedItems.length,
    notes: combinedNotes,
  };
}

export default function InventoryPage() {
  const [selectedImages, setSelectedImages] = useState<SelectedUploadImage[]>([]);
  const [shelfName, setShelfName] = useState("");
  const [shelfLocationDescription, setShelfLocationDescription] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchNotes, setBatchNotes] = useState<string[]>([]);
  const [replaceExistingInventory, setReplaceExistingInventory] = useState(true);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const selectedImagesRef = useRef<SelectedUploadImage[]>([]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.previewUrl);
      });
    };
  }, []);

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    setSelectedImages((previous) => {
      const startIndex = previous.length;
      const additions = imageFiles.map((file, offset) => ({
        id: createUploadImageId(file, startIndex + offset),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending" as UploadImageStatus,
        detectedCount: 0,
        errorMessage: null,
      }));
      return [...previous, ...additions];
    });
  };

  const onImagesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    addFiles(files);
    event.target.value = "";
  };

  const onOpenFilePicker = () => {
    uploadInputRef.current?.click();
  };

  const onRemoveImage = (id: string) => {
    setSelectedImages((previous) => {
      const target = previous.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter((image) => image.id !== id);
    });
  };

  const onClearAll = () => {
    setSelectedImages((previous) => {
      previous.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    setStatusMessage("");
    setErrorMessage("");
    setBatchNotes([]);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setBatchNotes([]);

    if (!selectedImages.length) {
      setErrorMessage("Upload one or more images first.");
      return;
    }

    if (!shelfName.trim()) {
      setErrorMessage("Shelf group name is required.");
      return;
    }

    setIsSubmitting(true);
    setSelectedImages((previous) =>
      previous.map((image) => ({
        ...image,
        status: "pending",
        detectedCount: 0,
        errorMessage: null,
      }))
    );

    const imagesSnapshot = [...selectedImagesRef.current];
    const rowsForSave: Array<Record<string, unknown>> = [];
    const notes: string[] = [];

    let processedCount = 0;
    let failedCount = 0;

    try {
      for (const selected of imagesSnapshot) {
        processedCount += 1;

        setStatusMessage(
          `Analyzing ${processedCount}/${imagesSnapshot.length}: ${selected.file.name} (uncertain items will be re-verified with a tighter crop)`
        );

        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === selected.id ? { ...image, status: "processing" } : image
          )
        );

        try {
          const analyzed = await analyzeOneImage(selected.file, shelfName.trim());
          rowsForSave.push(...analyzed.rows);
          notes.push(...analyzed.notes.map((note) => `${selected.file.name}: ${note}`));

          setSelectedImages((previous) =>
            previous.map((image) =>
              image.id === selected.id
                ? {
                    ...image,
                    status: "done",
                    detectedCount: analyzed.detectedCount,
                    errorMessage: null,
                  }
                : image
            )
          );
        } catch (imageError) {
          failedCount += 1;
          const message =
            imageError instanceof Error
              ? imageError.message
              : "Unexpected error while processing this image.";

          setSelectedImages((previous) =>
            previous.map((image) =>
              image.id === selected.id
                ? {
                    ...image,
                    status: "error",
                    errorMessage: message,
                    detectedCount: 0,
                  }
                : image
            )
          );
        }
      }

      if (!rowsForSave.length) {
        setErrorMessage("No inventory items were detected. Nothing was added.");
        setBatchNotes(notes);
        return;
      }

      const { merged: dedupedRows, mergedGroupCount, mergedExtraRowCount } =
        mergeDuplicateRows(rowsForSave);

      if (mergedGroupCount > 0) {
        notes.push(
          `Merged ${mergedExtraRowCount} duplicate detection${mergedExtraRowCount === 1 ? "" : "s"} into ${mergedGroupCount} consolidated product${mergedGroupCount === 1 ? "" : "s"} (same type + core name + size).`
        );
      }

      rowsForSave.length = 0;
      rowsForSave.push(...dedupedRows);

      let clearedCount = 0;
      if (replaceExistingInventory) {
        setStatusMessage("Clearing existing inventory before replacement...");
        const deleteResponse = await fetch(
          "/api/dataconnect/inventory-items?scope=all",
          { method: "DELETE" }
        );
        const { json: deleteJson, text: deleteText } = await readApiPayload(deleteResponse);
        const deletePayload = (deleteJson || {}) as {
          deletedCount?: number;
          error?: string;
        };
        if (!deleteResponse.ok) {
          const detail = deleteText.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON while clearing inventory."
            : deleteText.slice(0, 160);
          throw new Error(
            deletePayload.error ||
              `Clear existing inventory failed (${deleteResponse.status}). ${detail}`
          );
        }
        clearedCount = Number(deletePayload.deletedCount ?? 0);
      }

      setStatusMessage(`Saving ${rowsForSave.length} detected item rows to inventory...`);

      const saveResponse = await fetch("/api/dataconnect/inventory-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shelfName: shelfName.trim(),
          shelfLocationDescription: shelfLocationDescription.trim() || undefined,
          items: rowsForSave,
        }),
      });

      const { json: saveJson, text: saveText } = await readApiPayload(saveResponse);
      const savePayload = (saveJson || {}) as SaveInventoryResponse;

      if (!saveResponse.ok) {
        const detail = saveText.trim().startsWith("<!DOCTYPE")
          ? "Received HTML instead of JSON while saving inventory."
          : saveText.slice(0, 160);
        throw new Error(savePayload.error || `Save failed (${saveResponse.status}). ${detail}`);
      }

      const requestedCount = savePayload.metadata?.requestedCount ?? rowsForSave.length;
      const withLocationCount =
        savePayload.metadata?.withLocationCount ??
        rowsForSave.filter(
          (row) =>
            row.locationCenterX !== null &&
            row.locationCenterX !== undefined &&
            row.locationCenterY !== null &&
            row.locationCenterY !== undefined &&
            row.locationRadius !== null &&
            row.locationRadius !== undefined
        ).length;

      const savedCount = Number(savePayload.savedCount ?? rowsForSave.length);
      const persistenceMode = savePayload.metadata?.persistenceMode || "unknown";

      const replacementSummary = replaceExistingInventory
        ? `Cleared ${clearedCount} previous item${clearedCount === 1 ? "" : "s"} then added ${savedCount}`
        : `Added ${savedCount}`;

      setStatusMessage(
        `${replacementSummary} item row${savedCount === 1 ? "" : "s"} from ${imagesSnapshot.length} image${imagesSnapshot.length === 1 ? "" : "s"}. Failed images: ${failedCount}. Metadata on ${withLocationCount}/${requestedCount} rows. Persistence mode: ${persistenceMode}.`
      );
      setBatchNotes(notes);
    } catch (submitError) {
      setErrorMessage(
        submitError instanceof Error
          ? submitError.message
          : "Unexpected error while adding inventory."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const navLink = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" } as React.CSSProperties;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "clamp(12px, 4vw, 32px) clamp(10px, 3vw, 24px)", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <HexPanel contentStyle={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Admin · Inventory</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, margin: "0 0 4px" }}>AI Shelf Inventory Uploader</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>Upload images and add detected items to inventory.</p>
          </div>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin" style={navLink}>Admin Home</Link>
            <Link href="/" style={navLink}>Back Home</Link>
          </nav>
        </HexPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {errorMessage ? (
            <p style={{ border: "1px solid #7f2020", background: "rgba(180,30,30,0.12)", color: "#f87171", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: 0 }}>
              {errorMessage}
            </p>
          ) : null}

          {statusMessage ? (
            <p style={{ border: "1px solid #2d6a4a", background: "rgba(30,160,90,0.10)", color: "#6ee7b7", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: 0 }}>
              {statusMessage}
            </p>
          ) : null}

          {isSubmitting ? (
            <HexPanel contentStyle={{ padding: "8px 0" }}>
              <LoadingAnimation
                message="Analyzing shelf photos and updating inventory..."
                className="py-4"
                iconClassName="h-24 w-24"
                messageClassName="mt-2 text-sm font-medium"
              />
            </HexPanel>
          ) : null}

          <HexPanel contentStyle={{ padding: "20px 24px" }}>
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="grid gap-3 md:grid-cols-2">
                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600 }}>
                  Shelf group name
                  <input
                    type="text"
                    value={shelfName}
                    onChange={(event) => setShelfName(event.target.value)}
                    placeholder="e.g. Dry Shelf - Week 4"
                    style={{ background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-primary)", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
                    required
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600 }}>
                  Shelf location (optional)
                  <input
                    type="text"
                    value={shelfLocationDescription}
                    onChange={(event) => setShelfLocationDescription(event.target.value)}
                    placeholder="e.g. Back wall, aisle 2"
                    style={{ background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-primary)", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
                  />
                </label>
              </div>

              <div style={{ background: "var(--fp-surface-secondary)", border: "1px solid var(--fp-panel-border)", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <p style={{ color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 700, margin: 0 }}>
                    Images ({selectedImages.length})
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={onOpenFilePicker}
                      style={{ background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, padding: "7px 16px", cursor: "pointer" }}
                    >
                      Upload images
                    </button>
                    <button
                      type="button"
                      onClick={onClearAll}
                      disabled={!selectedImages.length || isSubmitting}
                      style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 8, fontSize: 13, fontWeight: 600, padding: "7px 14px", cursor: "pointer", opacity: (!selectedImages.length || isSubmitting) ? 0.5 : 1 }}
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onImagesChange}
                  className="hidden"
                />

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedImages.length ? (
                    selectedImages.map((selected, index) => (
                      <article
                        key={selected.id}
                        style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", borderRadius: 10, padding: "8px 10px" }}
                      >
                        <Image
                          src={selected.previewUrl}
                          alt={`${selected.file.name} preview`}
                          width={72}
                          height={72}
                          unoptimized
                          style={{ height: 56, width: 56, borderRadius: 8, border: "1px solid var(--fp-panel-border)", objectFit: "cover", flexShrink: 0 }}
                        />

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ color: "var(--fp-text-primary)", fontWeight: 600, fontSize: 13, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {index + 1}. {selected.file.name}
                          </p>
                          <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: "0 0 2px" }}>
                            {(selected.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <p style={{ fontSize: 12, margin: 0, color: selected.status === "error" ? "#f87171" : selected.status === "done" ? "#6ee7b7" : "var(--fp-text-muted)" }}>
                            {selected.status === "pending" ? "Waiting" : null}
                            {selected.status === "processing" ? "Processing..." : null}
                            {selected.status === "done"
                              ? `Done · ${selected.detectedCount} detected`
                              : null}
                            {selected.status === "error"
                              ? `Failed${selected.errorMessage ? ` · ${selected.errorMessage}` : ""}`
                              : null}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveImage(selected.id)}
                          disabled={isSubmitting}
                          style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 8, fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer", flexShrink: 0, opacity: isSubmitting ? 0.5 : 1 }}
                        >
                          Remove
                        </button>
                      </article>
                    ))
                  ) : (
                    <p style={{ border: "1px dashed var(--fp-panel-border)", color: "var(--fp-text-muted)", background: "transparent", borderRadius: 10, padding: "24px 16px", textAlign: "center", fontSize: 13, margin: 0 }}>
                      No images yet. Upload one or more shelf photos.
                    </p>
                  )}
                </div>
              </div>

              <label
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  borderRadius: 12, padding: "12px 16px", fontSize: 13, cursor: "pointer",
                  border: replaceExistingInventory ? "1px solid rgba(220,50,50,0.4)" : "1px solid var(--fp-panel-border)",
                  background: replaceExistingInventory ? "rgba(180,30,30,0.10)" : "rgba(50,80,130,0.12)",
                  color: replaceExistingInventory ? "#f87171" : "var(--fp-text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={replaceExistingInventory}
                  onChange={(event) => setReplaceExistingInventory(event.target.checked)}
                  disabled={isSubmitting}
                  style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", accentColor: "#dc2626", flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                    Replace existing inventory
                  </span>
                  <span style={{ display: "block", fontSize: 12 }}>
                    {replaceExistingInventory
                      ? "All current inventory will be deleted before the new items are saved. This cannot be undone."
                      : "Existing items will stay. The detected items will be added alongside them."}
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting || !selectedImages.length || !shelfName.trim()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "100%", background: "var(--fp-button-accent)", color: "#fff",
                  border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                  padding: "11px 20px", cursor: (isSubmitting || !selectedImages.length || !shelfName.trim()) ? "not-allowed" : "pointer",
                  opacity: (isSubmitting || !selectedImages.length || !shelfName.trim()) ? 0.5 : 1,
                  boxSizing: "border-box",
                }}
              >
                {isSubmitting
                  ? replaceExistingInventory
                    ? "Clearing inventory and uploading..."
                    : "Uploading and adding inventory..."
                  : replaceExistingInventory
                    ? "Replace Inventory with These Images"
                    : "Upload Images and Add to Inventory"}
              </button>
            </form>
          </HexPanel>

          {batchNotes.length ? (
            <HexPanel contentStyle={{ padding: "16px 20px" }}>
              <h2 style={{ color: "var(--fp-text-primary)", fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>Analyzer notes</h2>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                {batchNotes.map((note, index) => (
                  <li key={`${note}-${index}`} style={{ color: "var(--fp-text-secondary)", fontSize: 13 }}>{note}</li>
                ))}
              </ul>
            </HexPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
