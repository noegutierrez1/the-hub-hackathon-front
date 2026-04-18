"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type AnalyzeResponse = {
  text?: string;
  error?: string;
};

type InventoryItem = {
  sku?: string;
  brand: string;
  itemName: string;
  description: string;
  packageDetails: string;
  estimatedQuantityVisible: number;
  category: string;
  confidence: "high" | "medium" | "low" | string;
};

type InventorySnapshot = {
  sceneSummary: string;
  inventoryItems: InventoryItem[];
  notes: string[];
};

const DEFAULT_INVENTORY_PROMPT = `
Context:
My school has a Basic Needs Hub where donated groceries are delivered a few times a week by local partners.
Students can receive groceries for free using their student ID, with item limits for some categories.

Task:
Analyze this photo of Hub inventory and produce an inventory snapshot.

Return valid JSON only. Do not include markdown or code fences.

Use this exact schema:
{
  "sceneSummary": "string",
  "inventoryItems": [
    {
      "sku": "string or null",
      "brand": "string",
      "itemName": "string",
      "description": "short identifying description",
      "packageDetails": "size/count such as 12 oz or 5-pack",
      "estimatedQuantityVisible": 0,
      "category": "dry|refrigerated|frozen|beverage|produce|hygiene|other",
      "confidence": "high|medium|low"
    }
  ],
  "notes": ["string"]
}

Rules:
- estimatedQuantityVisible must be an integer.
- sku is optional. Use null when not visible.
- brand should be included when visible; otherwise provide a best estimate.
- If uncertain, still include best estimate and explain uncertainty in notes.
- Include every distinct visible item type.
`.trim();

const EMPTY_SNAPSHOT: InventorySnapshot = {
  sceneSummary: "",
  inventoryItems: [],
  notes: [],
};

