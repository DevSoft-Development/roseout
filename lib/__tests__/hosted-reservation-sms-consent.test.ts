import fs from "node:fs";
import path from "node:path";

describe("hosted reservation contact consent", () => {
  const widget = fs.readFileSync(
    path.join(process.cwd(), "public/widgets/reservations.js"),
    "utf8",
  );

  test("allows email, text, or both with clear terms", () => {
    expect(widget).toContain('placeholder="Mobile number"');
    expect(widget).not.toContain('placeholder="Mobile number (optional)"');
    expect(widget).toContain('name="smsConsent"');
    expect(widget).toContain("disabled><span class=\"toh-sms-copy\"");
    expect(widget).toContain("Consent is not a condition of purchase.");
    expect(widget).not.toContain("SMS is optional and unchecked by default.");
    expect(widget).toContain("Provide an email address, a mobile number for text updates, or both.");
    expect(widget).toContain("Email terms:");
    expect(widget).toContain("transactional reservation confirmations, updates, and reminders by email");
    expect(widget).toContain("not marketing messages");
    expect(widget).toContain('${apiBase}/sms-terms');
    expect(widget).toContain('${apiBase}/privacy');
  });

  test("only treats a phone as a contact channel after explicit SMS consent", () => {
    expect(widget).toContain('const smsConsent = Boolean(data.get("smsConsent")) && Boolean(phone);');
    expect(widget).toContain("if (!email && !smsConsent)");
    expect(widget).toContain("customer_email: email || null");
    expect(widget).toContain("customer_phone: smsConsent ? phone : null");
    expect(widget).toContain("if (!hasPhone) smsConsentInput.checked = false");
    expect(widget).toContain("smsConsentInput.disabled = !hasPhone");
  });
});
