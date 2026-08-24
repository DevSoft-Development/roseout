import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function authorized(req: Request) {
  const received = req.headers.get("x-cron-secret") ?? "";
  const enrichmentSecret =
    Deno.env.get("GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  return (
    (enrichmentSecret && secureCompare(received, enrichmentSecret)) ||
    (cronSecret && secureCompare(received, cronSecret))
  );
}

serve(async (req) => {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const requestedLimit = Number(body.limit ?? body.batchSize ?? 25);
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 25,
    ),
  );
  const staleDays = Math.min(
    90,
    Math.max(1, Number(body.staleDays ?? 30)),
  );
  const force = body.force === true || body.force === "true";

  const googleKey = clean(Deno.env.get("GOOGLE_PLACES_API_KEY"));
  const url =
    clean(Deno.env.get("SUPABASE_URL")) ||
    clean(Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"));
  const service = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!googleKey || !url || !service) {
    return json(
      {
        error: "Missing environment",
        missing: {
          googlePlacesApiKey: !googleKey,
          supabaseUrl: !url,
          serviceRoleKey: !service,
        },
      },
      500,
    );
  }

  const supabase = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();

  let query = supabase
    .from("locations")
    .select(
      "id,name,google_place_id,google_business_status,google_business_status_checked_at,is_searchable,is_hidden",
    )
    .eq("active", true)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .is("duplicate_of", null)
    .not("google_place_id", "is", null)
    .order("google_business_status_checked_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (!force) {
    query = query.or(
      `google_business_status_checked_at.is.null,google_business_status_checked_at.lt.${cutoff}`,
    );
  }

  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 400);

  const counters = {
    scanned: 0,
    operational: 0,
    temporarily_closed: 0,
    permanently_closed: 0,
    future_opening: 0,
    unspecified: 0,
    failed: 0,
    hidden_now: 0,
    googleApi: "places_api_new",
    results: [] as Array<Record<string, unknown>>,
  };

  for (const row of rows ?? []) {
    counters.scanned += 1;
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(row.google_place_id)}`,
        {
          headers: {
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,businessStatus",
          },
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          clean(payload?.error?.message) ||
            `Google Places API (New) HTTP ${response.status}`,
        );
      }

      const place = await response.json();
      const status = String(
        place.businessStatus || "BUSINESS_STATUS_UNSPECIFIED",
      );
      const checkedAt = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from("locations")
        .update({
          google_business_status: status,
          google_business_status_checked_at: checkedAt,
        })
        .eq("id", row.id)
        .select("id,is_searchable,is_hidden,publish_ready")
        .single();
      if (updateError) throw updateError;

      if (status === "OPERATIONAL") counters.operational += 1;
      else if (status === "CLOSED_TEMPORARILY") {
        counters.temporarily_closed += 1;
      } else if (status === "CLOSED_PERMANENTLY") {
        counters.permanently_closed += 1;
      } else if (status === "FUTURE_OPENING") {
        counters.future_opening += 1;
      } else {
        counters.unspecified += 1;
      }

      if (
        status === "CLOSED_PERMANENTLY" &&
        updated?.is_hidden === true
      ) {
        counters.hidden_now += 1;
      }

      counters.results.push({
        id: row.id,
        status,
        hidden: updated?.is_hidden === true,
      });
    } catch (error) {
      counters.failed += 1;
      counters.results.push({
        id: row.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(counters);
});
