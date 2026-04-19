"use client";

import Link from "next/link";
import { ReactNode } from "react";

type HeaderTone = "brand" | "admin" | "neutral";

type HeaderLink = {
  href: string;
  label: string;
};

type HubPageHeaderProps = {
  badge: string;
  title: string;
  description?: string;
  tone?: HeaderTone;
  links?: HeaderLink[];
  actions?: ReactNode;
};

function toneBadgeClasses(tone: HeaderTone) {
  if (tone === "admin") {
    return "border-admin-500/30 bg-admin-100 text-admin-700";
  }

  if (tone === "neutral") {
    return "border-border-strong bg-surface-muted text-ink-muted";
  }

  return "border-brand-500/30 bg-brand-100 text-brand-700";
}

function toneFocusClasses(tone: HeaderTone) {
  return tone === "admin"
    ? "focus-visible:ring-admin-500"
    : "focus-visible:ring-brand-500";
}

export default function HubPageHeader({
  badge,
  title,
  description,
  tone = "brand",
  links = [],
  actions,
}: HubPageHeaderProps) {
  const badgeClasses = toneBadgeClasses(tone);
  const focusClasses = toneFocusClasses(tone);

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[16rem] flex-1">
        <p
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${badgeClasses}`}
        >
          {badge}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted md:text-base">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-offset-2 ${focusClasses}`}
          >
            {link.label}
          </Link>
        ))}
        {actions}
      </div>
    </header>
  );
}
