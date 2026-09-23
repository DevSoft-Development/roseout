import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}
function requireAll(source, values, label) {
  for (const value of values) requireText(source, value, `${label} missing ${value}`);
}

const status = read("lib/reservations/status.ts");
const reservationsRoot = read("app/api/reserve/portal/reservations/route.ts");
const reservationsReserve = read("apps/reserve/app/api/reserve/portal/reservations/route.ts");
const updateRoot = read("app/api/reserve/portal/reservations/update/route.ts");
const updateReserve = read("apps/reserve/app/api/reserve/portal/reservations/update/route.ts");
const assignRoot = read("app/api/reserve/portal/assign-resource/route.ts");
const assignReserve = read("apps/reserve/app/api/reserve/portal/assign-resource/route.ts");
const waitlist = read("lib/reserve/waitlist-service.ts");
const seatWaitlistRoot = read("app/api/v1/reserve/host/seat-waitlist/route.ts");
const seatWaitlistReserve = read("apps/reserve/app/api/v1/reserve/host/seat-waitlist/route.ts");
const host = read("components/reserve/ReserveEnterpriseHostView.tsx");
const reminders = read("lib/reservations/reminders.ts");
const reminderCron = read("supabase/functions/reservation-reminder-cron/index.ts");
const tableReadyRoot = read("app/api/reserve/portal/reservations/table-ready/route.ts");
const tableReadyReserve = read("apps/reserve/app/api/reserve/portal/reservations/table-ready/route.ts");
const guarantee = read("lib/reservations/guarantee.ts");
const atomicAssignment = read("supabase/migrations/20260906043500_reserve_canonical_bookable_assignment.sql");
const atomicWaitlist = read("supabase/migrations/20260903213600_reserve_waitlist_atomic_seating.sql");
const waitlistRealtime = read("supabase/migrations/20260903213400_reserve_waitlist_realtime.sql");\nconst waitlistRealtimeRepair = read("supabase/migrations/20260923102000_reserve_waitlist_realtime_repair.sql");

requireAll(status, [
  '"pending"',
  '"confirmed"',
  '"checked_in"',
  '"waiting"',
  '"seated"',
  '"completed"',
  '"cancelled"',
  '"no_show"',
], "Reservation lifecycle");
requireText(status, "ALLOWED_RESERVATION_STATUS_TRANSITIONS", "Reservation lifecycle needs guarded transitions.");
requireText(status, 'label: hasAssignment ? "Seat guest" : "Assign table"', "Host lifecycle must require table assignment before seating.");

if (reservationsRoot !== reservationsReserve) throw new Error("Root and isolated Reserve reservation routes must remain identical.");
if (updateRoot !== updateReserve) throw new Error("Root and isolated Reserve reservation update routes must remain identical.");
requireAll(reservationsRoot, [
  "no_show_grace_minutes",
  "guarantee_required",
  "chargeReservationGuarantee",
  "releaseReservationGuarantee",
  "deposit_required",
  "deposit_status",
], "Reservation operations");

if (assignRoot !== assignReserve) throw new Error("Root and isolated Reserve assignment routes must remain identical.");
requireAll(assignRoot, [
  "layout_items",
  "location_bookable_items",
  "reservationConflictsWithResource",
  "bookable_item_name",
  "bookable_item_type",
], "Floor assignment");
requireText(atomicAssignment, "That table was just assigned or conflicts with another reservation", "Atomic assignment must reject overlapping table ownership.");

requireAll(waitlist, [
  '"waiting"',
  '"waitlisted"',
  '"notified"',
  "waitlist_position",
  "reservation_waitlist",
], "Waitlist");
if (seatWaitlistRoot !== seatWaitlistReserve) throw new Error("Root and isolated Reserve waitlist seating routes must remain identical.");
requireText(seatWaitlistRoot, "reserve_seat_waitlist_atomic", "Waitlist seating must have a database-atomic fallback.");
requireText(atomicWaitlist, "converted_reservation_id", "Waitlist conversion must link the resulting reservation.");
requireText(waitlistRealtime, "supabase_realtime", "Waitlist must publish realtime location-scoped changes.");\nrequireText(waitlistRealtimeRepair, "alter publication supabase_realtime add table public.reservation_waitlist", "Production/DR repair migration must re-assert waitlist realtime publication.");

requireAll(host, [
  'kind = "waitlist"',
  "useDraggable",
  "useDroppable",
  "seat-waitlist",
  "/api/v1/reserve/host/assign",
], "Enterprise host view");

requireAll(reminders, [
  'type ReminderWindow = "reminder_24h" | "reminder_2h"',
  "sendReservationReminderEmail",
  "sendReservationReminderSMS",
  "onConflict: \"reservation_id,reminder_type\"",
], "Reservation reminders");
requireText(reminderCron, "reservation-reminder-cron", "Reminder cron must remain deployed.");
if (tableReadyRoot !== tableReadyReserve) throw new Error("Root and isolated Reserve table-ready routes must remain identical.");
requireText(tableReadyRoot, "tableReady", "Table-ready messaging must respect location reminder settings.");

requireAll(guarantee, [
  'type GuaranteeReason = "late_cancel" | "no_show"',
  "stripe_payment_method_id",
  "stripe_connect_account_id",
  "idempotencyKey",
  "fraudDecisionPreventsSensitiveAction",
], "No-show protection");

console.log("Enterprise Reservations + Waitlist closure checks passed.");
