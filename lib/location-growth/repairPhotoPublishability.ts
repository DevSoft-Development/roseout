import { getPhotoStatus, hasLocationPhoto } from "@/lib/location-growth/photoDetection";
import { isLowLevelLocation, isUnverifiedNycRestaurant } from "@/lib/search/lowLevel";

type LocationLike = Record<string, any>;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function hasCoordinates(row: LocationLike) {
  return