"use client";
import { useState } from "react";
export default function BookSavedPlanButton({ plan }: { plan: any }) {
  const [message, setMessage] = useState("");
  async function book() {
    setMessage("");
    const res = await fetch("/api/user/outings/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saved_plan_id: plan.id,
        title: plan.title || "TheOutHaven Plan",
        prompt: plan.prompt || plan.summary || null,
        plan_payload: plan.plan_data || plan,
        source: "saved_plan_detail",
        status: "booked",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.success ? "Your outing was saved to your dashboard." : data.message || "We could not save this to your dashboard yet, but you can continue booking.");
  }
  return <div><button type="button" onClick={book} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black">Book My Outing</button>{message ? <p className="mt-2 text-xs text-white/65">{message}</p> : null}</div>;
}
