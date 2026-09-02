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
const integration = fs.readFileSync(
  path.join(repoRoot, "supabase/functions/_shared/aws-integration.ts"),
  "utf8",
);
const edgeWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/aws-edge-runtime.yml"),
  "utf8",
);

describe("reservation reminder SMS contract", () => {
  it("honors the location SMS reminder setting and no longer hardcodes sms_helper_missing", () => {
    expect(cron).toContain("reminderSettings.sms === true");
    expect(cron).toContain('reason: "sms_disabled"');
    expect(cron).not.toContain("sms_helper_missing");
  });

  it("routes the shared Edge SMS sender through AWS Integration first", () => {
    expect(cron).toContain('import { sendSms } from "../_shared/sms.ts"');
    expect(cron).toContain("await sendSms({");
    expect(sms).toContain('from "./aws-integration.ts"');
    expect(sms).toContain("platformIntegrationApiConfigured()");
    expect(sms).toContain('sendTelnyxSmsViaIntegrationApi("reservations", recipient, message)');
    expect(integration).toContain('"/v1/telnyx/messages/send"');
    expect(integration).toContain('Deno.env.get("AWS_PLATFORM_INTEGRATION_API_URL")');
    expect(integration).toContain('Deno.env.get("AWS_PLATFORM_INTEGRATION_API_SECRET")');
    expect(integration).toContain('Deno.env.get("AWS_PLATFORM_JOB_GATEWAY_SECRET")');
  });

  it("only permits direct Telnyx rollout fallback after a proven Integration 404", () => {
    expect(sms).toContain('errorMessage !== "aws_platform_integration_api_http_404"');
    expect(sms).toContain("return { sent: false, skipped: false, error: safeProviderError(errorMessage) }");
    expect(sms).toContain("return await directSendSms(recipient, message)");
    expect(integration).toContain('response.status === 404');
    expect(integration).toContain('throw new Error("aws_platform_integration_api_http_404")');
  });

  it("keeps the direct Telnyx sender only as the rollout/unconfigured fallback", () => {
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_API_KEY")');
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_PHONE_NUMBER")');
    expect(sms).toContain('Deno.env.get("TELNYX_TRANSACTIONAL_MESSAGING_PROFILE_ID")');
    expect(sms).toContain('https://api.telnyx.com/v2/messages');
    expect(sms).toContain("if (!response.ok)");
  });

  it("injects Integration API authority into the AWS Edge runtime secret", () => {
    expect(edgeWorkflow).toContain("AWS_PLATFORM_INTEGRATION_API_SECRET: ${{ secrets.AWS_PLATFORM_INTEGRATION_API_SECRET }}");
    expect(edgeWorkflow).toContain("theouthaven-integration-api-production");
    expect(edgeWorkflow).toContain("IntegrationApiUrl");
    expect(edgeWorkflow).toContain("AWS_PLATFORM_INTEGRATION_API_URL:$AWS_PLATFORM_INTEGRATION_API_URL");
    expect(edgeWorkflow).toContain("AWS_PLATFORM_INTEGRATION_API_SECRET:$AWS_PLATFORM_INTEGRATION_API_SHARED_SECRET");
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
