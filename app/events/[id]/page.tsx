import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatEventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function priceLabel(event: { is_free: boolean; price_min: number | null; price_max: number | null; currency: string | null }) {
  if (event.is_free) return "Free";
  if (event.price_min == null && event.price_max == null) return null;
  const currency = event.currency || "USD";
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  if (event.price_min != null && event.price_max != null && event.price_min !== event.price_max) {
    return `${formatter.format(event.price_min)} – ${formatter.format(event.price_max)}`;
  }
  return formatter.format(event.price_min ?? event.price_max ?? 0);
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id,title,description,category,subcategory,venue_name,address,city,state,zip_code,starts_at,ends_at,timezone,all_day,price_min,price_max,currency,is_free,external_url,image_url,status,searchable")
    .eq("id", id)
    .eq("searchable", true)
    .in("status", ["scheduled", "postponed"])
    .maybeSingle();

  if (error || !event) notFound();
  const effectiveEnd = new Date(event.ends_at ?? event.starts_at).getTime();
  if (!Number.isFinite(effectiveEnd) || effectiveEnd < Date.now()) notFound();

  const venueAddress = [event.address, event.city, event.state, event.zip_code].filter(Boolean).join(", ");
  const price = priceLabel(event);

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/create" className="text-sm font-medium text-red-400 hover:text-red-300">
          ← Find another outing
        </Link>

        <article className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#111] shadow-2xl">
          {event.image_url ? (
            <div
              className="h-64 w-full bg-cover bg-center sm:h-80"
              style={{ backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.08)), url(${JSON.stringify(event.image_url).slice(1, -1)})` }}
              role="img"
              aria-label={event.title}
            />
          ) : null}

          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_18rem]">
            <div>
              <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-400">
                <span>Event</span>
                {event.category ? <span>• {event.category.replaceAll("_", " ")}</span> : null}
                {event.status === "postponed" ? <span>• Postponed</span> : null}
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>
              {event.description ? <p className="mt-5 whitespace-pre-line text-base leading-7 text-white/70">{event.description}</p> : null}
            </div>

            <aside className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="text-white/45">When</dt>
                  <dd className="mt-1 font-medium">{event.all_day ? formatEventDate(event.starts_at, event.timezone).replace(/ at .*/, "") : formatEventDate(event.starts_at, event.timezone)}</dd>
                </div>
                {event.venue_name || venueAddress ? (
                  <div>
                    <dt className="text-white/45">Where</dt>
                    <dd className="mt-1 font-medium">{event.venue_name || venueAddress}</dd>
                    {event.venue_name && venueAddress ? <dd className="mt-1 text-white/55">{venueAddress}</dd> : null}
                  </div>
                ) : null}
                {price ? (
                  <div>
                    <dt className="text-white/45">Price</dt>
                    <dd className="mt-1 font-medium">{price}</dd>
                  </div>
                ) : null}
              </dl>

              {event.external_url ? (
                <a
                  href={event.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 block rounded-xl bg-red-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-red-500"
                >
                  View event details
                </a>
              ) : null}
            </aside>
          </div>
        </article>
      </div>
    </main>
  );
}
