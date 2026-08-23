"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(value: string, amount: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export default function ReservationDateNavRepair() {
  const router = useRouter();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button) return;
      const label = button.getAttribute("aria-label");
      if (label !== "Previous day" && label !== "Next day") return;

      event.preventDefault();
      event.stopPropagation();

      const params = new URLSearchParams(window.location.search);
      const current = params.get("date") || todayKey();
      params.set("date", shiftDate(current, label === "Previous day" ? -1 : 1));
      if (!params.get("tab")) params.set("tab", "today");
      router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
