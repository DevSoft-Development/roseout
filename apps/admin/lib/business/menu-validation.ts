export const MENU_STATUSES = ["draft", "published", "hidden"] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];
export const POST_MENU_ACTIONS = ["create_page", "create_section", "create_item"] as const;
export const PATCH_MENU_ACTIONS = ["update_page", "update_section", "update_item", "reorder_sections", "reorder_items", "publish_page", "unpublish_page"] as const;
export const DELETE_MENU_ACTIONS = ["delete_section", "delete_item"] as const;

export function isValidMenuAction(method: "POST" | "PATCH" | "DELETE", action: unknown) {
  const value = String(action || "");
  if (method === "POST") return (POST_MENU_ACTIONS as readonly string[]).includes(value);
  if (method === "PATCH") return (PATCH_MENU_ACTIONS as readonly string[]).includes(value);
  return (DELETE_MENU_ACTIONS as readonly string[]).includes(value);
}

export function normalizeMenuStatus(value: unknown): MenuStatus | null {
  const status = String(value || "").trim().toLowerCase();
  return (MENU_STATUSES as readonly string[]).includes(status) ? (status as MenuStatus) : null;
}

export function cleanNullableUrl(value: unknown) {
  const url = String(value || "").trim();
  return url || null;
}

export function normalizePriceCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function menuResponseShape(data: { location: unknown; page: unknown; sections: unknown[]; items: unknown[]; previewUrl: string; permissions?: unknown }) {
  return { ok: true, data: { location: data.location, page: data.page, sections: data.sections, items: data.items, previewUrl: data.previewUrl, permissions: data.permissions ?? { canEdit: true } } };
}
