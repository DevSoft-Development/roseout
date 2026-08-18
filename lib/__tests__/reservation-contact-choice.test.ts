import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("reservation contact choice", () => {
  const embedded = read("components/ReserveBookingForm.tsx");
  const fullBooking = read("app/reserve/location/[locationId]/booking/page.tsx");
  const hosted = read("public/widgets/reservations.js");

  test("removes the optional mobile label everywhere", () => {
    for (const source of [embedded, fullBooking, hosted]) {
      expect(source).toContain("Mobile number");
      expect(source).not.toContain("Mobile number (optional)");
      expect(source).toContain("Provide an email address, a mobile number for text updates, or both.");
    }
  });

  test("requires at least email or consented text contact", () => {
    expect(embedded).toContain("if (!contact.email && !contact.smsConsent)");
    expect(fullBooking).toContain("if (!trimmedEmail && !(trimmedPhone && smsConsent))");
    expect(hosted).toContain("if (!email && !smsConsent)");
    for (const source of [embedded, fullBooking, hosted]) {
      expect(source).toContain("Enter an email address or a mobile number and agree to text updates.");
    }
  });

  test("shows transactional email terms alongside SMS terms", () => {
    for (const source of [embedded, fullBooking, hosted]) {
      expect(source).toContain("Email terms:");
      expect(source).toContain("transactional reservation confirmations, updates, and reminders by email");
      expect(source).toContain("not marketing messages");
      expect(source).toContain("Consent is not a condition of purchase.");
    }
  });
});
