import { describe, expect, it } from "vitest";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";

const website = {
  id: "w1",
  location_id: "l1",
  editor_status: "draft",
  site_title: "Test Site",
  theme: {},
  sections: [{ id: "hero", type: "hero", enabled: true, liveBindings: ["name"] }],
  custom_content: {},
  hosting_node_id: null,
  site_path: null,
  domain: null,
  published_version: null,
  last_publish_status: "not_published",
  last_error: null,
  published_at: null,
  created_at: "",
  updated_at: "",
} as const;

describe("static website renderer", () => {
  it("renders one self-contained index file", () => {
    const files = renderWebsiteArtifact(website as never, { id: "l1", name: "TheOutHaven Lounge" });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("index.html");
    expect(files[0].content).toContain("TheOutHaven Lounge");
  });

  it("escapes canonical location content", () => {
    const files = renderWebsiteArtifact(website as never, { id: "l1", name: "<script>alert(1)</script>" });
    expect(files[0].content).not.toContain("<script>alert(1)</script>");
    expect(files[0].content).toContain("&lt;script&gt;");
  });
});
