import { describe, expect, it } from "vitest";
import { normalizeWaitlistRow } from "../../../app/api/reservations/waitlist/route";

describe("waitlist normalization", () => {
  it("returns contact and customer fallbacks plus notes", () => {
    const row = normalizeWaitlistRow({
      customer_name: "Ava",
      customer_phone: "212",
      customer_email: "ava@example.com",
      special_request: "Booth",
    });
    expect(row.contact_name).toBe("Ava");
    expect(row.contact_phone).toBe("212");
    expect(row.contact_email).toBe("ava@example.com");
    expect(row.notes).toBe("Booth");
  });

  it("allows null customer_phone when contact_email exists in normalized payloads", () => {
    const row = normalizeWaitlistRow({ contact_name: "Email Guest", contact_email: "guest@example.com", contact_phone: null, customer_phone: null });
    expect(row.customer_phone).toBeNull();
    expect(row.contact_email).toBe("guest@example.com");
  });
});