function parseInventoryJson(raw: string): InventorySnapshot {
  const sanitized = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(sanitized) as Partial<InventorySnapshot>;

  const items = Array.isArray(parsed.inventoryItems)
    ? parsed.inventoryItems.map((item) => ({
        itemName: String(item?.itemName ?? "Unknown item"),
        sku:
          item?.sku == null || String(item?.sku).trim() === ""
            ? ""
            : String(item?.sku),
        brand: String(item?.brand ?? item?.sku ?? "Unknown"),
        description: String(item?.description ?? ""),
        packageDetails: String(item?.packageDetails ?? ""),
        estimatedQuantityVisible: Number.isFinite(Number(item?.estimatedQuantityVisible))
          ? Math.max(0, Math.round(Number(item?.estimatedQuantityVisible)))
          : 0,
        category: String(item?.category ?? "other"),
        confidence: String(item?.confidence ?? "low"),
      }))
    : [];

  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((note) => String(note))
    : [];

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

function buildPlaceholderPhotoUrl(file: File | null, itemName: string, index: number) {
  const fileToken = (file?.name || "inventory-photo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const itemToken = itemName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const now = Date.now();
  return `https://images.example.com/hub/${fileToken || "photo"}-${itemToken || "item"}-${now}-${index + 1}.jpg`;
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
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { json: parsed, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

export default function InventoryPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [shelfName, setShelfName] = useState("");
  const [shelfLocationDescription, setShelfLocationDescription] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = () => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const closeCamera = () => {
    stopCameraStream();
    setIsCameraOpen(false);
    setIsStartingCamera(false);
  };

  const setSelectedImage = (file: File | null) => {
    setImageFile(file);
    setSnapshot(EMPTY_SNAPSHOT);
    setStatus("");
    setError("");

    if (!file) {
      setImagePreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedImage(file);
    closeCamera();
  };

  const onTakePhoto = async () => {
    setCameraError("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setIsStartingCamera(true);

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setIsCameraOpen(true);

      requestAnimationFrame(() => {
        if (!cameraVideoRef.current) {
          return;
        }

        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play().catch(() => {
          setCameraError(
            "Camera started but preview could not autoplay. Tap Capture if preview remains blank."
          );
        });
      });
    } catch {
      setCameraError("Could not access camera. Use Upload Existing Photo instead.");
      cameraInputRef.current?.click();
    } finally {
      setIsStartingCamera(false);
    }
  };

  const onUploadPhoto = () => {
    closeCamera();
    uploadInputRef.current?.click();
  };

  const onCaptureFromCamera = async () => {
    const video = cameraVideoRef.current;
    if (!video) {
      setCameraError("Camera preview is not ready yet.");
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture camera frame.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError("Could not generate image from camera capture.");
      return;
    }

    const file = new File([blob], `inventory-camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    setSelectedImage(file);
    closeCamera();
  };

  const onProcessAndSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSnapshot(EMPTY_SNAPSHOT);
    setStatus("");

    if (!imageFile) {
      setError("Upload an inventory photo first.");
      return;
    }

    if (!shelfName.trim()) {
      setError("Enter a shelf group name so this upload is linked to a shelf.");
      return;
    }

    setIsProcessing(true);
    try {
      const imageBase64 = await toBase64Data(imageFile);
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: DEFAULT_INVENTORY_PROMPT,
          imageBase64,
          mimeType: imageFile.type,
          responseMimeType: "application/json",
        }),
      });

      const { json: analyzeJson, text: analyzeText } = await readApiPayload(analyzeResponse);
      const analyzePayload = (analyzeJson || {}) as AnalyzeResponse;
      if (!analyzeResponse.ok) {
        throw new Error(
          analyzePayload.error ||
            `Inventory parsing failed (${analyzeResponse.status}). ${
              analyzeText ? analyzeText.slice(0, 160) : ""
            }`
        );
      }

      const rawText = analyzePayload.text || "";
      const parsedSnapshot = parseInventoryJson(rawText);
      setSnapshot(parsedSnapshot);

      if (!parsedSnapshot.inventoryItems.length) {
        setStatus("No inventory items detected in this photo.");
        return;
      }

      const saveResponse = await fetch("/api/dataconnect/inventory-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shelfName: shelfName.trim(),
          shelfLocationDescription: shelfLocationDescription.trim() || undefined,
          items: parsedSnapshot.inventoryItems.map((item, index) => ({
            sku: item.sku || null,
            shelfId: null,
            name: item.itemName,
            brand: item.brand,
            quantity: item.estimatedQuantityVisible,
            "package-size": item.packageDetails,
            category: item.category,
            description: item.description,
            photoUrl: buildPlaceholderPhotoUrl(imageFile, item.itemName, index),
          })),
        }),
      });

      const { json: saveJson, text: saveText } = await readApiPayload(saveResponse);
      const savePayload = (saveJson || {}) as {
        savedCount?: number;
        shelf?: {
          id?: string;
          name?: string | null;
        };
        error?: string;
      };

      if (!saveResponse.ok) {
        const details = saveText.trim().startsWith("<!DOCTYPE")
          ? "Received HTML instead of JSON. Check API deployment."
          : saveText.slice(0, 160);
        throw new Error(
          savePayload.error ||
            `Failed to save inventory (${saveResponse.status}). ${details}`
        );
      }

      const savedShelfName = savePayload.shelf?.name || shelfName;
      setStatus(
        `Saved ${savePayload.savedCount ?? 0} inventory rows to shelf "${savedShelfName}".`
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unexpected error while parsing this inventory photo."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 md:px-8">
      <main className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Admin Inventory Scanner
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              Capture Shelf Photo and Save to Database
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to Homepage
          </Link>
        </div>

        <p className="mb-6 max-w-4xl text-sm text-slate-600 md:text-base">
          Simple workflow: take a photo, detect inventory items, and save them to the database in one step.
        </p>

        <form className="grid gap-6 xl:grid-cols-[1fr_1.1fr]" onSubmit={onProcessAndSave}>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold text-slate-700">
              Inventory image
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onTakePhoto}
                disabled={isStartingCamera}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStartingCamera ? "Opening Camera..." : "Take Photo"}
              </button>
              <button
                type="button"
                onClick={onUploadPhoto}
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Upload Existing Photo
              </button>
            </div>

            <input
              id="inventory-image"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onImageChange}
              className="hidden"
            />
            <input
              id="inventory-image-upload"
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className="hidden"
            />
            <p className="text-xs text-slate-400">
              On desktop this opens your webcam preview. On mobile it opens your camera. Captures are used in-app only and are not downloaded to your device.
            </p>

            {cameraError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {cameraError}
              </p>
            ) : null}

            {isCameraOpen ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-64 w-full rounded-lg bg-black object-cover"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={onCaptureFromCamera}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel Camera
                  </button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {imagePreview ? (
                <Image
                  src={imagePreview}
                  alt="Inventory photo preview"
                  width={1300}
                  height={1300}
                  unoptimized
                  className="h-80 w-full object-contain"
                />
              ) : (
                <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-slate-500">
                  Take or upload a shelf, fridge, or pantry photo to preview it here.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Uses your configured server Gemini key and a fixed parser prompt.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Shelf group name
                <input
                  type="text"
                  value={shelfName}
                  onChange={(event) => setShelfName(event.target.value)}
                  placeholder="Example: Fridge A - Monday delivery"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring"
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Shelf location (optional)
                <input
                  type="text"
                  value={shelfLocationDescription}
                  onChange={(event) => setShelfLocationDescription(event.target.value)}
                  placeholder="Example: Back wall fridge"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? "Processing and saving..." : "Process Photo and Save to DB"}
            </button>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {status ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {status}
              </p>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Detected inventory items</h2>

              {snapshot.sceneSummary ? (
                <p className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  {snapshot.sceneSummary}
                </p>
              ) : (
                <p className="mb-3 text-sm text-slate-500">
                  Process a photo to view detected items.
                </p>
              )}

              <div className="hidden max-h-88 overflow-auto rounded-lg border border-slate-200 bg-white md:block">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Brand</th>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Quantity</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Package</th>
                      <th className="px-3 py-2 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {snapshot.inventoryItems.length ? (
                      snapshot.inventoryItems.map((item, index) => (
                        <tr key={`${item.itemName}-${index}`}>
                          <td className="px-3 py-2">{item.brand || "Unknown"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{item.itemName}</td>
                          <td className="px-3 py-2">{item.estimatedQuantityVisible}</td>
                          <td className="px-3 py-2">{item.category || "other"}</td>
                          <td className="px-3 py-2">{item.packageDetails || "-"}</td>
                          <td className="px-3 py-2">{item.confidence}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                          No parsed items yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 md:hidden">
                {snapshot.inventoryItems.length ? (
                  snapshot.inventoryItems.map((item, index) => (
                    <article
                      key={`${item.itemName}-${index}`}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {item.category || "other"}
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {item.brand || "Unknown"} {item.itemName}
                      </p>
                      <p className="mt-1 text-slate-700">Qty: {item.estimatedQuantityVisible}</p>
                      <p className="text-slate-600">Size: {item.packageDetails || "-"}</p>
                      <p className="text-slate-600">Confidence: {item.confidence}</p>
                      {item.description ? (
                        <p className="mt-1 text-slate-700">{item.description}</p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
                    No parsed items yet.
                  </p>
                )}
              </div>

              {snapshot.notes.length ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="mb-1 text-sm font-semibold text-slate-800">Notes</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {snapshot.notes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}
