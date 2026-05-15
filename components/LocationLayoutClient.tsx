"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Eye,
  Grid3X3,
  Loader2,
  Move,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type LocationType = "restaurant" | "activity";

type LocationOption = {
  id: string;
  type: LocationType;
  name: string;
  city?: string | null;
  state?: string | null;
};

type LayoutItem = {
  id: string;
  location_id: string;
  location_type: LocationType;
  item_name: string;
  item_type: string | null;
  capacity_min: number | null;
  capacity_max: number | null;
  max_concurrent: number | null;
  auto_confirm: boolean | null;
  is_active: boolean | null;
  layout_x: number | null;
  layout_y: number | null;
  layout_width: number | null;
  layout_height: number | null;
  layout_zone: string | null;
};

type Reservation = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  party_size: number | null;
  reservation_date: string;
  reservation_time: string;
  status: string | null;
  location_id: string | null;
  location_type: string | null;
  bookable_item_id: string | null;
  bookable_item_name: string | null;
  bookable_item_type: string | null;
  special_request: string | null;
};

type Props = {
  backHref: string;
  adminMode?: boolean;
};

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function prettyLabel(value: string | null | undefined) {
  return String(value || "reservation option")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string | null | undefined) {
  const clean = String(value || "").slice(0, 5);
  const [hourRaw, minuteRaw = "00"] = clean.split(":");
  const hour = Number(hourRaw);

  if (!Number.isFinite(hour)) return clean || "—";

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

function statusLabel(value: string | null | undefined) {
  return String(value || "available")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClasses(status: string) {
  if (status === "available") return "border-emerald-400/40 bg-emerald-50 text-emerald-800";
  if (status === "pending") return "border-amber-400/40 bg-amber-50 text-amber-800";
  if (status === "confirmed") return "border-blue-400/40 bg-blue-50 text-blue-800";
  if (status === "arrived") return "border-purple-400/40 bg-purple-50 text-purple-800";
  if (status === "seated") return "border-rose-400/40 bg-rose-50 text-rose-800";
  if (status === "disabled") return "border-neutral-300 bg-neutral-100 text-neutral-500";

  return "border-neutral-300 bg-white text-neutral-800";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LocationLayoutClient({ backHref, adminMode = false }: Props) {
  const supabase = createClient();

  const [items, setItems] = useState<LayoutItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationType, setLocationType] = useState<LocationType>("restaurant");
  const [locationId, setLocationId] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [hostessMode, setHostessMode] = useState(false);
  const [draggingId, setDraggingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filteredLocations = useMemo(
    () => locations.filter((location) => location.type === locationType),
    [locations, locationType]
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (!locationId) return true;

      return item.location_id === locationId && item.location_type === locationType;
    });
  }, [items, locationId, locationType]);

  const reservationsByItem = useMemo(() => {
    const map = new Map<string, Reservation[]>();

    reservations.forEach((reservation) => {
      if (!reservation.bookable_item_id) return;

      const list = map.get(reservation.bookable_item_id) || [];
      list.push(reservation);
      map.set(reservation.bookable_item_id, list);
    });

    return map;
  }, [reservations]);

  const zones = useMemo(() => {
    const grouped = new Map<string, LayoutItem[]>();

    visibleItems.forEach((item) => {
      const zone = item.layout_zone || "Main Area";
      const list = grouped.get(zone) || [];
      list.push(item);
      grouped.set(zone, list);
    });

    return Array.from(grouped.entries()).map(([zone, zoneItems]) => ({
      zone,
      items: zoneItems.sort((a, b) => {
        const yA = Number(a.layout_y || 0);
        const yB = Number(b.layout_y || 0);
        const xA = Number(a.layout_x || 0);
        const xB = Number(b.layout_x || 0);

        if (yA !== yB) return yA - yB;
        return xA - xB;
      }),
    }));
  }, [visibleItems]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const selectedItemReservations = selectedItem
    ? reservationsByItem.get(selectedItem.id) || []
    : [];

  const selectedReservation =
    selectedItemReservations.find((item) => item.id === selectedReservationId) ||
    selectedItemReservations[0] ||
    null;

  useEffect(() => {
    loadLayout();
  }, [locationId, locationType, selectedDate]);

  useEffect(() => {
    const channel = supabase
      .channel("location-layout-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location_reservations" },
        () => loadLayout(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location_bookable_items" },
        () => loadLayout(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, locationType, selectedDate]);

  async function loadLayout(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setError("");

      const params = new URLSearchParams({
        date: selectedDate,
      });

      if (locationId) {
        params.set("locationId", locationId);
        params.set("type", locationType);
      }

      const response = await fetch(`/api/reserve/portal/layout?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load location layout.");
      }

      setItems(data.items || []);
      setReservations(data.reservations || []);
      setLocations(data.locations || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to load location layout."));
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  function getItemStatus(item: LayoutItem) {
    if (item.is_active === false) return "disabled";

    const active = reservationsByItem.get(item.id) || [];

    if (!active.length) return "available";

    if (active.some((reservation) => reservation.status === "seated")) return "seated";
    if (active.some((reservation) => reservation.status === "arrived")) return "arrived";
    if (active.some((reservation) => reservation.status === "confirmed")) return "confirmed";
    if (active.some((reservation) => reservation.status === "pending")) return "pending";

    return "available";
  }

  async function moveLayoutItem(item: LayoutItem, direction: "left" | "right" | "up" | "down") {
    const currentX = Number(item.layout_x || 0);
    const currentY = Number(item.layout_y || 0);

    const nextX =
      direction === "left" ? Math.max(0, currentX - 1) : direction === "right" ? currentX + 1 : currentX;

    const nextY =
      direction === "up" ? Math.max(0, currentY - 1) : direction === "down" ? currentY + 1 : currentY;

    await patchLayoutItem(item, nextX, nextY, item.layout_zone || "Main Area");
  }

  async function patchLayoutItem(item: LayoutItem, x: number, y: number, zone: string) {
    try {
      setSaving(item.id);
      setError("");
      setMessage("");

      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_layout_item",
          id: item.id,
          layout_x: x,
          layout_y: y,
          layout_width: item.layout_width || 1,
          layout_height: item.layout_height || 1,
          layout_zone: zone || "Main Area",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save layout.");
      }

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, layout_x: x, layout_y: y, layout_zone: zone }
            : currentItem
        )
      );

      setMessage("Location layout updated.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to save layout."));
    } finally {
      setSaving("");
    }
  }

  async function updateReservationStatus(reservationId: string, status: string) {
    try {
      setSaving(reservationId);
      setError("");
      setMessage("");

      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_reservation_status",
          reservation_id: reservationId,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update reservation.");
      }

      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === reservationId ? data.reservation : reservation
        )
      );

      setMessage("Reservation updated.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to update reservation."));
    } finally {
      setSaving("");
    }
  }

  async function moveReservation(reservationId: string, itemId: string) {
    try {
      setSaving(reservationId);
      setError("");
      setMessage("");

      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_reservation",
          reservation_id: reservationId,
          bookable_item_id: itemId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to move reservation.");
      }

      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === reservationId ? data.reservation : reservation
        )
      );

      setMessage("Reservation moved.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to move reservation."));
    } finally {
      setSaving("");
    }
  }

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.25),transparent_35%),linear-gradient(135deg,#160b0b,#090706_60%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                {adminMode ? "Admin View" : "Business View"}
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Location Layout
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Drag, organize, monitor live occupancy, view reservations, move
                reservations, and run hostess mode for tables, rooms, lanes,
                booths, cabanas, sections, and packages.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setHostessMode((current) => !current)}
                className={`rounded-full px-5 py-3 text-sm font-black transition ${
                  hostessMode
                    ? "bg-rose-600 text-white"
                    : "border border-white/10 bg-white/[0.07] text-white/70 hover:bg-white/10"
                }`}
              >
                Hostess Mode {hostessMode ? "On" : "Off"}
              </button>

              <button
                onClick={() => loadLayout()}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 lg:grid-cols-[1fr_1fr_1fr]">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
              Location Type
            </span>
            <select
              value={locationType}
              onChange={(event) => {
                setLocationType(event.target.value as LocationType);
                setLocationId("");
              }}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none"
            >
              <option value="restaurant">Restaurant</option>
              <option value="activity">Activity</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
              Location
            </span>
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none"
            >
              <option value="">All {locationType}s</option>
              {filteredLocations.map((location) => (
                <option key={`${location.type}:${location.id}`} value={location.id}>
                  {location.name}
                  {location.city || location.state
                    ? ` · ${[location.city, location.state].filter(Boolean).join(", ")}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
              Date
            </span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none"
              />
            </div>
          </label>
        </section>

        {message ? (
          <div className="mt-5 flex items-center gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-200">
            <CheckCircle2 className="h-5 w-5" />
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 flex items-center gap-3 rounded-3xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm font-bold text-red-200">
            <X className="h-5 w-5" />
            {error}
          </div>
        ) : null}

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_430px]">
          <div className="rounded-[2rem] border border-white/10 bg-[#f8f3ef] p-5 text-[#1b1210] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">
                  Live Layout
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Tables, rooms, lanes, booths and sections
                </h2>
              </div>

              <div className="flex items-center gap-2 text-xs font-black text-black/45">
                <Grid3X3 className="h-4 w-4" />
                {visibleItems.length} options
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[360px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-rose-700" />
              </div>
            ) : zones.length ? (
              <div className="mt-6 space-y-8">
                {zones.map((zoneGroup) => (
                  <div key={zoneGroup.zone}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-lg font-black">{zoneGroup.zone}</h3>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-black/35">
                        Drop area
                      </p>
                    </div>

                    <div
                      className="grid min-h-[180px] grid-cols-1 gap-4 rounded-[1.5rem] border border-dashed border-black/15 bg-black/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();

                        const itemId = event.dataTransfer.getData("text/plain");
                        const item = items.find((current) => current.id === itemId);

                        if (!item) return;

                        patchLayoutItem(
                          item,
                          zoneGroup.items.length,
                          Number(item.layout_y || 0),
                          zoneGroup.zone
                        );
                      }}
                    >
                      {zoneGroup.items.map((item) => {
                        const activeReservations = reservationsByItem.get(item.id) || [];
                        const status = getItemStatus(item);
                        const primaryReservation = activeReservations[0];

                        return (
                          <button
                            key={item.id}
                            draggable={!hostessMode}
                            onDragStart={(event) => {
                              setDraggingId(item.id);
                              event.dataTransfer.setData("text/plain", item.id);
                            }}
                            onDragEnd={() => setDraggingId("")}
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setSelectedReservationId(primaryReservation?.id || "");
                            }}
                            className={`rounded-[1.5rem] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${statusClasses(
                              status
                            )} ${draggingId === item.id ? "scale-95 opacity-60" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-lg font-black">{item.item_name}</h4>
                                <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] opacity-60">
                                  {prettyLabel(item.item_type)}
                                </p>
                              </div>

                              <span className="rounded-full bg-black/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide">
                                {statusLabel(status)}
                              </span>
                            </div>

                            <div className="mt-4 flex items-center gap-2 text-sm font-bold opacity-70">
                              <Users className="h-4 w-4" />
                              {item.capacity_min || 1}–{item.capacity_max || 4} guests
                            </div>

                            {primaryReservation ? (
                              <div className="mt-4 rounded-2xl bg-white/60 p-3 text-sm">
                                <p className="font-black">
                                  {formatTime(primaryReservation.reservation_time)} · Party{" "}
                                  {primaryReservation.party_size || 1}
                                </p>
                                <p className="mt-1 font-bold opacity-70">
                                  {primaryReservation.customer_name || "Guest"}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-4 rounded-2xl bg-white/60 p-3 text-sm font-bold opacity-60">
                                No active reservation
                              </p>
                            )}

                            {!hostessMode ? (
                              <div className="mt-4 grid grid-cols-4 gap-2">
                                <span
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveLayoutItem(item, "left");
                                  }}
                                  className="rounded-xl bg-black/10 px-2 py-2 text-center text-xs font-black"
                                >
                                  ←
                                </span>
                                <span
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveLayoutItem(item, "up");
                                  }}
                                  className="rounded-xl bg-black/10 px-2 py-2 text-center text-xs font-black"
                                >
                                  ↑
                                </span>
                                <span
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveLayoutItem(item, "down");
                                  }}
                                  className="rounded-xl bg-black/10 px-2 py-2 text-center text-xs font-black"
                                >
                                  ↓
                                </span>
                                <span
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveLayoutItem(item, "right");
                                  }}
                                  className="rounded-xl bg-black/10 px-2 py-2 text-center text-xs font-black"
                                >
                                  →
                                </span>
                              </div>
                            ) : null}

                            {saving === item.id ? (
                              <div className="mt-3 flex items-center gap-2 text-xs font-black">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-black/10 bg-white p-8 text-center">
                <p className="text-lg font-black">No reservation options yet</p>
                <p className="mt-2 text-sm font-semibold text-black/45">
                  Add Reservation Options first, then they will appear in this
                  visual Location Layout.
                </p>
                <Link
                  href="/reserve/dashboard/options"
                  className="mt-5 inline-flex rounded-full bg-black px-5 py-3 text-sm font-black text-white"
                >
                  Add Reservation Options
                </Link>
              </div>
            )}
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-rose-300" />
              <h2 className="text-xl font-black">Reservation Details</h2>
            </div>

            {!selectedItem ? (
              <p className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-sm font-bold text-white/45">
                Click any table, room, lane, booth, cabana, section, or package
                to view and manage the active reservation.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                    Selected Option
                  </p>
                  <h3 className="mt-2 text-2xl font-black">{selectedItem.item_name}</h3>
                  <p className="mt-1 text-sm font-bold text-white/45">
                    {prettyLabel(selectedItem.item_type)} ·{" "}
                    {selectedItem.capacity_min || 1}–{selectedItem.capacity_max || 4} guests
                  </p>
                </div>

                {selectedItemReservations.length > 1 ? (
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                      Active Reservations
                    </span>
                    <select
                      value={selectedReservation?.id || ""}
                      onChange={(event) => setSelectedReservationId(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none"
                    >
                      {selectedItemReservations.map((reservation) => (
                        <option key={reservation.id} value={reservation.id}>
                          {formatTime(reservation.reservation_time)} ·{" "}
                          {reservation.customer_name || "Guest"} · Party{" "}
                          {reservation.party_size || 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {selectedReservation ? (
                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                        Guest
                      </p>
                      <h3 className="mt-2 text-xl font-black">
                        {selectedReservation.customer_name || "Guest"}
                      </h3>
                      <p className="mt-2 text-sm font-bold text-white/50">
                        {formatTime(selectedReservation.reservation_time)} · Party{" "}
                        {selectedReservation.party_size || 1}
                      </p>
                      <p className="mt-2 text-sm font-bold text-white/50">
                        Status: {statusLabel(selectedReservation.status)}
                      </p>
                      {selectedReservation.customer_phone ? (
                        <p className="mt-2 text-sm font-bold text-white/50">
                          Phone: {selectedReservation.customer_phone}
                        </p>
                      ) : null}
                      {selectedReservation.special_request ? (
                        <p className="mt-3 rounded-2xl bg-black/30 p-3 text-sm font-semibold text-white/60">
                          {selectedReservation.special_request}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() =>
                          updateReservationStatus(selectedReservation.id, "arrived")
                        }
                        className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
                      >
                        Mark Arrived
                      </button>
                      <button
                        onClick={() =>
                          updateReservationStatus(selectedReservation.id, "seated")
                        }
                        className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white"
                      >
                        Seat / In Use
                      </button>
                      <button
                        onClick={() =>
                          updateReservationStatus(selectedReservation.id, "completed")
                        }
                        className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() =>
                          updateReservationStatus(selectedReservation.id, "no_show")
                        }
                        className="rounded-2xl bg-neutral-700 px-4 py-3 text-sm font-black text-white"
                      >
                        No Show
                      </button>
                    </div>

                    <label className="space-y-2">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                        Move Reservation
                      </span>
                      <select
                        value={selectedReservation.bookable_item_id || ""}
                        onChange={(event) =>
                          moveReservation(selectedReservation.id, event.target.value)
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none"
                      >
                        {visibleItems
                          .filter((item) => item.is_active !== false)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.item_name} · {prettyLabel(item.item_type)}
                            </option>
                          ))}
                      </select>
                    </label>

                    {saving === selectedReservation.id ? (
                      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] p-4 text-sm font-black text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating reservation
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
                    <p className="text-lg font-black text-emerald-200">Available</p>
                    <p className="mt-2 text-sm font-bold text-white/50">
                      No active reservation is assigned to this option for the
                      selected date.
                    </p>
                  </div>
                )}
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}