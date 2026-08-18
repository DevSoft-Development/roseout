import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("reservation lifecycle emails", () => {
  test("uses one visual lifecycle renderer for customer reservation emails", () => {
    const renderer = read("lib/email/reservation-lifecycle.ts");
    const helpers = read("lib/email/reservation-emails.ts");

    expect(renderer).toContain('type ReservationLifecycleKind = "confirmation" | "reminder" | "modified" | "cancelled" | "waitlist"');
    expect(renderer).toContain("TheOutHaven<br/><span");
    expect(renderer).toContain("Reservations</span>");
    expect(renderer).toContain("email-shell");
    expect(renderer).toContain("Manage reservation");
    expect(helpers).toContain("renderReservationLifecycleEmail");
    expect(helpers).not.toContain("user_reservation_confirmation");
    expect(helpers).not.toContain("user_reservation_reminder");
    expect(helpers).not.toContain("user_reservation_cancelled");
  });

  test("sends modified email after web and sms reservation updates", () => {
    const modifyRoute = read("app/api/reservations/[id]/modify/route.ts");
    const smsActions = read("lib/reservations/sms-actions.ts");

    expect(modifyRoute).toContain("sendReservationModifiedEmail");
    expect(modifyRoute.indexOf(".update({")).toBeLessThan(modifyRoute.lastIndexOf("sendReservationModifiedEmail"));
    expect(smsActions).toContain("sendReservationModifiedEmail");
    expect(smsActions).toContain('eventType: "reservation_modified"');
    expect(smsActions.indexOf('eventType: "reservation_modified"')).toBeLessThan(smsActions.indexOf("sendReservationModifiedEmail({"));
  });

  test("reminder, cancellation, confirmation and waitlist helpers all use the lifecycle renderer", () => {
    const helpers = read("lib/email/reservation-emails.ts");

    expect(helpers).toContain('sendLifecycleEmail("confirmation"');
    expect(helpers).toContain('sendLifecycleEmail("modified"');
    expect(helpers).toContain('sendLifecycleEmail("cancelled"');
    expect(helpers).toContain('sendLifecycleEmail("reminder"');
    expect(helpers).toContain('sendLifecycleEmail("waitlist"');
  });
});
