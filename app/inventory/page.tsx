"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { QueryFetchPolicy } from "firebase/data-connect";

import LoadingAnimation from "@/components/LoadingAnimation";
import HexPanel from "../components/HexPanel";
import FloorPlanCanvas, {
  CATEGORIES,
  type CategoryId,
  type FloorPlanZone,
} from "../components/FloorPlanCanvas";
import { dataConnect } from "../../src/lib/firebase";
import { getAllFloorPlans } from "../../src/dataconnect-generated";

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

type DetectedCode = {
  value: string;
  symbology: "qr" | "upc" | "ean" | "barcode" | "unknown" | string;
  location: ItemLocation | null;
};

type CodeScanSnapshot = {
  codes: DetectedCode[];
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

type ShelfQrTarget = {
  shelfTag: string;
  shelfName: string;
  shelfUid: string;
  planId: string | null;
  category: string | null;
};

type ShelfSaveBatch = {
  shelfName: string;
  shelfTag: string | null;
  rows: Array<Record<string, unknown>>;
};

// Shelf as stored on a deployed floor plan (source-of-truth for manual picks).
type ShelfOption = {
  shelfUid: string;
  catId: CategoryId;
  limit: number;
  rotation: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type DeployedFloorPlan = {
  planId: string;
  shelves: ShelfOption[];
};

// One entry in the "couldn't find a QR — pick a shelf manually" queue.
type ManualShelfPick = {
  imageId: string;
  fileName: string;
  previewUrl: string;
  file: File;
  chosenShelfUid: string | null;
  skipped: boolean;
};

// Held between Phase 1 (QR scan) and Phase 2 (analyze + save) so Phase 2 can
// resume after the user finishes manually assigning shelves to pending images.
type PendingUploadState = {
  imagesSnapshot: SelectedUploadImage[];
  autoTargets: Record<string, ShelfQrTarget>;
  notes: string[];
  failedCount: number;
  manualPicks: ManualShelfPick[];
};

const SHELF_CATEGORY_LABELS: Record<string, string> = {
  frozen: "Frozen",
  refrigerated: "Refrigerated",
  produce: "Produce",
  canned_goods: "Canned Goods",
  dry_goods: "Dry Goods",
  misc_non_food: "Misc / Non-Food",
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

function buildShelfQrLocatePrompt(imageWidth: number, imageHeight: number) {
  return `
You are LOCATING a QR code in a pantry shelf photo. You do NOT need to decode it.

Return ONLY valid JSON. No markdown. No code fences.

Schema:
{
  "found": true,
  "centerX": 0,
  "centerY": 0,
  "radius": 0,
  "imageWidth": ${imageWidth},
  "imageHeight": ${imageHeight},
  "notes": "short string"
}

What a QR looks like:
- A square of black-and-white modules with three large square "finder" patterns in three of its corners.
- In this app the QR is printed on a shelf label — a small white/light rectangular tag, usually near a shelf edge or under a product. It may be only 3-10% of the image.

Rules:
- centerX/centerY/radius MUST be in source-image pixel coordinates. centerX in [0, ${imageWidth}], centerY in [0, ${imageHeight}].
- radius should be HALF the QR's side length (so the QR square fits inside a box of 2*radius × 2*radius around the center). It's OK to slightly over-estimate; do NOT under-estimate.
- If more than one QR is visible, return the largest / most complete one.
- If no QR is visible, return {"found": false, "centerX": 0, "centerY": 0, "radius": 0, "imageWidth": ${imageWidth}, "imageHeight": ${imageHeight}, "notes": "..."}.
- Never invent a location.
`.trim();
}

type QrLocateResult = {
  found: boolean;
  location: ItemLocation | null;
};

function parseShelfQrLocateJson(
  raw: string,
  realDimensions: ImageDimensions
): QrLocateResult {
  const parsed = parseJsonObject(raw);
  if (!parsed) return { found: false, location: null };
  if (parsed.found === false) return { found: false, location: null };

  const location = parseLocation(parsed);
  if (!location) return { found: false, location: null };
  return {
    found: true,
    location: normalizeLocationToRealDimensions(location, realDimensions),
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const sanitized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(sanitized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to object-fragment parse
  }

  const fragmentMatch = sanitized.match(/\{[\s\S]*\}/);
  if (!fragmentMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(fragmentMatch[0]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
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

const MAX_UPLOAD_BYTES = 1024 * 1024; // 1 MB

// Re-encode an in-memory image as JPEG at the given long-edge cap and quality.
// Returns null if the canvas could not produce a Blob.
function renderImageToJpegBlob(
  image: HTMLImageElement,
  maxDim: number,
  quality: number
): Promise<Blob | null> {
  const natW = Math.max(1, image.naturalWidth || image.width);
  const natH = Math.max(1, image.naturalHeight || image.height);
  const longEdge = Math.max(natW, natH);
  const scale = longEdge > maxDim ? maxDim / longEdge : 1;
  const outW = Math.max(1, Math.round(natW * scale));
  const outH = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(image, 0, 0, natW, natH, 0, 0, outW, outH);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

// Compress a user-supplied image File so it fits under MAX_UPLOAD_BYTES. The
// returned File replaces the original everywhere downstream (Cloudinary
// upload, local barcode decode, AI analyzer pre-encode, preview thumbnails),
// so all consumers keep working without further changes. Files already under
// the limit are returned unchanged to preserve original quality.
async function compressImageFileUnderLimit(
  file: File,
  limitBytes = MAX_UPLOAD_BYTES
): Promise<File> {
  if (file.size <= limitBytes) {
    return file;
  }

  let loaded: { image: HTMLImageElement; dispose: () => void };
  try {
    loaded = await loadImageFromFile(file);
  } catch {
    return file;
  }

  try {
    // Walk progressively more aggressive (smaller, lower-quality) re-encodings
    // until one fits under the limit. The last attempt is the smallest we are
    // willing to ship; we accept it even if it's still slightly over rather
    // than rejecting the upload.
    const attempts: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 2560, quality: 0.85 },
      { maxDim: 2048, quality: 0.82 },
      { maxDim: 1920, quality: 0.78 },
      { maxDim: 1600, quality: 0.74 },
      { maxDim: 1280, quality: 0.7 },
      { maxDim: 1024, quality: 0.65 },
      { maxDim: 800, quality: 0.6 },
    ];

    let lastBlob: Blob | null = null;
    for (const attempt of attempts) {
      const blob = await renderImageToJpegBlob(
        loaded.image,
        attempt.maxDim,
        attempt.quality
      );
      if (!blob) continue;
      lastBlob = blob;
      if (blob.size <= limitBytes) break;
    }

    if (!lastBlob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "upload";
    return new File([lastBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    loaded.dispose();
  }
}

// Produce a downscaled JPEG for the LLM analyzer. Full-res images blow past
// Next.js route-handler body limits and upstream model size caps (an 8 MB PNG
// becomes ~11 MB of JSON after base64). 2048 px on the long edge is plenty for
// vision models and keeps the payload well under any practical limit. The
// original File is still used for Cloudinary upload and local barcode decoding.
async function encodeImageForAi(
  file: File,
  maxDim = 2048,
  quality = 0.85
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const { image, dispose } = await loadImageFromFile(file);
  try {
    const natW = Math.max(1, image.naturalWidth || image.width);
    const natH = Math.max(1, image.naturalHeight || image.height);
    const longEdge = Math.max(natW, natH);
    const scale = longEdge > maxDim ? maxDim / longEdge : 1;
    const outW = Math.max(1, Math.round(natW * scale));
    const outH = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(image, 0, 0, natW, natH, 0, 0, outW, outH);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) {
      throw new Error("Could not encode image as JPEG.");
    }
    return { base64, mimeType: "image/jpeg", width: outW, height: outH };
  } finally {
    dispose();
  }
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

function buildShelfTag(planId: string | null, shelfUid: string) {
  const normalizedPlanId = (planId || "unknown-plan").trim().slice(0, 64) || "unknown-plan";
  const normalizedShelfUid = shelfUid.trim().slice(0, 64);
  return `floorplan:${normalizedPlanId}:shelf:${normalizedShelfUid}`.slice(0, 160);
}

function buildShelfNameFromQr(category: string | null, shelfUid: string) {
  const categoryLabel = category ? SHELF_CATEGORY_LABELS[category] || category : "Shelf";
  const shortUid = shelfUid.slice(0, 8);
  return `${categoryLabel} Shelf ${shortUid}`;
}

function parseShelfQrPayload(rawPayload: string): ShelfQrTarget | null {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    return null;
  }

  const kind = typeof parsed.kind === "string" ? parsed.kind.trim().toLowerCase() : "";
  if (kind && kind !== "hub-shelf") {
    return null;
  }

  const rawShelfUid =
    (typeof parsed.shelfUid === "string" ? parsed.shelfUid : null) ||
    (typeof parsed.shelf_uid === "string" ? parsed.shelf_uid : null) ||
    "";
  const shelfUid = rawShelfUid.trim().slice(0, 64);

  if (!shelfUid) {
    return null;
  }

  const rawPlanId = typeof parsed.planId === "string" ? parsed.planId.trim() : "";
  const planId = rawPlanId && rawPlanId !== "unknown" ? rawPlanId.slice(0, 64) : null;
  const category =
    typeof parsed.category === "string" && parsed.category.trim()
      ? parsed.category.trim().slice(0, 64)
      : null;

  return {
    shelfTag: buildShelfTag(planId, shelfUid),
    shelfName: buildShelfNameFromQr(category, shelfUid),
    shelfUid,
    planId,
    category,
  };
}

type ScannedCode = {
  value: string;
  symbology: "qr" | "upc" | "ean" | "barcode" | "unknown";
  centerX: number;
  centerY: number;
  radius: number;
  sourceWidth: number;
  sourceHeight: number;
};

const SHELF_QR_FORMATS = ["qr_code"] as const;
const PRODUCT_CODE_FORMATS = [
  "qr_code",
  "upc_a",
  "upc_e",
  "ean_13",
  "ean_8",
  "code_128",
] as const;

const ZXING_FORMAT_MAP: Record<string, BarcodeFormat> = {
  qr_code: BarcodeFormat.QR_CODE,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
  ean_13: BarcodeFormat.EAN_13,
  ean_8: BarcodeFormat.EAN_8,
  code_128: BarcodeFormat.CODE_128,
};

function normalizeSymbology(raw: string): ScannedCode["symbology"] {
  const lowered = (raw || "").toLowerCase();
  if (lowered.includes("qr")) return "qr";
  if (lowered.startsWith("upc")) return "upc";
  if (lowered.startsWith("ean")) return "ean";
  if (lowered.includes("code_128") || lowered.includes("code-128") || lowered.includes("code128")) {
    return "barcode";
  }
  return "unknown";
}

function centerAndRadiusFromBox(bb: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { cx: number; cy: number; r: number } {
  return {
    cx: bb.x + bb.width / 2,
    cy: bb.y + bb.height / 2,
    r: Math.max(1, Math.max(bb.width, bb.height) / 2),
  };
}

function centerAndRadiusFromResultPoints(
  points: Array<{ x: number; y: number }>
): { cx: number; cy: number; r: number } {
  if (!points.length) return { cx: 0, cy: 0, r: 0 };
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const r = Math.max(
    1,
    ...points.map((p) => Math.hypot(p.x - cx, p.y - cy))
  );
  return { cx, cy, r };
}

async function loadImageFromFile(
  file: File
): Promise<{ image: HTMLImageElement; dispose: () => void }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = url;
    });
    return { image, dispose: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const w = Math.max(1, image.naturalWidth || image.width);
  const h = Math.max(1, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(image, 0, 0, w, h);
  return canvas;
}

function cropImageToCanvas(
  image: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number },
  outputMaxDim: number
): HTMLCanvasElement {
  const natW = Math.max(1, image.naturalWidth || image.width);
  const natH = Math.max(1, image.naturalHeight || image.height);
  const x = Math.max(0, Math.min(natW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(natH - 1, Math.round(rect.y)));
  const w = Math.max(1, Math.min(Math.round(rect.width), natW - x));
  const h = Math.max(1, Math.min(Math.round(rect.height), natH - y));
  const scale = outputMaxDim > 0 ? outputMaxDim / Math.max(w, h) : 1;
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(image, x, y, w, h, 0, 0, outW, outH);
  return canvas;
}

type BarcodeDetectorCtor = new (init: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<
    Array<{
      rawValue?: string;
      format?: string;
      boundingBox?: { x: number; y: number; width: number; height: number };
    }>
  >;
};

type BarcodeDetectorStatic = BarcodeDetectorCtor & {
  getSupportedFormats?: () => Promise<string[]>;
};

async function scanWithBarcodeDetector(
  source: HTMLImageElement | HTMLCanvasElement,
  formats: readonly string[],
  sourceWidth: number,
  sourceHeight: number
): Promise<ScannedCode[] | null> {
  if (typeof window === "undefined") return null;
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorStatic })
    .BarcodeDetector;
  if (!Detector) return null;

  try {
    let usable = [...formats] as string[];
    if (typeof Detector.getSupportedFormats === "function") {
      const supported = await Detector.getSupportedFormats();
      if (Array.isArray(supported) && supported.length > 0) {
        usable = usable.filter((f) => supported.includes(f));
      }
    }
    if (!usable.length) return null;

    const detector = new Detector({ formats: usable });
    const results = await detector.detect(source);
    return results
      .map((r) => {
        const value = String(r.rawValue ?? "").trim();
        if (!value) return null;
        const bb = r.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
        const { cx, cy, r: radius } = centerAndRadiusFromBox(bb);
        return {
          value,
          symbology: normalizeSymbology(String(r.format ?? "unknown")),
          centerX: cx,
          centerY: cy,
          radius,
          sourceWidth,
          sourceHeight,
        } satisfies ScannedCode;
      })
      .filter((code): code is ScannedCode => Boolean(code));
  } catch {
    return null;
  }
}

type ZxingResultPoint = { getX: () => number; getY: () => number };

function scanWithZxing(
  canvas: HTMLCanvasElement,
  formats: readonly string[]
): ScannedCode[] {
  const mapped = formats
    .map((f) => ZXING_FORMAT_MAP[f])
    .filter((v): v is BarcodeFormat => typeof v === "number");
  if (!mapped.length) return [];

  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, mapped);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);

  try {
    const result = reader.decodeFromCanvas(canvas);
    if (!result) return [];
    const points = (result.getResultPoints?.() ?? []) as ZxingResultPoint[];
    const mappedPoints = points.map((p) => ({
      x: typeof p.getX === "function" ? p.getX() : 0,
      y: typeof p.getY === "function" ? p.getY() : 0,
    }));
    const { cx, cy, r } = centerAndRadiusFromResultPoints(mappedPoints);
    return [
      {
        value: result.getText(),
        symbology: normalizeSymbology(
          BarcodeFormat[result.getBarcodeFormat()] ?? "unknown"
        ),
        centerX: cx,
        centerY: cy,
        radius: r || Math.max(canvas.width, canvas.height) * 0.1,
        sourceWidth: canvas.width,
        sourceHeight: canvas.height,
      },
    ];
  } catch (error) {
    if (error instanceof NotFoundException) return [];
    return [];
  }
}

async function scanCodesOnCanvas(
  canvas: HTMLCanvasElement,
  formats: readonly string[]
): Promise<ScannedCode[]> {
  const native = await scanWithBarcodeDetector(
    canvas,
    formats,
    canvas.width,
    canvas.height
  );
  if (native && native.length) return native;
  return scanWithZxing(canvas, formats);
}

async function scanCodesInImage(
  image: HTMLImageElement,
  formats: readonly string[]
): Promise<ScannedCode[]> {
  const w = Math.max(1, image.naturalWidth || image.width);
  const h = Math.max(1, image.naturalHeight || image.height);
  const native = await scanWithBarcodeDetector(image, formats, w, h);
  if (native && native.length) return native;
  const canvas = imageToCanvas(image);
  return scanWithZxing(canvas, formats);
}

async function locateShelfQrViaAi(
  imageBase64: string,
  mimeType: string,
  dimensions: ImageDimensions
): Promise<QrLocateResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildShelfQrLocatePrompt(dimensions.width, dimensions.height),
      imageBase64,
      mimeType,
      responseMimeType: "application/json",
    }),
  });

  const { json, text } = await readApiPayload(response);
  const payload = (json || {}) as AnalyzeResponse;

  if (!response.ok) {
    const detail = text.trim().startsWith("<!DOCTYPE")
      ? "Received HTML instead of JSON from locator."
      : text.slice(0, 160);
    throw new Error(
      payload.error || `AI QR locate failed (${response.status}). ${detail}`
    );
  }

  return parseShelfQrLocateJson(payload.text || "", dimensions);
}

