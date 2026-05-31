import { createHash } from "crypto";
import {
  calculateLocationQuality,
  cleanText,
  normalizePhone,
} from "@/lib/location-growth/shared";

type StageableRow = Record<string, unknown>;

export function normalizeLocationText(value: unknown) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLocationKey(row: StageableRow) {
  const name = row.name || row.restaurant_name || row.activity_name;
  const joined = [
    normalizeLocationText(name),
    normalizeLocationText(row.address),
    normalizeLocationText(row.city),
    cleanText(row.state).toUpperCase(),
  ].join("|");

  return createHash("md5").update(joined).digest("hex");
}

export function qualityStatusForScore(score: number) {
  if (score >= 75) return "publish_ready";
  if (score >= 55) return "review";
  return "reject";
}

export function calculateStagingQuality(row: StageableRow) {
  const qualityScore = calculateLocationQuality(row);

  return {
    normalized_name:
      normalizeLocationText(row.name || row.restaurant_name || row.activity_name) || null,
    normalized_address: normalizeLocationText(row.address) || null,
    normalized_phone: normalizePhone(row.phone),
    location_key: buildLocationKey(row),
    quality_score: qualityScore,
    quality_status: qualityStatusForScore(qualityScore),
  };
}

export function hasCompleteStagingQuality(row: StageableRow) {
  return Boolean(
    row.normalized_name &&
      row.normalized_address &&
      row.location_key &&
      row.quality_score !== null &&
      row.quality_score !== undefined &&
      row.quality_status,
  );
}
