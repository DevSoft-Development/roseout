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

  if (badge) badge.textContent = isToday ? "Today" : "Selected day";
  if (heading) heading.textContent = `${isToday ? "Today, " : ""}${displayDate(selected)}`;
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
      window.setTimeout(syncDateHeader, 0);
    }

    function onReservationSelected(event: Event) {
      const detail = (event as CustomEvent<{ bookableItemName?: string }>).detail;
      selectedTableNames.current = String(detail?.bookableItemName || "");
      window.setTimeout(() => highlightAssignedTables(selectedTableNames.current), 0);
    }

    const observer = new MutationObserver(() => {
      syncDateHeader();
      if (selectedTableNames.current) highlightAssignedTables(selectedTableNames.current);
    });

    document.addEventListener("click", onClick, true);
    window.addEventListener("reserve:reservation-selected", onReservationSelected);
    observer.observe(document.body, { childList: true, subtree: true });
    syncDateHeader();

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("reserve:reservation-selected", onReservationSelected);
      observer.disconnect();
      clearFloorHighlights();
    };
  }, [router]);

  return null;
}
