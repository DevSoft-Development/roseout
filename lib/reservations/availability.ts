import { supabaseAdmin } from "@/lib/supabase-admin";
import { rangesOverlap, timeToMinutes } from "@/lib/reservationOperations";
import { ACTIVE_RESERVATION_STATUSES } from "@/lib/reservations/status";
import { isReservationTimeInPastNewYork } from "@/lib/reservations/reservationTime";

export type ReservationAvailabilityInput = {
  location_id: string;
  reservation_date: string;
  reservation_time: string;
  party_size?: number;
  location_type?: string;
  exclude_reservation_id?: string;
  user_id?: string | null;
  customer_email?: string | null;
  exclude_lock_id?: string | null;
};

export type ReservationAvailabilityResult = {
  available: boolean;
  remaining_capacity: number;
  reason?: string;
  max_capacity?: number;
  slot_duration_minutes?: number;
  current_reservations?: number;
  current_party_size?: number;
  locked_party_size?: number;
  locked_reservations?: number;
  max_reservations_per_slot?: number | null;
};

type ReservationLoadRow = {
  id: string;
  user_id?: string | null;
  customer_email?: string | null;
  reservation_time?: string | null;
  duration_minutes?: number | null;
  turn_time_minutes?: number | null;
  party_size?: number | null;
};

type SlotLockRow = {
  id: string;
  party_size?: number | null;
};

type CapacityRule = {
  open_time?: string | null;
  close_time?: string | null;
  slot_duration_minutes?: number | null;
  max_capacity?: number | null;
  min_party_size?: number | null;
  max_party_size?: number | null;
  max_reservations_per_slot?: number | null;
  buffer_minutes?: number | null;
  is_closed?: boolean | null;
};

const DEFAULT_CAPACITY = {
  slot_duration_minutes: 90,
  max_capacity: 100,
  min_party_size: 1,
  max_party_size: 20,
  max_reservations_per_slot: null as number | null,
  buffer_minutes: 0,
};

function normalizeTime(value: string | null | undefined) {
  return String(value || "00:00").slice(0, 5);
}

