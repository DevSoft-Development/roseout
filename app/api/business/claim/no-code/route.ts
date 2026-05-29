import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import {
  sendAdminNewClaimEmail,
  sendNoCodeMatchedClaimEmail,
  sendNoCodeNewLocationClaimEmail,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

type LocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  borough?: string | null;
  phone?: string | null;
  website?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  claim_status?: string | null;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
};

const LOCATION_SELECT = "id,name,restaurant_name,activity_name,address,city,state,zip_code,borough,phone,website,location_type,primary_category,claim_status,is_claimed,claimed";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function phoneDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function normalizeWebsite(value: unknown) {
  return lower(value).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function compactName(row: LocationRow) {
  return row.name || row.restaurant_name || row.activity_name || "TheOutHaven location";
}

function tokenSet(value: string) {
  return new Set(value.split(/[^a-z0-9]+/).filter((part) => part.length > 2));
}

function similarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((token) => {
    if (right.has(token)) shared += 1;
  });
  return shared / Math.max(left.size, right.size);
}

function snapshot(row: LocationRow) {
  return {
    id: row.id,
    name: compactName(row),
    address: row.address || null,
    city: row.city || row.borough || null,
    state: row.state || null,
    zipCode: row.zip_code || null,
    phone: row.phone || null,
    website: row.website || null,
    locationType: row.location_type || null,
    primaryCategory: row.primary_category || null,
    claimStatus: row.claim_status || null,
    isClaimed: Boolean(row.is_claimed || row.claimed),
  };
}

async function findBestMatch(input: {
  locationName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string;
}) {
  const phone = input.phone;
  const queries: any[] = [];

  if (phone) queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("phone", `%${phone.slice(-7)}%`).limit(10));
  if (input.zipCode) queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).eq("zip_code", input.zipCode).ilike("address", input.address).limit(10));
  if (input.city && input.state) {
    const firstNameToken = input.locationName.split(" ")[0] || input.locationName;
    queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("city", input.city).ilike("state", input.state).ilike("name", `%${firstNameToken}%`).limit(20));
    queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("city", input.city).ilike("state", input.state).ilike("restaurant_name", `%${firstNameToken}%`).limit(20));
    queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("city", input.city).ilike("state", input.state).ilike("activity_name", `%${firstNameToken}%`).limit(20));
  }
  if (input.website) queries.push(supabaseAdmin.from("locations").select(LOCATION_SELECT).ilike("website", `%${input.website}%`).limit(10));

  const results = await Promise.all(queries);
  const candidates = new Map<string, LocationRow>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data || []) candidates.set(row.id, row);
  }

  let best: { row: LocationRow; score: number; status: "exact_match" | "possible_match" | "no_match" | "pending_review" } | null = null;
  for (const row of candidates.values()) {
    const rowPhone = phoneDigits(row.phone);
    const rowAddress = lower(row.address);
    const rowZip = clean(row.zip_code);
    const rowName = lower(compactName(row));
    const rowCity = lower(row.city || row.borough);
    const rowState = lower(row.state);
    const rowWebsite = normalizeWebsite(row.website);
    const nameSimilarity = similarity(input.locationName, rowName);

    let score = 0;
    if (phone && rowPhone && (rowPhone === phone || rowPhone.endsWith(phone.slice(-7)))) score += 45;
    if (input.address && rowAddress === input.address && input.zipCode && rowZip === input.zipCode) score += 45;
    if (input.locationName && rowName === input.locationName && rowCity === input.city && rowState === input.state) score += 35;
    if (nameSimilarity >= 0.6 && phone && rowPhone && rowPhone.endsWith(phone.slice(-7))) score += 35;
    if (nameSimilarity >= 0.6 && input.address && rowAddress.includes(input.address.slice(0, 10))) score += 30;
    if (input.website && rowWebsite && rowWebsite === input.website) score += 25;

    const status: "exact_match" | "possible_match" | "no_match" | "pending_review" = score >= 80 ? "exact_match" : score >= 45 ? "possible_match" : score > 0 ? "pending_review" : "no_match";
    if (!best || score > best.score) best = { row, score, status };
  }

  if (!best || best.status === "pending_review" || best.status === "no_match") {
    const fallbackBest = best as { score: number; status: "exact_match" | "possible_match" | "no_match" | "pending_review" } | null;
    return { row: null, confidenceScore: fallbackBest?.score || null, matchStatus: fallbackBest?.status || "no_match" as const };
  }

  return { row: best.row, confidenceScore: best.score, matchStatus: best.status };
}

