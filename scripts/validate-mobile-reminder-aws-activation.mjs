import fs from "node:fs";

const schedules = JSON.parse(fs.readFileSync("infra/aws/edge-runtime/schedules.json", "utf8"));
if (schedules.length !== 65) throw new Error(`Expected 65 canonical schedules, got ${schedules.length}`);

const reservation = schedules.find((row) => row.name === "reservation-reminder-cron");
if (!reservation) throw new Error("reservation-reminder-cron schedule missing");
if (reservation.expression !== "cron(0/15 * * * ? *)") throw new Error("reservation reminder cadence drifted");
if (reservation.function !== "reservation-reminder-cron") throw new Error("reservation reminder runtime drifted");
if (reservation.body?._enqueue_background_target !== "/api/cron/mobile-outing-reminders") {
  throw new Error("mobile reminder sidecar target missing");
}
if (reservation.body?._enqueue_background_payload?.source !== "reservation_reminder_sidecar") {
  throw new Error("mobile reminder sidecar source missing");
}

const invoker = fs.readFileSync("infra/aws/lambda/edge_scheduler_invoker.py", "utf8");
for (const needle of ["_enqueue_background_target", "_enqueue_background_payload", "enqueue_background_cron"]) {
  if (!invoker.includes(needle)) throw new Error(`edge scheduler invoker missing ${needle}`);
}

const route = fs.readFileSync("app/api/cron/mobile-outing-reminders/route.ts", "utf8");
if (!route.includes("requireCronRequest")) throw new Error("mobile reminder route must use shared cron auth");
if (route.includes("MOBILE_OUTING_REMINDER_CRON_SECRET")) {
  throw new Error("mobile reminder route must not require a separate cron secret");
}

console.log("mobile reminder AWS activation contract: OK");
