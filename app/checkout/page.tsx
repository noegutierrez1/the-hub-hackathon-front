"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import LoadingAnimation from "@/components/LoadingAnimation";

type AnalyzeResponse = {
  text?: string;
  error?: string;
};

type CheckoutDetectedItem = {
  brand: string;
  itemName: string;
  quantity: number;
  size: string;
  category: string;
  confidence: string;
};

type CheckoutSnapshot = {
  items: CheckoutDetectedItem[];
  notes: string[];
};

type CheckoutUpdate = {
  id: string;
  name: string;
  brand: string;
  beforeQuantity: number;
  decrementedBy: number;
  afterQuantity: number;
};

type CheckoutUnmatched = {
  name: string;
  brand: string | null;
  quantity: number;
  category: string | null;
  size: string | null;
};

type CheckoutApplyResponse = {
  processedItems?: number;
  matchedItems?: number;
  totalDecremented?: number;
  updated?: CheckoutUpdate[];
  unmatched?: CheckoutUnmatched[];
  message?: string;
  error?: string;
};

const DEFAULT_CHECKOUT_PROMPT = `
Context:
This photo is from a checkout table at a campus Basic Needs Hub.
Students place the items they are taking on the table.

Task:
Identify the items and quantities so inventory can be decremented.

Return valid JSON only. Do not include markdown or code fences.

Use this exact schema:
{
  "items": [
    {
      "brand": "string",
      "itemName": "string",
      "quantity": 0,
      "size": "string",
      "category": "dry|refrigerated|frozen|beverage|produce|hygiene|other",
      "confidence": "high|medium|low"
    }
  ],
  "notes": ["string"]
}

Rules:
- quantity must be an integer >= 0.
- brand should be best estimate when visible.
- itemName should describe the product type clearly.
- include each distinct product shown on the table.
`.trim();

const EMPTY_CHECKOUT: CheckoutSnapshot = {
  items: [],
  notes: [],
};

