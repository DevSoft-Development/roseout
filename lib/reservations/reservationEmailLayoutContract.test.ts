import { describe, expect, it } from "vitest";
import { renderStructuredReservationRawEmail } from "@/lib/email/reservation-raw";

describe("reservation email layout", () => {
  it("renders the real production customer payload with a mobile-safe enterprise layout", () => {
    const rendered = renderStructuredReservationRawEmail({
      subject: "Your TheOutHaven Lounge reservation:",
      body: "TheOutHaven Reserve Hi nick, your reservation at TheOutHaven Lounge has been confirmed . Date: 2026-08-15 Time: 9:00 AM Party Size: 2 Reserved: VIP Booth View / Manage Reservation Use this link to view your reservation or cancel if needed. Thank you for using TheOutHaven.",
    });

    expect(rendered).not.toBeNull();
    expect(rendered?.html).toContain("Reservation confirmed");
    expect(rendered?.html).toContain("CONFIRMED");
    expect(rendered?.html).toContain("class=\"location-title\"");
    expect(rendered?.html).toContain("TheOutHaven Lounge");
    expect(rendered?.html).toContain("Sat, Aug 15");
    expect(rendered?.html).toContain("9:00 AM");
    expect(rendered?.html).toContain("2 guests");
    expect(rendered?.html).toContain("Reserved space");
    expect(rendered?.html).toContain("VIP Booth");
    expect(rendered?.html).toContain("Manage reservation");
    expect(rendered?.html).toContain("View, reschedule, or cancel this booking in TheOutHaven.");
    expect(rendered?.html).toContain("class=\"manage-button\"");
    expect(rendered?.html).toContain("width:600px;max-width:600px");
    expect(rendered?.html).not.toContain("2026-08-15</td>");
    expect(rendered?.html).not.toContain(">Reservation</td>");
    expect(rendered?.html).not.toContain("from your TheOutHaven reservations");
    expect(rendered?.html).not.toContain("Before you go");
    expect(rendered?.html).not.toContain("copy and paste this link");
    expect(rendered?.html).not.toContain("Operational details");
  });

  it("keeps pending reservations truthful", () => {
    const rendered = renderStructuredReservationRawEmail({
      subject: "Your TheOutHaven Lounge reservation:",
      body: "TheOutHaven Reserve Hi Nick, your reservation at TheOutHaven Lounge has been received and pending confirmation. Date: 2026-08-14 Time: 8:00 PM Party Size: 2 Reserved: Bar Seats View / Manage Reservation",
    });

    expect(rendered).not.toBeNull();
    expect(rendered?.html).toContain("PENDING CONFIRMATION");
    expect(rendered?.html).toContain("Reservation request received");
    expect(rendered?.html).not.toContain("Reservation confirmed");
  });

  it("renders owner notifications with reservation and customer details", () => {
    const rendered = renderStructuredReservationRawEmail({
      subject: "Your TheOutHaven Lounge reservation: Nick",
      body: "New TheOutHaven Reservation Nick submitted a reservation for TheOutHaven Lounge. Status: confirmed Date: 2026-08-14 Time: 8:00 PM Party Size: 2 Item: Bar Seats Email: nick@example.com Request: Birthday celebration Open Reserve Portal",
    });

    expect(rendered).not.toBeNull();
    expect(rendered?.html).toContain("New reservation received");
    expect(rendered?.html).toContain("NEW RESERVATION");
    expect(rendered?.html).toContain("8:00 PM");
    expect(rendered?.html).toContain("Bar Seats");
    expect(rendered?.html).toContain("nick@example.com");
    expect(rendered?.html).toContain("Birthday celebration");
    expect(rendered?.html).toContain("Open Reserve Portal");
  });

  it("does not hijack unrelated raw reservation emails", () => {
    expect(
      renderStructuredReservationRawEmail({
        subject: "Reservation system update",
        body: "A generic operational reservation message.",
      }),
    ).toBeNull();
  });
});
