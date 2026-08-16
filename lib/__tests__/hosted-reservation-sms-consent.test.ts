import fs from "node:fs";
import path from "node:path";

describe("hosted reservation SMS consent", () => {
  const widget = fs.readFileSync(
    path.join(process.cwd(), "public/widgets/reservations.js"),
    "utf8",
  );

  test("matches the public reservation consent posture", () => {
    expect(widget).toContain('placeholder="Mobile number (optional)"');
    expect(widget).toContain('name="smsConsent"');
    expect(widget).toContain("disabled><span class=\"toh-sms-copy\"");
    expect(widget).toContain("Consent is not a condition of purchase.");
    expect(widget).toContain("Optional and unchecked by default.");
    expect(widget).toContain('${apiBase}/sms-terms');
    expect(widget).toContain('${apiBase}/privacy');
  });

  test("only submits a phone number after explicit SMS consent", () => {
    expect(widget).toContain('const smsConsent = Boolean(data.get("smsConsent")) && Boolean(phone);');
    expect(widget).toContain("customer_phone: smsConsent ? phone : null");
    expect(widget).toContain("if (!hasPhone) smsConsentInput.checked = false");
    expect(widget).toContain("smsConsentInput.disabled = !hasPhone");
  });
});
