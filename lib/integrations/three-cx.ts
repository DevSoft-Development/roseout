import { timingSafeEqual } from "node:crypto";

const PHONE_DIGITS = /\D/g;

export function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(PHONE_DIGITS, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
}

export function phoneLookupSuffix(value: unknown) {
  const normalized = normalizePhone(value);
  return normalized.length >= 4 ? normalized.slice(-4) : normalized;
}

export function isThreeCxAuthorized(request: Request) {
  const expected = process.env.THREE_CX_CRM_API_KEY?.trim();
  if (!expected) return false;

  const url = new URL(request.url);
  const supplied =
    request.headers.get("x-3cx-api-key")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    url.searchParams.get("key")?.trim() ||
    "";

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function firstText(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

export function splitContactName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) return { firstName: "", lastName: "" };
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || "",
  };
}