function resolveShelfQrFromValue(value: string): ShelfQrTarget | null {
  return parseShelfQrPayload(value);
}

function firstShelfHit(codes: ScannedCode[]): ShelfQrTarget | null {
  for (const code of codes) {
    const parsed = resolveShelfQrFromValue(code.value);
    if (parsed) return parsed;
  }
  return null;
}

// Shelf-QR detection pipeline: real decoder primary, LLM used only as a locator.
//   Pass 1: BarcodeDetector (native) / ZXing fallback on the full image.
//   Pass 2: If no hit, ask the model to LOCATE the QR (no decode), crop tightly
//           client-side, and re-run the real decoder on the high-res crop.
//   Pass 3: Brute-force 3×3 overlapping tile sweep, still using the real decoder.
// The model never returns a payload — so there is no way for it to fabricate a
// shelf identifier.
async function detectShelfQrTarget(file: File): Promise<ShelfQrTarget | null> {
  const { image, dispose } = await loadImageFromFile(file);
  try {
    // Pass 1: full-image decode.
    const direct = await scanCodesInImage(image, SHELF_QR_FORMATS);
    const directHit = firstShelfHit(direct);
    if (directHit) return directHit;

    const dimensions: ImageDimensions = {
      width: Math.max(1, image.naturalWidth || image.width),
      height: Math.max(1, image.naturalHeight || image.height),
    };

    // Pass 2: AI locator -> tight crop -> real decoder.
    try {
      // Send the model a downscaled JPEG so the request body fits and the
      // upload is fast. The model returns coordinates in the downscaled space,
      // and we scale them back up to crop the full-resolution image.
      const aiEncoded = await encodeImageForAi(file, 2048, 0.85);
      const aiDimensions: ImageDimensions = {
        width: aiEncoded.width,
        height: aiEncoded.height,
      };
      const locate = await locateShelfQrViaAi(
        aiEncoded.base64,
        aiEncoded.mimeType,
        aiDimensions
      );
      if (locate.found && locate.location) {
        const scaleX = dimensions.width / aiDimensions.width;
        const scaleY = dimensions.height / aiDimensions.height;
        const loc = {
          centerX: locate.location.centerX * scaleX,
          centerY: locate.location.centerY * scaleY,
          radius: locate.location.radius * Math.max(scaleX, scaleY),
        };
        const paddedRadius = Math.max(
          loc.radius * 1.6,
          Math.min(dimensions.width, dimensions.height) * 0.04
        );
        const side = Math.min(
          Math.min(dimensions.width, dimensions.height),
          paddedRadius * 2
        );
        const cropCanvas = cropImageToCanvas(
          image,
          {
            x: loc.centerX - side / 2,
            y: loc.centerY - side / 2,
            width: side,
            height: side,
          },
          1280
        );
        const cropCodes = await scanCodesOnCanvas(cropCanvas, SHELF_QR_FORMATS);
        const cropHit = firstShelfHit(cropCodes);
        if (cropHit) return cropHit;
      }
    } catch {
      // Ignore locator failures and fall through to tile sweep.
    }

    // Pass 3: overlapping 3×3 tile sweep with the real decoder — no AI calls.
    const tileW = Math.max(256, Math.round(dimensions.width * 0.5));
    const tileH = Math.max(256, Math.round(dimensions.height * 0.5));
    const steps = [0, 0.5, 1] as const;
    for (const sy of steps) {
      const y = Math.round((dimensions.height - tileH) * sy);
      for (const sx of steps) {
        const x = Math.round((dimensions.width - tileW) * sx);
        try {
          const tileCanvas = cropImageToCanvas(
            image,
            { x, y, width: tileW, height: tileH },
            1280
          );
          const tileCodes = await scanCodesOnCanvas(tileCanvas, SHELF_QR_FORMATS);
          const tileHit = firstShelfHit(tileCodes);
          if (tileHit) return tileHit;
        } catch {
          // Try next tile.
        }
      }
    }

    return null;
  } finally {
    dispose();
  }
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

  // Preserve any decoded SKU across the cluster — primary might lack one even
  // when a sibling carries a real UPC/EAN from the code-scan pass.
  const firstNonEmptySku = rows
    .map((row) => {
      const value = row.sku;
      return typeof value === "string" ? value.trim() : "";
    })
    .find((value) => value.length > 0);

  return {
    ...primary,
    sku: firstNonEmptySku || primary.sku || null,
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

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function assignCodesToItems(input: {
  items: RawInventoryItem[];
  codes: DetectedCode[];
  realDimensions: ImageDimensions;
}): { items: RawInventoryItem[]; assignedCount: number } {
  const availableCodes = input.codes
    .map((code) => ({
      ...code,
      location: code.location
        ? normalizeLocationToRealDimensions(code.location, input.realDimensions)
        : null,
    }))
    .filter((code) => Boolean(code.value) && Boolean(code.location));

  if (!availableCodes.length) {
    return { items: input.items, assignedCount: 0 };
  }

  const items = input.items.map((item) => ({
    ...item,
    location: item.location
      ? normalizeLocationToRealDimensions(item.location, input.realDimensions)
      : null,
  }));

  // Greedy assignment: for each item (closest-first), attach the nearest unused code
  // if it lands within a reasonable neighborhood around the item's detection circle.
  const candidates: Array<{
    itemIndex: number;
    codeIndex: number;
    d2: number;
    threshold2: number;
  }> = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.sku && String(item.sku).trim()) continue;
    if (!item.location) continue;

    const itemCenter = { x: item.location.centerX, y: item.location.centerY };
    const itemRadius = Math.max(24, item.location.radius || 0);

    for (let j = 0; j < availableCodes.length; j += 1) {
      const code = availableCodes[j];
      if (!code.location) continue;
      const codeCenter = { x: code.location.centerX, y: code.location.centerY };
      const codeRadius = Math.max(12, code.location.radius || 0);
      const d2 = distanceSquared(itemCenter, codeCenter);
      const threshold = Math.max(itemRadius * 1.25, itemRadius + codeRadius + 18);
      candidates.push({ itemIndex: i, codeIndex: j, d2, threshold2: threshold * threshold });
    }
  }

  candidates.sort((a, b) => a.d2 - b.d2);

  const usedCodes = new Set<number>();
  let assignedCount = 0;
  const next = [...items];

  for (const candidate of candidates) {
    if (usedCodes.has(candidate.codeIndex)) continue;
    if (candidate.d2 > candidate.threshold2) continue;
    const item = next[candidate.itemIndex];
    if (!item || (item.sku && String(item.sku).trim())) continue;
    const code = availableCodes[candidate.codeIndex];
    next[candidate.itemIndex] = { ...item, sku: code.value };
    usedCodes.add(candidate.codeIndex);
    assignedCount += 1;
  }

  return { items: next, assignedCount };
}

