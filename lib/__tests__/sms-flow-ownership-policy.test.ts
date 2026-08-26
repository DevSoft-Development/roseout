import { describe, expect, it } from "vitest";

import { classifySmsDepartment } from "@/lib/communications/sms-intent-routing";
import { didSupportTopicChange } from "@/lib/support/topic-context";

describe("SMS conversation ownership policy", () => {
  it("lets a clear new department intent interrupt an existing flow", () => {
    expect(classifySmsDepartment("I forgot my password")).toBe("support");
    expect(classifySmsDepartment("Change my reservation to tomorrow")).toBe("reservations");
    expect(classifySmsDepartment("Give me directions to the restaurant")).toBe("concierge");
  });

  it("creates a clean Support topic boundary instead of carrying unrelated history", () => {
    expect(didSupportTopicChange([
      "I need help with my subscription invoice",
    ], "My website will not publish")).toBe(true);

    expect(didSupportTopicChange([
      "My website will not publish",
    ], "The custom domain is not working")).toBe(false);
  });
});
