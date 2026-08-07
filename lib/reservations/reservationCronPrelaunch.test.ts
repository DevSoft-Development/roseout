import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("reservation cron prelaunch contract", () => {
  it("does not authorize admins from user-editable metadata", () => {
    const auth = read("supabase/functions/_shared/auth.ts");
    expect(auth).toContain("user?.app_metadata");
    expect(auth).not.toContain("user?.user_metadata");
  });

  it("deploys reservation cron functions with platform JWT verification disabled", () => {
    const config = read("supabase/config.toml");
    for (const slug of [
      "reservation-daily-digest",
      "reservation-status-cleanup",
      "reservation-reminder-cron",
    ]) {
      expect(config).toContain(`[functions.${slug}]\nverify_jwt = false`);
    }
  });

  it("keeps real reservation cron implementations in source control", () => {
    const reminder = read("supabase/functions/reservation-reminder-cron/index.ts");
    const cleanup = read("supabase/functions/reservation-status-cleanup/index.ts");
    const digest = read("supabase/functions/reservation-daily-digest/index.ts");

    expect(reminder).toContain('const JOB = "reservation-reminder-cron"');
    expect(reminder).toContain('from("reservation_reminders")');
    expect(cleanup).toContain('const JOB = "reservation-status-cleanup"');
    expect(cleanup).toContain('status: "no_show"');
    expect(digest).toContain('const JOB = "reservation-daily-digest"');
    expect(digest).toContain("Reservation daily digest");

    for (const source of [reminder, cleanup, digest]) {
      expect(source).not.toContain("Hello from Functions!");
      expect(source).toContain("requireAdminOrCron");
    }
  });
});
