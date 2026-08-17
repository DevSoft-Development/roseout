import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location menu workspace", () => {
  it("uses the friendly owner workflow around the live menu editor", () => {
    const page = readFileSync("app/locations/dashboard/menu/page.tsx", "utf8");
    expect(page).toContain("Build what guests can browse");
    expect(page).toContain("Choose what you want to edit");
    expect(page).toContain("Create a section");
    expect(page).toContain("Add items & photos");
    expect(page).toContain("Preview, then publish");
    expect(page).toContain("commercePageId");
    expect(page).toContain("embedded");
  });

  it("keeps edits scoped to the selected existing commerce page", () => {
    const menu = readFileSync("lib/locations/menu.ts", "utf8");
    expect(menu).toContain("getLocationCommercePages");
    expect(menu).toContain("commercePageId");
    expect(menu).toContain('.eq("commerce_page_id", page.id)');
    expect(menu).toContain("Section not found on this page");
  });

  it("supports direct menu item image uploads", () => {
    const editor = readFileSync("app/business/dashboard/menu/MenuEditorClient.tsx", "utf8");
    const uploadRoute = readFileSync("app/api/business/menu/item-image/upload/route.ts", "utf8");
    expect(editor).toContain("Upload Image");
    expect(editor).toContain("accept=\"image/*\"");
    expect(editor).toContain("/api/business/menu/item-image/upload");
    expect(uploadRoute).toContain('const BUCKET = "menu-item-images"');
    expect(uploadRoute).toContain("8 * 1024 * 1024");
  });
});
