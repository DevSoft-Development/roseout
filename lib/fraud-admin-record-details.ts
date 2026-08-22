import { supabaseAdmin } from "@/lib/supabase-admin";

export type FraudSignalReference = {
  subject_type: string;
  subject_id: string;
  related_subject_type?: string | null;
  related_subject_id?: string | null;
};

export type FraudAdminRecordDetail = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  details: string[];
  riskScore: number | null;
  riskBand: string | null;
  enforcementState: string | null;
  activeCaseId: string | null;
};

export function fraudRecordKey(type: string | null | undefined, id: string | null | undefined) {
  return type && id ? `${type}:${id}` : "";
}

function fallbackTitle(type: string) {
  const labels: Record<string, string> = {
    user: "Customer account",
    location: "Location",
    claim: "Business claim",
    organizer: "Organizer account",
    event: "Event",
    experience: "Experience",
    reservation: "Reservation",
    order: "Ticket order",
    payment: "Payment activity",
    payout: "Payout activity",
    review: "Review",
    other: "Record",
  };
  return labels[type] || "Record";
}

function compact(parts: Array<string | null | undefined>) {
  return parts.map((value) => String(value || "").trim()).filter(Boolean);
}

function contactDetails(values: Array<[string, unknown]>) {
  return values.flatMap(([label, raw]) => {
    const value = String(raw || "").trim();
    return value ? [`${label}: ${value}`] : [];
  });
}

function money(cents: unknown, currency: unknown) {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return null;
  const code = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}

