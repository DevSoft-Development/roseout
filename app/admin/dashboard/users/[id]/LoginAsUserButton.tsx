"use client";

import { useState } from "react";

export default function LoginAsUserButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);

  const loginAsUser = async () => {
    setLoading(true);

    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      alert("You are not allowed to login as this user.");
      setLoading(false);
      return;
    }

    window.location.href = "/user/dashboard";
  };

  return (
    <button
      onClick={loginAsUser}
      disabled={loading}
      className="rounded-full bg-rose-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400 disabled:opacity-50"
    >
      {loading ? "Logging In..." : "Login as User"}
    </button>
  );
}