"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EventOrderRefundButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refundOrder() {
    if (!window.confirm("Refund this ticket order in full? The tickets will be voided after Stripe confirms the refund.")) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/events/ticket-orders/${encodeURIComponent(orderId)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "requested_by_customer" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to refund this order.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refund this order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={loading}
        onClick={refundOrder}
        className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Refunding..." : "Refund"}
      </button>
      {error ? <p className="mt-1 max-w-48 text-[11px] font-semibold text-red-300">{error}</p> : null}
    </div>
  );
}
