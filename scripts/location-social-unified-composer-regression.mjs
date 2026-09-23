import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const route = read("apps/business/app/api/locations/marketing/social/publish/route.ts");
const composer = read("components/marketing/LocationSocialComposer.tsx");
const operations = read("lib/marketing/content-operations.ts");
const publishing = read("lib/marketing/social-publishing.ts");

requireText(route, 'permission: "marketing.edit"', "Unified social publishing must require marketing.edit.");
requireText(route, "normalizePlatforms", "Unified social publishing must normalize supported platforms.");
requireText(route, '.eq("scope", "location")', "Unified publishing must use location-scoped connections.");
requireText(route, "missingPlatforms", "Unified publishing must fail closed when a selected account is not connected.");
requireText(route, 'platforms.includes("instagram")', "Unified publishing must validate Instagram media/caption constraints.");
requireText(route, 'platforms.includes("tiktok")', "Unified publishing must enforce TikTok creator choices.");
requireText(route, 'platforms.includes("youtube")', "Unified publishing must validate YouTube video requirements.");
requireText(route, "contentApprovalHash", "Unified content must be approved before job creation.");
requireText(route, "syncApprovedSocialRecords", "Unified publishing must reuse the canonical social job fan-out.");
requireText(route, "claimAndProcessSocialPublishJob", "Publish-now must reuse the claimed worker-safe publisher.");
requireText(route, 'created_from: "location_social_composer"', "Unified content must preserve its creation source.");

for (const provider of ["instagram", "facebook", "tiktok", "youtube"]) {
  requireText(composer, `${provider}: "`, `Composer must expose ${provider}.`);
}
requireText(composer, "Build from live demand", "Composer must keep Search V2 demand integration.");
requireText(composer, "Channel copy", "Composer must allow per-channel copy.");
requireText(composer, "TikTok creator controls", "Composer must expose TikTok privacy controls.");
requireText(composer, "Review & publish", "Composer must require an explicit publish action.");

requireText(operations, "tiktok_privacy_level", "TikTok privacy choice must reach social_posts metadata.");
requireText(operations, "tiktok_disable_comment", "TikTok comment choice must reach social_posts metadata.");
requireText(operations, "tiktok_disable_duet", "TikTok duet choice must reach social_posts metadata.");
requireText(operations, "tiktok_disable_stitch", "TikTok stitch choice must reach social_posts metadata.");

requireText(publishing, "contentApprovalHash(content)", "Worker must revalidate approval hash before publishing.");
requireText(publishing, 'job.provider === "facebook"', "Worker must retain Facebook publishing.");
requireText(publishing, 'job.provider === "tiktok"', "Worker must retain TikTok publishing.");
requireText(publishing, 'else result = await publishYouTube', "Worker must retain YouTube publishing.");

console.log("Unified location social composer regression checks passed.");
