import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function displayName(row: Record<string, unknown>) {
  return clean(row.name || row.restaurant_name || row.activity_name) || "TheOutHaven location";
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const quantity = Math.min(Math.max(Number(body.quantity || 250), 1), 500);
    const name = clean(body.name) || `Mailing Batch ${new Date().toLocaleDateString("en-US")}`;
    const q = clean(body.q);
    const city = clean(body.city);
    const state = clean(body.state).toUpperCase();
    const zip = clean(body.zip);
    const plannedMailDate = clean(body.plannedMailDate) || null;
    const notes = clean(body.notes) || null;

    if (plannedMailDate && !/^\d{4}-\d{2}-\d{2}$/.test(plannedMailDate)) {
      return Response.json({ success: false, error: "Enter a valid planned mail date." }, { status: 400 });
    }

    let locationQuery = supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name,address,city,state,zip_code,claim_code,is_claimed,claimed,claim_status,do_not_contact")
      .not("claim_code", "is", null)
      .not("address", "is", null)
      .not("city", "is", null)
      .not("state", "is", null)
      .not("zip_code", "is", null)
      .or("is_claimed.eq.false,is_claimed.is.null")
      .or("claimed.eq.false,claimed.is.null")
      .or("claim_status.neq.claimed,claim_status.is.null")
      .or("do_not_contact.eq.false,do_not_contact.is.null")
      .order("name", { ascending: true })
      .limit(2500);

    if (q) {
      const safe = q.replace(/[,%()]/g, " ").trim();
      if (safe) {
        locationQuery = locationQuery.or(
          `name.ilike.%${safe}%,restaurant_name.ilike.%${safe}%,activity_name.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%,zip_code.ilike.%${safe}%`,
        );
      }
    }
    if (city) locationQuery = locationQuery.ilike("city", city);
    if (state) locationQuery = locationQuery.eq("state", state);
    if (zip) locationQuery = locationQuery.ilike("zip_code", `${zip}%`);

    const { data: locations, error: locationError } = await locationQuery;
    if (locationError) throw locationError;

    const candidateIds = (locations || []).map((row) => row.id).filter(Boolean);
    let alreadyActive = new Set<string>();

    if (candidateIds.length) {
      const { data: activeItems, error: activeError } = await supabaseAdmin
        .from("mailing_batch_items")
        .select("location_id")
        .in("location_id", candidateIds)
        .not("status", "in", "(cancelled,returned)")
        .limit(10000);
      if (activeError) throw activeError;
      alreadyActive = new Set((activeItems || []).map((item) => String(item.location_id || "")).filter(Boolean));
    }

    const selected = (locations || [])
      .filter((row) => !alreadyActive.has(String(row.id)))
      .filter((row) => clean(row.claim_code) && clean(row.address) && clean(row.city) && clean(row.state) && clean(row.zip_code))
      .slice(0, quantity);

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

    const itemRows = selected.map((row) => ({
      batch_id: batch.id,
      location_id: row.id,
      status: "queued",
      claim_code: clean(row.claim_code),
      business_name: displayName(row as Record<string, unknown>),
      street_address: clean(row.address) || null,
      city: clean(row.city) || null,
      state: clean(row.state) || null,
      zip_code: clean(row.zip_code) || null,
    }));

    const { error: itemError } = await supabaseAdmin.from("mailing_batch_items").insert(itemRows);
    if (itemError) {
      await supabaseAdmin.from("mailing_batches").delete().eq("id", batch.id);
      throw itemError;
    }

    return Response.json({
      success: true,
      batchId: batch.id,
      batchName: batch.name,
      count: itemRows.length,
      requested: quantity,
    });
  } catch (error) {
    console.error("Mailing batch creation failed", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not create mailing batch." },
      { status: 500 },
    );
  }
}
