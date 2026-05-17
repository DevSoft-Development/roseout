"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  Eye,
  Grid3X3,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
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
  source_table?: string | null;
  source_id?: string | null;
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
  rotation?: number | null;
  status?: string | null;
  sort_order?: number | null;
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
  guest_notes?: string | null;
  vip_tag?: string | null;
  created_at?: string | null;
};

type WaitlistEntry = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  party_size: number | null;
  status: string | null;
  estimated_wait_minutes: number | null;
  created_at: string | null;
};

type Props = {
  backHref: string;
  adminMode?: boolean;
};

const restaurantTypes = ["table", "booth", "bar_seat", "private_dining_room", "patio_section", "vip_section"];
const activityTypes = ["room", "lane", "court", "station", "karaoke_room", "escape_room", "party_room", "event_space"];
const itemStatuses = ["available", "reserved", "occupied", "cleaning", "blocked", "maintenance"];
const reservationStatuses = ["arrived", "seated", "completed", "no_show"];

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function prettyLabel(value: string | null | undefined) {
  return String(value || "item").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string | null | undefined) {
  const clean = String(value || "").slice(0, 5);
  const [hourRaw, minuteRaw = "00"] = clean.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return clean || "—";
  return `${hour % 12 || 12}:${minuteRaw.padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function statusLabel(value: string | null | undefined) {
  return prettyLabel(value || "available");
}

function statusClasses(status: string) {
  if (status === "available") return "border-emerald-400/40 bg-emerald-50 text-emerald-800";
  if (status === "reserved" || status === "confirmed") return "border-blue-400/40 bg-blue-50 text-blue-800";
  if (["occupied", "seated", "arrived"].includes(status)) return "border-rose-400/40 bg-rose-50 text-rose-800";
  if (status === "cleaning") return "border-cyan-400/40 bg-cyan-50 text-cyan-800";
  if (["blocked", "maintenance", "disabled"].includes(status)) return "border-neutral-300 bg-neutral-100 text-neutral-500";
  if (status === "pending") return "border-amber-400/40 bg-amber-50 text-amber-800";
  return "border-neutral-300 bg-white text-neutral-800";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function itemCapacity(item: LayoutItem) {
  return Number(item.capacity_max || item.capacity_min || 2);
}

function itemToForm(item: LayoutItem | null, locationId: string, locationType: LocationType) {
  return {
    id: item?.id || "",
    location_id: item?.location_id || locationId,
    location_type: item?.location_type || locationType,
    item_name: item?.item_name || "",
    item_type: item?.item_type || (locationType === "restaurant" ? "table" : "room"),
    capacity: itemCapacity(item || ({} as LayoutItem)),
    layout_x: Number(item?.layout_x || 0),
    layout_y: Number(item?.layout_y || 0),
    layout_width: Number(item?.layout_width || 1),
    layout_height: Number(item?.layout_height || 1),
    rotation: Number(item?.rotation || 0),
    status: item?.status || (item?.is_active === false ? "blocked" : "available"),
    is_active: item?.is_active !== false,
    sort_order: Number(item?.sort_order || 0),
  };
}

export default function LocationLayoutClient({ backHref, adminMode = false }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationType, setLocationType] = useState<LocationType>("restaurant");
  const [locationId, setLocationId] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [hostessMode, setHostessMode] = useState(false);
  const [draggingId, setDraggingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(itemToForm(null, "", "restaurant"));

  const typeOptions = locationType === "restaurant" ? restaurantTypes : activityTypes;

  const filteredLocations = useMemo(() => {
    const search = locationSearch.toLowerCase().trim();
    return locations.filter((location) => {
      if (location.type !== locationType) return false;
      if (!search) return true;
      return [location.name, location.city, location.state].filter(Boolean).join(" ").toLowerCase().includes(search);
    });
  }, [locations, locationType, locationSearch]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => !locationId || (item.location_id === locationId && item.location_type === locationType));
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

  const unassignedReservations = useMemo(
    () => reservations.filter((reservation) => !reservation.bookable_item_id),
    [reservations],
  );

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) || null, [items, selectedItemId]);
  const selectedItemReservations = selectedItem ? reservationsByItem.get(selectedItem.id) || [] : [];
  const selectedReservation = selectedItemReservations.find((item) => item.id === selectedReservationId) || selectedItemReservations[0] || null;

  const occupancy = useMemo(() => {
    const active = visibleItems.filter((item) => ["reserved", "occupied"].includes(getItemStatus(item)) || (reservationsByItem.get(item.id) || []).length > 0).length;
    const capacity = visibleItems.reduce((total, item) => total + itemCapacity(item), 0);
    const guests = reservations.reduce((total, reservation) => total + Number(reservation.party_size || 0), 0);
    return { active, total: visibleItems.length, capacity, guests };
  }, [visibleItems, reservations, reservationsByItem]);

  useEffect(() => {
    loadLayout();
  }, [locationId, locationType, selectedDate]);

  useEffect(() => {
    const channel = supabase
      .channel("location-layout-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "location_reservations" }, () => loadLayout(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "layout_items" }, () => loadLayout(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "location_bookable_items" }, () => loadLayout(false))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, locationType, selectedDate]);

  useEffect(() => {
    setForm(itemToForm(selectedItem, locationId, locationType));
  }, [selectedItem, locationId, locationType]);

  async function loadLayout(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setError("");
      const params = new URLSearchParams({ date: selectedDate });
      if (locationId) {
        params.set("locationId", locationId);
        params.set("type", locationType);
      }
      const response = await fetch(`/api/reserve/portal/layout?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load location layout.");
      setItems(data.items || []);
      setReservations(data.reservations || []);
      setWaitlist(data.waitlist || []);
      setLocations(data.locations || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to load location layout."));
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  function getItemStatus(item: LayoutItem) {
    if (item.is_active === false) return "disabled";
    if (item.status && item.status !== "available") return item.status;
    const active = reservationsByItem.get(item.id) || [];
    if (!active.length) return "available";
    if (active.some((reservation) => ["seated", "occupied"].includes(String(reservation.status)))) return "occupied";
    if (active.some((reservation) => reservation.status === "arrived")) return "occupied";
    if (active.some((reservation) => reservation.status === "confirmed")) return "reserved";
    if (active.some((reservation) => reservation.status === "pending")) return "pending";
    return "available";
  }

  async function patch(action: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/reserve/portal/layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save changes.");
    return data;
  }

  async function saveItem(action = form.id ? "update_layout_item" : "create_layout_item") {
    if (!locationId && !form.location_id) {
      setError("Select a location before adding a layout item.");
      return;
    }
    try {
      setSaving("layout-item");
      setError("");
      setMessage("");
      const data = await patch(action, { ...form, location_id: form.location_id || locationId, location_type: form.location_type || locationType });
      setItems((current) => {
        if (action === "create_layout_item" || action === "duplicate_layout_item") return [...current, data.item];
        return current.map((item) => (item.id === data.item.id ? data.item : item));
      });
      setSelectedItemId(data.item.id);
      setMessage("Location layout saved.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to save layout item."));
    } finally {
      setSaving("");
    }
  }

  async function deleteItem(item: LayoutItem) {
    try {
      setSaving(item.id);
      setError("");
      await patch("delete_layout_item", { id: item.id });
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setSelectedItemId("");
      setMessage("Layout item deleted.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to delete layout item."));
    } finally {
      setSaving("");
    }
  }

  async function moveLayoutItem(item: LayoutItem, x: number, y: number) {
    const next = itemToForm(item, locationId, locationType);
    next.layout_x = Math.max(0, Math.round(x));
    next.layout_y = Math.max(0, Math.round(y));
    setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, layout_x: next.layout_x, layout_y: next.layout_y } : currentItem)));
    setForm(next);
    await saveItemFor(next);
  }

  async function saveItemFor(next: ReturnType<typeof itemToForm>) {
    try {
      setSaving(next.id);
      const data = await patch("update_layout_item", next);
      setItems((current) => current.map((item) => (item.id === data.item.id ? data.item : item)));
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
      const data = await patch("update_reservation_status", { reservation_id: reservationId, status });
      setReservations((current) => current.map((reservation) => (reservation.id === reservationId ? data.reservation : reservation)));
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
      const data = await patch("move_reservation", { reservation_id: reservationId, bookable_item_id: itemId });
      setReservations((current) => current.map((reservation) => (reservation.id === reservationId ? data.reservation : reservation)));
      setMessage("Reservation assigned.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to move reservation."));
    } finally {
      setSaving("");
    }
  }

  async function notifyWaitlist(entry: WaitlistEntry) {
    try {
      setSaving(entry.id);
      const data = await patch("notify_waitlist", { waitlist_id: entry.id });
      setWaitlist((current) => current.map((row) => (row.id === entry.id ? data.waitlist : row)));
      setMessage("Guest notified by SMS.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to notify guest."));
    } finally {
      setSaving("");
    }
  }

  const selectedLocation = locations.find((location) => location.id === locationId);

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-[#090706] px-3 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1560px]">
        <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.25),transparent_35%),linear-gradient(135deg,#160b0b,#090706_60%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">{adminMode ? "Admin View" : "Business View"}</p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Location Layout</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
                Build a visual floor/layout map, drag seating and rooms, assign reservations, track occupancy, manage blocked items, and operate waitlist-ready hostess mode.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setHostessMode((current) => !current)} className={`rounded-full px-5 py-3 text-sm font-black transition ${hostessMode ? "bg-rose-600 text-white" : "border border-white/10 bg-white/[0.07] text-white/70 hover:bg-white/10"}`}>
                Mobile Hostess Mode {hostessMode ? "On" : "Off"}
              </button>
              <button onClick={() => loadLayout()} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid max-w-full gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1fr_0.8fr]">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Location Type</span>
            <select value={locationType} onChange={(event) => { setLocationType(event.target.value as LocationType); setLocationId(""); }} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none">
              <option value="restaurant">Restaurant / Lounge</option>
              <option value="activity">Activity / Rooms</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Search Location</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder="Search by name, city, state" className="w-full rounded-2xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none" />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Selected Location</span>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none">
              <option value="">All {locationType}s</option>
              {filteredLocations.map((location) => (
                <option key={`${location.type}:${location.id}`} value={location.id}>{location.name}{location.city || location.state ? ` · ${[location.city, location.state].filter(Boolean).join(", ")}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none" />
            </div>
          </label>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          {[
            ["Live occupancy", `${occupancy.active}/${occupancy.total} items`],
            ["Guests assigned", `${occupancy.guests}/${occupancy.capacity} capacity`],
            ["Upcoming", `${reservations.length} reservations`],
            ["Waitlist", `${waitlist.length} waiting/notified`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </div>
          ))}
        </section>

        {message ? <div className="mt-5 flex items-center gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm font-bold text-emerald-200"><CheckCircle2 className="h-5 w-5" />{message}</div> : null}
        {error ? <div className="mt-5 flex items-center gap-3 rounded-3xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm font-bold text-red-200"><X className="h-5 w-5" />{error}</div> : null}

        <section className={`mt-5 grid max-w-full gap-5 ${hostessMode ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : "2xl:grid-cols-[minmax(0,1fr)_340px_320px]"}`}>
          <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#f8f3ef] p-4 text-[#1b1210] shadow-2xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Visual Floor / Layout Map</p>
                <h2 className="mt-2 text-2xl font-black">{selectedLocation?.name || "Tables, rooms, lanes and spaces"}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs font-black text-black/45"><Grid3X3 className="h-4 w-4" />Grid snapping · {visibleItems.length} items</div>
            </div>

            {loading ? (
              <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-rose-700" /></div>
            ) : visibleItems.length ? (
              <div className="relative mt-6 max-w-full min-h-[420px] overflow-auto overscroll-contain rounded-[1.5rem] border border-dashed border-black/15 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:48px_48px] p-3 sm:min-h-[560px] sm:p-4">
                <div className="relative h-[620px] min-w-[760px] sm:h-[720px] lg:min-w-[900px]">
                  {visibleItems.map((item) => {
                    const activeReservations = reservationsByItem.get(item.id) || [];
                    const status = getItemStatus(item);
                    const primaryReservation = activeReservations[0];
                    const left = Number(item.layout_x || 0) * 48;
                    const top = Number(item.layout_y || 0) * 48;
                    const width = Math.max(1, Number(item.layout_width || 2)) * 48;
                    const height = Math.max(1, Number(item.layout_height || 2)) * 48;
                    return (
                      <button
                        key={item.id}
                        draggable={!hostessMode}
                        onDragStart={(event) => { setDraggingId(item.id); event.dataTransfer.setData("text/plain", item.id); }}
                        onDragEnd={() => setDraggingId("")}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const reservationId = event.dataTransfer.getData("reservation/id");
                          if (reservationId) moveReservation(reservationId, item.id);
                        }}
                        onClick={() => { setSelectedItemId(item.id); setSelectedReservationId(primaryReservation?.id || ""); }}
                        className={`absolute rounded-[1.25rem] border p-3 text-left shadow-sm transition hover:z-10 hover:-translate-y-0.5 hover:shadow-xl ${statusClasses(status)} ${draggingId === item.id ? "scale-95 opacity-60" : ""}`}
                        style={{ left, top, width, height, transform: `rotate(${Number(item.rotation || 0)}deg)` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div><h4 className="text-base font-black">{item.item_name}</h4><p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-60">{prettyLabel(item.item_type)}</p></div>
                          <span className="rounded-full bg-black/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide">{statusLabel(status)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs font-bold opacity-70"><Users className="h-3 w-3" />{itemCapacity(item)} guests</div>
                        {primaryReservation ? <div className="mt-2 rounded-xl bg-white/60 p-2 text-xs"><p className="font-black">{formatTime(primaryReservation.reservation_time)} · Party {primaryReservation.party_size || 1}</p><p className="mt-1 font-bold opacity-70">{primaryReservation.customer_name || "Guest"}</p></div> : null}
                        {!hostessMode ? <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] font-black"><span onClick={(e) => { e.stopPropagation(); moveLayoutItem(item, Number(item.layout_x || 0) - 1, Number(item.layout_y || 0)); }} className="rounded-lg bg-black/10 py-1 text-center">←</span><span onClick={(e) => { e.stopPropagation(); moveLayoutItem(item, Number(item.layout_x || 0), Number(item.layout_y || 0) - 1); }} className="rounded-lg bg-black/10 py-1 text-center">↑</span><span onClick={(e) => { e.stopPropagation(); moveLayoutItem(item, Number(item.layout_x || 0), Number(item.layout_y || 0) + 1); }} className="rounded-lg bg-black/10 py-1 text-center">↓</span><span onClick={(e) => { e.stopPropagation(); moveLayoutItem(item, Number(item.layout_x || 0) + 1, Number(item.layout_y || 0)); }} className="rounded-lg bg-black/10 py-1 text-center">→</span></div> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-black/10 bg-white p-8 text-center"><p className="text-lg font-black">No layout items yet</p><p className="mt-2 text-sm font-semibold text-black/45">Select a location and add tables, booths, rooms, lanes, courts, stations or event spaces.</p></div>
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
              <div className="flex items-center gap-2"><Eye className="h-5 w-5 text-rose-300" /><h2 className="text-xl font-black">Host / Operator</h2></div>
              {!selectedItem ? <p className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-sm font-bold text-white/45">Click an item to view reservations, mark seated/completed/no-show, clean/reset availability, or move reservations.</p> : (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Selected Item</p><h3 className="mt-2 text-2xl font-black">{selectedItem.item_name}</h3><p className="mt-1 text-sm font-bold text-white/45">{prettyLabel(selectedItem.item_type)} · {itemCapacity(selectedItem)} guests</p></div>
                  {selectedReservation ? <div className="space-y-4"><div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Guest</p><h3 className="mt-2 text-xl font-black">{selectedReservation.customer_name || "Guest"}{selectedReservation.vip_tag ? <span className="ml-2 rounded-full bg-amber-300 px-2 py-1 text-xs text-black">VIP</span> : null}</h3><p className="mt-2 text-sm font-bold text-white/50">{formatTime(selectedReservation.reservation_time)} · Party {selectedReservation.party_size || 1}</p><p className="mt-2 text-sm font-bold text-white/50">Status: {statusLabel(selectedReservation.status)}</p>{selectedReservation.customer_phone ? <p className="mt-2 text-sm font-bold text-white/50">Phone: {selectedReservation.customer_phone}</p> : null}{selectedReservation.special_request || selectedReservation.guest_notes ? <p className="mt-3 rounded-2xl bg-black/30 p-3 text-sm font-semibold text-white/60">{selectedReservation.special_request || selectedReservation.guest_notes}</p> : null}</div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{reservationStatuses.map((status) => <button key={status} onClick={() => updateReservationStatus(selectedReservation.id, status)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white">{prettyLabel(status)}</button>)}</div><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Move Reservation</span><select value={selectedReservation.bookable_item_id || ""} onChange={(event) => moveReservation(selectedReservation.id, event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none">{visibleItems.filter((item) => item.is_active !== false && !["blocked", "maintenance"].includes(String(item.status))).map((item) => <option key={item.id} value={item.id}>{item.item_name} · {prettyLabel(item.item_type)} · {itemCapacity(item)} guests</option>)}</select></label></div> : <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-5"><p className="text-lg font-black text-emerald-200">Available</p><p className="mt-2 text-sm font-bold text-white/50">No active reservation assigned for this date.</p></div>}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{["cleaning", "available", "maintenance"].map((status) => <button key={status} onClick={() => { const next = { ...itemToForm(selectedItem, locationId, locationType), status }; setForm(next); saveItemFor(next); }} className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-black text-white/70">{prettyLabel(status)}</button>)}</div>
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
              <h2 className="text-lg font-black">Upcoming Reservations</h2>
              <div className="mt-4 space-y-3">{reservations.slice(0, 8).map((reservation) => <div key={reservation.id} draggable onDragStart={(event) => event.dataTransfer.setData("reservation/id", reservation.id)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-sm font-black">{formatTime(reservation.reservation_time)} · {reservation.customer_name || "Guest"}</p><p className="mt-1 text-xs font-bold text-white/45">Party {reservation.party_size || 1} · {reservation.bookable_item_name || "Unassigned"}</p>{unassignedReservations.some((item) => item.id === reservation.id) ? <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-amber-200">Drag onto an item to assign</p> : null}</div>)}{!reservations.length ? <p className="rounded-2xl bg-white/[0.06] p-4 text-sm font-bold text-white/45">No upcoming reservations for this date.</p> : null}</div>
            </div>

            <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
              <h2 className="text-lg font-black">Waitlist</h2>
              <div className="mt-4 space-y-3">{waitlist.slice(0, 8).map((entry) => <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-sm font-black">{entry.customer_name || "Guest"} · Party {entry.party_size || 1}</p><p className="mt-1 text-xs font-bold text-white/45">{statusLabel(entry.status)} · {entry.estimated_wait_minutes || 0} min estimate</p><button onClick={() => notifyWaitlist(entry)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-2 text-xs font-black text-white"><MessageSquareText className="h-3 w-3" />Notify Guest</button></div>)}{!waitlist.length ? <p className="rounded-2xl bg-white/[0.06] p-4 text-sm font-bold text-white/45">Waitlist-ready placeholder: guests will appear here after joining.</p> : null}</div>
            </div>
          </aside>

          {!hostessMode ? (
            <aside className="min-w-0 rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Layout Builder</h2><button onClick={() => { setSelectedItemId(""); setForm(itemToForm(null, locationId, locationType)); }} className="rounded-full bg-rose-600 p-2 text-white"><Plus className="h-4 w-4" /></button></div>
              <div className="mt-5 space-y-4">
                <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Name</span><input value={form.item_name} onChange={(event) => setForm((current) => ({ ...current, item_name: event.target.value }))} placeholder="Table 12, Lane 4, VIP Patio" className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label>
                <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Item Type</span><select value={form.item_type || "table"} onChange={(event) => setForm((current) => ({ ...current, item_type: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none">{typeOptions.map((type) => <option key={type} value={type}>{prettyLabel(type)}</option>)}</select></label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Capacity</span><input type="number" min="1" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value, is_active: !["blocked", "maintenance"].includes(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none">{itemStatuses.map((status) => <option key={status} value={status}>{prettyLabel(status)}</option>)}</select></label></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">X</span><input type="number" value={form.layout_x} onChange={(event) => setForm((current) => ({ ...current, layout_x: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Y</span><input type="number" value={form.layout_y} onChange={(event) => setForm((current) => ({ ...current, layout_y: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">W</span><input type="number" min="1" value={form.layout_width} onChange={(event) => setForm((current) => ({ ...current, layout_width: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">H</span><input type="number" min="1" value={form.layout_height} onChange={(event) => setForm((current) => ({ ...current, layout_height: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label><label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Rotate</span><input type="number" step="15" value={form.rotation} onChange={(event) => setForm((current) => ({ ...current, rotation: Number(event.target.value) }))} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none" /></label></div>
                <button onClick={() => saveItem()} disabled={saving === "layout-item"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving === "layout-item" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save Item</button>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><button onClick={() => selectedItem && saveItem("duplicate_layout_item")} disabled={!selectedItem} className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-xs font-black text-white/70 disabled:opacity-40"><Copy className="mx-auto mb-1 h-4 w-4" />Duplicate</button><button onClick={() => setForm((current) => ({ ...current, rotation: Number(current.rotation || 0) + 15 }))} className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-xs font-black text-white/70"><RotateCw className="mx-auto mb-1 h-4 w-4" />Rotate</button><button onClick={() => selectedItem && deleteItem(selectedItem)} disabled={!selectedItem} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-xs font-black text-red-200 disabled:opacity-40"><Trash2 className="mx-auto mb-1 h-4 w-4" />Delete</button></div>
              </div>
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}
