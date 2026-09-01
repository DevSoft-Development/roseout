import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contentOperations = readFileSync("lib/marketing/content-operations.ts", "utf8");
const instagramApi = readFileSync("lib/marketing/instagram-business-api.ts", "utf8");
const socialMetrics = readFileSync("lib/marketing/social-metrics.ts", "utf8");
const publishRoute = readFileSync("app/api/locations/marketing/instagram/publish/route.ts", "utf8");
const locationOauth = readFileSync("lib/marketing/location-instagram-oauth.ts", "utf8");
const platformOauth = readFileSync("lib/marketing/platform-instagram-oauth.ts", "utf8");
const providerConfig = readFileSync("lib/marketing/social-provider-config.ts", "utf8");

describe("location Instagram end-to-end safety", () => {
  it("binds location-scoped content to the exact location connection", () => {
    expect(contentOperations).toContain('content.scope === "location"');
    expect(contentOperations).toContain('.eq("location_id", content.location_id)');
    expect(publishRoute).toContain('.eq("scope", "location")');
    expect(publishRoute).toContain('.eq("location_id", locationId)');
    expect(publishRoute).toContain('post.social_connection_id !== connection.id');
    expect(publishRoute).toContain('job.connection_id !== connection.id');
  });

  it("uses Instagram Business Login graph endpoints and refresh", () => {
    expect(instagramApi).toContain("https://graph.instagram.com/");
    expect(instagramApi).toContain("https://graph.instagram.com/refresh_access_token");
    expect(instagramApi).toContain('grant_type", "ig_refresh_token');
    expect(instagramApi).not.toContain("graph.facebook.com");
  });

  it("uses the Instagram platform App ID instead of the generic Meta App ID", () => {
    expect(providerConfig).toContain("instagramAppId");
    expect(providerConfig).toContain("INSTAGRAM_APP_ID");
    expect(providerConfig).toContain("instagramAppSecret");
    expect(locationOauth).toContain("loadInstagramSocialConfig");
    expect(platformOauth).toContain("loadInstagramSocialConfig");
    expect(locationOauth).not.toContain("loadMetaSocialConfig");
    expect(platformOauth).not.toContain("loadMetaSocialConfig");
  });

  it("syncs metrics for connected accounts across scopes", () => {
    expect(socialMetrics).toContain('.eq("status", "connected")');
    expect(socialMetrics).not.toContain('.eq("scope", "platform")');
    expect(socialMetrics).toContain("instagramAccountMetrics");
    expect(socialMetrics).toContain("instagramPostMetrics");
  });
});
