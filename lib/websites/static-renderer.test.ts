import { describe, expect, it } from "vitest";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";
import { WEBSITE_COMPOSITION_PROFILES } from "@/lib/websites/composition-profiles";

const website = {
  id: "w1",
  location_id: "l1",
  editor_status: "draft",
  site_title: "Test Site",
  theme: {},
  sections: [
    { id: "hero", type: "hero", enabled: true, liveBindings: ["name"] },
    { id: "gallery", type: "gallery", enabled: true, liveBindings: ["photos"] },
    { id: "reservations", type: "reservations", enabled: true, liveBindings: ["reservation_link"] },
  ],
  custom_content: {},
  hosting_node_id: null,
  site_path: null,
  domain: null,
  platform_domain: null,
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

  it("ships ten genuinely distinct composition profiles", () => {
    const profiles = Object.values(WEBSITE_COMPOSITION_PROFILES);
    expect(profiles).toHaveLength(10);
    expect(new Set(profiles.map((profile) => profile.hero)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(profiles.map((profile) => profile.sectionOrder.join(","))).size).toBeGreaterThanOrEqual(7);
  });

  it("keeps reservation conversion prominent in every composition", () => {
    for (const direction of Object.keys(WEBSITE_COMPOSITION_PROFILES)) {
      const themed = { ...website, theme: { design_direction_id: direction } };
      const html = renderWebsiteArtifact(themed as never, { id: "l1", name: "TheOutHaven Lounge" })[0].content;
      expect(html).toContain('href="#reserve">Reserve</a>');
      expect(html).toContain("/embed/reservations/l1");
      expect(html).toContain("mobile-reserve");
      expect(html).toContain(`composition-${direction}`);
    }
  });

  it("does not repeat the same single canonical photo as a fake gallery", () => {
    const html = renderWebsiteArtifact(website as never, {
      id: "l1",
      name: "TheOutHaven Lounge",
      image_url: "https://images.example/lounge.jpg",
    })[0].content;
    expect(html.match(/https:\/\/images\.example\/lounge\.jpg/g)).toHaveLength(1);
    expect(html).not.toContain("gallery-stage");
  });
});
