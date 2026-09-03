export type ReserveHostReservation = {
  id: string;
  status?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
  party_size?: number | null;
  duration_minutes?: number | null;
  turn_time_minutes?: number | null;
  seated_at?: string | null;
  bookable_item_name?: string | null;
  server_staff_profile_id?: string | null;
};

export type ReserveHostStaff = {
  id: string;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
  section_id?: string | null;
  max_tables?: number | null;
  max_covers?: number | null;
};

export type ReserveHostResource = {
  id?: string | null;
  item_name?: string | null;
  name?: string | null;
  label?: string | null;
  item_type?: string | null;
  type?: string | null;
  capacity?: number | null;
  capacity_max?: number | null;
  section_id?: string | null;
};

const ACTIVE = new Set(["pending", "confirmed", "checked_in", "waiting", "arrived", "seated", "occupied"]);

function minutesOfDay(value: string | null | undefined) {
  const [h, m] = String(value || "00:00").slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function resourceCapacity(resource: ReserveHostResource) {
  const value = Number(resource.capacity ?? resource.capacity_max ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resourceLabel(resource: ReserveHostResource) {
  return String(resource.item_name || resource.name || resource.label || "Table").trim();
}

export function isBarResource(resource: ReserveHostResource) {
  const type = String(resource.item_type || resource.type || "").toLowerCase().replaceAll(" ", "_");
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(type);
}

export function reservationTurnMinutes(reservation: ReserveHostReservation) {
  const value = Number(reservation.duration_minutes ?? reservation.turn_time_minutes ?? 90);
  return Number.isFinite(value) && value > 0 ? value : 90;
}

export function buildPacingBuckets(
  reservations: ReserveHostReservation[],
  bucketMinutes = 15,
) {
  const buckets = new Map<number, { startMinute: number; reservations: number; covers: number }>();
  for (const reservation of reservations) {
    if (!ACTIVE.has(String(reservation.status || "confirmed").toLowerCase())) continue;
    const minute = minutesOfDay(reservation.reservation_time);
    const startMinute = Math.floor(minute / bucketMinutes) * bucketMinutes;
    const current = buckets.get(startMinute) || { startMinute, reservations: 0, covers: 0 };
    current.reservations += 1;
    current.covers += Math.max(1, Number(reservation.party_size || 1));
    buckets.set(startMinute, current);
  }
  return [...buckets.values()].sort((a, b) => a.startMinute - b.startMinute);
}

export function pacingWarnings(
  reservations: ReserveHostReservation[],
  settings: { max_covers_15m?: number | null; max_covers_30m?: number | null },
) {
  const warnings: Array<{ startMinute: number; windowMinutes: number; covers: number; limit: number }> = [];
  const fifteen = buildPacingBuckets(reservations, 15);
  const max15 = Number(settings.max_covers_15m || 0);
  if (max15 > 0) {
    for (const bucket of fifteen) {
      if (bucket.covers > max15) warnings.push({ startMinute: bucket.startMinute, windowMinutes: 15, covers: bucket.covers, limit: max15 });
    }
  }
  const max30 = Number(settings.max_covers_30m || 0);
  if (max30 > 0) {
    const thirty = buildPacingBuckets(reservations, 30);
    for (const bucket of thirty) {
      if (bucket.covers > max30) warnings.push({ startMinute: bucket.startMinute, windowMinutes: 30, covers: bucket.covers, limit: max30 });
    }
  }
  return warnings.sort((a, b) => a.startMinute - b.startMinute || a.windowMinutes - b.windowMinutes);
}

export function tableTurnState(reservation: ReserveHostReservation, now = Date.now()) {
  if (!reservation.seated_at || !["seated", "occupied"].includes(String(reservation.status || "").toLowerCase())) return null;
  const seatedAt = new Date(reservation.seated_at).getTime();
  if (!Number.isFinite(seatedAt)) return null;
  const elapsedMinutes = Math.max(0, Math.floor((now - seatedAt) / 60_000));
  const expectedMinutes = reservationTurnMinutes(reservation);
  const remainingMinutes = expectedMinutes - elapsedMinutes;
  const state = remainingMinutes < 0 ? "overdue" : remainingMinutes <= 15 ? "turning" : "active";
  return { seatedAt, elapsedMinutes, expectedMinutes, remainingMinutes, state } as const;
}

export function hostAttentionItems(reservations: ReserveHostReservation[], now = Date.now()) {
  return reservations.flatMap((reservation) => {
    const turn = tableTurnState(reservation, now);
    if (turn?.state === "overdue") {
      return [{
        key: `turn-${reservation.id}`,
        tone: "critical" as const,
        reservationId: reservation.id,
        message: `${reservation.bookable_item_name || "Table"} is ${Math.abs(turn.remainingMinutes)} minutes over its expected turn.`,
      }];
    }
    const status = String(reservation.status || "").toLowerCase();
    if (["confirmed", "pending"].includes(status) && reservation.reservation_date && reservation.reservation_time) {
      const start = new Date(`${reservation.reservation_date}T${String(reservation.reservation_time).slice(0, 5)}:00`).getTime();
      if (Number.isFinite(start)) {
        const minutesLate = Math.floor((now - start) / 60_000);
        if (minutesLate >= 10) return [{ key: `late-${reservation.id}`, tone: "warning" as const, reservationId: reservation.id, message: `Guest is ${minutesLate} minutes late.` }];
      }
    }
    return [];
  });
}

export function staffWorkload(
  staff: ReserveHostStaff,
  reservations: ReserveHostReservation[],
  now = Date.now(),
) {
  const assigned = reservations.filter((reservation) =>
    reservation.server_staff_profile_id === staff.id && ACTIVE.has(String(reservation.status || "").toLowerCase()),
  );
  const seated = assigned.filter((reservation) => ["seated", "occupied"].includes(String(reservation.status || "").toLowerCase()));
  const currentCovers = seated.reduce((sum, reservation) => sum + Math.max(1, Number(reservation.party_size || 1)), 0);
  const recentlySeatedCovers = seated.reduce((sum, reservation) => {
    if (!reservation.seated_at) return sum;
    const age = (now - new Date(reservation.seated_at).getTime()) / 60_000;
    return age >= 0 && age <= 15 ? sum + Math.max(1, Number(reservation.party_size || 1)) : sum;
  }, 0);
  const upcomingCovers = assigned.reduce((sum, reservation) => {
    if (!reservation.reservation_date || !reservation.reservation_time || ["seated", "occupied"].includes(String(reservation.status || "").toLowerCase())) return sum;
    const start = new Date(`${reservation.reservation_date}T${String(reservation.reservation_time).slice(0, 5)}:00`).getTime();
    const delta = (start - now) / 60_000;
    return delta >= 0 && delta <= 30 ? sum + Math.max(1, Number(reservation.party_size || 1)) : sum;
  }, 0);
  const score = seated.length * 6 + currentCovers * 1.5 + recentlySeatedCovers * 2.5 + upcomingCovers * 1.25;
  return { tables: seated.length, currentCovers, recentlySeatedCovers, upcomingCovers, score };
}

export function rankStaffForParty(
  partySize: number,
  staff: ReserveHostStaff[],
  reservations: ReserveHostReservation[],
  options: { sectionId?: string | null; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  return staff
    .filter((person) => !["break", "cut", "clocked_out", "unavailable"].includes(String(person.status || "active")))
    .filter((person) => !options.sectionId || !person.section_id || person.section_id === options.sectionId)
    .map((person) => {
      const load = staffWorkload(person, reservations, now);
      const tableLimitPenalty = person.max_tables && load.tables >= person.max_tables ? 1000 : 0;
      const coverLimitPenalty = person.max_covers && load.currentCovers + partySize > person.max_covers ? 1000 : 0;
      return { staff: person, load, score: load.score + partySize * 0.25 + tableLimitPenalty + coverLimitPenalty };
    })
    .sort((a, b) => a.score - b.score || String(a.staff.display_name || "").localeCompare(String(b.staff.display_name || "")));
}

export function rankResourcesForReservation(
  reservation: ReserveHostReservation,
  resources: ReserveHostResource[],
  options: { includeBar?: boolean; unavailableLabels?: Set<string> } = {},
) {
  const partySize = Math.max(1, Number(reservation.party_size || 1));
  return resources
    .map((resource) => {
      const capacity = resourceCapacity(resource);
      const label = resourceLabel(resource);
      const bar = isBarResource(resource);
      const unavailable = Boolean(options.unavailableLabels?.has(label.toLowerCase()));
      const fits = capacity >= partySize || bar;
      const barPenalty = bar && options.includeBar === false ? 1000 : bar ? 12 : 0;
      const waste = capacity > 0 ? Math.max(0, capacity - partySize) : 20;
      const score = unavailable || !fits ? 10_000 : waste * 4 + barPenalty;
      return { resource, label, capacity, fits, unavailable, score };
    })
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
}
