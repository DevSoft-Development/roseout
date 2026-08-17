import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("location menu workspace", () => {
  it("uses an item-first owner workflow", () => {
    const page = readFileSync("app/locations/dashboard/menu/page.tsx", "utf8");
    const quickAdd = readFileSync("app/locations/dashboard/menu/QuickAddMenuItem.tsx", "utf8");
    expect(page).toContain("Add what you sell. We handle the structure.");
    expect(page).toContain("Add the item");
    expect(page).toContain("Add the photo");
    expect(page).toContain("Choose the category");
    expect(page).toContain("Advanced organization");
    expect(page).toContain("QuickAddMenuItem");
    expect(quickAdd).toContain("You do not need to create categories first");
    expect(quickAdd).toContain("+ Create a new category");
    expect(quickAdd).toContain('Math.round(numericPrice * 100)');
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
