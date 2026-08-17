import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location menu workspace", () => {
  it("uses a guided item-first owner workflow", () => {
    const page = readFileSync("app/locations/dashboard/menu/page.tsx", "utf8");
    const basics = readFileSync("app/locations/dashboard/menu/MenuPageBasics.tsx", "utf8");
    const quickAdd = readFileSync("app/locations/dashboard/menu/QuickAddMenuItem.tsx", "utf8");
    expect(page).toContain("Build your guest-facing menu step by step");
    expect(page).toContain("Choose what you are setting up");
    expect(page).toContain("Menu readiness");
    expect(page).toContain('id="menu-items"');
    expect(page).toContain("Organize and fine-tune");
    expect(page).toContain("Review and publish");
    expect(page).toContain("Advanced organization");
    expect(page).toContain("QuickAddMenuItem");
    expect(basics).toContain("Page basics");
    expect(basics).toContain('action: "update_page"');
    expect(basics).toContain('window.location.hash = "menu-items"');
    expect(basics).toContain("Save & continue");
    expect(quickAdd).toContain("You do not need to create categories first");
    expect(quickAdd).toContain("+ Create a new category");
    expect(quickAdd).toContain("Math.round(numericPrice * 100)");
  });

  it("keeps edits scoped to the selected existing commerce page", () => {
    const menu = readFileSync("lib/locations/menu.ts", "utf8");
    expect(menu).toContain("getLocationCommercePages");
    expect(menu).toContain("commercePageId");
    expect(menu).toContain('.eq("commerce_page_id", page.id)');
    expect(menu).toContain("Section not found on this page");
  });

  it("supports direct menu item image uploads in both simple and advanced flows", () => {
    const editor = readFileSync("app/business/dashboard/menu/MenuEditorClient.tsx", "utf8");
    const quickAdd = readFileSync("app/locations/dashboard/menu/QuickAddMenuItem.tsx", "utf8");
    const uploadRoute = readFileSync("app/api/business/menu/item-image/upload/route.ts", "utf8");
    expect(editor).toContain("Upload Image");
    expect(quickAdd).toContain("Upload photo");
    expect(quickAdd).toContain("/api/business/menu/item-image/upload");
    expect(uploadRoute).toContain('const BUCKET = "menu-item-images"');
    expect(uploadRoute).toContain("8 * 1024 * 1024");
  });
});
