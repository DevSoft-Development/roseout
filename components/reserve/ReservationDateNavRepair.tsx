"use client";

import { useEffect, useRef } from "react";
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

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function syncDateHeader() {
  const previous = document.querySelector<HTMLButtonElement>('button[aria-label="Previous day"]');
  const section = previous?.closest("section");
  if (!section) return;

  const params = new URLSearchParams(window.location.search);
  const selected = params.get("date") || todayKey();
  const isToday = selected === todayKey();
  const badge = section.querySelector<HTMLElement>("span.rounded-full");
  const heading = section.querySelector<HTMLHeadingElement>("h2");
  const nextBadge = isToday ? "Today" : "Selected day";
  const nextHeading = `${isToday ? "Today, " : ""}${displayDate(selected)}`;

  // Guard DOM writes. Setting textContent creates childList mutations, so writing
  // the same value repeatedly can create a MutationObserver feedback loop.
  if (badge && badge.textContent !== nextBadge) badge.textContent = nextBadge;
  if (heading && heading.textContent !== nextHeading) heading.textContent = nextHeading;
}

function clearFloorHighlights() {
  document.querySelectorAll<HTMLElement>('[data-reserve-selected-table="1"]').forEach((element) => {
    element.style.outline = "";
    element.style.outlineOffset = "";
    element.style.boxShadow = "";
    element.removeAttribute("data-reserve-selected-table");
  });
}

function highlightAssignedTables(bookableItemName: string) {
  clearFloorHighlights();
  const labels = bookableItemName
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!labels.length) return;

  const floor = document.querySelector(".reserve-floor-snapshot");
  if (!floor) return;

  floor.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const text = String(button.textContent || "").toLowerCase();
    if (!labels.some((label) => text.includes(label))) return;
    button.dataset.reserveSelectedTable = "1";
    button.style.outline = "3px solid #ff2142";
    button.style.outlineOffset = "3px";
    button.style.boxShadow = "0 0 0 6px rgba(255,33,66,.16)";
  });
}

export default function ReservationDateNavRepair() {
  const router = useRouter();
  const selectedTableNames = useRef("");
  const frame = useRef<number | null>(null);

  useEffect(() => {
    function scheduleSync() {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        syncDateHeader();
        if (selectedTableNames.current) highlightAssignedTables(selectedTableNames.current);
      });
    }

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
      scheduleSync();
    }

    function onReservationSelected(event: Event) {
      const detail = (event as CustomEvent<{ bookableItemName?: string }>).detail;
      selectedTableNames.current = String(detail?.bookableItemName || "");
      scheduleSync();
    }

    const observer = new MutationObserver(scheduleSync);

    document.addEventListener("click", onClick, true);
    window.addEventListener("reserve:reservation-selected", onReservationSelected);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleSync();

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("reserve:reservation-selected", onReservationSelected);
      observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      clearFloorHighlights();
    };
  }, [router]);

  return null;
}
