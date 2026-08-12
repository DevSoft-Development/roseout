import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reminderCron = readFileSync(
  "supabase/functions/reservation-reminder-cron/index.ts",
  "utf8",
);

describe("TheOutHaven Lounge reminder recipient safety", () => {
  it("blocks external recipients whenever demo scope is active", () => {
    expect(reminderCron).toContain('const DEMO_EMAIL_DOMAIN = "@theouthaven.com"');
    expect(reminderCron).toContain('const SAFE_DEMO_PHONES = new Set(["2125550199", "12125550199"])');
    expect(reminderCron).toContain("demoLocationId &&");
    expect(reminderCron).toContain("!isSafeDemoEmail(email) || !isSafeDemoPhone(phone)");
    expect(reminderCron).toContain('error_message: "unsafe_demo_recipient_blocked"');
    expect(reminderCron).toContain('reason: "unsafe_demo_recipient_blocked"');
  });

  it("keeps the normal production reminder delivery path intact outside demo scope", () => {
    expect(reminderCron).toContain("await sendEmail({");
    expect(reminderCron).toContain("await sendSms({");
    expect(reminderCron).toContain("const demoLocationId = await resolveDemoReservationScope");
  });
});
