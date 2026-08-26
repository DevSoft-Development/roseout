import { describe, expect, it } from "vitest";

import {
  didSupportTopicChange,
  inferExplicitSupportTopic,
  scopeSupportTextContext,
} from "@/lib/support/topic-context";

describe("support topic isolation", () => {
  it("detects a new explicit topic instead of inheriting the old case", () => {
    expect(didSupportTopicChange([
      "I need help claiming my restaurant",
      "Search for my location TheOutHaven Lounge",
    ], "I'd like to change my password")).toBe(true);

    expect(didSupportTopicChange([
      "I can't log into my account",
    ], "I have a billing question about my subscription")).toBe(true);
  });

  it("does not split rephrased messages in the same topic", () => {
    expect(didSupportTopicChange([
      "I forgot my password",
    ], "The password reset email never arrived")).toBe(false);

    expect(didSupportTopicChange([
      "I need help claiming my business",
    ], "The ownership verification code isn't working")).toBe(false);
  });

  it("keeps ambiguous continuations attached to the active topic", () => {
    expect(didSupportTopicChange([
      "Search for my location TheOutHaven Lounge",
    ], "New York")).toBe(false);
    expect(inferExplicitSupportTopic("yes")).toBeNull();
  });

  it("scopes AI context at an explicit topic boundary", () => {
    const scoped = scopeSupportTextContext([
      "I need help claiming my restaurant",
      "Search for my location TheOutHaven Lounge",
      "It is in Queens",
    ], "I'd like to change my password");

    expect(scoped).toEqual(["I'd like to change my password"]);
    expect(scoped.join(" ")).not.toMatch(/claim|restaurant|Queens/i);
  });
});
