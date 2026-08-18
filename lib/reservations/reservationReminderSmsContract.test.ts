import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cron = fs.readFileSync(
  path.join(repoRoot, "supabase/functions/reservation-reminder-cron/index.ts"),
  "utf8",
);
const sms = fs.readFileSync(
  path.join(repoRoot, "supabase/functions/_shared/sms.ts"),
  "utf8",
);

describe("reservation reminder SMS contract", () => {
  it("honors the location SMS reminder setting and no longer hardcodes sms_helper_missing", () => {
    expect(cron).toContain("reminderSettings.sms === true");
    expect(cron).toContain('reason: "sms_disabled"');
    expect(cron).not.toContain("sms_helper_missing");
  });

  it("sends SMS through the shared Edge Telnyx sender", () => {
    expect(cron).toContain('import { sendSms } from "../_shared/sms.ts"');
    expect(cron).toContain("await sendSms({");
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_API_KEY")');
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_PHONE_NUMBER")');
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID")');
    expect(sms).toContain('https://api.telnyx.com/v2/messages');
    expect(sms).toContain("if (!response.ok)");
  });

  it("keeps email and SMS delivery independent", () => {
    expect(cron).toContain("const delivered = emailDelivered || smsDelivered");
    expect(cron).toContain("const partialFailure = delivered && deliveryErrors.length > 0");
    expect(cron).toContain("partial_failure: partialFailure");
    expect(cron).toContain("partial_failure_count: partialFailures");
  });

  it("persists channel-level reminder delivery outcomes", () => {
    expect(cron).toContain('action: "reservation_reminder_delivery"');
    expect(cron).toContain("email: metadata.email");
    expect(cron).toContain("sms: metadata.sms");
    expect(cron).toContain("attempted_at: new Date().toISOString()");
  });

  it("redacts provider credentials in provider errors", () => {
    expect(sms).toContain('"Bearer [redacted]"');
    expect(sms).toContain(".slice(0, 240)");
  });
});
