"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type AnalyzeResponse = {
  text?: string;
  error?: string;
};

type InventoryItem = {
  sku?: string;
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

function extractApiKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (!match) {
      continue;
    }

    const [, name, rawValue] = match;
    if (!["GEMINI_API_KEY", "GOOGLE_API_KEY", "API_KEY"].includes(name)) {
      continue;
    }

    return rawValue.trim().replace(/^['\"]|['\"]$/g, "");
  }

  return trimmed.replace(/^['\"]|['\"]$/g, "");
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

export default function InventoryPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [envInput, setEnvInput] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_INVENTORY_PROMPT);
  const [analysis, setAnalysis] = useState("");
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const extractedKey = useMemo(() => extractApiKey(envInput), [envInput]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setAnalysis("");
    setSnapshot(EMPTY_SNAPSHOT);
    setSaveStatus("");
    setError("");

    if (!file) {
      setImagePreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setAnalysis("");
    setSnapshot(EMPTY_SNAPSHOT);
    setSaveStatus("");

    if (!imageFile) {
      setError("Upload an inventory photo first.");
      return;
    }

    setIsLoading(true);
    try {
      const imageBase64 = await toBase64Data(imageFile);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: extractedKey,
          prompt,
          imageBase64,
          mimeType: imageFile.type,
          responseMimeType: "application/json",
        }),
      });

      const payload = (await response.json()) as AnalyzeResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Inventory parsing failed.");
      }

      const rawText = payload.text || "";
      setAnalysis(rawText);
      const parsedSnapshot = parseInventoryJson(rawText);
      setSnapshot(parsedSnapshot);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unexpected error while parsing this inventory photo."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onSendToDataConnect = async () => {
    if (!snapshot.inventoryItems.length) {
      setSaveStatus("No parsed items to send yet.");
      return;
    }

    setIsSaving(true);
    setSaveStatus("");
    try {
      const response = await fetch("/api/dataconnect/inventory-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: snapshot.inventoryItems.map((item) => ({
            sku: item.sku || null,
            name: item.itemName,
            quantity: item.estimatedQuantityVisible,
            "package-size": item.packageDetails,
              description: item.description,
          })),
        }),
      });

      const payload = (await response.json()) as {
        savedCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save items to Data Connect.");
      }

      setSaveStatus(`Saved ${payload.savedCount ?? 0} items to InventoryItem.`);
    } catch (saveError) {
      setSaveStatus(
        saveError instanceof Error
          ? saveError.message
          : "Unexpected error while saving to Data Connect."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,197,94,0.2),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(6,182,212,0.25),transparent_40%),linear-gradient(120deg,#020617,#0f172a_45%,#1e293b)]" />
      <main className="relative z-10 mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full border border-emerald-300/40 bg-emerald-300/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-200">
              Hub Inventory Tracker
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-4xl">
              Upload shelf photos and estimate inventory with Gemini
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-300/60"
          >
            Back to Homepage
          </Link>
        </div>

        <p className="mb-6 max-w-4xl text-sm text-slate-300 md:text-base">
          This route is designed for Hub staff. It parses a photo into item names, package details,
          estimated counts, category labels, and confidence notes so students can check stock before
          showing up.
        </p>

        <form className="grid gap-6 xl:grid-cols-[1fr_1.15fr]" onSubmit={onSubmit}>
          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:p-5">
            <label className="block text-sm font-medium text-slate-200" htmlFor="inventory-image">
              Inventory image
            </label>
            <input
              id="inventory-image"
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className="block w-full cursor-pointer rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950 hover:border-cyan-300/40"
            />

            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/70">
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
                <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-slate-400">
                  Upload a shelf, fridge, or pantry photo to preview it here.
                </div>
              )}
            </div>

            <label className="block text-sm font-medium text-slate-200" htmlFor="env-input">
              API key or env line (optional)
            </label>
            <textarea
              id="env-input"
              value={envInput}
              onChange={(event) => setEnvInput(event.target.value)}
              placeholder="GEMINI_API_KEY=AIza..."
              rows={3}
              className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-300/70 focus:outline-none"
            />
            <p className="text-xs text-slate-400">
              Leave this blank to use GEMINI_API_KEY / GOOGLE_API_KEY from Vercel env.
            </p>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 md:p-5">
            <label className="block text-sm font-medium text-slate-200" htmlFor="prompt-input">
              Inventory prompt
            </label>
            <textarea
              id="prompt-input"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={14}
              className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-300/70 focus:outline-none"
            />

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-200 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Analyzing inventory photo..." : "Generate inventory snapshot"}
            </button>

            {error ? (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Organized inventory output</h2>

              {snapshot.sceneSummary ? (
                <p className="mb-3 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-slate-100">
                  {snapshot.sceneSummary}
                </p>
              ) : (
                <p className="mb-3 text-sm text-slate-400">
                  The inventory summary will appear here after analysis.
                </p>
              )}

              <div className="max-h-[20rem] overflow-auto rounded-lg border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-slate-800/70 text-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold">SKU</th>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Quantity</th>
                      <th className="px-3 py-2 font-semibold">Package</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Confidence</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-slate-900/60">
                    {snapshot.inventoryItems.length ? (
                      snapshot.inventoryItems.map((item, index) => (
                        <tr key={`${item.itemName}-${index}`}>
                          <td className="px-3 py-2 text-slate-300">{item.sku || "-"}</td>
                          <td className="px-3 py-2 text-slate-100">{item.itemName}</td>
                          <td className="px-3 py-2 text-slate-200">{item.estimatedQuantityVisible}</td>
                          <td className="px-3 py-2 text-slate-200">{item.packageDetails || "-"}</td>
                          <td className="px-3 py-2 text-slate-200">{item.category}</td>
                          <td className="px-3 py-2 text-slate-200">{item.confidence}</td>
                          <td className="px-3 py-2 text-slate-300">{item.description || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-slate-400">
                          No parsed items yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onSendToDataConnect}
                  disabled={isSaving || !snapshot.inventoryItems.length}
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving ? "Sending to Data Connect..." : "Send Items To Data Connect"}
                </button>
                {saveStatus ? (
                  <p className="text-sm text-slate-300">{saveStatus}</p>
                ) : (
                  <p className="text-sm text-slate-500">
                    Writes to Data Connect table: InventoryItem
                  </p>
                )}
              </div>

              {snapshot.notes.length ? (
                <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-400/5 p-3">
                  <h3 className="mb-1 text-sm font-semibold text-emerald-200">Notes</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                    {snapshot.notes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {analysis && !snapshot.inventoryItems.length && !snapshot.sceneSummary ? (
                <details className="mt-3 rounded-lg border border-white/10 bg-slate-900/70 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-200">
                    Raw model output
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                    {analysis}
                  </pre>
                </details>
              ) : null}
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}
