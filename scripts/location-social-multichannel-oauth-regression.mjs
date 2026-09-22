import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

const oauth = read("lib/marketing/social-oauth.ts");
const locationOauth = read("lib/marketing/location-social-oauth.ts");
const start = read("apps/business/app/api/locations/social/[provider]/route.ts");
const callback = read("apps/business/app/api/locations/social/[provider]/callback/route.ts");
const page = read("apps/business/app/locations/dashboard/social-accounts/page.tsx");
const card = read("apps/business/app/locations/dashboard/social-accounts/LocationSocialChannelCard.tsx");
const publishing = read("lib/marketing/social-publishing.ts");

for (const provider of ["facebook", "tiktok", "youtube"]) {
  requireText(locationOauth, `value === "${provider}"`, `Location OAuth must allow ${provider}.`);
  requireText(page, `provider="${provider}"`, `Connected Accounts must expose ${provider}.`);
}
requireText(locationOauth, "locationId", "Location OAuth state must bind a location.");
requireText(locationOauth, "20 * 60 * 1000", "Location OAuth state must expire.");
requireText(start, 'permission: "marketing.edit"', "Connect/disconnect must require marketing.edit.");
requireText(callback, 'permission: "marketing.edit"', "OAuth callback must reauthorize location access.");
requireText(callback, "user.id !== state.userId", "OAuth callback must bind to the initiating user.");
requireText(start, "resolveWebSurfaceAuthOrigin", "OAuth redirects must preserve isolated Business origin.");
requireText(callback, "resolveWebSurfaceAuthOrigin", "OAuth callback must preserve isolated Business origin.");
requireText(oauth, 'scope?: "platform" | "location"', "Shared OAuth storage must support location scope.");
requireText(oauth, 'location_id: scope === "location" ? input.locationId : null', "Location OAuth must persist canonical location_id.");
requireText(oauth, 'META_LOGIN_CONFIGURATION_ID', "Meta Login for Business configuration must be honored.");
requireText(oauth, '"video.publish"', "TikTok OAuth must request approved direct-post scope.");
requireText(oauth, '"https://www.googleapis.com/auth/youtube.upload"', "YouTube OAuth must request upload scope.");
requireText(oauth, '"https://www.googleapis.com/auth/youtube.readonly"', "YouTube OAuth must request channel read scope.");
requireText(start, 'from("marketing_social_connection_secrets")', "Disconnect must remove encrypted provider tokens.");
requireText(card, "Disconnect", "Connected Accounts must support disconnect lifecycle.");
requireText(publishing, 'connection.provider === "tiktok"', "Publishing backend must support TikTok token refresh.");
requireText(publishing, 'connection.provider === "youtube"', "Publishing backend must support YouTube token refresh.");
requireText(publishing, "publishFacebook", "Publishing backend must support Facebook.");
requireText(publishing, "publishTikTok", "Publishing backend must support TikTok.");
requireText(publishing, "publishYouTube", "Publishing backend must support YouTube.");

console.log("Location multi-channel social OAuth regression checks passed.");
