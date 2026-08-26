import { describe, expect, it } from "vitest";

import { classifySmsDepartment, isShortSmsContinuation } from "@/lib/communications/sms-intent-routing";

describe("system-wide SMS intent routing", () => {
  it("routes account and support requests away from stale conversations", () => {
    expect(classifySmsDepartment("I'd like to change my password")).toBe("support");
    expect(classifySmsDepartment("I can't log in to my account")).toBe("support");
    expect(classifySmsDepartment("I need help claiming my restaurant")).toBe("support");
    expect(classifySmsDepartment("I was charged twice and need support")).toBe("support");
  });

  it("routes explicit reservation-management requests", () => {
    expect(classifySmsDepartment("Change my reservation to 8:30")).toBe("reservations");
    expect(classifySmsDepartment("I need to cancel my booking")).toBe("reservations");
    expect(classifySmsDepartment("What are the details for my reservation?")).toBe("reservations");
    expect(classifySmsDepartment("I'm on the waitlist")).toBe("reservations");
  });

  it("routes explicit outing and place questions to Concierge", () => {
    expect(classifySmsDepartment("Give me directions to Catch")).toBe("concierge");
    expect(classifySmsDepartment("What time does the restaurant close?")).toBe("concierge");
    expect(classifySmsDepartment("Find me a date night in Brooklyn")).toBe("concierge");
    expect(classifySmsDepartment("Swap the activity in my outing")).toBe("concierge");
  });

  it("does not steal Book Plan booking confirmations from Concierge", () => {
    expect(classifySmsDepartment("I booked Catch")).toBeNull();
    expect(classifySmsDepartment("I was able to book it")).toBeNull();
    expect(classifySmsDepartment("the booking worked")).toBeNull();
  });

  it("leaves short replies with the active conversation owner", () => {
    for (const message of ["YES", "no", "4", "SKIP", "thanks", "okay", "maybe later"]) {
      expect(isShortSmsContinuation(message)).toBe(true);
      expect(classifySmsDepartment(message)).toBeNull();
    }
    expect(classifySmsDepartment("New York")).toBeNull();
    expect(classifySmsDepartment("HELP")).toBeNull();
  });
});
