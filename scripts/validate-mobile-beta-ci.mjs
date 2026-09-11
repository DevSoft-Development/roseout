import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/mobile-beta-ci.yml", "utf8");
const checklist = fs.readFileSync("mobile/BETA_RELEASE_CHECKLIST.md", "utf8");
const app = JSON.parse(fs.readFileSync("mobile/app.json", "utf8")).expo;
const eas = JSON.parse(fs.readFileSync("mobile/eas.json", "utf8"));

if (!workflow.includes("node-version: '22.13.1'")) throw new Error("Mobile CI must pin Node 22.13.1");
if (!workflow.includes("npm run typecheck")) throw new Error("Mobile CI must typecheck");
if (!workflow.includes("npx expo config --type public")) throw new Error("Mobile CI must validate Expo config");
if (checklist.includes("MOBILE_OUTING_REMINDER_CRON_SECRET")) throw new Error("Stale mobile reminder secret remains in checklist");
if (!checklist.includes("existing server/AWS `CRON_SECRET`")) throw new Error("Shared CRON_SECRET contract missing from checklist");
if (app?.ios?.bundleIdentifier !== "com.theouthaven.app") throw new Error("Unexpected iOS bundle identifier");
if (app?.android?.package !== "com.theouthaven.app") throw new Error("Unexpected Android package");
if (!app?.ios?.associatedDomains?.includes("applinks:outhvn.com")) throw new Error("iOS short-link associated domain missing");
if (!eas?.build?.preview || eas.build.preview.distribution !== "internal") throw new Error("EAS preview profile must remain internal");

console.log("Mobile beta CI readiness contract verified.");
