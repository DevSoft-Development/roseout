import { compactSmsMessage, extractClaimSearchContext, getSupportToolDecision, isResolutionMessage } from "@/lib/support/tool-layer";

describe("support tool layer", () => {
  test("recognizes clear customer resolution without closing unresolved messages", () => {
    expect(isResolutionMessage("Ok that worked thanks")).toBe(true);
    expect(isResolutionMessage("That fixed it")).toBe(true);
    expect(isResolutionMessage("Thanks")).toBe(true);
    expect(isResolutionMessage("Thanks but it still does not work")).toBe(false);
    expect(isResolutionMessage("It did not work")).toBe(false);
  });

  test("keeps claim entity context when a later SMS only supplies an area", () => {
    expect(
      extractClaimSearchContext(
        [
          "I need assistance claiming my restaurant",
          "Trying to start the claim",
          "Search for my location TheOutHaven Lounge",
        ],
        "New York",
      ),
    ).toEqual({ locationName: "TheOutHaven Lounge", area: "New York" });
  });

  test("can search immediately when the customer provides a business name", () => {
    expect(
      extractClaimSearchContext(
        ["I need assistance claiming my restaurant"],
        "Search for my location TheOutHaven Lounge",
      ),
    ).toEqual({ locationName: "TheOutHaven Lounge", area: "" });
  });

  test("password requests bypass stale claim context and return account recovery guidance", async () => {
    const decision = await getSupportToolDecision({
      ticketId: "stale-claim-ticket-that-should-not-be-read",
      latestMessage: "I'd like to change my password",
    });

    expect(decision).toMatchObject({
      reason: "account_password_reset_guidance",
      category: "Account",
      priority: "normal",
    });
    expect(decision?.message).toContain("/forgot-password");
    expect(decision?.message).not.toMatch(/claim|ownership verification/i);
  });

  test("login requests bypass unrelated support history", async () => {
    const decision = await getSupportToolDecision({
      ticketId: "unrelated-old-ticket-that-should-not-be-read",
      latestMessage: "I can't log in to my account",
    });

    expect(decision).toMatchObject({
      reason: "account_access_guidance",
      category: "Account",
    });
    expect(decision?.message).toContain("/login");
    expect(decision?.message).toContain("/forgot-password");
  });

  test("keeps support SMS under two concatenated GSM segments when possible", () => {
    const source = "This is a long support explanation. It includes several navigation steps. It also includes information the customer already knows. The important next action is to open the specific link and continue there. Do you want help with the next step after opening it?";
    const compacted = compactSmsMessage(source, 300);
    expect(compacted.length).toBeLessThanOrEqual(300);
    expect(compacted).toContain("?");
  });
});