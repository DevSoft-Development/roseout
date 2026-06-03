import { normalizeKbRole, roleCanManageKb, roleCanEditKb, roleCanViewArticle } from "../lib/knowledge-base/access";
import { renderKbTemplate } from "../lib/knowledge-base/render";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(normalizeKbRole("ambassador") === "partner_ambassador", "ambassador aliases to partner_ambassador");
assert(roleCanManageKb("admin"), "admin manages KB");
assert(roleCanEditKb("editor"), "editor edits KB drafts");
assert(!roleCanEditKb("viewer"), "viewer cannot edit KB");
assert(roleCanViewArticle("partner_ambassador", { visibility: "internal", allowed_roles: ["partner_ambassador"] }), "partner ambassador can see allowed article");
assert(!roleCanViewArticle("partner_ambassador", { visibility: "internal", allowed_roles: ["experience_team"] }), "partner ambassador cannot see experience article");
assert(renderKbTemplate("Hi {{owner_name}}", { owner_name: "Ava" }) === "Hi Ava", "template renders variables");
console.log("KB helper tests passed");
