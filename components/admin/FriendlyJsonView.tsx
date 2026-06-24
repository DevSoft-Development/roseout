"use client";

import { useState } from "react";

export function humanizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value) && !Number.isNaN(Date.parse(value));
}

export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return isDateLike(value) ? new Date(value).toLocaleString() : value;
  return "";
}

export function JsonDeveloperDetails({ data, title = "Developer details", defaultOpen = false }: { data: unknown; title?: string; defaultOpen?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  return (
    <details open={defaultOpen} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
      <summary className="cursor-pointer font-black text-white/80">{title}</summary>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-white hover:bg-white/15"
        >
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
      <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-black/50 p-3 text-xs text-white/60">{text}</pre>
    </details>
  );
}

function primitiveBadge(value: unknown, i: number) {
  return <span key={i} className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-bold text-white/75">{humanizeValue(value)}</span>;
}

export function FriendlyKeyValueList({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return <p className="text-sm text-white/50">—</p>;
  if (typeof data !== "object") return <p className="text-sm text-white/80">{humanizeValue(data)}</p>;
  if (Array.isArray(data)) {
    const shown = data.slice(0, 20);
    if (!shown.length) return <p className="text-sm text-white/50">No items.</p>;
    if (shown.every((v) => v === null || typeof v !== "object")) {
      return <div className="flex flex-wrap gap-2">{shown.map(primitiveBadge)}{data.length > shown.length ? <span className="text-xs text-white/45">and {data.length - shown.length} more…</span> : null}</div>;
    }
    return <div className="space-y-2">{shown.map((item, i) => <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3"><FriendlyKeyValueList data={item} depth={depth + 1} /></div>)}{data.length > shown.length ? <p className="text-xs text-white/45">and {data.length - shown.length} more…</p> : null}</div>;
  }
  if (depth > 3) return <p className="text-sm text-white/55">Nested details available in Developer JSON.</p>;
  const entries = Object.entries(data as Record<string, unknown>).slice(0, 40);
  if (!entries.length) return <p className="text-sm text-white/50">No details.</p>;
  return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([key, value]) => {
    const primitive = value === null || typeof value !== "object";
    return <div key={key} className="rounded-xl border border-white/10 bg-black/20 p-3"><dt className="text-xs font-black uppercase tracking-widest text-white/40">{humanizeKey(key)}</dt><dd className="mt-1 text-sm text-white/80">{primitive ? humanizeValue(value) : <FriendlyKeyValueList data={value} depth={depth + 1} />}</dd></div>;
  })}</dl>;
}

export function FriendlyJsonView({ data, title }: { data: unknown; title?: string }) {
  return <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">{title ? <h3 className="font-black text-white">{title}</h3> : null}<FriendlyKeyValueList data={data} /><JsonDeveloperDetails data={data} /></div>;
}
