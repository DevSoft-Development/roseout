import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { moderateEventExperienceAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type SubjectType = "event" | "experience";

type ModerationItem = {
  id: string;
  subjectType: SubjectType;
  title: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  locationId: string | null;
  organizationId: string | null;
  status: string;
  searchable: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  isFree?: boolean | null;
  priceMin?: number | null;
  priceMax?: number | null;
  ticketingEnabled?: boolean | null;
  capacity?: number | null;
  durationMinutes?: number | null;
  minPartySize?: number | null;
  maxPartySize?: number | null;
  pricePerPerson?: number | null;
};

const activeCaseStatuses = ["open", "investigating", "awaiting_evidence", "actioned", "appealed"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function words(value: string | null | undefined) {
  if (!value) return "Not provided";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function caseStatus(value: string) {
  const labels: Record<string, string> = {
    open: "Needs review",
    investigating: "Being reviewed",
    awaiting_evidence: "Waiting for creator",
    actioned: "Held by Trust & Safety",
    appealed: "Appeal received",
  };
  return labels[value] || words(value);
}

function priorityLabel(value: string) {
  const labels: Record<string, string> = { low: "Low", medium: "Normal", high: "High", urgent: "Urgent" };
  return labels[value] || words(value);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not provided";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function signalLabel(signal: { signal_type?: string | null; rule_key?: string | null }) {
  const plain: Record<string, string> = {
    event_content_deception: "Event information may be misleading",
    experience_content_deception: "Experience information may be misleading",
    event_material_change: "Important event details changed after publishing",
    experience_material_change: "Important experience details changed after publishing",
    event_ticketing_abuse: "Unusual event ticket or payment activity",
    experience_booking_abuse: "Unusual experience booking or payment activity",
    linked_bad_actor: "Connected to a restricted account",
    report_burst: "Many reports received in a short time",
  };
  return (signal.rule_key && plain[signal.rule_key]) || words(signal.signal_type || signal.rule_key || "warning sign");
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <p className="text-xs font-black uppercase tracking-[.12em] text-white/35">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white/40">{detail}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">{label}</p>
      <p className="mt-1 text-sm font-black text-white/85">{value}</p>
    </div>
  );
}

export default async function EventsExperiencesModerationPage({ searchParams }: { searchParams: Params }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraud);
  const params = await searchParams;
  const notice = (first(params.notice) || "").trim();
  const q = (first(params.q) || "").trim().toLowerCase();
  const typeFilter = (first(params.type) || "all") as "all" | SubjectType;

  const { data: cases, error: casesError } = await supabaseAdmin
    .from("fraud_cases")
    .select("id,case_number,primary_subject_type,primary_subject_id,title,summary,status,priority,risk_score,resolution_notes,opened_at,last_activity_at")
    .in("primary_subject_type", ["event", "experience"])
    .in("status", activeCaseStatuses)
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (casesError) throw casesError;

  const eventIds = (cases || []).filter((item) => item.primary_subject_type === "event").map((item) => item.primary_subject_id);
  const experienceIds = (cases || []).filter((item) => item.primary_subject_type === "experience").map((item) => item.primary_subject_id);

  const [eventsResult, experiencesResult, eventSignalsResult, experienceSignalsResult, eventActionsResult, experienceActionsResult] = await Promise.all([
    eventIds.length
      ? supabaseAdmin.from("events").select("id,title,description,category,image_url,venue_name,address,city,state,location_id,organization_id,status,searchable,starts_at,ends_at,is_free,price_min,price_max,ticketing_enabled,capacity").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    experienceIds.length
      ? supabaseAdmin.from("experiences").select("id,title,description,category,image_url,venue_name,address,city,state,location_id,organization_id,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person").in("id", experienceIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabaseAdmin.from("fraud_signals").select("id,subject_id,rule_key,signal_type,severity,score_delta,observed_at").eq("subject_type", "event").in("subject_id", eventIds).order("observed_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    experienceIds.length
      ? supabaseAdmin.from("fraud_signals").select("id,subject_id,rule_key,signal_type,severity,score_delta,observed_at").eq("subject_type", "experience").in("subject_id", experienceIds).order("observed_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabaseAdmin.from("fraud_actions").select("id,subject_id,action_type,reason,created_at").eq("subject_type", "event").in("subject_id", eventIds).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    experienceIds.length
      ? supabaseAdmin.from("fraud_actions").select("id,subject_id,action_type,reason,created_at").eq("subject_type", "experience").in("subject_id", experienceIds).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [eventsResult, experiencesResult, eventSignalsResult, experienceSignalsResult, eventActionsResult, experienceActionsResult]) {
    if (result.error) throw result.error;
  }

  const eventMap = new Map<string, ModerationItem>((eventsResult.data || []).map((event: any) => [String(event.id), {
    id: String(event.id),
    subjectType: "event",
    title: event.title,
    description: event.description,
    category: event.category,
    imageUrl: event.image_url,
    venueName: event.venue_name,
    address: event.address,
    city: event.city,
    state: event.state,
    locationId: event.location_id ? String(event.location_id) : null,
    organizationId: event.organization_id ? String(event.organization_id) : null,
    status: event.status,
    searchable: Boolean(event.searchable),
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    isFree: event.is_free,
    priceMin: event.price_min === null ? null : Number(event.price_min),
    priceMax: event.price_max === null ? null : Number(event.price_max),
    ticketingEnabled: event.ticketing_enabled,
    capacity: event.capacity,
  }]));

  const experienceMap = new Map<string, ModerationItem>((experiencesResult.data || []).map((experience: any) => [String(experience.id), {
    id: String(experience.id),
    subjectType: "experience",
    title: experience.title,
    description: experience.description,
    category: experience.category,
    imageUrl: experience.image_url,
    venueName: experience.venue_name,
    address: experience.address,
    city: experience.city,
    state: experience.state,
    locationId: experience.location_id ? String(experience.location_id) : null,
    organizationId: experience.organization_id ? String(experience.organization_id) : null,
    status: experience.status,
    searchable: Boolean(experience.searchable),
    durationMinutes: experience.duration_minutes,
    minPartySize: experience.min_party_size,
    maxPartySize: experience.max_party_size,
    pricePerPerson: experience.price_per_person === null ? null : Number(experience.price_per_person),
  }]));

  const allItems = [...eventMap.values(), ...experienceMap.values()];
  const locationIds = [...new Set(allItems.map((item) => item.locationId).filter(Boolean) as string[])];
  const organizationIds = [...new Set(allItems.map((item) => item.organizationId).filter(Boolean) as string[])];

  const [locationsResult, organizationsResult] = await Promise.all([
    locationIds.length
      ? supabaseAdmin.from("locations").select("id,name,city,state").in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    organizationIds.length
      ? supabaseAdmin.from("organizations").select("id,name").in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (locationsResult.error) throw locationsResult.error;
  if (organizationsResult.error) throw organizationsResult.error;

  const locationMap = new Map((locationsResult.data || []).map((row: any) => [String(row.id), row]));
  const organizationMap = new Map((organizationsResult.data || []).map((row: any) => [String(row.id), row]));
  const signals = [...(eventSignalsResult.data || []), ...(experienceSignalsResult.data || [])];
  const actions = [...(eventActionsResult.data || []), ...(experienceActionsResult.data || [])];

  const rows = (cases || []).map((fraudCase: any) => {
    const subjectType = fraudCase.primary_subject_type as SubjectType;
    const item = subjectType === "event" ? eventMap.get(fraudCase.primary_subject_id) : experienceMap.get(fraudCase.primary_subject_id);
    if (!item) return null;
    const location = item.locationId ? locationMap.get(item.locationId) : null;
    const organization = item.organizationId ? organizationMap.get(item.organizationId) : null;
    const creatorName = organization?.name || location?.name || "Creator not identified";
    const itemSignals = signals.filter((signal: any) => signal.subject_id === item.id).slice(0, 10);
    const itemActions = actions.filter((action: any) => action.subject_id === item.id).slice(0, 8);
    return { fraudCase, item, location, organization, creatorName, itemSignals, itemActions };
  }).filter(Boolean) as Array<any>;

  const filteredRows = rows.filter((row) => {
    if (typeFilter !== "all" && row.item.subjectType !== typeFilter) return false;
    if (!q) return true;
    const haystack = [row.item.title, row.creatorName, row.item.venueName, row.item.city, row.fraudCase.summary, row.fraudCase.title].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const eventCount = rows.filter((row) => row.item.subjectType === "event").length;
  const experienceCount = rows.filter((row) => row.item.subjectType === "experience").length;
  const waitingCount = rows.filter((row) => row.fraudCase.status === "awaiting_evidence").length;
  const urgentCount = rows.filter((row) => row.fraudCase.priority === "urgent" || Number(row.fraudCase.risk_score) >= 85).length;
  const canModerate = canAdmin(admin.role, "fraudEnforce");

  return (
    <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Trust & Safety</p>
            <h1 className="mt-2 text-3xl font-black">Events & Experiences Moderation</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/50">
              Review events and experiences that TheOutHaven has temporarily held. Open any card to see the full submission, why it was held, and the available decision.
            </p>
          </div>
          <Link href="/admin/dashboard/fraud" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-black text-white/70 hover:border-white/25 hover:text-white">
            Open Fraud & Safety
          </Link>
        </div>

        {notice ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">{notice}</div>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Held for review" value={rows.length} detail="All events and experiences currently in moderation" />
          <Metric label="Events" value={eventCount} detail="Held event submissions" />
          <Metric label="Experiences" value={experienceCount} detail="Held experience submissions" />
          <Metric label="Needs attention" value={urgentCount} detail={`${waitingCount} waiting for creator details`} />
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
          <p className="font-black">How moderation works</p>
          <div className="mt-3 grid gap-3 text-sm font-semibold leading-5 text-white/55 md:grid-cols-3">
            <p><span className="mr-2 font-black text-white">1.</span>Open a held event or experience and review the submission.</p>
            <p><span className="mr-2 font-black text-white">2.</span>Read why TheOutHaven held it and check the warning signs.</p>
            <p><span className="mr-2 font-black text-white">3.</span>Approve it, deny it, or ask the creator for more information.</p>
          </div>
        </section>

        <form className="mt-5 flex flex-wrap gap-2">
          <input name="q" defaultValue={first(params.q) || ""} placeholder="Search title, creator, venue, or city" className="min-w-64 flex-1 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold outline-none placeholder:text-white/25 focus:border-[#ff2142]/60" />
          <select name="type" defaultValue={typeFilter} aria-label="Submission type" className="rounded-xl border border-white/10 bg-black p-3 text-sm font-bold">
            <option value="all">Events & experiences</option>
            <option value="event">Events only</option>
            <option value="experience">Experiences only</option>
          </select>
          <button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Search</button>
          {(q || typeFilter !== "all") ? <Link href="/admin/dashboard/events-experiences/moderation" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black">Clear</Link> : null}
        </form>

        <section className="mt-6 space-y-3">
          {filteredRows.map(({ fraudCase, item, creatorName, itemSignals, itemActions }) => {
            const locationLine = [item.venueName, item.address, item.city, item.state].filter(Boolean).join(" · ");
            const price = item.subjectType === "event"
              ? item.isFree ? "Free" : item.priceMin === item.priceMax ? money(item.priceMin) : `${money(item.priceMin)} – ${money(item.priceMax)}`
              : `${money(item.pricePerPerson)} per person`;

            return (
              <details key={fraudCase.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] open:border-white/20 open:bg-white/[.05]">
                <summary className="cursor-pointer list-none p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[.12em]">
                        <span className="rounded-full bg-[#e1062a]/15 px-3 py-1 text-[#ff5570]">{item.subjectType === "event" ? "Event" : "Experience"}</span>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-white/55">{caseStatus(fraudCase.status)}</span>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-white/55">{priorityLabel(fraudCase.priority)} priority</span>
                      </div>
                      <h2 className="mt-3 text-xl font-black">{item.title}</h2>
                      <p className="mt-1 text-sm font-semibold text-white/45">{creatorName}{locationLine ? ` · ${locationLine}` : ""}</p>
                      <p className="mt-3 line-clamp-2 max-w-4xl text-sm leading-6 text-white/50">{fraudCase.summary || fraudCase.title || "The submission needs an admin review before it can be public."}</p>
                      <p className="mt-3 text-xs font-black text-white/65 group-open:hidden">Click to review submission ↓</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-3xl font-black">{fraudCase.risk_score}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-white/35">Concern score</p>
                      <p className="mt-2 text-xs font-semibold text-white/35">Case #{fraudCase.case_number}</p>
                    </div>
                  </div>
                </summary>

                <div className="border-t border-white/10 p-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail label="Current status" value={words(item.status)} />
                    <Detail label="Creator" value={creatorName} />
                    <Detail label="Category" value={item.category || "Not provided"} />
                    <Detail label="Price" value={price} />
                    {item.subjectType === "event" ? <Detail label="Starts" value={dateTime(item.startsAt)} /> : <Detail label="Duration" value={item.durationMinutes ? `${item.durationMinutes} minutes` : "Not provided"} />}
                    {item.subjectType === "event" ? <Detail label="Ends" value={dateTime(item.endsAt)} /> : <Detail label="Party size" value={item.minPartySize && item.maxPartySize ? `${item.minPartySize}–${item.maxPartySize} people` : "Not provided"} />}
                    {item.subjectType === "event" ? <Detail label="Capacity" value={item.capacity || "Not provided"} /> : <Detail label="Visibility" value={item.searchable ? "Public" : "Not public"} />}
                    {item.subjectType === "event" ? <Detail label="Ticketing" value={item.ticketingEnabled ? "TheOutHaven ticketing" : "No internal ticketing"} /> : <Detail label="Venue" value={item.venueName || "Not provided"} />}
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
                    <div className="space-y-5">
                      <section>
                        <h3 className="text-sm font-black">Submission details</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/55">{item.description || "The creator did not add a description."}</p>
                        {locationLine ? <p className="mt-2 text-xs font-semibold text-white/35">Where: {locationLine}</p> : null}
                        {item.imageUrl ? <a href={item.imageUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-[#ff5570] hover:underline">Open submitted image ↗</a> : null}
                      </section>

                      <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <h3 className="text-sm font-black">Why this is being held</h3>
                        <p className="mt-2 text-sm leading-6 text-white/55">{fraudCase.summary || fraudCase.title || "The automated safety system found activity that needs a person to review it."}</p>
                        <div className="mt-3 space-y-2">
                          {itemSignals.length ? itemSignals.map((signal: any) => (
                            <div key={signal.id} className="rounded-lg bg-white/[.04] p-3">
                              <p className="text-xs font-black">{signalLabel(signal)}</p>
                              <p className="mt-1 text-[11px] font-semibold text-white/35">Added {signal.score_delta} concern points · {dateTime(signal.observed_at)}</p>
                            </div>
                          )) : <p className="text-xs font-semibold text-white/35">No individual warning signs are available for this case.</p>}
                        </div>
                      </section>

                      {itemActions.length ? (
                        <section>
                          <h3 className="text-sm font-black">Recent Trust & Safety activity</h3>
                          <div className="mt-2 space-y-2">
                            {itemActions.map((action: any) => (
                              <div key={action.id} className="rounded-lg border border-white/10 p-3">
                                <p className="text-xs font-black">{words(action.action_type)}</p>
                                <p className="mt-1 text-xs leading-5 text-white/45">{action.reason}</p>
                                <p className="mt-1 text-[11px] font-semibold text-white/30">{dateTime(action.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>

                    <aside className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <h3 className="text-lg font-black">Make a decision</h3>
                      <p className="mt-1 text-xs font-semibold leading-5 text-white/40">Approve publishes the submission. Deny keeps it off TheOutHaven. Ask for more details keeps it held and contacts the creator.</p>

                      {canModerate ? (
                        <form action={moderateEventExperienceAction} className="mt-4 space-y-3">
                          <input type="hidden" name="caseId" value={fraudCase.id} />
                          <input type="hidden" name="subjectId" value={item.id} />
                          <input type="hidden" name="subjectType" value={item.subjectType} />
                          <label className="block text-xs font-bold text-white/50">
                            Note to creator
                            <textarea name="note" placeholder="Optional for approval. Required when denying or asking for more details." className="mt-1 min-h-28 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25" />
                          </label>
                          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                            <button name="decision" value="approve" className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-black">Approve</button>
                            <button name="decision" value="request_details" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100">Ask for details</button>
                            <button name="decision" value="deny" className="rounded-xl border border-[#ff5570]/30 bg-[#ff5570]/10 px-4 py-3 text-sm font-black text-[#ff8da0]">Deny</button>
                          </div>
                          <p className="text-[11px] font-semibold leading-5 text-white/30">These actions update the real event or experience and are recorded in the Trust & Safety case history.</p>
                        </form>
                      ) : (
                        <div className="mt-4 rounded-xl border border-white/10 p-4 text-sm font-semibold leading-6 text-white/45">Your admin role can review moderation details but cannot approve, deny, or request changes.</div>
                      )}
                    </aside>
                  </div>
                </div>
              </details>
            );
          })}

          {!filteredRows.length ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <p className="font-black">Nothing is waiting in this moderation view.</p>
              <p className="mt-1 text-sm font-semibold text-white/40">When an event or experience is held for Trust & Safety review, it will appear here automatically.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