async function analyzeOneImage(file: File, shelfName: string): Promise<AnalyzeOneResult> {
  const dimensions = await readImageDimensions(file);
  // Full-resolution base64 is still uploaded to Cloudinary so the student page
  // and zoom modal get the highest-quality shelf photo we have.
  const fullResBase64Promise = toBase64Data(file);
  // AI vision calls get a compressed 2048-px JPEG to stay well under request
  // body and upstream API limits. 8+ MB PNGs would otherwise fail at the edge.
  const aiEncoded = await encodeImageForAi(file, 2048, 0.85);
  const codeScanNotesPrefix = "Code scan:";

  // Local machine-readable code scan (QR + UPC/EAN/Code128) via BarcodeDetector
  // with a ZXing fallback. Runs in parallel with the LLM's product-detail call.
  // The decoder never hallucinates, so any code in the returned snapshot is a
  // real decode from the printed barcode.
  const codeScanPromise: Promise<CodeScanSnapshot> = (async () => {
    try {
      const { image, dispose } = await loadImageFromFile(file);
      try {
        const scanned = await scanCodesInImage(image, PRODUCT_CODE_FORMATS);
        return {
          codes: scanned.map((code) => ({
            value: code.value,
            symbology: code.symbology,
            location: {
              centerX: code.centerX,
              centerY: code.centerY,
              radius: Math.max(1, code.radius),
              imageWidth: code.sourceWidth,
              imageHeight: code.sourceHeight,
            },
          })),
          notes: [],
        };
      } finally {
        dispose();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return { codes: [], notes: [`Local decode failed: ${message}`] };
    }
  })();

  const analyzePromise = fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildInventoryPrompt(dimensions.width, dimensions.height),
      imageBase64: aiEncoded.base64,
      mimeType: aiEncoded.mimeType,
      responseMimeType: "application/json",
    }),
  });

  const [codeSnapshot, analyzeResponse] = await Promise.all([
    codeScanPromise,
    analyzePromise,
  ]);

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
    return {
      rows: [],
      detectedCount: 0,
      notes: [...snapshot.notes, ...codeSnapshot.notes.map((note) => `${codeScanNotesPrefix} ${note}`)],
    };
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

  // Merge codes into item skus by nearest location match.
  const { items: itemsWithCodes, assignedCount: codeAssignedCount } = assignCodesToItems({
    items: refinedItems,
    codes: codeSnapshot.codes,
    realDimensions: dimensions,
  });

  const fullResBase64 = await fullResBase64Promise;
  const shelfPhotoUrl = await uploadPhotoToCloudinary(
    fullResBase64,
    file.type || "image/jpeg",
    shelfName
  );

  const sanitizedItems = itemsWithCodes.map(normalizeBareName);
  const bareNameRewriteCount = sanitizedItems.reduce(
    (count, item, index) => count + (item === itemsWithCodes[index] ? 0 : 1),
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
  if (codeSnapshot.codes.length > 0) {
    combinedNotes.push(
      `Decoded ${codeSnapshot.codes.length} machine-readable code${codeSnapshot.codes.length === 1 ? "" : "s"} and assigned ${codeAssignedCount} to nearby item${codeAssignedCount === 1 ? "" : "s"} as SKU.`
    );
  }
  if (estimatedQuantityCount > 0) {
    combinedNotes.push(
      `Estimated ${extraUnitsBehindFront} extra unit${extraUnitsBehindFront === 1 ? "" : "s"} stacked behind the front row across ${estimatedQuantityCount} product${estimatedQuantityCount === 1 ? "" : "s"}.`
    );
  }
  combinedNotes.push(...codeSnapshot.notes.map((note) => `${codeScanNotesPrefix} ${note}`));
  combinedNotes.push(...refinementNotes);

  return {
    rows,
    detectedCount: sanitizedItems.length,
    notes: combinedNotes,
  };
}