function parseCheckoutJson(raw: string): CheckoutSnapshot {
  const sanitized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  const parsed = JSON.parse(sanitized) as Partial<CheckoutSnapshot>;

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item) => ({
        brand: String(item?.brand ?? "Unknown"),
        itemName: String(item?.itemName ?? "Unknown item"),
        quantity: Number.isFinite(Number(item?.quantity))
          ? Math.max(0, Math.round(Number(item?.quantity)))
          : 0,
        size: String(item?.size ?? ""),
        category: String(item?.category ?? "other"),
        confidence: String(item?.confidence ?? "low"),
      }))
    : [];

  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((note) => String(note))
    : [];

  return {
    items,
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

export default function CheckoutPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot>(EMPTY_CHECKOUT);
  const [updates, setUpdates] = useState<CheckoutUpdate[]>([]);
  const [unmatched, setUnmatched] = useState<CheckoutUnmatched[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
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
    setSnapshot(EMPTY_CHECKOUT);
    setUpdates([]);
    setUnmatched([]);
    setError("");
    setStatus("");

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

    const file = new File([blob], `checkout-camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    setSelectedImage(file);
    closeCamera();
  };

  const onProcessCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setSnapshot(EMPTY_CHECKOUT);
    setUpdates([]);
    setUnmatched([]);

    if (!imageFile) {
      setError("Upload a checkout photo first.");
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
          prompt: DEFAULT_CHECKOUT_PROMPT,
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
            `Checkout photo analysis failed (${analyzeResponse.status}). ${analyzeText.slice(0, 160)}`
        );
      }

      const parsed = parseCheckoutJson(analyzePayload.text || "");
      setSnapshot(parsed);

      if (!parsed.items.length) {
        setStatus("No checkout items detected in this photo.");
        return;
      }

      const decrementResponse = await fetch("/api/dataconnect/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: parsed.items.map((item) => ({
            name: item.itemName,
            brand: item.brand,
            quantity: item.quantity,
            size: item.size,
            category: item.category,
          })),
        }),
      });

      const { json: decrementJson, text: decrementText } = await readApiPayload(decrementResponse);
      const decrementPayload = (decrementJson || {}) as CheckoutApplyResponse;

      if (!decrementResponse.ok) {
        const details = decrementPayload.error || decrementText.slice(0, 160);
        throw new Error(details || `Checkout decrement failed (${decrementResponse.status}).`);
      }

      setUpdates(Array.isArray(decrementPayload.updated) ? decrementPayload.updated : []);
      setUnmatched(Array.isArray(decrementPayload.unmatched) ? decrementPayload.unmatched : []);

      const processed = decrementPayload.processedItems ?? parsed.items.length;
      const matched = decrementPayload.matchedItems ?? 0;
      const totalDecremented = decrementPayload.totalDecremented ?? 0;

      setStatus(
        `${decrementPayload.message || "Checkout processed."} Matched ${matched}/${processed} items and decremented ${totalDecremented} units.`
      );
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : "Unexpected error while processing checkout photo."
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
              Admin Checkout
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              Minimal Item Checkout
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
          Minimal workflow: upload one checkout photo, detect selected items, and decrement inventory.
        </p>

        <form className="grid gap-6 xl:grid-cols-[1fr_1.1fr]" onSubmit={onProcessCheckout}>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold text-slate-700">
              Checkout image
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
              id="checkout-image"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onImageChange}
              className="hidden"
            />
            <input
              id="checkout-image-upload"
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
                  alt="Checkout table preview"
                  width={1200}
                  height={900}
                  unoptimized
                  className="h-80 w-full object-contain"
                />
              ) : (
                <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-slate-500">
                  Take or upload a checkout table photo to preview it here.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Uses your configured server Gemini key and a fixed checkout parser prompt.
            </p>

            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? "Processing checkout..." : "Process Photo and Update DB"}
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
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Detected checkout items</h2>

              {isProcessing ? (
                <LoadingAnimation
                  message="Analyzing checkout photo and updating inventory counts..."
                  className="py-4"
                  iconClassName="h-24 w-24"
                  messageClassName="mt-2 text-sm font-medium text-slate-600"
                />
              ) : (
                <>

                <div className="hidden max-h-88 overflow-auto rounded-lg border border-slate-200 bg-white md:block">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Brand</th>
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-3 py-2 font-semibold">Quantity</th>
                        <th className="px-3 py-2 font-semibold">Category</th>
                        <th className="px-3 py-2 font-semibold">Size</th>
                        <th className="px-3 py-2 font-semibold">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {snapshot.items.length ? (
                        snapshot.items.map((item, index) => (
                          <tr key={`${item.brand}-${item.itemName}-${index}`}>
                            <td className="px-3 py-2">{item.brand}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{item.itemName}</td>
                            <td className="px-3 py-2">{item.quantity}</td>
                            <td className="px-3 py-2">{item.category || "other"}</td>
                            <td className="px-3 py-2">{item.size || "-"}</td>
                            <td className="px-3 py-2">{item.confidence}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                            No detected checkout items yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {snapshot.items.length ? (
                    snapshot.items.map((item, index) => (
                      <article
                        key={`${item.brand}-${item.itemName}-${index}`}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {item.category || "other"}
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {item.brand} {item.itemName}
                        </p>
                        <p className="mt-1 text-slate-700">Qty: {item.quantity}</p>
                        <p className="text-slate-600">Size: {item.size || "-"}</p>
                        <p className="text-slate-600">Confidence: {item.confidence}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
                      No detected checkout items yet.
                    </p>
                  )}
                </div>
                </>
              )}
            </div>
          </section>
        </form>

        {updates.length ? (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Applied inventory updates</h2>
            <div className="hidden overflow-auto rounded-lg border border-slate-200 bg-white md:block">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Brand</th>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Before</th>
                    <th className="px-3 py-2 font-semibold">Decremented</th>
                    <th className="px-3 py-2 font-semibold">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {updates.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.brand}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                      <td className="px-3 py-2">{item.beforeQuantity}</td>
                      <td className="px-3 py-2 text-rose-700">-{item.decrementedBy}</td>
                      <td className="px-3 py-2 text-emerald-700">{item.afterQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 md:hidden">
              {updates.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  <p className="font-semibold text-slate-900">{item.brand} {item.name}</p>
                  <p className="mt-1 text-slate-700">Before: {item.beforeQuantity}</p>
                  <p className="text-rose-700">Decremented: -{item.decrementedBy}</p>
                  <p className="text-emerald-700">After: {item.afterQuantity}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {unmatched.length ? (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-800">Unmatched detected items</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {unmatched.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {item.brand ? `${item.brand} ` : ""}
                  {item.name} (qty {item.quantity})
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
