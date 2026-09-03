import "server-only";
export function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Invalid email address");
  return normalized;
}
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) throw new Error("Invalid phone number");
  return e164;
}
