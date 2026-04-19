"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";

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

type SuccessSummary = {
  matched: number;
  processed: number;
  totalDecremented: number;
  unmatchedCount: number;
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

const EMPTY_CHECKOUT: CheckoutSnapshot = { items: [], notes: [] };
const ONE_MB = 1024 * 1024;

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

  const notes = Array.isArray(parsed.notes) ? parsed.notes.map((note) => String(note)) : [];
  return { items, notes };
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
  if (!rawText) return { json: null, text: "" };
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { json: parsed, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

// Re-encode large captures so the analyzer endpoint stays under any practical
// payload limit. Falls back to the original file if the canvas pipeline fails.
async function compressForAnalyzer(file: File, limitBytes = ONE_MB): Promise<File> {
  if (file.size <= limitBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = url;
    });

    const attempts: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 2048, quality: 0.82 },
      { maxDim: 1600, quality: 0.74 },
      { maxDim: 1280, quality: 0.7 },
      { maxDim: 1024, quality: 0.65 },
      { maxDim: 800, quality: 0.6 },
    ];

    let lastBlob: Blob | null = null;
    for (const attempt of attempts) {
      const natW = Math.max(1, image.naturalWidth || image.width);
      const natH = Math.max(1, image.naturalHeight || image.height);
      const longEdge = Math.max(natW, natH);
      const scale = longEdge > attempt.maxDim ? attempt.maxDim / longEdge : 1;
      const outW = Math.max(1, Math.round(natW * scale));
      const outH = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.drawImage(image, 0, 0, natW, natH, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", attempt.quality);
      });
      if (!blob) continue;
      lastBlob = blob;
      if (blob.size <= limitBytes) break;
    }

    if (!lastBlob) return file;
    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "checkout";
    return new File([lastBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CheckoutPage() {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessSummary | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

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

  const releasePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setScanPreview(null);
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
      releasePreview();
    };
  }, []);

  const onOpenCamera = async () => {
    setError("");
    setSuccess(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera isn't available on this device. Try Upload photo instead.");
      return;
    }

    setIsStartingCamera(true);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
      requestAnimationFrame(() => {
        if (!cameraVideoRef.current) return;
        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play().catch(() => {
          /* autoplay may need a user gesture; capture button still works */
        });
      });
    } catch {
      setError("We couldn't access your camera. Try Upload photo instead.");
    } finally {
      setIsStartingCamera(false);
    }
  };

  const onUploadClick = () => {
    setError("");
    setSuccess(null);
    closeCamera();
    uploadInputRef.current?.click();
  };

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    await runCheckout(file);
  };

  const onCaptureFromCamera = async () => {
    const video = cameraVideoRef.current;
    if (!video) {
      setError("Camera isn't ready yet. Please try again.");
      return;
    }
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("We couldn't capture a photo. Please try again.");
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) {
      setError("We couldn't capture a photo. Please try again.");
      return;
    }
    const file = new File([blob], `checkout-camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    closeCamera();
    await runCheckout(file);
  };

  const runCheckout = async (rawFile: File) => {
    setError("");
    setSuccess(null);
    setIsProcessing(true);

    releasePreview();
    const previewUrl = URL.createObjectURL(rawFile);
    previewUrlRef.current = previewUrl;
    setScanPreview(previewUrl);

    try {
      const file = await compressForAnalyzer(rawFile);
      const imageBase64 = await toBase64Data(file);

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: DEFAULT_CHECKOUT_PROMPT,
          imageBase64,
          mimeType: file.type,
          responseMimeType: "application/json",
        }),
      });

      const { json: analyzeJson } = await readApiPayload(analyzeResponse);
      const analyzePayload = (analyzeJson || {}) as AnalyzeResponse;

      if (!analyzeResponse.ok) {
        throw new Error("We couldn't read that photo. Please try again.");
      }

      const parsed = parseCheckoutJson(analyzePayload.text || "") || EMPTY_CHECKOUT;

      if (!parsed.items.length) {
        throw new Error(
          "We didn't see any items in that photo. Try again with better lighting or a closer shot."
        );
      }

      const decrementResponse = await fetch("/api/dataconnect/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      const { json: decrementJson } = await readApiPayload(decrementResponse);
      const decrementPayload = (decrementJson || {}) as CheckoutApplyResponse;

      if (!decrementResponse.ok) {
        throw new Error("We couldn't update the inventory. Please try again.");
      }

      const processed = decrementPayload.processedItems ?? parsed.items.length;
      const matched = decrementPayload.matchedItems ?? 0;
      const totalDecremented = decrementPayload.totalDecremented ?? 0;
      const unmatchedCount = Array.isArray(decrementPayload.unmatched)
        ? decrementPayload.unmatched.length
        : 0;

      setSuccess({ matched, processed, totalDecremented, unmatchedCount });
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsProcessing(false);
      // Hold the scan preview a moment so the success modal lands on top of it
      // rather than disappearing into a blank card; the user closes it via Done.
    }
  };

  const onDoneSuccess = () => {
    setSuccess(null);
    releasePreview();
  };

  const onDismissError = () => {
    setError("");
    releasePreview();
  };

  const navLink = {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--fp-panel-border)",
    color: "var(--fp-text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    background: "var(--fp-input-bg)",
  } as React.CSSProperties;

  const primaryButton: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    background: "var(--fp-button-accent)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    fontWeight: 700,
    fontSize: 16,
    padding: "18px 22px",
    cursor: "pointer",
    boxSizing: "border-box",
    minHeight: 64,
  };

  const secondaryButton: React.CSSProperties = {
    ...primaryButton,
    background: "var(--fp-input-bg)",
    color: "var(--fp-text-primary)",
    border: "1px solid var(--fp-panel-border)",
  };

  const showIdle = !isCameraOpen && !isProcessing;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--fp-page-bg)",
        padding: "clamp(12px, 4vw, 32px) clamp(10px, 3vw, 24px)",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0%); opacity: 0.95; }
          50%  { transform: translateY(100%); opacity: 0.7; }
          100% { transform: translateY(0%); opacity: 0.95; }
        }
        @keyframes scan-glow {
          0%, 100% { box-shadow: 0 0 18px rgba(74,222,128,0.35); }
          50%      { box-shadow: 0 0 36px rgba(74,222,128,0.7); }
        }
        @keyframes success-pop {
          0%   { transform: scale(0.8); opacity: 0; }
          60%  { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <HexPanel
          contentStyle={{
            padding: "20px 24px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
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
              Checkout
            </p>
            <h1
              style={{
                color: "var(--fp-text-primary)",
                fontSize: "clamp(22px, 5vw, 30px)",
                fontWeight: 800,
                margin: "0 0 4px",
              }}
            >
              Scan a checkout photo
            </h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>
              Snap or upload one photo of the checkout table. We&apos;ll do the rest.
            </p>
          </div>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin" style={navLink}>
              Admin Dashboard
            </Link>
            <Link href="/" style={navLink}>
              Home
            </Link>
          </nav>
        </HexPanel>

        <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "28px 24px" }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            onChange={onFileSelected}
            className="hidden"
          />

          {showIdle && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button
                type="button"
                onClick={onOpenCamera}
                disabled={isStartingCamera}
                style={{
                  ...primaryButton,
                  cursor: isStartingCamera ? "not-allowed" : "pointer",
                  opacity: isStartingCamera ? 0.7 : 1,
                }}
              >
                <CameraIcon />
                {isStartingCamera ? "Opening camera…" : "Open camera"}
              </button>
              <button type="button" onClick={onUploadClick} style={secondaryButton}>
                <UploadIcon />
                Upload photo
              </button>

              <p
                style={{
                  margin: "6px 0 0",
                  textAlign: "center",
                  color: "var(--fp-text-muted)",
                  fontSize: 12,
                }}
              >
                We&apos;ll recognize the items and update inventory for you.
              </p>
            </div>
          )}

          {isCameraOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  position: "relative",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid var(--fp-panel-border)",
                  background: "#000",
                }}
              >
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <button type="button" onClick={onCaptureFromCamera} style={primaryButton}>
                  Capture
                </button>
                <button type="button" onClick={closeCamera} style={secondaryButton}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isProcessing && (
            <ScanningOverlay previewUrl={scanPreview} />
          )}
        </HexPanel>
      </div>

      {success && (
        <SuccessModal summary={success} onClose={onDoneSuccess} />
      )}

      {error && !isProcessing && (
        <ErrorModal message={error} onDismiss={onDismissError} />
      )}
    </div>
  );
}

function ScanningOverlay({ previewUrl }: { previewUrl: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--fp-panel-border)",
          background: "#000",
          aspectRatio: "4 / 3",
          animation: "scan-glow 2s ease-in-out infinite",
        }}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Captured checkout photo"
            fill
            unoptimized
            style={{ objectFit: "cover", filter: "brightness(0.85)" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
            }}
          >
            Preparing scan…
          </div>
        )}

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(transparent 49%, rgba(74,222,128,0.95) 49.5%, rgba(74,222,128,0.95) 50.5%, transparent 51%)",
            mixBlendMode: "screen",
            animation: "scanline 1.6s ease-in-out infinite",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "2px solid rgba(74,222,128,0.55)",
            borderRadius: 14,
            pointerEvents: "none",
          }}
        />
      </div>

      <p
        style={{
          margin: 0,
          textAlign: "center",
          color: "var(--fp-text-secondary)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        Scanning items and updating inventory…
      </p>
    </div>
  );
}

function SuccessModal({
  summary,
  onClose,
}: {
  summary: SuccessSummary;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(8,14,24,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--fp-surface-primary)",
          border: "1px solid var(--fp-panel-border)",
          borderRadius: 18,
          padding: "28px 26px",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          animation: "success-pop 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 16px",
            borderRadius: 999,
            background: "rgba(74,222,128,0.14)",
            border: "2px solid rgba(74,222,128,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckIcon />
        </div>

        <h2
          style={{
            color: "var(--fp-text-primary)",
            fontSize: 22,
            fontWeight: 800,
            margin: "0 0 6px",
          }}
        >
          Checkout complete
        </h2>
        <p
          style={{
            color: "var(--fp-text-secondary)",
            fontSize: 14,
            margin: "0 0 18px",
            lineHeight: 1.5,
          }}
        >
          Matched {summary.matched} of {summary.processed} item{summary.processed === 1 ? "" : "s"} and removed{" "}
          {summary.totalDecremented} unit{summary.totalDecremented === 1 ? "" : "s"} from inventory.
          {summary.unmatchedCount > 0
            ? ` ${summary.unmatchedCount} item${summary.unmatchedCount === 1 ? " was" : "s were"} skipped because we couldn't find a match.`
            : ""}
        </p>

        <button
          type="button"
          onClick={onClose}
          autoFocus
          style={{
            width: "100%",
            background: "var(--fp-button-accent)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            padding: "12px 20px",
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ErrorModal({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(8,14,24,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--fp-surface-primary)",
          border: "1px solid #7f2020",
          borderRadius: 18,
          padding: "24px 26px",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        <h2
          style={{
            color: "#f87171",
            fontSize: 18,
            fontWeight: 800,
            margin: "0 0 8px",
          }}
        >
          Couldn&apos;t process that photo
        </h2>
        <p
          style={{
            color: "var(--fp-text-secondary)",
            fontSize: 13,
            margin: "0 0 18px",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          autoFocus
          style={{
            width: "100%",
            background: "var(--fp-button-accent)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4ade80"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
