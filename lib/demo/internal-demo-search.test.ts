import { describe, expect, it } from "vitest";
import {
  isTheOutHavenLoungeSearch,
  requestContainsTheOutHavenLoungeSearch,
} from "@/lib/demo/internal-demo-search";

describe("TheOutHaven Lounge branded internal search", () => {
  it.each([
    "TheOutHaven Lounge",
    "The Outhaven Lounge",
    "TheOutHaven Lounge in Manhattan",
    "TheOutHaven Lounge near me",
    "TheOutHaven Lounge around New York",
  ])("recognizes %s as the branded demo lookup", (query) => {
    expect(isTheOutHavenLoungeSearch(query)).toBe(true);
  });

  it.each([
    "TheOutHaven Lounge and bowling",
    "TheOutHaven Lounge with dinner",
    "TheOutHaven Lounge then karaoke",
    "another lounge in Manhattan",
  ])("does not hijack ordinary outing search: %s", (query) => {
    expect(isTheOutHavenLoungeSearch(query)).toBe(false);
  });

  it("checks every supported request query field instead of only the first populated one", () => {
    expect(requestContainsTheOutHavenLoungeSearch({
      message: "Find me something fun",
      input: "TheOutHaven Lounge in Manhattan",
    })).toBe(true);
  });
});
