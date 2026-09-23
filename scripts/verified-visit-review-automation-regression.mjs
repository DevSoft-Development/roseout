import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

const helper = read("lib/reviews/visit-verification.ts");
const reservation = read("lib/reservations/send-post-visit-review.ts");
const sms = read("lib/reviews/sms-review-conversation.ts");
const confirmRoot = read("app/api/outings/confirm/[token]/route.ts");
const confirmConsumer = read("apps/consumer/app/api/outings/confirm/[token]/route.ts");
const reviewRoot = read("app/api/reviews/route.ts");
const reviewConsumer = read("apps/consumer/app/api/reviews/route.ts");
const feedbackRoot = read("app/api/feedback/route.ts");
const feedbackConsumer = read("apps/consumer/app/api/feedback/route.ts");
const migration = read("supabase/migrations/20260923010000_canonical_verified_visit_review_integrity.sql");
const cron = read("app/api/cron/post-visit-followups/route.ts");

requireText(helper, 'from("outing_visit_verifications")', "Canonical helper must use outing_visit_verifications.");
requireText(helper, 'reservation_id', "Canonical helper must support reservation identity.");
requireText(helper, 'outing_id', "Canonical helper must support outing identity.");
requireText(helper, 'guest_session_id', "Canonical helper must support guest-session identity.");
requireText(helper, "linkReviewToCanonicalVisit", "Canonical helper must link submitted reviews back to visits.");

requireText(reservation, "ensureCanonicalVisitVerification", "Reservation follow-ups must canonicalize verified attendance.");
requireText(reservation, "visit_id: verification.id", "Reservation eligibility must store canonical visit_id.");
requireText(reservation, "followup_sent_at", "Reservation follow-ups must remain deduplicated.");

requireText(sms, "ensureCanonicalVisitVerification", "SMS review flow must canonicalize visits.");
requireText(sms, "visit_id: visit.id", "SMS eligibility must store canonical visit_id.");
requireText(sms, "linkReviewToCanonicalVisit", "SMS review submission must link review to visit.");

for (const source of [confirmRoot, confirmConsumer]) {
  requireText(source, "ensureCanonicalVisitVerification", "Attendance confirmation must create/reuse canonical visit.");
  requireText(source, "visit_id: verification.id", "Attendance-confirmed eligibility must carry visit_id.");
}
if (confirmRoot !== confirmConsumer) throw new Error("Root and consumer outing confirmation routes must remain identical.");

for (const source of [reviewRoot, reviewConsumer]) {
  requireText(source, "linkReviewToCanonicalVisit", "Web review submission must link review to canonical visit.");
}
if (reviewRoot !== reviewConsumer) throw new Error("Root and consumer review routes must remain identical.");

for (const source of [feedbackRoot, feedbackConsumer]) {
  requireText(source, "ensureCanonicalVisitVerification", "Guest check-in must use canonical visit verification.");
}
if (feedbackRoot !== feedbackConsumer) throw new Error("Root and consumer feedback routes must remain identical.");

requireText(migration, "uniq_visit_verification_reservation", "Reservation visit verification must be unique.");
requireText(migration, "uniq_visit_verification_outing_location", "Outing/location visit verification must be unique.");
requireText(migration, "uniq_visit_verification_guest_session_location", "Guest-session/location visit verification must be unique.");
requireText(migration, "location_review_eligibility_visit_id_fkey", "Review eligibility must reference canonical visit.");
requireText(migration, "canonical_visit_backfilled_at", "Existing eligibility must be backfilled when possible.");

requireText(cron, "sendReservationPostVisitReview", "Hourly post-visit cron must keep automatic reservation follow-ups.");
requireText(cron, "MAX_LATE_MS", "Post-visit cron must keep bounded late-send safety.");

console.log("Verified visit review automation regression checks passed.");
