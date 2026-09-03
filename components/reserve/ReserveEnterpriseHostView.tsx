"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  LogOut,
  MessageSquare,
  Minimize2,
  RefreshCw,
  Search,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReserveConversationThread from "@/components/reserve/ReserveConversationThread";
import {
  getFloorSnapshotState,
  resourceCapacity,
  resourceName,
} from "@/lib/reservations/floorSnapshot";
import {
  formatReservationTime,
  getReservationGuestName,
} from "@/lib/reservations/ui";

const ACTIVE = new Set(["pending", "confirmed", "checked_in", "waiting", "arrived", "seated", "occupied"]);
const CACHE_VERSION = 1;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function cacheKey(locationId: string, date: string) {
  return `theouthaven:reserve-host:v${CACHE_VERSION}:${locationId}:${date}`;
}

function normalizedType(resource: any) {
  return String(resource?.item_type || resource?.type || "").toLowerCase().replaceAll(" ", "_");
}

function isBarResource(resource: any) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalizedType(resource));
}

function statusClass(status: string) {
  if (status === "Open") return "border-emerald-400/55 bg-emerald-500/10 text-emerald-200";
  if (status === "Seated") return "border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-100";
  if (["Waiting", "Ready sent", "Due now"].includes(status)) return "border-[#e1062a]/50 bg-[#e1062a]/12 text-[#ff8aa0]";
  if (["Blocked"].includes(status)) return "border-red-500/60 bg-red-500/10 text-red-200";
  return "border-white/15 bg-white/[0.045] text-white/80";
}

function chairStyle(index: number, capacity: number) {
  const side = index % 4;
  const positionIndex = Math.floor(index / 4);
  const countOnSide = Math.ceil(Math.max(0, capacity - side) / 4);
  const pct = `${((positionIndex + 1) / (countOnSide + 1)) * 100}%`;
  if (side === 0) return { left: pct, top: "1px", transform: "translate(-50%, -50%)" };
  if (side === 1) return { right: "1px", top: pct, transform: "translate(50%, -50%)" };
  if (side === 2) return { left: pct, bottom: "1px", transform: "translate(-50%, 50%)" };
  return { left: "1px", top: pct, transform: "translate(-50%, -50%)" };
}

function TableDrop({ resource, reservations, dragging, onSelect }: { resource: any; reservations: any[]; dragging: any; onSelect: (reservation: any) => void }) {
  const state = getFloorSnapshotState(resource, reservations);
  const capacity = Math.max(1, Number(resourceCapacity(resource) || 1));
  const name = resourceName(resource);
  const partySize = Math.max(1, Number(dragging?.party_size || 1));
  const validFit = !dragging || capacity >= partySize;
  const canDrop = Boolean(dragging && validFit && (state.available || state.reservation?.id === dragging.id));
  const { isOver, setNodeRef } = useDroppable({
    id: `resource:${resource.id || resource.layout_item_id || name}`,
    data: { kind: "resource", resource, canDrop },
    disabled: Boolean(dragging && !canDrop),
  });
  const turn = state.reservation?.seated_at ? (() => {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(state.reservation.seated_at).getTime()) / 60000));
    return Number.isFinite(elapsed) ? `${elapsed}m` : null;
  })() : null;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => state.reservation && onSelect(state.reservation)}
      title={`${name} · ${capacity} seats · ${state.status}`}
      className={`relative flex h-[82px] w-[96px] shrink-0 items-center justify-center rounded-xl border transition-all ${statusClass(state.status)} ${
        dragging ? canDrop ? "ring-1 ring-emerald-400/45" : "opacity-35" : ""
      } ${isOver && canDrop ? "scale-105 ring-2 ring-emerald-300 shadow-[0_0_28px_rgba(52,211,153,0.22)]" : ""}`}
    >
      {Array.from({ length: Math.min(capacity, 16) }).map((_, index) => (
        <span key={index} aria-hidden="true" className="absolute h-2 w-2 rounded-[2px] border border-current/50 bg-current/30" style={chairStyle(index, Math.min(capacity, 16))} />
      ))}
      <span className="absolute inset-x-[14px] inset-y-[13px] flex flex-col items-center justify-center rounded-lg border border-current/35 bg-[#050607]/80 px-1">
        <strong className="max-w-full truncate text-[11px] font-black text-white">{name}</strong>
        <span className="mt-0.5 max-w-full truncate text-[8px] font-black uppercase tracking-[0.05em] opacity-80">
          {state.reservation ? getReservationGuestName(state.reservation).split(" ")[0] : state.status === "Open" ? "Open" : state.status}
        </span>
        {turn ? <span className="text-[8px] font-black text-white/55">{turn}</span> : null}
      </span>
    </button>
  );
}

