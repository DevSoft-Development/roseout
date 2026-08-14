import fs from "node:fs";
import path from "node:path";

describe("admin generated website reset", () => {
  it("is exposed from admin settings", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/admin/dashboard/settings/page.tsx"), "utf8");
    expect(source).toContain('/admin/dashboard/settings/websites');
    expect(source).toContain("Generated Websites");
  });

  it("deletes exactly one selected website and requires explicit confirmation", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/admin/websites/route.ts"), "utf8");
    expect(source).toContain("requireSuperAdmin");
    expect(source).toContain('confirmation !== "DELETE"');
    expect(source).toContain('.eq("id", websiteId)');
    expect(source).toContain('.eq("location_id", locationId)');
    expect(source).not.toContain("delete all");
  });

  it("preserves location and registered-domain records", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/admin/websites/route.ts"), "utf8");
    expect(source).toContain('.from("business_websites")');
    expect(source).not.toContain('.from("locations").delete');
    expect(source).not.toContain('.from("domain_registration_operations").delete');
  });
});
