export function normalizeCareerEmail(email: string) { return email.trim().toLowerCase(); }
export function slugifyCareerTitle(title: string) { return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
export function validateRequiredString(value: unknown, label: string) { if (typeof value !== "string" || !value.trim()) return `${label} is required.`; return null; }
export function isDuplicateApplicationError(message?: string | null) { return Boolean(message && /duplicate|unique/i.test(message)); }