function BarSeatDrop({ parent, seatNumber, reservations, dragging, onSelect }: { parent: any; seatNumber: number; reservations: any[]; dragging: any; onSelect: (reservation: any) => void }) {
  const name = resourceName(parent);
  const type = normalizedType(parent).startsWith("counter") ? "counter_seat" : "bar_seat";
  const resource = {
    item_name: `${name} Seat ${seatNumber}`,
    item_type: type,
    capacity: 1,
    capacity_max: 1,
    location_id: parent.location_id,
  };
  const state = getFloorSnapshotState(resource, reservations);
  const canDrop = Boolean(dragging && (state.available || state.reservation?.id === dragging.id));
  const { isOver, setNodeRef } = useDroppable({
    id: `bar:${name}:${seatNumber}`,
    data: { kind: "resource", resource, canDrop },
    disabled: Boolean(dragging && !canDrop),
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => state.reservation && onSelect(state.reservation)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition ${statusClass(state.status)} ${
        dragging ? canDrop ? "ring-1 ring-emerald-400/50" : "opacity-30" : ""
      } ${isOver && canDrop ? "scale-110 ring-2 ring-emerald-300" : ""}`}
      title={`${resource.item_name} · ${state.status}`}
    >
      {seatNumber}
    </button>
  );
}

function DraggableGuest({ item, kind = "reservation", selected, onClick }: { item: any; kind?: "reservation" | "waitlist"; selected?: boolean; onClick?: () => void }) {
  const id = kind === "waitlist" ? `waitlist:${item.id}` : `reservation:${item.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { kind, item } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const name = kind === "waitlist" ? item.contact_name || item.customer_name || "Walk-in guest" : getReservationGuestName(item);
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={`w-full touch-none rounded-xl border px-3 py-2.5 text-left transition ${
        selected ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.065]"
      } ${isDragging ? "z-50 opacity-30" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{name}</p>
          <p className="mt-0.5 truncate text-[10px] font-bold text-white/45">
            {kind === "waitlist" ? "Waitlist" : formatReservationTime(item.reservation_time)}
            {item.bookable_item_name ? ` · ${item.bookable_item_name}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-black text-white/70">
          {Math.max(1, Number(item.party_size || 1))}
        </span>
      </div>
    </button>
  );
}

function ServiceMetric({ label, value, warning }: { label: string; value: string | number; warning?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warning ? "border-[#e1062a]/35 bg-[#e1062a]/10" : "border-white/10 bg-white/[0.035]"}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${warning ? "text-[#ff8aa0]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function StaffSwitcher({ locationId, staff, session, onChanged }: { locationId: string; staff: any[]; session: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify() {
    if (!selected || !/^\d{4,6}$/.test(pin)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_pin", locationId, staffProfileId: selected.id, pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      setOpen(false); setSelected(null); setPin(""); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  async function logout() {
    await fetch("/api/v1/reserve/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout", locationId }) });
    onChanged();
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-black text-white">
          {session?.profile?.display_name || "Staff sign in"}
        </button>
        {session ? <button type="button" onClick={logout} title="Sign out staff" className="rounded-full border border-white/10 p-2 text-white/50 hover:text-white"><LogOut size={14} /></button> : null}
      </div>
      {open ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Quick switch</p><h2 className="mt-1 text-xl font-black">Who is using this device?</h2></div><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {staff.filter((person) => person.can_quick_switch !== false).map((person) => (
                <button key={person.id} type="button" onClick={() => { setSelected(person); setPin(""); setError(""); }} className={`rounded-xl border p-3 text-left ${selected?.id === person.id ? "border-[#e1062a]/60 bg-[#e1062a]/12" : "border-white/10 bg-white/[0.035]"}`}>
                  <p className="text-sm font-black">{person.display_name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">{String(person.role || "staff").replaceAll("_", " ")}</p>
                </button>
              ))}
            </div>
            {selected ? <div className="mt-4"><label className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">4–6 digit PIN</label><input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && void verify()} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-[#e1062a]/70" />{error ? <p className="mt-2 text-xs font-bold text-[#ff8aa0]">{error}</p> : null}<button disabled={busy || !/^\d{4,6}$/.test(pin)} onClick={verify} className="mt-3 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Signing in…" : "Sign in"}</button></div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function ReserveEnterpriseHostView({ initialLocationId = "" }: { initialLocationId?: string }) {
  const searchParams = useSearchParams();
  const locationId = initialLocationId || clean(searchParams.get("adminLocationId")) || clean(searchParams.get("locationId"));
  const date = clean(searchParams.get("date")) || localDate();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [railMode, setRailMode] = useState<"arriving" | "waitlist" | "seated">("arriving");
  const [railOpen, setRailOpen] = useState(true);
  const [floorFocus, setFloorFocus] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [dragging, setDragging] = useState<any>(null);
  const [dragKind, setDragKind] = useState<"reservation" | "waitlist" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [threadRefresh, setThreadRefresh] = useState(0);
  const [staffData, setStaffData] = useState<any>({ staff: [], session: null });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const loadStaff = useCallback(async () => {
    if (!locationId) return;
    try {
      const response = await fetch(`/api/v1/reserve/staff?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setStaffData(data);
    } catch { /* service stays usable without staff quick-switch */ }
  }, [locationId]);

  const load = useCallback(async (silent = false) => {
    if (!locationId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v1/reserve/host/snapshot?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Host View.");
      setSnapshot(data); setError(""); setOffline(false); setLastSync(data.generatedAt || new Date().toISOString());
      try { localStorage.setItem(cacheKey(locationId, date), JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch {}
      if (data.settings?.floor_focus_default) setFloorFocus(true);
    } catch (err) {
      let restored = false;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(locationId, date)) || "null");
        if (cached?.data) { setSnapshot(cached.data); setLastSync(cached.savedAt || cached.data.generatedAt || null); setOffline(true); restored = true; }
      } catch {}
      setError(restored ? "Offline — showing the last synchronized service snapshot. Seating changes are paused until connection returns." : err instanceof Error ? err.message : "Unable to load Host View.");
    } finally { setLoading(false); }
  }, [locationId, date]);

  useEffect(() => { void load(false); void loadStaff(); }, [load, loadStaff]);
  useEffect(() => {
    const online = () => void load(true);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load]);
  useEffect(() => {
    if (!locationId || offline) return;
    const timer = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(timer);
  }, [locationId, offline, load]);

  const reservations = snapshot?.reservations || [];
  const waitlist = snapshot?.waitlist || [];
  const resources = snapshot?.resources || [];
  const activeReservations = reservations.filter((r: any) => ACTIVE.has(String(r.status || "").toLowerCase()));
  const arriving = activeReservations.filter((r: any) => !["seated", "occupied"].includes(String(r.status || "").toLowerCase()));
  const seated = activeReservations.filter((r: any) => ["seated", "occupied"].includes(String(r.status || "").toLowerCase()));
  const seatedCovers = seated.reduce((sum: number, r: any) => sum + Math.max(1, Number(r.party_size || 1)), 0);
  const arrivingCovers = arriving.reduce((sum: number, r: any) => sum + Math.max(1, Number(r.party_size || 1)), 0);
  const tableResources = resources.filter((r: any) => !isBarResource(r));
  const barResources = resources.filter((r: any) => isBarResource(r));

  async function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as any;
    const overData = event.over?.data.current as any;
    setDragging(null); setDragKind(null);
    if (!activeData?.item || !overData?.resource || !overData?.canDrop || offline) return;
    const item = activeData.item;
    const resource = overData.resource;
    setBusy(true); setError("");
    try {
      const endpoint = activeData.kind === "waitlist" ? "/api/v1/reserve/host/seat-waitlist" : "/api/v1/reserve/host/assign";
      const payload = activeData.kind === "waitlist" ? {
        locationId,
        waitlistId: item.id,
        resourceId: resource.id || resource.layout_item_id || null,
        resourceLabel: resourceName(resource),
      } : {
        locationId,
        reservationId: item.id,
        resource_id: resource.id || resource.layout_item_id || null,
        resource_label: resourceName(resource),
        seat_after_assign: true,
      };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to seat this guest.");
      setSelected(data.reservation || item);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to seat this guest."); }
    finally { setBusy(false); }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as any;
    setDragging(data?.item || null); setDragKind(data?.kind || null);
  }

  async function sendMessage(text = message) {
    if (!selected || !text.trim() || offline) return;
    setMessageBusy(true); setError("");
    try {
      const channel = selected.customer_phone ? "sms" : "email";
      const response = await fetch("/api/reserve/portal/reservations/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservation_id: selected.id, location_id: selected.location_id || locationId, channel, message: text.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to message this guest.");
      setMessage(""); setThreadRefresh((value) => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to message this guest."); }
    finally { setMessageBusy(false); }
  }

  if (!locationId) return <div className="p-8 text-sm font-bold text-white/60">Choose a location to open Host View.</div>;
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={() => { setDragging(null); setDragKind(null); }} onDragEnd={(event) => void handleDragEnd(event)}>
      <main className="min-h-[calc(100vh-48px)] bg-[#050607] text-white">
        <div className="sticky top-12 z-50 border-b border-white/10 bg-[#07090d]/95 px-3 py-2 backdrop-blur-xl sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => setRailOpen((value) => !value)} className="rounded-full border border-white/10 p-2 text-white/65 hover:text-white">{railOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>
              <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Live service</p><p className="truncate text-sm font-black">{date} · Host floor</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ServiceMetric label="Seated" value={`${seated.length} · ${seatedCovers}`} />
              <ServiceMetric label="Arriving" value={`${arriving.length} · ${arrivingCovers}`} />
              <ServiceMetric label="Waiting" value={waitlist.length} />
              <ServiceMetric label="Attention" value={snapshot?.attention?.length || 0} warning={Boolean(snapshot?.attention?.length)} />
              <button type="button" onClick={() => setFloorFocus((value) => !value)} className={`rounded-xl border p-2.5 ${floorFocus ? "border-[#e1062a]/50 bg-[#e1062a]/12 text-[#ff8aa0]" : "border-white/10 bg-white/[0.04] text-white/65"}`} title="Floor focus">{floorFocus ? <Minimize2 size={15} /> : <Expand size={15} />}</button>
              <button type="button" disabled={loading} onClick={() => void load(false)} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-white/65 disabled:opacity-40" title="Refresh"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
              <StaffSwitcher locationId={locationId} staff={staffData.staff || []} session={staffData.session} onChanged={() => void loadStaff()} />
            </div>
          </div>
          {error ? <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold ${offline ? "border-amber-300/30 bg-amber-400/10 text-amber-100" : "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff9bad]"}`}>{error}</div> : null}
        </div>

        <div className={`grid min-h-[calc(100vh-116px)] ${floorFocus || !railOpen ? "grid-cols-1" : "lg:grid-cols-[300px_minmax(0,1fr)]"}`}>
          {!floorFocus && railOpen ? (
            <aside className="border-r border-white/10 bg-[#080a0d] p-3">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
                {(["arriving", "waitlist", "seated"] as const).map((mode) => <button key={mode} onClick={() => setRailMode(mode)} className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.06em] ${railMode === mode ? "bg-[#e1062a] text-white" : "text-white/45 hover:text-white"}`}>{mode}</button>)}
              </div>
              <div className="mt-3 max-h-[calc(100vh-185px)] space-y-2 overflow-y-auto pr-1">
                {railMode === "arriving" ? arriving.map((item: any) => <DraggableGuest key={item.id} item={item} selected={selected?.id === item.id} onClick={() => setSelected(item)} />) : null}
                {railMode === "waitlist" ? waitlist.map((item: any) => <DraggableGuest key={item.id} item={item} kind="waitlist" />) : null}
                {railMode === "seated" ? seated.map((item: any) => <DraggableGuest key={item.id} item={item} selected={selected?.id === item.id} onClick={() => setSelected(item)} />) : null}
                {(railMode === "arriving" && !arriving.length) || (railMode === "waitlist" && !waitlist.length) || (railMode === "seated" && !seated.length) ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs font-bold text-white/35">Nothing here right now.</div> : null}
              </div>
            </aside>
          ) : null}

          <section className="min-w-0 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Floor plan</p><h1 className="mt-1 text-xl font-black">Drag a guest to a table or bar seat</h1></div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/40">{offline ? <><AlertTriangle size={13} /> Offline</> : <><span className="h-2 w-2 rounded-full bg-emerald-400" /> Live</>} {lastSync ? `· ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</div>
            </div>

            {snapshot?.pacing?.warnings?.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{snapshot.pacing.warnings.map((warning: any, index: number) => <div key={`${warning.startMinute}-${warning.windowMinutes}-${index}`} className="shrink-0 rounded-xl border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-2 text-[10px] font-black text-[#ff9bad]"><AlertTriangle size={12} className="mr-1 inline" /> {warning.covers} covers / {warning.windowMinutes}m · limit {warning.limit}</div>)}</div> : null}

            {barResources.length ? <div className="mt-4 space-y-3">{barResources.map((bar: any) => <div key={bar.id || resourceName(bar)} className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025] p-3"><div className="min-w-max"><div className="rounded-t-[24px] border border-white/15 bg-white/[0.07] px-8 py-3 text-center"><p className="text-xs font-black">{resourceName(bar)}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Bar · {resourceCapacity(bar)} seats</p></div><div className="flex gap-2 border-x border-b border-white/10 px-3 py-2">{Array.from({ length: Math.max(1, Number(resourceCapacity(bar) || 1)) }).map((_, index) => <BarSeatDrop key={index} parent={bar} seatNumber={index + 1} reservations={reservations} dragging={dragging} onSelect={setSelected} />)}</div></div></div>)}</div> : null}

            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[#090b0e] p-3 sm:p-4">
              <div className="flex flex-wrap gap-2.5">
                {tableResources.map((resource: any) => <TableDrop key={resource.id || resource.layout_item_id || resourceName(resource)} resource={resource} reservations={reservations} dragging={dragging} onSelect={setSelected} />)}
                {!tableResources.length ? <div className="grid min-h-48 w-full place-items-center rounded-xl border border-dashed border-white/10 text-sm font-bold text-white/35">No dining tables configured.</div> : null}
              </div>
            </div>

            {!floorFocus && snapshot?.serverRanking?.length ? <div className="mt-4 overflow-x-auto"><div className="flex min-w-max gap-2">{snapshot.serverRanking.map((entry: any) => <div key={entry.staff.id} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"><p className="text-xs font-black">{entry.staff.display_name}</p><p className="mt-0.5 text-[9px] font-bold text-white/40">{entry.load.currentCovers} covers · {entry.load.tables} tables · +{entry.load.upcomingCovers} soon</p></div>)}</div></div> : null}
          </section>
        </div>

        {selected ? <div className="fixed inset-y-0 right-0 z-[80] w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#090b0f]/98 p-4 shadow-2xl backdrop-blur-xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Reservation</p><h2 className="mt-1 text-2xl font-black">{getReservationGuestName(selected)}</h2><p className="mt-1 text-xs font-bold text-white/45">{formatReservationTime(selected.reservation_time)} · Party {selected.party_size || 1}{selected.bookable_item_name ? ` · ${selected.bookable_item_name}` : ""}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-full border border-white/10 p-2 text-white/55"><X size={16} /></button></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/35">Status</p><p className="mt-1 text-sm font-black capitalize">{String(selected.status || "confirmed").replaceAll("_", " ")}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/35">Server</p><p className="mt-1 text-sm font-black">{snapshot?.staff?.find((person: any) => person.id === selected.server_staff_profile_id)?.display_name || "Unassigned"}</p></div></div>
          <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Quick message</p><div className="mt-2 flex flex-wrap gap-2">{["Your table is ready. Please check in with the host.", "We’re running about 10 minutes behind. Thank you for your patience.", "Are you still planning to join us?", "Please check in with the host when you arrive."].map((template) => <button key={template} disabled={offline || messageBusy} onClick={() => void sendMessage(template)} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black text-white/70 hover:border-[#e1062a]/40">{template.split(".")[0]}</button>)}</div><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message guest…" className="mt-3 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm font-semibold outline-none placeholder:text-white/25 focus:border-[#e1062a]/60" /><button disabled={offline || messageBusy || !message.trim()} onClick={() => void sendMessage()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><MessageSquare size={14} /> {messageBusy ? "Sending…" : "Send message"}</button></div>
          <ReserveConversationThread reservation={selected} refreshKey={threadRefresh} />
          {snapshot?.events?.some((event: any) => event.reservation_id === selected.id) ? <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Activity</p><div className="mt-2 space-y-2">{snapshot.events.filter((event: any) => event.reservation_id === selected.id).slice(0, 8).map((event: any) => <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><p className="text-xs font-black text-white/80">{String(event.event_type || "Activity").replaceAll("_", " ").replaceAll(".", " · ")}</p><p className="mt-0.5 text-[9px] font-bold text-white/35">{new Date(event.created_at).toLocaleString()}</p></div>)}</div></div> : null}
        </div> : null}

        {busy ? <div className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-white/15 bg-black/90 px-4 py-2 text-xs font-black shadow-2xl"><RefreshCw size={13} className="mr-2 inline animate-spin" /> Updating floor…</div> : null}
      </main>
      <DragOverlay>{dragging ? <div className="w-52 rounded-xl border border-[#e1062a]/45 bg-[#111318] px-3 py-2 shadow-2xl"><p className="text-xs font-black text-white">{dragKind === "waitlist" ? dragging.contact_name || dragging.customer_name : getReservationGuestName(dragging)}</p><p className="mt-1 text-[10px] font-bold text-white/45">Party {dragging.party_size || 1} · release on a highlighted seat</p></div> : null}</DragOverlay>
    </DndContext>
  );
}
