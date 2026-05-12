"use client";

import { useState } from "react";

export default function ImpersonationBanner() {
  const [loading, setLoading] = useState(false);

  const stop = async () => {
    setLoading(true);

    await fetch("/api/admin/stop-impersonation", {
      method: "POST",
    });

    window.location.href = "/admin/dashboard/users";
  };

  return (
    <div className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-center gap-4 bg-red-600 px-4 py-3 text-center text-sm font-bold text-white shadow-lg">
      <span>You are viewing TheOutHaven as another user.</span>

      <button
        onClick={stop}
        disabled={loading}
        className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-red-600 disabled:opacity-60"
      >
        {loading ? "Exiting..." : "Exit User View"}
      </button>
    </div>
  );
}