async function maybeSendEmails(args: {
  ownerEmail: string;
  contactName: string;
  locationName: string;
  matched: boolean;
  requestType: string;
  phone: string;
  matchStatus: string;
  verificationStatus: string;
  planInterest: string;
  createdAt?: string | null;
}) {
  const createdAt = args.createdAt ? new Date(args.createdAt).getTime() : 0;
  const olderThan24Hours = !createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000;
  if (!olderThan24Hours) return;

  await Promise.allSettled([
    args.matched
      ? sendNoCodeMatchedClaimEmail({ email: args.ownerEmail, contactName: args.contactName, locationName: args.locationName })
      : sendNoCodeNewLocationClaimEmail({ email: args.ownerEmail, contactName: args.contactName, locationName: args.locationName }),
    sendAdminNewClaimEmail({
      locationName: args.locationName,
      requestType: args.requestType,
      contactNameOrOwnerName: args.contactName,
      businessEmail: args.ownerEmail,
      phone: args.phone,
      matchStatus: args.matchStatus,
      verificationStatus: args.verificationStatus,
      planInterest: args.planInterest,
    }),
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const required = ["locationName", "address", "city", "state", "zipCode", "phone", "businessEmail", "contactName", "roleAtBusiness"];
    for (const field of required) {
      if (!clean(body[field])) return Response.json({ ok: false, error: `missing_${field}` }, { status: 400 });
    }

    const authSupabase = await createClient();
    const { data: userData } = await authSupabase.auth.getUser();
    const user = userData.user;

    const locationNameRaw = clean(body.locationName);
    const addressRaw = clean(body.address);
    const cityRaw = clean(body.city);
    const stateRaw = clean(body.state);
    const zipCode = clean(body.zipCode);
    const phoneRaw = clean(body.phone);
    const ownerPhone = phoneDigits(phoneRaw);
    const ownerEmail = lower(body.businessEmail);
    const contactName = clean(body.contactName);
    const roleAtBusiness = clean(body.roleAtBusiness);
    const websiteRaw = clean(body.website);
    const planInterest = clean(body.planInterest) === "pro" ? "pro" : "free_discovery";
    const notes = clean(body.notes);

    const match = await findBestMatch({
      locationName: lower(locationNameRaw),
      address: lower(addressRaw),
      city: lower(cityRaw),
      state: lower(stateRaw),
      zipCode,
      phone: ownerPhone,
      website: normalizeWebsite(websiteRaw),
    });

    const matchedExistingLocation = Boolean(match.row);
    const verificationStatus = matchedExistingLocation ? "background_matched" : "needs_admin_match";
    const matchedLocationSnapshot = match.row ? snapshot(match.row) : null;

    const duplicateChecks = [
      supabaseAdmin
        .from("location_claim_requests")
        .select("id, created_at, location_id")
        .eq("status", "pending")
        .eq("owner_email", ownerEmail)
        .eq("owner_phone", ownerPhone || phoneRaw)
        .limit(1),
      supabaseAdmin
        .from("location_claim_requests")
        .select("id, created_at, location_id")
        .eq("status", "pending")
        .eq("location_name", locationNameRaw)
        .eq("address", addressRaw)
        .eq("owner_phone", ownerPhone || phoneRaw)
        .limit(1),
    ];

    if (match.row?.id) {
      duplicateChecks.push(
        supabaseAdmin
          .from("location_claim_requests")
          .select("id, created_at, location_id")
          .eq("status", "pending")
          .eq("location_id", match.row.id)
          .eq("owner_email", ownerEmail)
          .limit(1),
      );
    }

    const duplicateResults = await Promise.all(duplicateChecks);
    for (const result of duplicateResults) {
      if (result.error) throw result.error;
    }
    const duplicate = duplicateResults.flatMap((result) => result.data || [])[0];
    if (duplicate) {
      await maybeSendEmails({
        ownerEmail,
        contactName,
        locationName: locationNameRaw,
        matched: Boolean(duplicate.location_id || matchedExistingLocation),
        requestType: "No-code business claim",
        phone: phoneRaw,
        matchStatus: match.matchStatus,
        verificationStatus,
        planInterest,
        createdAt: duplicate.created_at,
      });
      return Response.json({ ok: true, claimRequestId: duplicate.id, matchedExistingLocation: Boolean(duplicate.location_id || matchedExistingLocation), message: "Your claim is already pending review." });
    }

    const now = new Date().toISOString();
    const { data: claim, error } = await supabaseAdmin
      .from("location_claim_requests")
      .insert({
        location_name: locationNameRaw,
        location_type: "Business",
        request_type: "No-code business claim",
        website: websiteRaw || null,
        address: addressRaw,
        city: cityRaw,
        state: stateRaw,
        zip_code: zipCode,
        owner_name: contactName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone || phoneRaw,
        notes: notes || null,
        status: "pending",
        verification_status: verificationStatus,
        user_id: user?.id || null,
        location_id: match.row?.id || null,
        claim_code: null,
        plan_interest: planInterest,
        role_at_business: roleAtBusiness,
        match_status: match.matchStatus,
        confidence_score: match.confidenceScore,
        matched_location_snapshot: matchedLocationSnapshot,
        submission_payload: {
          locationName: locationNameRaw,
          address: addressRaw,
          city: cityRaw,
          state: stateRaw,
          zipCode,
          phone: phoneRaw,
          businessEmail: ownerEmail,
          contactName,
          roleAtBusiness,
          website: websiteRaw || null,
          planInterest,
          notes: notes || null,
        },
        submitted_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;

    await maybeSendEmails({
      ownerEmail,
      contactName,
      locationName: locationNameRaw,
      matched: matchedExistingLocation,
      requestType: "No-code business claim",
      phone: phoneRaw,
      matchStatus: match.matchStatus,
      verificationStatus,
      planInterest,
    });

    return Response.json({
      ok: true,
      claimRequestId: claim.id,
      matchedExistingLocation,
      message: matchedExistingLocation ? "Location already added. Claim pending review." : "Location submitted. Claim pending review.",
    });
  } catch (error) {
    console.error("No-code claim submission failed", error);
    return Response.json({ ok: false, error: "submit_failed" }, { status: 500 });
  }
}