export async function loadFraudAdminRecordDetails(signals: FraudSignalReference[]) {
  const idsByType = new Map<string, Set<string>>();
  const add = (type: string | null | undefined, id: string | null | undefined) => {
    if (!type || !id) return;
    if (!idsByType.has(type)) idsByType.set(type, new Set());
    idsByType.get(type)?.add(id);
  };

  for (const signal of signals) {
    add(signal.subject_type, signal.subject_id);
    add(signal.related_subject_type, signal.related_subject_id);
  }

  const ids = (type: string) => [...(idsByType.get(type) || new Set<string>())];
  const queryIf = async (type: string, table: string, columns: string) => {
    const values = ids(type);
    if (!values.length) return [] as any[];
    const { data, error } = await supabaseAdmin.from(table).select(columns).in("id", values);
    if (error) throw error;
    return (data || []) as any[];
  };

  const stateQueries = [...idsByType.entries()].map(async ([type, values]) => {
    if (!values.size) return [] as any[];
    const { data, error } = await supabaseAdmin
      .from("fraud_subjects")
      .select("subject_type,subject_id,display_label,risk_score,risk_band,enforcement_state,active_case_id")
      .eq("subject_type", type)
      .in("subject_id", [...values]);
    if (error) throw error;
    return (data || []) as any[];
  });

  const [users, locations, claims, organizers, events, experiences, reservations, orders, ...stateGroups] = await Promise.all([
    queryIf("user", "users", "id,full_name,email,phone,account_status"),
    queryIf("location", "locations", "id,name,business_name,restaurant_name,activity_name,address,city,state,owner_name,owner_email,phone"),
    queryIf("claim", "location_claims", "id,location_id,name,email,phone,status"),
    queryIf("organizer", "organizations", "id,name,status,verification_status"),
    queryIf("event", "events", "id,title,venue_name,address,city,state,status,searchable,location_id,organization_id"),
    queryIf("experience", "experiences", "id,title,venue_name,address,city,state,status,searchable,location_id,organization_id"),
    queryIf("reservation", "location_reservations", "id,location_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status"),
    queryIf("order", "event_ticket_orders", "id,event_id,purchaser_name,purchaser_email,purchaser_phone,quantity,status,payment_status,total_cents,currency"),
    ...stateQueries,
  ]);

  const map = new Map<string, FraudAdminRecordDetail>();
  for (const [type, values] of idsByType.entries()) {
    for (const id of values) {
      map.set(fraudRecordKey(type, id), {
        type,
        id,
        title: fallbackTitle(type),
        subtitle: null,
        details: [],
        riskScore: null,
        riskBand: null,
        enforcementState: null,
        activeCaseId: null,
      });
    }
  }

  const patch = (type: string, id: unknown, values: Partial<FraudAdminRecordDetail>) => {
    const key = fraudRecordKey(type, String(id || ""));
    const current = map.get(key);
    if (!current) return;
    map.set(key, { ...current, ...values });
  };

  for (const row of users) {
    patch("user", row.id, {
      title: row.full_name || row.email || "Customer account",
      subtitle: row.email || null,
      details: contactDetails([["Phone", row.phone], ["Account status", row.account_status]]),
    });
  }

  for (const row of locations) {
    const title = row.name || row.business_name || row.restaurant_name || row.activity_name || "Location";
    patch("location", row.id, {
      title,
      subtitle: compact([row.address, row.city, row.state]).join(", ") || null,
      details: contactDetails([["Owner", row.owner_name], ["Owner email", row.owner_email], ["Business phone", row.phone]]),
    });
  }

  for (const row of claims) {
    patch("claim", row.id, {
      title: row.name || row.email || "Business claim",
      subtitle: row.email || null,
      details: contactDetails([["Phone", row.phone], ["Claim status", row.status]]),
    });
  }

  for (const row of organizers) {
    patch("organizer", row.id, {
      title: row.name || "Organizer account",
      subtitle: row.verification_status ? `Verification: ${row.verification_status}` : null,
      details: contactDetails([["Account status", row.status]]),
    });
  }

  for (const row of events) {
    patch("event", row.id, {
      title: row.title || "Event",
      subtitle: compact([row.venue_name, row.address, row.city, row.state]).join(" · ") || null,
      details: contactDetails([["Event status", row.status], ["Public", row.searchable ? "Yes" : "No"]]),
    });
  }

  for (const row of experiences) {
    patch("experience", row.id, {
      title: row.title || "Experience",
      subtitle: compact([row.venue_name, row.address, row.city, row.state]).join(" · ") || null,
      details: contactDetails([["Experience status", row.status], ["Public", row.searchable ? "Yes" : "No"]]),
    });
  }

  for (const row of reservations) {
    const when = compact([row.reservation_date, row.reservation_time]).join(" at ");
    patch("reservation", row.id, {
      title: row.customer_name || row.customer_email || "Reservation",
      subtitle: row.customer_email || null,
      details: compact([
        row.customer_phone ? `Phone: ${row.customer_phone}` : null,
        when ? `Reservation: ${when}` : null,
        row.party_size ? `Party size: ${row.party_size}` : null,
        row.status ? `Status: ${row.status}` : null,
      ]),
    });
  }

  for (const row of orders) {
    const total = money(row.total_cents, row.currency);
    patch("order", row.id, {
      title: row.purchaser_name || row.purchaser_email || "Ticket order",
      subtitle: row.purchaser_email || null,
      details: compact([
        row.purchaser_phone ? `Phone: ${row.purchaser_phone}` : null,
        row.quantity ? `Tickets: ${row.quantity}` : null,
        total ? `Order total: ${total}` : null,
        row.payment_status ? `Payment: ${row.payment_status}` : null,
        row.status ? `Order status: ${row.status}` : null,
      ]),
    });
  }

  for (const row of stateGroups.flat()) {
    const key = fraudRecordKey(row.subject_type, row.subject_id);
    const current = map.get(key);
    if (!current) continue;
    const genericTitle = fallbackTitle(current.type);
    map.set(key, {
      ...current,
      title: current.title === genericTitle && row.display_label ? row.display_label : current.title,
      riskScore: row.risk_score == null ? null : Number(row.risk_score),
      riskBand: row.risk_band || null,
      enforcementState: row.enforcement_state || null,
      activeCaseId: row.active_case_id || null,
    });
  }

  return map;
}

function readableEvidenceKey(key: string) {
  const labels: Record<string, string> = {
    attempt_count: "Attempts",
    recent_count: "Recent attempts",
    linked_subject_count: "Linked accounts",
    failure_code: "Failure code",
    failure_message: "Failure reason",
    decline_code: "Decline reason",
    reason: "Reason",
    status: "Status",
    country: "Country",
    currency: "Currency",
    changed_fields: "Details changed",
    previous_owner_present: "Had a previous owner",
    contact_matches: "Contact matches business",
    payouts_enabled_before: "Payouts worked before",
    payouts_enabled_after: "Payouts work now",
    external_account_object: "Payout method type",
    quantity: "Quantity",
    window_minutes: "Time window (minutes)",
    threshold: "Trigger threshold",
  };
  return labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableEvidenceValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.slice(0, 8).map(String).join(", ");
  if (value && typeof value === "object") return null;
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function describeFraudEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [] as Array<{ label: string; value: string }>;
  const hidden = /(^|_)(id|hash|fingerprint|token|secret|ip)($|_)/i;
  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(evidence as Record<string, unknown>)) {
    if (hidden.test(key) || key.startsWith("stripe_")) continue;
    const value = readableEvidenceValue(raw);
    if (!value) continue;
    entries.push({ label: readableEvidenceKey(key), value });
    if (entries.length >= 8) break;
  }
  return entries;
}
