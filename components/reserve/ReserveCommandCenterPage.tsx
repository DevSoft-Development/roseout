"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, QrCode, RefreshCw, UserPlus } from "lucide-react";
import AdminActingAsLocationBanner from "@/components/admin/AdminActingAsLocationBanner";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import ReserveCommandCenterShell from "@/components/reserve/ReserveCommandCenterShell";
import ReserveMetricCard from "@/components/reserve/ReserveMetricCard";
import ReserveTimeline from "@/components/reserve/ReserveTimeline";
import ReserveFloorSnapshot from "@/components/reserve/ReserveFloorSnapshot";
import ReserveGuestDetails from "@/components/reserve/ReserveGuestDetails";
import ReserveWaitlistPanel from "@/components/reserve/ReserveWaitlistPanel";
import ReserveHumanMessage from "@/components/reserve/ReserveHumanMessage";
import ReserveQuickActionButton from "@/components/reserve/ReserveQuickActionButton";
import ReserveEmptyState from "@/components/reserve/ReserveEmptyState";
import { getReservationStatusLabel } from "@/lib/reservations/ui";
import { formatShortDate } from "@/lib/reservations/reservationFormatting";
import { getReserveBookingUrl, getReserveDashboardUrl, getReserveEmbedUrl, getReserveQrUrl } from "@/lib/reservations/reserveLinks";
import { getFloorSnapshotState, resourceCapacity, resourceId, resourceName } from "@/lib/reservations/floorSnapshot";

type ReservationStatus = "pending"|"confirmed"|"checked_in"|"arrived"|"seated"|"waitlisted"|"declined"|"cancelled"|"completed"|"no_show";
type Reservation = Record<string, any> & { id:string; status:ReservationStatus; reservation_date:string; reservation_time:string; customer_name?:string; party_size?:number; location_id:string; location_type:string };
const statusTabs = ["all","pending","confirmed","checked_in","seated","completed","cancelled","no_show"];
const validTabs = new Set(["today","calendar","floor","guests","waitlist","settings"]);
function todayKey(date = new Date()) { return date.toISOString().split("T")[0]; }
function normalizeType(value: string | null) { const type = String(value || "restaurant").toLowerCase(); return type === "activities" ? "activity" : type; }
function addDays(dateKeyValue:string, amount:number){ const d=new Date(`${dateKeyValue}T12:00:00`); d.setDate(d.getDate()+amount); return todayKey(d); }
function friendlyError(value: unknown, fallback="We could not load this reservation view.") { return value instanceof Error ? value.message : fallback; }
function hasAssignedResource(r:any){ return Boolean(r?.assigned_resource_id || r?.assigned_layout_item_id || r?.assigned_resource_label || r?.reservable_item_name || r?.bookable_item_id || r?.bookable_item_name); }

export default function ReserveCommandCenterPage(){ return <Suspense fallback={<main className="reserve-command-center min-h-screen p-10">Loading Reserve Command Center…</main>}><ReserveCommandCenterContent /></Suspense>; }

function ReserveCommandCenterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [persistedAdminLocationId, setPersistedAdminLocationId] = useState("");
  const adminLocationId = searchParams.get("adminLocationId") || persistedAdminLocationId;
  const locationId = adminLocationId || searchParams.get("locationId") || "";
  const locationType = normalizeType(searchParams.get("type"));
  const [activeTab, setActiveTab] = useState(validTabs.has(searchParams.get("tab") || "") ? searchParams.get("tab") || "today" : "today");
  const [activeSection, setActiveSection] = useState(searchParams.get("section") || "");
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") || todayKey());
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState<{tone:"success"|"error"|"warning"|"info"; text:string} | null>(null);
  const [adminSummary, setAdminSummary] = useState<any>(null);
  const [modal, setModal] = useState<"reservation"|"walkin"|"waitlist"|null>(null);
  const [assigningReservationId, setAssigningReservationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loadInFlight = useRef(false);

  function dashboardHref(tab = activeTab, section?: string){ return getReserveDashboardUrl(tab, section, { adminLocationId: adminLocationId||undefined, locationId: !adminLocationId?locationId:undefined, type: locationType, date:selectedDate }); }
  function actionContext(){ return { adminLocationId: adminLocationId || undefined, type: locationType }; }
  function switchTab(tab:string){ if(!validTabs.has(tab)) tab="today"; setActiveTab(tab); router.replace(dashboardHref(tab), { scroll:false }); }

  async function loadAll(options: { silent?: boolean } = {}){
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!options.silent) setLoading(true);
    if (!options.silent) setMessage(null);
    try {
      const params = new URLSearchParams({ filter:"upcoming" }); if(locationId){ params.set("locationId", locationId); params.set("type", locationType); if(adminLocationId) params.set("adminLocationId", adminLocationId); }
      const res = await fetch(`/api/reserve/portal/reservations?${params}`); const data = await res.json(); if(!res.ok) throw new Error(data.error || "Unable to load reservations.");
      const all = (data.reservations || []) as Reservation[]; setReservations(all);
      const rParams = new URLSearchParams({ locationId, date:selectedDate }); if(adminLocationId) rParams.set("adminLocationId", adminLocationId);
      if(locationId){
        const [resourceResponse, waitlistResponse] = await Promise.allSettled([fetch(`/api/reserve/portal/resources?${rParams}`), fetch(`/api/reservations/waitlist?${rParams}`)]);
        if(resourceResponse.status === "fulfilled"){ const rd=await resourceResponse.value.json(); setResources(resourceResponse.value.ok ? (rd.resources||[]) : []); }
        if(waitlistResponse.status === "fulfilled"){ const wd=await waitlistResponse.value.json(); setWaitlist(waitlistResponse.value.ok ? (wd.waitlist||[]) : []); }
      }
    setLastUpdated(new Date());
    } catch (error) { if (!options.silent) setMessage({ tone:"error", text:friendlyError(error) }); }
    finally { loadInFlight.current = false; if (!options.silent) setLoading(false); }
  }

  async function updateStatus(reservation:Reservation, status:string){
    if(status === "seated" && !(reservation.assigned_resource_id || reservation.assigned_layout_item_id || reservation.assigned_resource_label || reservation.reservable_item_name)){ setSelectedId(reservation.id); setAssigningReservationId(reservation.id); setMessage({ tone:"warning", text:"Choose a table before seating this guest." }); return; }
    if(["cancelled","no_show","declined"].includes(status) && !window.confirm(`Mark this reservation as ${getReservationStatusLabel(status)}?`)) return;
    setUpdatingId(reservation.id); setMessage(null);
    try { const response = await fetch("/api/reserve/portal/reservations/update", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reservation_id: reservation.id, location_id: reservation.location_id, location_type: reservation.location_type, status, adminLocationId: adminLocationId || undefined }) }); const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not update this reservation. Please try again."); setReservations((prev)=>prev.map((r)=>r.id===reservation.id?data.reservation:r)); setSelectedId(reservation.id); setMessage({ tone:"success", text: status === "confirmed" ? "Reservation confirmed." : status === "checked_in" ? "Guest checked in." : status === "seated" ? "Guest seated." : status === "completed" ? "Reservation completed." : `Reservation marked ${getReservationStatusLabel(status)}.` }); await loadAll(); }
    catch(error){ setMessage({ tone:"error", text:friendlyError(error, `This reservation cannot move from ${getReservationStatusLabel(reservation.status)} to ${getReservationStatusLabel(status)}.`) }); }
    finally { setUpdatingId(""); }
  }

  async function assignResource(reservation:Reservation, resource:any){
    const state = getFloorSnapshotState(resource, dayReservations);
    if(!state.available){ setMessage({ tone:"error", text:"That table is already unavailable for this time." }); return; }
    setUpdatingId(reservation.id); setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/assign-resource", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reservation_id: reservation.id, location_id: reservation.location_id, location_type: reservation.location_type, resource_id: resourceId(resource), adminLocationId: adminLocationId || undefined }) });
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not assign this table. Please try another table.");
      setReservations((prev)=>prev.map((r)=>r.id===reservation.id?data.reservation:r));
      setSelectedId(reservation.id); setAssigningReservationId(""); setMessage({ tone:"success", text:"Table assigned. You can now seat the guest." }); await loadAll();
    } catch(error){ setMessage({ tone:"error", text:friendlyError(error, "We could not assign this table. Please try another table.") }); }
    finally { setUpdatingId(""); }
  }

  async function sendTableReady(reservation:Reservation){
    if(!hasAssignedResource(reservation)){ setSelectedId(reservation.id); setAssigningReservationId(reservation.id); setMessage({ tone:"warning", text:"Choose a table before sending a table ready text." }); return; }
    if(!reservation.customer_phone){ setMessage({ tone:"warning", text:"Add a phone number before sending a table ready text." }); return; }
    setUpdatingId(reservation.id); setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/reservations/table-ready", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reservation_id: reservation.id, location_id: reservation.location_id, adminLocationId: adminLocationId || undefined }) });
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not send the table ready text.");
      setReservations((prev)=>prev.map((r)=>r.id===reservation.id?{...r, table_ready_sms_sent:true, table_ready_sms_sent_at:data.sms?.sent_at||data.sms?.created_at||new Date().toISOString(), table_ready_sms_status:data.sms?.status||"sent"}:r));
      setSelectedId(reservation.id); setMessage({ tone:"success", text:`Table ready text sent to ${reservation.customer_name||"guest"}.` }); await loadAll({ silent:true });
    } catch(error){ setMessage({ tone:"error", text:friendlyError(error, "We could not send the table ready text.") }); }
    finally { setUpdatingId(""); }
  }

  async function notifyWaitlist(entry:any){
    setUpdatingId(entry.id); setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/layout", { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"notify_waitlist", waitlist_id: entry.id, location_id: locationId, adminLocationId: adminLocationId || undefined }) });
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not send the table offered text.");
      setWaitlist((prev)=>prev.map((item)=>item.id===entry.id?data.waitlist:item));
      setMessage({ tone:"success", text:"Table offered text sent." }); await loadAll({ silent:true });
    } catch(error){ setMessage({ tone:"error", text:friendlyError(error, "We could not send the table offered text.") }); }
    finally { setUpdatingId(""); }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>, kind: "reservation"|"walkin"|"waitlist") {
    event.preventDefault();
    if (!locationId) { setMessage({ tone:"warning", text:"Select a location before creating a reservation." }); return; }
    const form = new FormData(event.currentTarget);
    const guestName = String(form.get("guestName") || "").trim();
    const partySize = Math.max(Number(form.get("partySize") || 2), 1);
    const reservationDate = String(form.get("date") || selectedDate);
    const reservationTime = String(form.get("time") || new Date().toTimeString().slice(0,5)).slice(0,5);
    const notes = String(form.get("notes") || "").trim();
    setSubmitting(true); setMessage(null);
    try {
      if (kind === "waitlist") {
        const response = await fetch("/api/reservations/waitlist", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ location_id: locationId, reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize, contact_name: guestName, contact_email: String(form.get("email") || ""), contact_phone: String(form.get("phone") || ""), notes }) });
        const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not add this guest to the waitlist.");
        setMessage({ tone:"success", text:"Guest added to waitlist." });
      } else {
        const response = await fetch("/api/reserve/portal/reservations", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ location_id: locationId, location_type: locationType, customer_name: kind === "walkin" ? (guestName || "Walk-in Guest") : guestName, customer_email: String(form.get("email") || ""), customer_phone: String(form.get("phone") || ""), party_size: partySize, reservation_date: reservationDate, reservation_time: reservationTime, duration_minutes: Number(form.get("duration") || 90), special_request: notes, source: kind === "walkin" ? "walk_in" : "owner_dashboard", status: kind === "walkin" ? "checked_in" : "confirmed", adminLocationId: adminLocationId || undefined }) });
        const data = await response.json(); if(!response.ok) throw new Error(data.error || "We could not create this reservation.");
        setSelectedId(data.reservation?.id || "");
        setMessage({ tone:"success", text: kind === "walkin" ? "Walk-in added." : "Reservation created." });
      }
      setModal(null); await loadAll();
    } catch(error) { setMessage({ tone:"error", text:friendlyError(error, kind === "waitlist" ? "We could not add this guest to the waitlist." : "We could not create this reservation.") }); }
    finally { setSubmitting(false); }
  }

  useEffect(()=>{ const nextTab = searchParams.get("tab") || "today"; if(validTabs.has(nextTab)) setActiveTab(nextTab); setActiveSection(searchParams.get("section") || ""); const nextDate = searchParams.get("date"); if(nextDate) setSelectedDate(nextDate); const nextStatus = searchParams.get("status"); if(nextStatus) setStatusFilter(nextStatus); }, [searchParams]);
  useEffect(()=>{
    const fromQuery = searchParams.get("adminLocationId") || "";
    if (fromQuery) { window.sessionStorage.setItem("reserveAdminLocationId", fromQuery); setPersistedAdminLocationId(fromQuery); return; }
    const stored = window.sessionStorage.getItem("reserveAdminLocationId") || "";
    if (stored) setPersistedAdminLocationId(stored);
    else setPersistedAdminLocationId("");
  }, [searchParams]);
  useEffect(()=>{ loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [locationId, locationType, adminLocationId, selectedDate]);
  useEffect(()=>{ if(!adminLocationId) return; fetch(`/api/admin/locations/${adminLocationId}/summary`).then(r=>r.json().then(d=>({r,d}))).then(({r,d})=>{ if(r.ok) setAdminSummary(d); }); }, [adminLocationId]);
  useEffect(()=>{
    const timer = window.setInterval(() => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (modal || submitting || updatingId || assigningReservationId || typing) return;
      void loadAll({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [locationId, locationType, adminLocationId, selectedDate, modal, submitting, updatingId, assigningReservationId]);

  const dayReservations = reservations.filter((r)=>r.reservation_date === selectedDate);
  const filtered = dayReservations.filter((r)=> (statusFilter === "all" || r.status === statusFilter) && `${r.customer_name||""} ${r.customer_phone||""} ${r.customer_email||""} ${r.special_request||""}`.toLowerCase().includes(search.toLowerCase()));
  const selected = dayReservations.find((r)=>r.id === selectedId) || dayReservations.find((r)=>!["cancelled","completed","no_show","declined"].includes(r.status)) || dayReservations[0];
  const metrics = { pending: dayReservations.filter(r=>r.status==='pending').length, confirmed: dayReservations.filter(r=>r.status==='confirmed').length, arrived: dayReservations.filter(r=>r.status==='checked_in'||r.status==='arrived').length, seated: dayReservations.filter(r=>r.status==='seated').length, completed: dayReservations.filter(r=>r.status==='completed').length, noShow: dayReservations.filter(r=>r.status==='no_show').length };
  const setupEnabled = Boolean(locationId && (resources.length || dayReservations.length));
  const assigningReservation = dayReservations.find((r)=>r.id===assigningReservationId);
  const locationName = adminSummary?.location?.name || adminSummary?.location?.restaurant_name || "TheOutHaven location";

  const topActions = <><Link className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black" aria-disabled={!locationId} title={locationId ? "Open public booking page" : "Select a location before opening the booking page."} href={getReserveBookingUrl(locationId, locationType) || "#"}>Booking page <ExternalLink className="inline" size={14}/></Link><Link className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black" title={locationId ? "Open embed page" : "Select a location before opening the embed."} href={getReserveEmbedUrl(locationId) || "#"}>Embed</Link><Link className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black" title={locationId ? "Open QR tools" : "QR tools are not configured for this location yet."} href={getReserveQrUrl(locationId) || "#"}><QrCode className="inline" size={14}/> QR Code</Link><button type="button" disabled={!locationId} title={!locationId ? "Select a location before creating a reservation." : undefined} onClick={()=>setModal("reservation")} className="reserve-primary inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-45"><Plus size={14}/> New Reservation</button><button type="button" disabled={!locationId} title={!locationId ? "Select a location before adding a walk-in." : undefined} onClick={()=>setModal("walkin")} className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--reserve-primary)] px-3 text-xs font-black text-[var(--reserve-primary)] disabled:cursor-not-allowed disabled:opacity-45"><UserPlus size={14}/> Walk-in</button></>;

  return <ReserveCommandCenterShell locationName={locationName} locationId={locationId} locationType={locationType} activeTab={activeTab} activeSection={activeSection} onTabChange={switchTab} actions={topActions} setupEnabled={setupEnabled} userLabel={adminLocationId ? "Admin location mode" : "Owner workspace"} actingContext={actionContext()}>

    {assigningReservation && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="reserve-card max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase reserve-muted">Assign table</p><h2 className="mt-1 text-2xl font-black">{assigningReservation.customer_name||"Guest"} · Party {assigningReservation.party_size}</h2><p className="mt-1 text-sm reserve-muted">Unavailable tables are disabled for this reservation time.</p></div><button type="button" onClick={()=>setAssigningReservationId("")} className="reserve-soft rounded-full px-3 py-1 text-sm font-black">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resources.map((resource)=>{const state=getFloorSnapshotState(resource, dayReservations);return <button key={resource.id} type="button" disabled={!state.available || updatingId===assigningReservation.id} onClick={()=>assignResource(assigningReservation, resource)} className="reserve-soft rounded-2xl p-4 text-left disabled:cursor-not-allowed disabled:opacity-50"><p className="text-lg font-black">{resourceName(resource)}</p><p className="text-sm reserve-muted">Capacity {resourceCapacity(resource)||"—"}</p><p className="mt-3 text-xs font-black">{state.status} · {state.available ? "Available" : "Unavailable"}</p>{state.reservation&&<p className="mt-1 truncate text-xs reserve-muted">{state.reservation.customer_name||"Guest"} · Party {state.reservation.party_size||"—"}</p>}</button>})}</div></div></div>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><form onSubmit={(event)=>submitCreate(event, modal)} className="reserve-card w-full max-w-xl rounded-[2rem] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase reserve-muted">{modal === "waitlist" ? "Waitlist" : modal === "walkin" ? "Walk-in" : "New reservation"}</p><h2 className="mt-1 text-2xl font-black">{modal === "waitlist" ? "Add to Waitlist" : modal === "walkin" ? "Add Walk-in" : "Create Reservation"}</h2></div><button type="button" onClick={()=>setModal(null)} className="reserve-soft rounded-full px-3 py-1 text-sm font-black">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Guest name<input name="guestName" required={modal!=="walkin"} placeholder={modal==="walkin"?"Walk-in Guest":"Guest name"} className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label><label className="text-sm font-bold">Party size<input name="partySize" required type="number" min="1" defaultValue="2" className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label>{modal!=="walkin" && <><label className="text-sm font-bold">Phone<input name="phone" placeholder="Phone" className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label><label className="text-sm font-bold">Email<input name="email" type="email" placeholder="Email" className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label></>}<label className="text-sm font-bold">Date<input name="date" type="date" required defaultValue={selectedDate} className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label><label className="text-sm font-bold">Time<input name="time" type="time" required defaultValue={modal==="walkin" ? new Date().toTimeString().slice(0,5) : "19:00"} className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label>{modal==="reservation" && <label className="text-sm font-bold">Duration<input name="duration" type="number" min="15" step="15" defaultValue="90" className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label>}<label className="text-sm font-bold sm:col-span-2">Notes<textarea name="notes" rows={3} placeholder="Optional notes" className="reserve-soft mt-1 w-full rounded-2xl px-4 py-3"/></label></div><button disabled={submitting} className="reserve-primary mt-5 w-full rounded-full px-5 py-3 font-black disabled:opacity-60">{submitting ? "Saving…" : modal === "waitlist" ? "Add to Waitlist" : modal === "walkin" ? "Add Walk-in" : "Create Reservation"}</button></form></div>}
    {adminLocationId && <><AdminActingAsLocationBanner locationId={adminLocationId} locationName={locationName} locationType={locationType} plan={adminSummary?.location?.plan} reservationAccess={adminSummary?.reservationAccess?.plan}/><div className="mb-3"><AdminLocationSearch compact /></div></>}
    {message && <div className="mb-4"><ReserveHumanMessage tone={message.tone}>{message.text}</ReserveHumanMessage></div>}
    {!locationId && <div className="mb-4"><ReserveHumanMessage tone="warning">Select a location to load live reservations, floor resources, booking links, and waitlist data.</ReserveHumanMessage></div>}

    <section className="reserve-card mb-4 rounded-2xl p-3"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-3"><span className="rounded-full bg-[var(--reserve-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--reserve-primary)]">Today</span><h2 className="text-lg font-black">Today, {formatShortDate(new Date(`${selectedDate}T12:00:00`))}</h2></div><div className="flex flex-wrap items-center gap-2"><button className="reserve-soft grid h-9 w-9 place-items-center rounded-full" onClick={()=>setSelectedDate(addDays(selectedDate,-1))} aria-label="Previous day"><ChevronLeft size={16}/></button><button className="reserve-primary h-9 rounded-full px-3 text-xs font-black" onClick={()=>setSelectedDate(todayKey())}>Today</button><button className="reserve-soft grid h-9 w-9 place-items-center rounded-full" onClick={()=>setSelectedDate(addDays(selectedDate,1))} aria-label="Next day"><ChevronRight size={16}/></button><select aria-label="Shift" className="reserve-soft h-9 rounded-full px-3 text-xs font-bold"><option>All shifts</option><option>Dinner</option><option>Lunch</option></select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="reserve-soft h-9 rounded-full px-3 text-xs font-bold"><option value="all">All statuses</option>{statusTabs.slice(1).map(s=><option key={s} value={s}>{getReservationStatusLabel(s)}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guest, phone, email, notes" className="reserve-soft h-9 min-w-[280px] flex-1 rounded-full px-3 text-sm xl:min-w-[320px]"/><button onClick={()=>loadAll()} className="reserve-soft inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-black"><RefreshCw size={14}/> Refresh</button><span className="text-xs reserve-muted">Auto-refresh on · {lastUpdated ? "updated just now" : "waiting"}</span></div></div></section>
    <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><ReserveMetricCard label="Needs action" value={metrics.pending} active={statusFilter==='pending'} onClick={()=>setStatusFilter("pending")}/><ReserveMetricCard label="Ready for arrival" value={metrics.confirmed} active={statusFilter==='confirmed'} onClick={()=>setStatusFilter("confirmed")}/><ReserveMetricCard label="Guest arrived" value={metrics.arrived} active={statusFilter==='checked_in'} onClick={()=>setStatusFilter("checked_in")}/><ReserveMetricCard label="Seated now" value={metrics.seated} active={statusFilter==='seated'} onClick={()=>setStatusFilter("seated")}/><ReserveMetricCard label="Finished" value={metrics.completed} active={statusFilter==='completed'} onClick={()=>setStatusFilter("completed")}/><ReserveMetricCard label="Waitlist" value={waitlist.length} active={activeTab==='waitlist'} onClick={()=>switchTab("waitlist")}/><ReserveMetricCard label="No-shows" value={metrics.noShow} active={statusFilter==='no_show'} onClick={()=>setStatusFilter("no_show")}/></section>
    
    {activeTab === "today" && <div className="grid gap-4 xl:grid-cols-[minmax(430px,0.42fr)_minmax(620px,1fr)]"><section className="reserve-card rounded-2xl p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-black uppercase reserve-muted">Reservation timeline</p><h2 className="text-xl font-black">{filtered.length} bookings</h2></div></div>{loading ? <ReserveEmptyState title="Loading reservations…" message="We’re checking the live reservation list."/> : filtered.length ? <ReserveTimeline reservations={filtered} selectedId={selected?.id} onSelect={(r)=>setSelectedId(r.id)} onStatus={updateStatus} onAssign={(r)=>{setSelectedId(r.id);setAssigningReservationId(r.id);}} onTableReady={sendTableReady} updatingId={updatingId}/> : <ReserveEmptyState title="No reservations for this day." message="New bookings and changes will appear here automatically."/>}</section><div className="space-y-4"><ReserveFloorSnapshot resources={resources} reservations={dayReservations} settingsHref={dashboardHref("settings","layout")} assigningReservation={assigningReservation} onResourceSelect={(resource)=>assigningReservation&&assignResource(assigningReservation,resource)} onReservationSelect={(r)=>setSelectedId(r.id)}/><div className="grid gap-4 2xl:grid-cols-2"><ReserveGuestDetails reservation={selected} onStatus={updateStatus} onAssign={(r)=>{setSelectedId(r.id);setAssigningReservationId(r.id);}} onTableReady={sendTableReady} updatingId={updatingId}/><ReserveWaitlistPanel entries={waitlist} onAdd={()=>setModal("waitlist")} onOffer={notifyWaitlist} onViewAll={()=>switchTab("waitlist")} updatingId={updatingId}/></div></div></div>}
    {activeTab === "floor" && <ReserveFloorSnapshot resources={resources} reservations={dayReservations} settingsHref={dashboardHref("settings","layout")} assigningReservation={assigningReservation} onResourceSelect={(resource)=>assigningReservation&&assignResource(assigningReservation,resource)} onReservationSelect={(r)=>setSelectedId(r.id)}/>} {activeTab === "waitlist" && <ReserveWaitlistPanel entries={waitlist} onAdd={()=>setModal("waitlist")} onOffer={notifyWaitlist} onViewAll={()=>switchTab("waitlist")} updatingId={updatingId}/>} {activeTab === "guests" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Guests</h2><ReserveTimeline reservations={filtered} selectedId={selected?.id} onSelect={(r)=>setSelectedId(r.id)} onStatus={updateStatus} onAssign={(r)=>{setSelectedId(r.id);setAssigningReservationId(r.id);}} onTableReady={sendTableReady} updatingId={updatingId}/></section>} {activeTab === "calendar" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Calendar volume</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from(new Set(reservations.map(r=>r.reservation_date))).slice(0,12).map(d=><button key={d} onClick={()=>{setSelectedDate(d);switchTab('today')}} className="reserve-soft rounded-2xl p-4 text-left"><CalendarDays size={18}/><p className="mt-2 font-black">{d}</p><p className="text-sm reserve-muted">{reservations.filter(r=>r.reservation_date===d).length} reservations</p></button>)}</div></section>} {activeTab === "settings" && <section className="reserve-card rounded-[2rem] p-5"><h2 className="text-2xl font-black">Reservation setup</h2><p className="mt-1 text-sm reserve-muted">Use these setup sections for the selected Reserve location.</p><div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]"><div className="space-y-2">{[["layout","Layout & Tables"],["hours","Hours & Capacity"],["reminders","Reminders"],["deposits","Deposit & Policies"],["booking","Booking page"],["embed","Embed"],["qr","QR code"]].map(([section,label])=><Link key={section} href={dashboardHref("settings", section)} className={`block rounded-2xl px-4 py-3 text-sm font-black ${activeSection === section ? "reserve-primary" : "reserve-soft"}`}>{label}</Link>)}</div><div className="reserve-soft rounded-[1.5rem] p-5">{activeSection === "layout" ? <div><h3 className="text-xl font-black">Layout & Tables</h3>{resources.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{resources.map((resource)=><div key={resource.id} className="rounded-2xl bg-black/10 p-4"><p className="font-black">{resource.label || resource.item_name || "Resource"}</p><p className="text-sm reserve-muted">Capacity {resource.capacity || resource.capacity_max || resource.capacity_min || "—"}</p></div>)}</div> : <p className="mt-3 font-bold">No tables or bookable spaces are set up yet.</p>}<Link href={`/reserve/dashboard/location-layout${locationId ? `?adminLocationId=${encodeURIComponent(locationId)}&type=${encodeURIComponent(locationType)}` : ""}`} className="mt-4 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black">Add tables & spaces</Link></div> : activeSection === "hours" ? <div><h3 className="text-xl font-black">Hours & Capacity</h3><p className="mt-3 font-bold">Reservation hours are not configured here yet. Use the location hours settings.</p><Link href={locationId ? `/admin/dashboard/crm/${encodeURIComponent(locationId)}` : "/admin/dashboard/crm"} className="mt-4 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black">Open location hours settings</Link></div> : activeSection === "reminders" ? <div><h3 className="text-xl font-black">Reminders</h3><p className="mt-3 font-bold">Reservation reminders are handled by the existing reminder system.</p></div> : activeSection === "deposits" ? <div><h3 className="text-xl font-black">Deposit & Policies</h3><p className="mt-3 font-bold">Deposits are not configured for this location yet.</p></div> : activeSection === "booking" ? <div><h3 className="text-xl font-black">Booking page</h3><p className="mt-3 break-all text-sm reserve-muted">{getReserveBookingUrl(locationId, locationType) || "Select a location to generate the booking page link."}</p>{locationId && <div className="mt-4 flex flex-wrap gap-2"><Link href={getReserveBookingUrl(locationId, locationType)} className="reserve-primary rounded-full px-4 py-2 text-sm font-black">Open booking page</Link><button onClick={()=>navigator.clipboard?.writeText(`${window.location.origin}${getReserveBookingUrl(locationId, locationType)}`)} className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black">Copy booking page link</button></div>}</div> : activeSection === "embed" ? <div><h3 className="text-xl font-black">Embed</h3><p className="mt-3 break-all text-sm reserve-muted">{getReserveEmbedUrl(locationId) || "Select a location to generate the embed link."}</p>{locationId && <><code className="mt-4 block overflow-x-auto rounded-2xl bg-black/20 p-4 text-xs">{`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}${getReserveEmbedUrl(locationId)}" title="TheOutHaven reservations"></iframe>`}</code><div className="mt-4 flex flex-wrap gap-2"><Link href={getReserveEmbedUrl(locationId)} className="reserve-primary rounded-full px-4 py-2 text-sm font-black">Open embed</Link><button onClick={()=>navigator.clipboard?.writeText(`${window.location.origin}${getReserveEmbedUrl(locationId)}`)} className="reserve-soft inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs font-black">Copy embed link</button></div></>}</div> : activeSection === "qr" ? <div><h3 className="text-xl font-black">QR code</h3>{getReserveQrUrl(locationId) ? <Link href={getReserveQrUrl(locationId)} className="mt-4 inline-block reserve-primary rounded-full px-4 py-2 text-sm font-black">Open QR tools</Link> : <p className="mt-3 font-bold">QR tools are not configured for this location yet.</p>}</div> : <div><h3 className="text-xl font-black">Settings</h3><p className="mt-3 font-bold">Choose a setup section to manage reservation operations.</p></div>}</div></div></section>}
  </ReserveCommandCenterShell>;
}