// Build the same ShelfQrTarget shape a decoded QR would produce, so a manually
// picked shelf travels through the rest of the pipeline (analyzeOneImage,
// shelfBatches, save) without special-casing.
function shelfOptionToQrTarget(
  shelf: ShelfOption,
  planId: string
): ShelfQrTarget {
  return {
    shelfTag: buildShelfTag(planId, shelf.shelfUid),
    shelfName: buildShelfNameFromQr(shelf.catId, shelf.shelfUid),
    shelfUid: shelf.shelfUid,
    planId,
    category: shelf.catId,
  };
}

// Data Connect row shape for the shelves array on a floor plan.
type RawShelfRow = {
  shelf_uid?: unknown;
  cat_id?: unknown;
  limit_per_student?: unknown;
  rotation?: unknown;
  map_x?: unknown;
  map_y?: unknown;
  map_w?: unknown;
  map_h?: unknown;
};

function toShelfOption(row: RawShelfRow, index: number): ShelfOption | null {
  const uid = typeof row.shelf_uid === "string" ? row.shelf_uid.trim() : "";
  if (!uid) return null;
  const catIdRaw = typeof row.cat_id === "string" ? row.cat_id.trim() : "";
  const catId = (CATEGORIES.find((c) => c.id === catIdRaw)?.id ??
    "misc_non_food") as CategoryId;
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  void index;
  return {
    shelfUid: uid.slice(0, 64),
    catId,
    limit: num(row.limit_per_student, 0),
    rotation: num(row.rotation, 0),
    x: num(row.map_x, 0),
    y: num(row.map_y, 0),
    w: num(row.map_w, 0),
    h: num(row.map_h, 0),
  };
}

