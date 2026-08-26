import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureShortLink } from "@/lib/short-links/service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const THEOUTHAVEN_LOUNGE_ID = "642a2ad6-c144-47b7-b9ff-f89554edf0da";
const LOCATION_SELECT = "id,name,restaurant_name,activity_name,address,city,state,zip_code,claim_code,is_claimed,claimed,claim_status,do_not_contact";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

type LocationRow = Record<string, unknown> & { id: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeSearch(value: unknown) {
  return clean(value).replace(/[^a-zA-Z0-9\s.'&#-]/g, " ").replace(/\s+/g, " ").trim();
}

function displayName(row: Record<string, unknown>) {
  return clean(row.name || row.restaurant_name || row.activity_name) || "TheOutHaven location";
}

function isCompleteEligibleLocation(row: Record<string, unknown>) {
  return Boolean(
    clean(row.claim_code) &&
      clean(row.address) &&
      clean(row.city) &&
      clean(row.state) &&
      clean(row.zip_code),
  );
}

async function activeLocationIds(locationIds: string[]) {
  if (!locationIds.length) return new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("location_id")
    .in("location_id", locationIds)
    .not("status", "in", "(cancelled,returned)")
    .limit(10000);
  if (error) throw error;
  return new Set((data || []).map((item) => String(item.location_id || "")).filter(Boolean));
}

function baseEligibleQuery() {
  return supabaseAdmin
    .from("locations")
    .select(LOCATION_SELECT)
    .not("claim_code", "is", null)
    .not("address", "is", null)
    .not("city", "is", null)
    .not("state", "is", null)
    .not("zip_code", "is", null)
    .or("is_claimed.eq.false,is_claimed.is.null")
    .or("claimed.eq.false,claimed.is.null")
    .or("claim_status.neq.claimed,claim_status.is.null")
    .or(`do_not_contact.eq.false,do_not_contact.is.null,id.eq.${THEOUTHAVEN_LOUNGE_ID}`);
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const url = new URL(req.url);
    const q = safeSearch(url.searchParams.get("q"));
    const city = safeSearch(url.searchParams.get("city"));
    const state = safeSearch(url.searchParams.get("state")).toUpperCase().slice(0, 2);
    const zip = safeSearch(url.searchParams.get("zip")).replace(/\D/g, "").slice(0, 5);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);

    let query = baseEligibleQuery().order("name", { ascending: true }).limit(Math.max(limit * 3, 100));

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,zip_code.ilike.%${q}%`,
      );
    }
    if (city) query = query.ilike("city", city);
    if (state) query = query.eq("state", state);
    if (zip) query = query.ilike("zip_code", `${zip}%`);

    const { data, error } = await query;
    if (error) throw error;

    const rows = ((data || []) as LocationRow[]).filter(isCompleteEligibleLocation);
    const activeIds = await activeLocationIds(rows.map((row) => row.id));
    const available = rows.filter((row) => !activeIds.has(row.id)).slice(0, limit);

    return Response.json({
      success: true,
      locations: available.map((row) => ({
        id: row.id,
        name: displayName(row),
        address: clean(row.address),
        city: clean(row.city),
        state: clean(row.state),
        zipCode: clean(row.zip_code),
        claimCode: clean(row.claim_code),
      })),
      count: available.length,
    });
  } catch (error) {
    console.error("Mailing batch location search failed", error);
    return Response.json({ success: false, error: "Could not search locations." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const quantity = Math.min(Math.max(Number(body.quantity || 250), 1), 500);
    const name = clean(body.name) || `Mailing Batch ${new Date().toLocaleDateString("en-US")}`;
    const q = safeSearch(body.q);
    const city = safeSearch(body.city);
    const state = safeSearch(body.state).toUpperCase().slice(0, 2);
    const zip = safeSearch(body.zip).replace(/\D/g, "").slice(0, 5);
    const plannedMailDate = clean(body.plannedMailDate) || null;
    const notes = clean(body.notes) || null;
    const selectedLocationIds: string[] = Array.isArray(body.selectedLocationIds)
      ? Array.from(new Set<string>((body.selectedLocationIds as unknown[]).map((value) => clean(value)).filter(Boolean))).slice(0, 500)
      : [];

    if (plannedMailDate && !/^\d{4}-\d{2}-\d{2}$/.test(plannedMailDate)) {
      return Response.json({ success: false, error: "Enter a valid planned mail date." }, { status: 400 });
    }

    let locationQuery = baseEligibleQuery().order("name", { ascending: true }).limit(selectedLocationIds.length ? 500 : 2500);

    if (selectedLocationIds.length) {
      locationQuery = locationQuery.in("id", selectedLocationIds);
    } else {
      if (q) {
        locationQuery = locationQuery.or(
          `name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,zip_code.ilike.%${q}%`,
        );
      }
      if (city) locationQuery = locationQuery.ilike("city", city);
      if (state) locationQuery = locationQuery.eq("state", state);
      if (zip) locationQuery = locationQuery.ilike("zip_code", `${zip}%`);
    }

    const { data: locations, error: locationError } = await locationQuery;
    if (locationError) throw locationError;

    const candidateRows = (locations || []) as LocationRow[];
    const alreadyActive = await activeLocationIds(candidateRows.map((row) => row.id));
    const available = candidateRows.filter((row) => !alreadyActive.has(row.id)).filter(isCompleteEligibleLocation);

    let selected: LocationRow[];
    if (selectedLocationIds.length) {
      const byId = new Map(available.map((row) => [row.id, row]));
      selected = selectedLocationIds.map((id) => byId.get(id)).filter((row): row is LocationRow => Boolean(row));
      if (selected.length !== selectedLocationIds.length) {
        return Response.json(
          { success: false, error: "One or more selected locations are no longer eligible. Refresh the location search and try again." },
          { status: 409 },
        );
      }
    } else {
      selected = available.slice(0, quantity);
    }

    if (!selected.length) {
      return Response.json(
        { success: false, error: "No eligible unclaimed locations matched these filters. Try widening the search." },
        { status: 409 },
      );
    }

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("mailing_batches")
      .insert({
        name,
        status: "queued",
        planned_mail_date: plannedMailDate,
        notes,
        created_by: auth.adminUser?.user_id || null,
      })
      .select("id,name,status")
      .single();

    if (batchError || !batch) throw batchError || new Error("Could not create mailing batch.");

    const itemRows = selected.map((row, index) => ({
      batch_id: batch.id,
      location_id: row.id,
      sequence_number: index + 1,
      status: "queued",
      claim_code: clean(row.claim_code),
      business_name: displayName(row),
      street_address: clean(row.address) || null,
      city: clean(row.city) || null,
      state: clean(row.state) || null,
      zip_code: clean(row.zip_code) || null,
    }));

    const { data: createdItems, error: itemError } = await supabaseAdmin
      .from("mailing_batch_items")
      .insert(itemRows)
      .select("id,location_id,business_name,tracking_token");
    if (itemError) {
      await supabaseAdmin.from("mailing_batches").delete().eq("id", batch.id);
      throw itemError;
    }

    // Add branded links for new postcards, but never make batch creation depend on
    // the short-link service. The existing tracking URL remains the permanent fallback.
    let shortLinksRegistered = 0;
    await Promise.all((createdItems || []).map(async (item) => {
      try {
        await ensureShortLink(supabaseAdmin, {
          destinationUrl: `${SITE_URL}/postcard/claim/${item.tracking_token}`,
          linkType: "postcard",
          entityType: "mailing_batch_item",
          entityId: item.id,
          title: `${item.business_name || "Claim postcard"} postcard`,
          createdBy: auth.adminUser?.user_id || null,
          metadata: {
            batch_id: batch.id,
            location_id: item.location_id,
            tracking_token: item.tracking_token,
          },
        });
        shortLinksRegistered += 1;
      } catch (error) {
        console.warn("Postcard short link registration skipped", {
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));

    return Response.json({
      success: true,
      batchId: batch.id,
      batchName: batch.name,
      count: itemRows.length,
      requested: selectedLocationIds.length || quantity,
      shortLinksRegistered,
    });
  } catch (error) {
    console.error("Mailing batch creation failed", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not create mailing batch." },
      { status: 500 },
    );
  }
}