function getDayOfWeek(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

async function getCapacityRule(
  locationId: string,
  reservationDate: string,
): Promise<CapacityRule> {
  const [dailyResult, locationResult] = await Promise.all([
    supabaseAdmin
      .from("location_capacity")
      .select(
        "open_time, close_time, slot_duration_minutes, max_capacity, max_party_size, is_closed",
      )
      .eq("location_id", locationId)
      .eq("day_of_week", getDayOfWeek(reservationDate))
      .maybeSingle(),
    supabaseAdmin
      .from("locations")
      .select("reservation_settings,default_duration_minutes")
      .eq("id", locationId)
      .maybeSingle(),
  ]);

  const daily = dailyResult.error ? null : dailyResult.data;
  const location = locationResult.error ? null : locationResult.data;
  const settings = ((location?.reservation_settings as any) || {}).capacity || {};

  return {
    ...(daily || {}),
    slot_duration_minutes:
      daily?.slot_duration_minutes ??
      settings.defaultDurationMinutes ??
      location?.default_duration_minutes ??
      DEFAULT_CAPACITY.slot_duration_minutes,
    max_capacity:
      daily?.max_capacity ?? settings.maxGuestsPerSlot ?? DEFAULT_CAPACITY.max_capacity,
    min_party_size: settings.minPartySize ?? DEFAULT_CAPACITY.min_party_size,
    max_party_size:
      daily?.max_party_size ?? settings.maxPartySize ?? DEFAULT_CAPACITY.max_party_size,
    max_reservations_per_slot:
      settings.slotCapacity ?? DEFAULT_CAPACITY.max_reservations_per_slot,
    buffer_minutes: settings.bufferMinutes ?? DEFAULT_CAPACITY.buffer_minutes,
  };
}

export async function clearExpiredSlotLocks() {
  await supabaseAdmin
    .from("reservation_slot_locks")
    .delete()
    .lt("expires_at", new Date().toISOString());
}

export async function calculateSlotLoad(input: ReservationAvailabilityInput) {
  const rule = await getCapacityRule(input.location_id, input.reservation_date);
  const slotDuration = Number(
    rule.slot_duration_minutes || DEFAULT_CAPACITY.slot_duration_minutes,
  );
  const bufferMinutes = Number(rule.buffer_minutes || 0);
  const occupancyDuration = slotDuration + bufferMinutes;
  const maxCapacity = Number(rule.max_capacity || DEFAULT_CAPACITY.max_capacity);
  const startTime = normalizeTime(input.reservation_time);

  await clearExpiredSlotLocks();

  let reservationsQuery = supabaseAdmin
    .from("location_reservations")
    .select(
      "id, user_id, customer_email, reservation_time, duration_minutes, turn_time_minutes, party_size, status",
    )
    .eq("location_id", input.location_id)
    .eq("reservation_date", input.reservation_date)
    .in("status", [...ACTIVE_RESERVATION_STATUSES]);

  if (input.location_type) {
    reservationsQuery = reservationsQuery.eq("location_type", input.location_type);
  }
  if (input.exclude_reservation_id) {
    reservationsQuery = reservationsQuery.neq("id", input.exclude_reservation_id);
  }

  const { data: reservations, error: reservationsError } = await reservationsQuery;
  if (reservationsError) throw new Error(reservationsError.message);

  const overlapping = ((reservations || []) as ReservationLoadRow[]).filter(
    (reservation) =>
      rangesOverlap(
        startTime,
        occupancyDuration,
        normalizeTime(reservation.reservation_time),
        Number(
          reservation.duration_minutes ||
            reservation.turn_time_minutes ||
            slotDuration,
        ) + bufferMinutes,
      ),
  );

  const duplicateForUser = overlapping.some((reservation) => {
    const sameUser = input.user_id && reservation.user_id === input.user_id;
    const sameEmail =
      input.customer_email && reservation.customer_email === input.customer_email;
    return sameUser || sameEmail;
  });

  let locksQuery = supabaseAdmin
    .from("reservation_slot_locks")
    .select("id, party_size")
    .eq("location_id", input.location_id)
    .eq("reservation_date", input.reservation_date)
    .eq("reservation_time", startTime)
    .gt("expires_at", new Date().toISOString());

  if (input.exclude_lock_id) {
    locksQuery = locksQuery.neq("id", input.exclude_lock_id);
  }

  const { data: locks } = await locksQuery;

  const currentPartySize = overlapping.reduce(
    (sum: number, reservation) => sum + Number(reservation.party_size || 2),
    0,
  );
  const lockedPartySize = ((locks || []) as SlotLockRow[]).reduce(
    (sum: number, lock) => sum + Number(lock.party_size || 2),
    0,
  );
  const usedCapacity = currentPartySize + lockedPartySize;
  const remainingCapacity = Math.max(maxCapacity - usedCapacity, 0);

  return {
    current_reservations: overlapping.length,
    current_party_size: currentPartySize,
    locked_party_size: lockedPartySize,
    locked_reservations: (locks || []).length,
    occupancy_percent:
      maxCapacity > 0 ? Math.round((usedCapacity / maxCapacity) * 100) : 100,
    remaining_capacity: remainingCapacity,
    max_capacity: maxCapacity,
    slot_duration_minutes: slotDuration,
    max_reservations_per_slot: rule.max_reservations_per_slot ?? null,
    duplicate_for_user: duplicateForUser,
  };
}

export async function checkReservationAvailability(
  input: ReservationAvailabilityInput,
): Promise<ReservationAvailabilityResult> {
  const partySize = Math.max(Number(input.party_size || 2), 1);
  const startTime = normalizeTime(input.reservation_time);
  const rule = await getCapacityRule(input.location_id, input.reservation_date);
  const slotDuration = Number(
    rule.slot_duration_minutes || DEFAULT_CAPACITY.slot_duration_minutes,
  );
  const maxCapacity = Number(rule.max_capacity || DEFAULT_CAPACITY.max_capacity);
  const minPartySize = Number(
    rule.min_party_size || DEFAULT_CAPACITY.min_party_size,
  );
  const maxPartySize = Number(
    rule.max_party_size || DEFAULT_CAPACITY.max_party_size,
  );

  if (isReservationTimeInPastNewYork(input.reservation_date, startTime)) {
    return {
      available: false,
      remaining_capacity: 0,
      reason: "Please choose a future reservation time.",
      max_capacity: maxCapacity,
      slot_duration_minutes: slotDuration,
    };
  }

  if (rule.is_closed) {
    return {
      available: false,
      remaining_capacity: 0,
      reason: "Location is closed on this day.",
      max_capacity: maxCapacity,
      slot_duration_minutes: slotDuration,
    };
  }

  if (rule.open_time && rule.close_time) {
    const start = timeToMinutes(startTime);
    const open = timeToMinutes(rule.open_time);
    const close = timeToMinutes(rule.close_time);
    if (start < open || start + slotDuration > close) {
      return {
        available: false,
        remaining_capacity: 0,
        reason: "This time is outside the location's availability window.",
        max_capacity: maxCapacity,
        slot_duration_minutes: slotDuration,
      };
    }
  }

  if (partySize < minPartySize) {
    return {
      available: false,
      remaining_capacity: maxCapacity,
      reason: `Party size must be at least ${minPartySize}.`,
      max_capacity: maxCapacity,
      slot_duration_minutes: slotDuration,
    };
  }

  if (partySize > maxPartySize) {
    return {
      available: false,
      remaining_capacity: maxCapacity,
      reason: `Party size exceeds the maximum of ${maxPartySize}.`,
      max_capacity: maxCapacity,
      slot_duration_minutes: slotDuration,
    };
  }

  const load = await calculateSlotLoad(input);

  if (load.duplicate_for_user) {
    return {
      available: false,
      reason: "You already have an overlapping reservation for this time.",
      ...load,
    };
  }

  if (
    load.max_reservations_per_slot &&
    load.current_reservations + load.locked_reservations >=
      load.max_reservations_per_slot
  ) {
    return {
      available: false,
      reason: "This time has reached the reservation limit.",
      ...load,
    };
  }

  if (partySize > load.remaining_capacity) {
    return {
      available: false,
      reason: "Slot no longer available",
      ...load,
    };
  }

  return { available: true, reason: undefined, ...load };
}
