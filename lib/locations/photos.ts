import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CacheGooglePhotoOptions } from "@/lib/locations/photoTypes";
export {
  dedupeLocationPhotos,
  getBestLocationImage,
  getBestPublicLocationImageFromRecord,
  getLocationImageFromRecord,
  getLocationPhotoGallery,
  getMissingPhotoStatusFromRecord,
  getPublicLocationPhotoGallery,
  getPublicLocationPhotosFromRecord,
  normalizeLocationPhotoList,
  normalizePhotoUrlForPublic,
  normalizePublicLocationPhotos,
  normalizePublicLocationPhotosFromRecord,
} from "@/lib/locations/photo-public";
import {
  getMissingPhotoStatusFromRecord,
  getPublicLocationPhotosFromRecord,
} from "@/lib/locations/photo-public";

export async function getPublicLocationPhotos(locationIdOrSlug: string) {
  const { data, error } = await supabaseAdmin.from("locations").select("*").or(`id.eq.${locationIdOrSlug},slug.eq.${locationIdOrSlug}`).maybeSingle();
  if (error) throw error;
  return getPublicLocationPhotosFromRecord(data as any);
}

export async function getLocationPhotos(locationId: string) {
  const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (error) throw error;
  return getPublicLocationPhotosFromRecord(data as any);
}

export async function getEditableLocationPhotos(locationId: string, _context: unknown) { return getLocationPhotos(locationId); }
export async function uploadLocationPhoto(): Promise<never> { throw new Error("Use the canonical upload API route for file uploads."); }
export async function setPrimaryLocationPhoto(): Promise<never> { throw new Error("Not implemented for legacy array-backed photos."); }
export async function deleteLocationPhoto(): Promise<never> { throw new Error("Not implemented for legacy array-backed photos."); }
export async function cacheGoogleLocationPhoto(_locationId: string, _options?: CacheGooglePhotoOptions) { throw new Error("Use cacheGooglePlacePhotoToStorage wrapper."); }
export async function repairLocationPhotoPublishability(locationId: string) { const { getPhotoPublishabilityUpdates } = await import("@/lib/location-growth/repairPhotoPublishability"); const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle(); if (error) throw error; return getPhotoPublishabilityUpdates(data as any); }
export async function getMissingPhotoStatus(locationId: string) { const { data, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle(); if (error) throw error; return getMissingPhotoStatusFromRecord(data as any); }
