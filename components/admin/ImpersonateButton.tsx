"use client";

import { useState } from "react";

type ImpersonateButtonProps = {
  className?: string;
  disabled?: boolean;
  label?: string;
  locationId?: string;
  locationType?: "restaurants" | "activities";
  targetType?: "user" | "location_owner";
  userId?: string;
};

export default function ImpersonateButton({
  className,
  disabled,
  label,
  locationId,
  locationType,
  targetType,
  userId,
}: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);

  const startImpersonation = async () => {
    if (disabled || loading) return;

    const confirmed = window.confirm(
      "You are about to log in as this account. This action will be recorded in the admin audit log.",
    );
    if (!confirmed) return;

    setLoading(true);

    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: targetType || (locationId ? "location_owner" : "user"),
          userId,
          targetUserId: userId,
          locationId,
          locationType,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.redirectTo) {
        window.alert(data.error || "Unable to start secure impersonation.");
        return;
      }

      window.location.href = data.redirectTo;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={startImpersonation}
      disabled={disabled || loading}
      className={
        className ||
        "rounded-full bg-rose-500 px-4 py-2 text-xs font-black text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {loading ? "Starting…" : label || "Log in as user"}
    </button>
  );
}
