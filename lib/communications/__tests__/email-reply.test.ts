import { describe, expect, it } from "vitest";
import { extractLatestEmailReply } from "../email-reply";

describe("extractLatestEmailReply", () => {
  it("keeps only the new iPhone reply", () => {
    const input = "I’m running 20 minutes late Sent from my iPhone On Aug 16, 2026, at 19:17, TheOutHaven Reservations &lt;reserve@theouthaven.com&gt; wrote: Your TheOutHaven reservation Reservation update Please reply if you need to cancel or change your time.";
    expect(extractLatestEmailReply(input)).toBe("I’m running 20 minutes late");
  });

  it("removes standard quoted reply blocks", () => {
    const input = "Can we come at 8 instead?\n\nOn Aug 16, 2026, at 7:17 PM, TheOutHaven Reservations <reserve@theouthaven.com> wrote:\nYour reservation is confirmed.";
    expect(extractLatestEmailReply(input)).toBe("Can we come at 8 instead?");
  });

  it("removes Outlook mobile signatures", () => {
    const input = "Please add one more guest.\nGet Outlook for iOS\nFrom: TheOutHaven Reservations <reserve@theouthaven.com>";
    expect(extractLatestEmailReply(input)).toBe("Please add one more guest.");
  });

  it("leaves plain replies alone", () => {
    expect(extractLatestEmailReply("We’ll be there on time. Thank you!"))
      .toBe("We’ll be there on time. Thank you!");
  });
});
