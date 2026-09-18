"use client";

import { useState } from "react";

export function TeamReviewActionButton({
  table,
  id,
  action,
  label,
}: {
  table: string;
  id: string;
  action: "approve" | "reject";
  label: string;
}) {
  const [message, setMessage] = useState("");

  async function act() {
    const response = await fetch("/api/admin/team/review-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id, action }),
    });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? "Saved." : data?.error || "Could not save.");
    if (response.ok) window.location.reload();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={act}
        className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white hover:bg-white/15"
      >
        {label}
      </button>
      {message ? (
        <span className="text-xs font-bold text-white/50">{message}</span>
      ) : null}
    </span>
  );
}
