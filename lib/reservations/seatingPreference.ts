export type SeatingPreference = "any" | "dining" | "bar";

export function normalizeSeatingPreference(value: unknown): SeatingPreference {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bar") return "bar";
  if (normalized === "dining" || normalized === "table") return "dining";
  return "any";
}

export function isBarSeatingType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalized);
}
