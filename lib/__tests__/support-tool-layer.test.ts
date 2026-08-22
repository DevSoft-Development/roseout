import { compactSmsMessage, extractClaimSearchContext, isResolutionMessage } from "@/lib/support/tool-layer";

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

  test("keeps support SMS under two concatenated GSM segments when possible", () => {
    const source = "This is a long support explanation. It includes several navigation steps. It also includes information the customer already knows. The important next action is to open the specific link and continue there. Do you want help with the next step after opening it?";
    const compacted = compactSmsMessage(source, 300);
    expect(compacted.length).toBeLessThanOrEqual(300);
    expect(compacted).toContain("?");
  });
});