async function loadDeployedFloorPlan(): Promise<DeployedFloorPlan | null> {
  const res = await getAllFloorPlans(dataConnect, {
    fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
  });
  const plans = (res.data.floorPlans as Array<{
    id: string;
    isDeployed?: boolean | null;
    updatedAt?: string | null;
    shelves?: unknown | null;
  }>).filter((plan) => plan.isDeployed);
  if (!plans.length) return null;
  plans.sort((a, b) => {
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bt - at;
  });
  const plan = plans[0];
  const rawShelves = Array.isArray(plan.shelves)
    ? (plan.shelves as RawShelfRow[])
    : [];
  const shelves = rawShelves
    .map((row, index) => toShelfOption(row, index))
    .filter((shelf): shelf is ShelfOption => shelf !== null);
  return { planId: plan.id, shelves };
}

// Sub-component: lets the admin click a shelf on the deployed floor plan for
// each image that couldn't be auto-matched via QR decode. Each click binds the
// selected shelf to the currently active image and advances the queue.
function ManualShelfPicker({
  pendingUpload,
  deployedPlan,
  activePickIndex,
  onActivePickIndexChange,
  onUpdatePick,
  onToggleSkip,
  onCancel,
  onContinue,
}: {
  pendingUpload: PendingUploadState;
  deployedPlan: DeployedFloorPlan;
  activePickIndex: number;
  onActivePickIndexChange: (index: number) => void;
  onUpdatePick: (imageId: string, shelfUid: string | null) => void;
  onToggleSkip: (imageId: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const picks = pendingUpload.manualPicks;
  const safeIndex = Math.min(Math.max(0, activePickIndex), Math.max(0, picks.length - 1));
  const active = picks[safeIndex];

  const canvasSize = 520;
  const scale = canvasSize; // map_* values are normalized [0, 1].

  const renderedZones: FloorPlanZone[] = useMemo(
    () =>
      deployedPlan.shelves.map((shelf) => ({
        id: shelf.shelfUid,
        catId: shelf.catId,
        limit: shelf.limit,
        rotation: shelf.rotation,
        x: shelf.x * scale,
        y: shelf.y * scale,
        w: shelf.w * scale,
        h: shelf.h * scale,
      })),
    [deployedPlan, scale]
  );

  const assignmentsByShelfUid = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pick of picks) {
      if (pick.chosenShelfUid) {
        const list = map.get(pick.chosenShelfUid) ?? [];
        list.push(pick.fileName);
        map.set(pick.chosenShelfUid, list);
      }
    }
    return map;
  }, [picks]);

  const allResolved = picks.every(
    (pick) => pick.skipped || Boolean(pick.chosenShelfUid)
  );

  const handleZoneClick = (zone: FloorPlanZone) => {
    if (!active) return;
    // Clicking the same shelf again deselects it for this image.
    const next = active.chosenShelfUid === zone.id ? null : zone.id;
    onUpdatePick(active.imageId, next);
    // Advance to the next unresolved image if the admin just assigned one.
    if (next) {
      const nextIndex = picks.findIndex(
        (pick, i) =>
          i !== safeIndex && !pick.skipped && !pick.chosenShelfUid
      );
      if (nextIndex >= 0) {
        onActivePickIndexChange(nextIndex);
      }
    }
  };

  const buttonBase: React.CSSProperties = {
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 14px",
    cursor: "pointer",
    border: "1px solid var(--fp-panel-border)",
    background: "var(--fp-input-bg)",
    color: "var(--fp-text-secondary)",
  };

  return (
    <HexPanel contentStyle={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
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
            Assign shelves
          </p>
          <h2
            style={{
              color: "var(--fp-text-primary)",
              fontSize: "clamp(18px, 4vw, 22px)",
              fontWeight: 800,
              margin: "0 0 4px",
            }}
          >
            Tell us where these photos were taken
          </h2>
          <p
            style={{
              color: "var(--fp-text-secondary)",
              fontSize: 13,
              margin: 0,
            }}
          >
            {picks.length === 1
              ? "We couldn't read the shelf QR in this photo. Pick the matching shelf on the floor plan."
              : `We couldn't read the shelf QR in ${picks.length} photos. Select each photo, then click the matching shelf on the floor plan.`}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 280px) 1fr",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: canvasSize,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {picks.map((pick, index) => {
              const isActive = index === safeIndex;
              const chosenShelf = pick.chosenShelfUid
                ? deployedPlan.shelves.find(
                    (shelf) => shelf.shelfUid === pick.chosenShelfUid
                  )
                : null;
              const categoryLabel = chosenShelf
                ? CATEGORIES.find((cat) => cat.id === chosenShelf.catId)
                    ?.label ?? chosenShelf.catId
                : null;
              return (
                <button
                  key={pick.imageId}
                  type="button"
                  onClick={() => onActivePickIndexChange(index)}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: isActive
                      ? "var(--fp-surface-secondary)"
                      : "var(--fp-input-bg)",
                    border: isActive
                      ? "2px solid var(--fp-button-accent)"
                      : "1px solid var(--fp-panel-border)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  <Image
                    src={pick.previewUrl}
                    alt={`${pick.fileName} preview`}
                    width={48}
                    height={48}
                    unoptimized
                    style={{
                      height: 48,
                      width: 48,
                      borderRadius: 8,
                      border: "1px solid var(--fp-panel-border)",
                      objectFit: "cover",
                      flexShrink: 0,
                      opacity: pick.skipped ? 0.4 : 1,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        color: "var(--fp-text-primary)",
                        fontWeight: 600,
                        fontSize: 12,
                        margin: "0 0 2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {index + 1}. {pick.fileName}
                    </p>
                    <p
                      style={{
                        color: pick.skipped
                          ? "#f87171"
                          : pick.chosenShelfUid
                            ? "#6ee7b7"
                            : "var(--fp-text-muted)",
                        fontSize: 11,
                        margin: 0,
                      }}
                    >
                      {pick.skipped
                        ? "Skipped"
                        : chosenShelf && categoryLabel
                          ? categoryLabel
                          : "No shelf selected"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                background: "var(--fp-surface-secondary)",
                border: "1px solid var(--fp-panel-border)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    color: "var(--fp-text-muted)",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    margin: "0 0 2px",
                  }}
                >
                  Selected photo
                </p>
                <p
                  style={{
                    color: "var(--fp-text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {active ? active.fileName : "—"}
                </p>
              </div>
              {active ? (
                <button
                  type="button"
                  onClick={() => onToggleSkip(active.imageId)}
                  style={{
                    ...buttonBase,
                    color: active.skipped ? "#f87171" : "var(--fp-text-secondary)",
                  }}
                >
                  {active.skipped ? "Include this photo" : "Skip this photo"}
                </button>
              ) : null}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <FloorPlanCanvas
                canvasSize={canvasSize}
                zones={renderedZones}
                walls={[]}
                markers={[]}
                selected={
                  active?.chosenShelfUid
                    ? { id: active.chosenShelfUid, kind: "zone" }
                    : null
                }
                onZoneClick={handleZoneClick}
                renderZoneExtras={(zone) => {
                  const fileNames = assignmentsByShelfUid.get(zone.id);
                  if (!fileNames || fileNames.length === 0) return null;
                  return (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 4,
                        background: "rgba(15,23,42,0.85)",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        pointerEvents: "none",
                      }}
                    >
                      {fileNames.length}
                    </span>
                  );
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button type="button" onClick={onCancel} style={buttonBase}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!allResolved}
            style={{
              ...buttonBase,
              background: "var(--fp-button-accent)",
              color: "#fff",
              border: "none",
              cursor: allResolved ? "pointer" : "not-allowed",
              opacity: allResolved ? 1 : 0.5,
            }}
          >
            Save inventory
          </button>
        </div>
      </div>
    </HexPanel>
  );
}

export default function InventoryPage() {
  const router = useRouter();
  const [selectedImages, setSelectedImages] = useState<SelectedUploadImage[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployedPlan, setDeployedPlan] = useState<DeployedFloorPlan | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUploadState | null>(null);
  const [activePickIndex, setActivePickIndex] = useState(0);

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

  // Pull the deployed floor plan once so the manual shelf-picker fallback has
  // something to show the admin when QR decoding fails. Silent-fail here —
  // auto-QR still works even without a plan loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plan = await loadDeployedFloorPlan();
        if (!cancelled) setDeployedPlan(plan);
      } catch {
        if (!cancelled) setDeployedPlan(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      return;
    }

    setErrorMessage("");

    const oversizedCount = imageFiles.filter(
      (file) => file.size > MAX_UPLOAD_BYTES
    ).length;
    if (oversizedCount > 0) {
      setStatusMessage("Preparing photos…");
    } else {
      setStatusMessage("");
    }

    const processed = await Promise.all(
      imageFiles.map(async (file) => {
        try {
          return await compressImageFileUnderLimit(file);
        } catch {
          return file;
        }
      })
    );

    if (oversizedCount > 0) {
      setStatusMessage("");
    }

    setSelectedImages((previous) => {
      const startIndex = previous.length;
      const additions = processed.map((file, offset) => ({
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
    void addFiles(files);
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
  };

  // Phase 2: analyze every image we have a shelf target for, then DELETE +
  // POST to replace inventory. Shared by both the all-auto-QR path and the
  // "continue after manual shelf picks" path, so the behavior is identical.
  const runAnalyzeAndSave = async (input: {
    imagesSnapshot: SelectedUploadImage[];
    targetsById: Record<string, ShelfQrTarget>;
    initialNotes: string[];
    initialFailedCount: number;
  }) => {
    const { imagesSnapshot, targetsById, initialNotes } = input;
    const notes = [...initialNotes];
    let failedCount = input.initialFailedCount;

    const shelfBatches = new Map<string, ShelfSaveBatch>();
    let processedCount = 0;

    for (const selected of imagesSnapshot) {
      processedCount += 1;
      const shelfTarget = targetsById[selected.id];
      if (!shelfTarget) {
        // Image was skipped / unresolved — surface an error row and move on.
        continue;
      }

      const resolvedShelfName = shelfTarget.shelfName;

      try {
        setStatusMessage(
          `Identifying products… (${processedCount} of ${imagesSnapshot.length})`
        );

        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === selected.id ? { ...image, status: "processing" } : image
          )
        );

        const analyzed = await analyzeOneImage(selected.file, resolvedShelfName);

        const batchKey = shelfTarget.shelfTag;
        const existingBatch = shelfBatches.get(batchKey);

        if (existingBatch) {
          existingBatch.rows.push(...analyzed.rows);
        } else {
          shelfBatches.set(batchKey, {
            shelfName: resolvedShelfName,
            shelfTag: shelfTarget.shelfTag,
            rows: [...analyzed.rows],
          });
        }

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
      } catch {
        failedCount += 1;

        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === selected.id
              ? {
                  ...image,
                  status: "error",
                  errorMessage: "We couldn't read this photo.",
                  detectedCount: 0,
                }
              : image
          )
        );
      }
    }

    const batches = Array.from(shelfBatches.values()).filter(
      (batch) => batch.rows.length > 0
    );

    if (!batches.length) {
      setErrorMessage(
        "No items were saved. Make sure each photo shows a shelf QR code and visible products, then try again."
      );
      return { savedCount: 0, failedCount };
    }

    for (const batch of batches) {
      const { merged } = mergeDuplicateRows(batch.rows);
      batch.rows = merged;
    }

    let inventoryCleared = false;
    setStatusMessage("Updating inventory…");
    const deleteResponse = await fetch(
      "/api/dataconnect/inventory-items?scope=all",
      { method: "DELETE" }
    );
    // Drain the body so the connection releases; we only care about status.
    await readApiPayload(deleteResponse);
    if (!deleteResponse.ok) {
      throw new Error(
        "We couldn't update the inventory. Please try again."
      );
    }
    inventoryCleared = true;

    let savedCount = 0;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setStatusMessage(
        `Saving items… (${index + 1} of ${batches.length} shelves)`
      );

      const saveResponse = await fetch("/api/dataconnect/inventory-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shelfName: batch.shelfName,
          shelfTag: batch.shelfTag || undefined,
          items: batch.rows,
        }),
      });

      const { json: saveJson } = await readApiPayload(saveResponse);
      const savePayload = (saveJson || {}) as SaveInventoryResponse;

      if (!saveResponse.ok) {
        throw new Error(
          inventoryCleared
            ? "Inventory was only partially saved. Please re-upload to finish."
            : "We couldn't save the inventory. Please try again."
        );
      }

      const batchSavedCount = Number(savePayload.savedCount ?? batch.rows.length);
      savedCount += batchSavedCount;
    }

    const itemLabel = savedCount === 1 ? "item" : "items";
    const shelfLabel = batches.length === 1 ? "shelf" : "shelves";
    const summary =
      failedCount > 0
        ? `Saved ${savedCount} ${itemLabel} across ${batches.length} ${shelfLabel}. ${failedCount} photo${failedCount === 1 ? "" : "s"} couldn't be processed.`
        : `Saved ${savedCount} ${itemLabel} across ${batches.length} ${shelfLabel}.`;
    setStatusMessage(summary);
    // notes were accumulated for debugging but we no longer surface them to the
    // end user — the per-image cards communicate per-photo state clearly.
    void notes;

    return { savedCount, failedCount };
  };

  // Phase 1: scan every image for a shelf QR. Auto-matched images get their
  // ShelfQrTarget; anything without a decodable QR is collected into a queue
  // for manual shelf picking from the deployed floor plan.
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    if (!selectedImages.length) {
      setErrorMessage("Add one or more shelf photos first.");
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
    const autoTargets: Record<string, ShelfQrTarget> = {};
    const manualPicks: ManualShelfPick[] = [];
    const notes: string[] = [];
    let failedCount = 0;

    // Set of shelf_uids that actually exist on the deployed floor plan. We use
    // this to *validate* decoded QR payloads — a QR can physically decode but
    // reference a shelf that isn't on the current plan (e.g. stale QR prints
    // like `legacy-2`). Those would persist with a shelfTag that no zone can
    // match on the student page, so we route them to the manual picker.
    const deployedShelfUids = new Set(
      (deployedPlan?.shelves ?? []).map((shelf) => shelf.shelfUid.toLowerCase())
    );
    const haveDeployedShelves = deployedShelfUids.size > 0;

    try {
      for (let i = 0; i < imagesSnapshot.length; i += 1) {
        const selected = imagesSnapshot[i];

        setStatusMessage(
          `Scanning shelves… (${i + 1} of ${imagesSnapshot.length})`
        );
        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === selected.id ? { ...image, status: "processing" } : image
          )
        );

        let shelfTarget: ShelfQrTarget | null = null;
        try {
          shelfTarget = await detectShelfQrTarget(selected.file);
        } catch (qrError) {
          const message =
            qrError instanceof Error
              ? qrError.message
              : "Unable to scan shelf QR from this image.";
          notes.push(`${selected.file.name}: ${message}`);
        }

        // Reject QR payloads whose shelf_uid isn't on the deployed floor plan.
        // If we saved with that uid anyway, `renderedZones.find(zone.id === uid)`
        // on the student page would fail and the item would show up without a
        // shelf mapping ("not on the current floor plan yet").
        if (
          shelfTarget &&
          haveDeployedShelves &&
          !deployedShelfUids.has(shelfTarget.shelfUid.toLowerCase())
        ) {
          notes.push(
            `${selected.file.name}: decoded shelf QR "${shelfTarget.shelfUid}" is not on the deployed floor plan — asking for manual assignment.`
          );
          shelfTarget = null;
        }

        if (shelfTarget) {
          autoTargets[selected.id] = shelfTarget;
          notes.push(
            `${selected.file.name}: matched shelf QR ${shelfTarget.shelfUid}${
              shelfTarget.planId ? ` (plan ${shelfTarget.planId})` : ""
            }.`
          );
          setSelectedImages((previous) =>
            previous.map((image) =>
              image.id === selected.id ? { ...image, status: "pending" } : image
            )
          );
        } else {
          manualPicks.push({
            imageId: selected.id,
            fileName: selected.file.name,
            previewUrl: selected.previewUrl,
            file: selected.file,
            chosenShelfUid: null,
            skipped: false,
          });
          setSelectedImages((previous) =>
            previous.map((image) =>
              image.id === selected.id
                ? {
                    ...image,
                    status: "pending",
                    errorMessage: "Shelf QR not detected",
                  }
                : image
            )
          );
        }
      }

      // Nothing to pick manually → run Phase 2 immediately.
      if (!manualPicks.length) {
        let saveResult: { savedCount: number; failedCount: number } | undefined;
        try {
          saveResult = await runAnalyzeAndSave({
            imagesSnapshot,
            targetsById: autoTargets,
            initialNotes: notes,
            initialFailedCount: failedCount,
          });
        } finally {
          setIsSubmitting(false);
        }
        if (saveResult && saveResult.savedCount > 0) {
          router.push("/student/inventory");
        }
        return;
      }

      // If we have pending images but no deployed floor plan loaded, there is
      // no UI to pick from — mark those images as errored like before.
      if (!deployedPlan || deployedPlan.shelves.length === 0) {
        for (const pick of manualPicks) {
          failedCount += 1;
          const message = "Shelf QR not detected";
          notes.push(`${pick.fileName}: ${message}`);
          setSelectedImages((previous) =>
            previous.map((image) =>
              image.id === pick.imageId
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

        let saveResult: { savedCount: number; failedCount: number } | undefined;
        try {
          if (Object.keys(autoTargets).length) {
            saveResult = await runAnalyzeAndSave({
              imagesSnapshot,
              targetsById: autoTargets,
              initialNotes: notes,
              initialFailedCount: failedCount,
            });
          } else {
            setErrorMessage(
              "We couldn't find a shelf QR in any photo. Make sure each photo clearly shows the shelf's QR code and try again."
            );
          }
        } finally {
          setIsSubmitting(false);
        }
        if (saveResult && saveResult.savedCount > 0) {
          router.push("/student/inventory");
        }
        return;
      }

      // Open the manual shelf picker and let the admin resolve each pending
      // image; Phase 2 runs when they click "Save with selected shelves".
      setStatusMessage(
        manualPicks.length === 1
          ? "1 photo needs a shelf — pick it on the floor plan below."
          : `${manualPicks.length} photos need a shelf — pick them on the floor plan below.`
      );
      setPendingUpload({
        imagesSnapshot,
        autoTargets,
        notes,
        failedCount,
        manualPicks,
      });
      setActivePickIndex(0);
      setIsSubmitting(false);
    } catch {
      setErrorMessage("Something went wrong while scanning your photos. Please try again.");
      setIsSubmitting(false);
    }
  };

  const continueAfterManualPicks = async () => {
    if (!pendingUpload) return;

    const targetsById: Record<string, ShelfQrTarget> = {
      ...pendingUpload.autoTargets,
    };
    const notes = [...pendingUpload.notes];
    let failedCount = pendingUpload.failedCount;

    const planId = deployedPlan?.planId ?? null;
    const shelvesByUid = new Map<string, ShelfOption>();
    if (deployedPlan) {
      for (const shelf of deployedPlan.shelves) {
        shelvesByUid.set(shelf.shelfUid, shelf);
      }
    }

    for (const pick of pendingUpload.manualPicks) {
      if (pick.skipped) {
        failedCount += 1;
        const message = "Skipped";
        notes.push(`${pick.fileName}: ${message}`);
        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === pick.imageId
              ? {
                  ...image,
                  status: "error",
                  errorMessage: message,
                  detectedCount: 0,
                }
              : image
          )
        );
        continue;
      }

      if (!pick.chosenShelfUid || !planId) {
        failedCount += 1;
        const message = "No shelf selected";
        notes.push(`${pick.fileName}: ${message}`);
        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === pick.imageId
              ? {
                  ...image,
                  status: "error",
                  errorMessage: message,
                  detectedCount: 0,
                }
              : image
          )
        );
        continue;
      }

      const shelf = shelvesByUid.get(pick.chosenShelfUid);
      if (!shelf) {
        failedCount += 1;
        const message = "Selected shelf no longer exists";
        notes.push(`${pick.fileName}: ${message}`);
        setSelectedImages((previous) =>
          previous.map((image) =>
            image.id === pick.imageId
              ? {
                  ...image,
                  status: "error",
                  errorMessage: message,
                  detectedCount: 0,
                }
              : image
          )
        );
        continue;
      }

      const target = shelfOptionToQrTarget(shelf, planId);
      targetsById[pick.imageId] = target;
      notes.push(
        `${pick.fileName}: manually assigned to shelf ${target.shelfUid}.`
      );
    }

    setPendingUpload(null);
    setActivePickIndex(0);
    setIsSubmitting(true);

    let saveResult: { savedCount: number; failedCount: number } | undefined;
    try {
      saveResult = await runAnalyzeAndSave({
        imagesSnapshot: pendingUpload.imagesSnapshot,
        targetsById,
        initialNotes: notes,
        initialFailedCount: failedCount,
      });
    } catch (submitError) {
      setErrorMessage(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while saving. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }

    if (saveResult && saveResult.savedCount > 0) {
      router.push("/student/inventory");
    }
  };

  const cancelManualPicker = () => {
    if (!pendingUpload) return;
    for (const pick of pendingUpload.manualPicks) {
      setSelectedImages((previous) =>
        previous.map((image) =>
          image.id === pick.imageId
            ? {
                ...image,
                status: "pending",
                errorMessage: null,
                detectedCount: 0,
              }
            : image
        )
      );
    }
    setPendingUpload(null);
    setActivePickIndex(0);
    setStatusMessage("");
  };

  const updateManualPick = (imageId: string, shelfUid: string | null) => {
    setPendingUpload((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        manualPicks: previous.manualPicks.map((pick) =>
          pick.imageId === imageId
            ? { ...pick, chosenShelfUid: shelfUid, skipped: false }
            : pick
        ),
      };
    });
  };

  const toggleSkipManualPick = (imageId: string) => {
    setPendingUpload((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        manualPicks: previous.manualPicks.map((pick) =>
          pick.imageId === imageId
            ? {
                ...pick,
                skipped: !pick.skipped,
                chosenShelfUid: pick.skipped ? pick.chosenShelfUid : null,
              }
            : pick
        ),
      };
    });
  };

  const navLink = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" } as React.CSSProperties;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "clamp(12px, 4vw, 32px) clamp(10px, 3vw, 24px)", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <HexPanel contentStyle={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Admin · Inventory</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, margin: "0 0 4px" }}>Shelf Inventory Upload</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>Upload shelf photos and we&apos;ll refresh the inventory automatically.</p>
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
                message="Working on it…"
                className="py-4"
                iconClassName="h-24 w-24"
                messageClassName="mt-2 text-sm font-medium"
              />
            </HexPanel>
          ) : null}

          {!isSubmitting && pendingUpload && deployedPlan ? (
            <ManualShelfPicker
              pendingUpload={pendingUpload}
              deployedPlan={deployedPlan}
              activePickIndex={activePickIndex}
              onActivePickIndexChange={setActivePickIndex}
              onUpdatePick={updateManualPick}
              onToggleSkip={toggleSkipManualPick}
              onCancel={cancelManualPicker}
              onContinue={continueAfterManualPicks}
            />
          ) : null}

          {!isSubmitting && !pendingUpload ? (
            <HexPanel contentStyle={{ padding: "20px 24px" }}>
              <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ border: "1px solid rgba(220,50,50,0.4)", background: "rgba(180,30,30,0.10)", color: "#fca5a5", borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: 0, fontWeight: 600 }}>
                  Uploading replaces the entire inventory. The current list will be cleared before new items are saved.
                </p>

                <p style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-surface-secondary)", color: "var(--fp-text-secondary)", borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: 0 }}>
                  Each photo should show the shelf&apos;s QR code. If we can&apos;t read one, we&apos;ll ask you to pick the shelf on the floor plan.
                </p>

                <div style={{ background: "var(--fp-surface-secondary)", border: "1px solid var(--fp-panel-border)", borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <p style={{ color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 700, margin: 0 }}>
                      Photos ({selectedImages.length})
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={onOpenFilePicker}
                        style={{ background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, padding: "7px 16px", cursor: "pointer" }}
                      >
                        Add photos
                      </button>
                      <button
                        type="button"
                        onClick={onClearAll}
                        disabled={!selectedImages.length}
                        style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 8, fontSize: 13, fontWeight: 600, padding: "7px 14px", cursor: "pointer", opacity: !selectedImages.length ? 0.5 : 1 }}
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
                            <p style={{ fontSize: 12, margin: 0, color: selected.status === "error" ? "#f87171" : selected.status === "done" ? "#6ee7b7" : "var(--fp-text-muted)" }}>
                              {selected.status === "pending" ? "Ready" : null}
                              {selected.status === "processing" ? "Working…" : null}
                              {selected.status === "done"
                                ? `Done · ${selected.detectedCount} item${selected.detectedCount === 1 ? "" : "s"}`
                                : null}
                              {selected.status === "error"
                                ? selected.errorMessage || "Couldn't read photo"
                                : null}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveImage(selected.id)}
                            style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 8, fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer", flexShrink: 0 }}
                          >
                            Remove
                          </button>
                        </article>
                      ))
                    ) : (
                      <p style={{ border: "1px dashed var(--fp-panel-border)", color: "var(--fp-text-muted)", background: "transparent", borderRadius: 10, padding: "24px 16px", textAlign: "center", fontSize: 13, margin: 0 }}>
                        Add one or more shelf photos to get started.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!selectedImages.length}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "100%", background: "var(--fp-button-accent)", color: "#fff",
                    border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                    padding: "11px 20px", cursor: !selectedImages.length ? "not-allowed" : "pointer",
                    opacity: !selectedImages.length ? 0.5 : 1,
                    boxSizing: "border-box",
                  }}
                >
                  Replace inventory
                </button>
              </form>
            </HexPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
