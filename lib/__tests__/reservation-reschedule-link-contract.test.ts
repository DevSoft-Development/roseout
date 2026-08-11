import fs from "node:fs";
import path from "node:path";

describe("reservation reschedule link contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/reserve/confirmation/[token]/page.tsx"),
    "utf8",
  );

  it("keeps customer PII out of the reschedule URL", () => {
    expect(source).toContain("rescheduleToken=${token}");
    expect(source).toContain("partySize=${");
    expect(source).not.toContain("customer_name=");
    expect(source).not.toContain("customer_email=");
    expect(source).not.toContain("customer_phone=");
  });

  it("does not carry internal table inventory in the reschedule URL", () => {
    expect(source).not.toContain("&item=${reservation.bookable_item_id");
  });

  it("explains automatic original-reservation cancellation accurately", () => {
    expect(source).toContain("Your original reservation stays active until the new one is");
    expect(source).toContain("successfully created, then it is cancelled automatically.");
    expect(source).not.toContain("can cancel this one if needed");
  });
});
