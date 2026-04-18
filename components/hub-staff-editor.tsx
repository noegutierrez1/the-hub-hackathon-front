"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { HubInfoRow } from "@/lib/dataconnect/types";

type Props = {
  hub: HubInfoRow;
  canEdit: boolean;
};

export function HubStaffEditor({ hub, canEdit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setPending(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const hoursOfOperation = String(fd.get("hoursOfOperation") ?? "").trim();
    const descriptionRaw = fd.get("description");
    const locationRaw = fd.get("location");
    const description =
      descriptionRaw === null || descriptionRaw === ""
        ? null
        : String(descriptionRaw);
    const location =
      locationRaw === null || locationRaw === "" ? null : String(locationRaw);

    const res = await fetch("/api/hub-info", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: hub.id,
        name,
        hoursOfOperation,
        description,
        location,
      }),
    });

    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Request failed (${res.status})`);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!canEdit) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-200"
      >
        {open ? "Cancel edit" : "Edit (staff)"}
      </button>
      {open ? (
        <form
          onSubmit={onSubmit}
          className="mt-4 flex max-w-lg flex-col gap-3 text-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Name</span>
            <input
              name="name"
              required
              defaultValue={hub.name}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">
              Hours of operation
            </span>
            <input
              name="hoursOfOperation"
              required
              defaultValue={hub.hoursOfOperation}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={hub.description ?? ""}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Location</span>
            <input
              name="location"
              defaultValue={hub.location ?? ""}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 max-w-xs items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
