import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";
const failures = [];
const checks = [];

function assert(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
}

const dashboardLayout = read("app/user/dashboard/layout.tsx");
const profileRoute = read("app/api/user/profile/route.ts");
const dashboardLib = read("lib/user-dashboard.ts");
const outingDetail = read("app/user/dashboard/outings/[id]/page.tsx");
const savedDetail = read("app/user/dashboard/saved/[id]/page.tsx");
const bookRoute = read("app/api/user/outings/book/route.ts");
const stateRoute = read("app/api/user/outings/[id]/state/route.ts");
const completeRoute = read("app/api/outings/complete/route.ts");
const supportList = read("app/api/user/support/tickets/route.ts");
const supportDetail = read("app/api/user/support/tickets/[ticketId]/route.ts");
const supportMessages = read("app/api/user/support/tickets/[ticketId]/messages/route.ts");
const dashboardPage = read("app/user/dashboard/page.tsx");

assert("dashboard layout auth boundary", dashboardLayout.includes("requireUserForDashboard"), "app/user/dashboard/layout.tsx must enforce authentication for the whole dashboard subtree");

assert("profile authenticates server-side", profileRoute.includes("auth.getUser()") && profileRoute.includes("supabaseAdmin"), "profile writes must authenticate the session before service-role access");
assert("profile owns row by authenticated id", profileRoute.includes("user_id: user.id") && profileRoute.includes('onConflict: "user_id"'), "profile writes must derive user_id exclusively from auth.getUser()");
assert("profile minimizes PII", !profileRoute.includes("full_name") && !profileRoute.includes("birthday_day") && !profileRoute.includes('.select("*")') && profileRoute.includes('.from("consumer_profiles")'), "normal profile writes must use consumer_profiles and must not collect full name/birth day or return every column");
assert("profile required fields", profileRoute.includes("First name is required") && profileRoute.includes("valid 5-digit ZIP code is required") && profileRoute.includes("Birth month must be between 1 and 12"), "first name, ZIP, and birth month must remain the minimal required profile fields");

assert("dashboard profile select minimized", dashboardLib.includes('PROFILE_SELECT = "first_name,phone_e164,birth_month,home_zip_code,home_neighborhood,home_borough,home_city,home_county,home_state,home_market,sms_consent,personalization_enabled"'), "dashboard profile reads must use the canonical consumer profile field list");
assert("dashboard outing select excludes guest PII", !dashboardLib.match(/OUTING_SELECT[^\n]*(guest_email|guest_phone|guest_name|phone_number|confirm_token|plan_access_token)/), "dashboard outing list must not pull guest contact data or access tokens");

assert("canonical outing detail owner-scoped", outingDetail.includes('.from("outings")') && outingDetail.includes('.eq("user_id", user.id)') && !outingDetail.includes('.from("user_outings")'), "outing detail must read canonical outings and scope by authenticated user");
assert("legacy saved detail owner-scoped", savedDetail.includes('.from("saved_plans")') && savedDetail.includes('.eq("user_id", user.id)'), "legacy saved detail must retain explicit ownership filtering");
assert("legacy book bridges to canonical outings", bookRoute.includes('.from("saved_plans")') && bookRoute.includes('.eq("user_id", user.id)') && bookRoute.includes('.from("outings")') && !bookRoute.includes('.from("user_outings")'), "Book My Outing must validate saved-plan ownership and write canonical outings only");
assert("outing state owner-scoped", stateRoute.includes("auth.getUser()") && stateRoute.includes('.eq("user_id", user.id)'), "outing lifecycle state mutations must be authenticated and owner-scoped");
assert("outing completion owner-scoped", completeRoute.includes("auth.getUser()") && completeRoute.includes('.eq("user_id", userId)'), "completion must only update the authenticated user's outing");

for (const [name, source] of [["support list", supportList], ["support detail", supportDetail], ["support messages", supportMessages]]) {
  assert(`${name} authenticates`, source.includes("auth.getUser()"), `${name} must authenticate the current user`);
  assert(`${name} avoids broad selects`, !source.includes('.select("*")'), `${name} must return only workflow-required fields`);
  assert(`${name} avoids email authorization fallback`, !source.includes("requester_email.eq") && !source.includes("t.requester_email") && !source.includes("t.email!==user.email"), `${name} must authorize by stable user_id, not email`);
}
assert("support list owner-scoped", supportList.includes('.eq("user_id", user.id)'), "support list must only read the authenticated user's tickets");
assert("support detail owner-scoped", supportDetail.includes('.eq("user_id", user.id)'), "support detail must only read the authenticated user's ticket");
assert("support message owner-scoped", supportMessages.includes('.eq("user_id", user.id)'), "support replies must verify ticket ownership before insert/update");
assert("dashboard support list minimized", dashboardPage.includes('select("id,ticket_number,subject,category,status,updated_at,created_at")') && dashboardPage.includes('.eq("user_id", ctx.user.id)'), "dashboard ticket summary must be field-minimized and user-scoped");

const apiRoot = path.join(root, "app/api/user");
const routeFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "route.ts") routeFiles.push(full);
  }
}
walk(apiRoot);

const apiRisks = [];
for (const full of routeFiles) {
  const rel = path.relative(root, full).replaceAll("\\", "/");
  if (rel.startsWith("app/api/user/careers/")) continue; // intentionally public application flow
  const source = fs.readFileSync(full, "utf8");
  const privileged = source.includes("supabaseAdmin") || source.includes("getSupabaseAdminClient");
  if (privileged && !source.includes("auth.getUser()")) apiRisks.push(`${rel}: privileged access without auth.getUser()`);
  if (source.includes('.select("*")')) apiRisks.push(`${rel}: broad select(*) in consumer API`);
}
assert("consumer API privileged-auth sweep", apiRisks.length === 0, apiRisks.join("; ") || "all privileged consumer APIs authenticate");

console.log("User dashboard security audit");
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
console.log(`Routes scanned: ${routeFiles.length}`);
console.log(`Failures: ${failures.length}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = checks.map((check) => `- ${check.ok ? "✅" : "❌"} ${check.name}`).join("\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### User dashboard security audit\n\n${rows}\n\n- Consumer API routes scanned: **${routeFiles.length}**\n- Failures: **${failures.length}**\n`);
}

if (failures.length) {
  console.error("\n" + failures.join("\n"));
  process.exit(1);
}
