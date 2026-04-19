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

  const navLink = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" } as React.CSSProperties;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "clamp(12px, 4vw, 32px) clamp(10px, 3vw, 24px)", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        <HexPanel contentStyle={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Admin Checkout</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, margin: "0 0 4px" }}>Minimal Item Checkout</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>Upload one checkout photo, detect selected items, and decrement inventory.</p>
          </div>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin" style={navLink}>Admin Dashboard</Link>
            <Link href="/" style={navLink}>Home</Link>
          </nav>
        </HexPanel>

        <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px" }}>
          <form className="grid gap-6 xl:grid-cols-[1fr_1.1fr]" onSubmit={onProcessCheckout}>

            {/* ── Left: image input ── */}
            <section style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", borderRadius: 14, padding: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: 0 }}>Checkout image</p>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onTakePhoto}
                  disabled={isStartingCamera}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, padding: "10px 16px", cursor: isStartingCamera ? "not-allowed" : "pointer", opacity: isStartingCamera ? 0.6 : 1, boxSizing: "border-box" }}
                >
                  {isStartingCamera ? "Opening Camera…" : "Take Photo"}
                </button>
                <button
                  type="button"
                  onClick={onUploadPhoto}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", border: "1px solid var(--fp-panel-border)", background: "var(--fp-surface-secondary)", color: "var(--fp-text-secondary)", borderRadius: 9, fontWeight: 600, fontSize: 13, padding: "10px 16px", cursor: "pointer", boxSizing: "border-box" }}
                >
                  Upload Existing Photo
                </button>
              </div>

              <input id="checkout-image" ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onImageChange} className="hidden" />
              <input id="checkout-image-upload" ref={uploadInputRef} type="file" accept="image/*" onChange={onImageChange} className="hidden" />

              <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: 0 }}>
                On desktop this opens your webcam preview. On mobile it opens your camera. Captures are used in-app only and are not downloaded to your device.
              </p>

              {cameraError ? (
                <p style={{ border: "1px solid #7f2020", background: "rgba(180,30,30,0.12)", color: "#f87171", borderRadius: 9, padding: "8px 12px", fontSize: 12, margin: 0 }}>
                  {cameraError}
                </p>
              ) : null}

              {isCameraOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--fp-surface-secondary)", border: "1px solid var(--fp-panel-border)", borderRadius: 12, padding: 12 }}>
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", height: 240, borderRadius: 9, background: "#000", objectFit: "cover" }}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={onCaptureFromCamera}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, padding: "9px 16px", cursor: "pointer", boxSizing: "border-box" }}
                    >
                      Capture Photo
                    </button>
                    <button
                      type="button"
                      onClick={closeCamera}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 9, fontWeight: 600, fontSize: 13, padding: "9px 16px", cursor: "pointer", boxSizing: "border-box" }}
                    >
                      Cancel Camera
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid var(--fp-panel-border)", background: "var(--fp-surface-secondary)" }}>
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Checkout table preview"
                    width={1200}
                    height={900}
                    unoptimized
                    style={{ width: "100%", height: 280, objectFit: "contain", display: "block" }}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--fp-text-muted)", fontSize: 13, textAlign: "center", padding: "0 20px" }}>
                    Take or upload a checkout table photo to preview it here.
                  </div>
                )}
              </div>
            </section>

            {/* ── Right: analysis + results ── */}
            <section style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", borderRadius: 14, padding: 18 }}>
              <p style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-surface-secondary)", color: "var(--fp-text-muted)", borderRadius: 9, padding: "8px 12px", fontSize: 12, margin: 0 }}>
                Uses your configured server Gemini key and a fixed checkout parser prompt.
              </p>

              <button
                type="submit"
                disabled={isProcessing}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, padding: "12px 20px", cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1, boxSizing: "border-box" }}
              >
                {isProcessing ? "Processing checkout…" : "Process Photo and Update DB"}
              </button>

              {error ? (
                <p style={{ border: "1px solid #7f2020", background: "rgba(180,30,30,0.12)", color: "#f87171", borderRadius: 9, padding: "10px 14px", fontSize: 13, margin: 0 }}>
                  {error}
                </p>
              ) : null}

              {status ? (
                <p style={{ border: "1px solid #2d6a4a", background: "rgba(30,160,90,0.10)", color: "#6ee7b7", borderRadius: 9, padding: "10px 14px", fontSize: 13, margin: 0 }}>
                  {status}
                </p>
              ) : null}

              <div style={{ background: "var(--fp-surface-secondary)", border: "1px solid var(--fp-panel-border)", borderRadius: 12, padding: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 12px" }}>Detected checkout items</p>

                {isProcessing ? (
                  <LoadingAnimation
                    message="Analyzing checkout photo and updating inventory counts..."
                    className="py-4"
                    iconClassName="h-24 w-24"
                    messageClassName="mt-2 text-sm font-medium"
                  />
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block" style={{ maxHeight: 340, overflowY: "auto", borderRadius: 9, border: "1px solid var(--fp-panel-border)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                        <thead>
                          <tr style={{ background: "var(--fp-input-bg)", borderBottom: "1px solid var(--fp-panel-border)" }}>
                            {["Brand", "Item", "Qty", "Category", "Size", "Confidence"].map((h) => (
                              <th key={h} style={{ padding: "8px 12px", color: "var(--fp-text-muted)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.items.length ? (
                            snapshot.items.map((item, index) => (
                              <tr key={`${item.brand}-${item.itemName}-${index}`} style={{ borderBottom: "1px solid var(--fp-panel-border)" }}>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-muted)", fontSize: 13 }}>{item.brand}</td>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-primary)", fontWeight: 600, fontSize: 13 }}>{item.itemName}</td>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-secondary)", fontSize: 13 }}>{item.quantity}</td>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-secondary)", fontSize: 13 }}>{item.category || "other"}</td>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-muted)", fontSize: 13 }}>{item.size || "—"}</td>
                                <td style={{ padding: "8px 12px", color: "var(--fp-text-muted)", fontSize: 13 }}>{item.confidence}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} style={{ padding: "16px 12px", textAlign: "center", color: "var(--fp-text-muted)", fontSize: 13 }}>
                                No detected checkout items yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {snapshot.items.length ? (
                        snapshot.items.map((item, index) => (
                          <article
                            key={`${item.brand}-${item.itemName}-${index}`}
                            style={{ background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", borderRadius: 10, padding: "10px 12px" }}
                          >
                            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>{item.category || "other"}</p>
                            <p style={{ fontWeight: 700, color: "var(--fp-text-primary)", fontSize: 14, margin: "0 0 4px" }}>{item.brand} {item.itemName}</p>
                            <p style={{ color: "var(--fp-text-secondary)", fontSize: 13, margin: "0 0 2px" }}>Qty: {item.quantity}</p>
                            <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: "0 0 2px" }}>Size: {item.size || "—"}</p>
                            <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: 0 }}>Confidence: {item.confidence}</p>
                          </article>
                        ))
                      ) : (
                        <p style={{ border: "1px dashed var(--fp-panel-border)", color: "var(--fp-text-muted)", borderRadius: 9, padding: "16px 12px", textAlign: "center", fontSize: 13, margin: 0 }}>
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
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 12px" }}>Applied inventory updates</p>

              {/* Desktop table */}
              <div className="hidden md:block" style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--fp-panel-border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--fp-input-bg)", borderBottom: "1px solid var(--fp-panel-border)" }}>
                      {["Brand", "Item", "Before", "Decremented", "After"].map((h) => (
                        <th key={h} style={{ padding: "8px 14px", color: "var(--fp-text-muted)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {updates.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid var(--fp-panel-border)" }}>
                        <td style={{ padding: "8px 14px", color: "var(--fp-text-muted)", fontSize: 13 }}>{item.brand}</td>
                        <td style={{ padding: "8px 14px", color: "var(--fp-text-primary)", fontWeight: 600, fontSize: 13 }}>{item.name}</td>
                        <td style={{ padding: "8px 14px", color: "var(--fp-text-secondary)", fontSize: 13 }}>{item.beforeQuantity}</td>
                        <td style={{ padding: "8px 14px", color: "#f87171", fontSize: 13, fontWeight: 600 }}>−{item.decrementedBy}</td>
                        <td style={{ padding: "8px 14px", color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>{item.afterQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {updates.map((item) => (
                  <article key={item.id} style={{ background: "var(--fp-input-bg)", border: "1px solid var(--fp-panel-border)", borderRadius: 10, padding: "10px 14px" }}>
                    <p style={{ fontWeight: 700, color: "var(--fp-text-primary)", fontSize: 14, margin: "0 0 4px" }}>{item.brand} {item.name}</p>
                    <p style={{ color: "var(--fp-text-secondary)", fontSize: 13, margin: "0 0 2px" }}>Before: {item.beforeQuantity}</p>
                    <p style={{ color: "#f87171", fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>Decremented: −{item.decrementedBy}</p>
                    <p style={{ color: "#6ee7b7", fontSize: 13, fontWeight: 600, margin: 0 }}>After: {item.afterQuantity}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {unmatched.length ? (
            <div style={{ marginTop: 16, border: "1px solid rgba(180,120,20,0.35)", background: "rgba(180,120,20,0.08)", borderRadius: 12, padding: "14px 18px" }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#d97706", margin: "0 0 10px" }}>Unmatched detected items</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {unmatched.map((item, index) => (
                  <li key={`${item.name}-${index}`} style={{ color: "#fbbf24", fontSize: 13 }}>
                    {item.brand ? `${item.brand} ` : ""}
                    {item.name} (qty {item.quantity})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </HexPanel>
      </div>
    </div>
  );
}
