import "server-only";

import { getPlacePhotosNew, type PlacesNewPhoto } from "@/lib/google/places-new-client";

export type GooglePhotoAttribution = {
  displayName: string | null;
  uri: string | null;
  photoUri: string | null;
};

export type GooglePhotoSlot = {
  index: number;
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  attributions: GooglePhotoAttribution[];
};

type GooglePhotoAuthor = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(9, Math.floor(parsed)));
}

function normalizeAttributions(photo: PlacesNewPhoto | undefined) {
  const values = Array.isArray(photo?.authorAttributions)
    ? (photo?.authorAttributions as GooglePhotoAuthor[])
    : [];
  return values.map((author) => ({
    displayName: clean(author?.displayName) || null,
    uri: clean(author?.uri) || null,
    photoUri: clean(author?.photoUri) || null,
  }));
}

async function getPhotoList(placeId: string) {
  const id = clean(placeId);
  if (!id) throw new Error("Missing Google Place ID.");
  return getPlacePhotosNew(id);
}

export async function getGooglePhotoSlot(placeId: string, requestedIndex: unknown) {
  const index = clampIndex(requestedIndex);
  const photos = await getPhotoList(placeId);
  const photo = photos[index];
  const name = clean(photo?.name);
  if (!name) return null;

  return {
    index,
    name,
    widthPx: Number.isFinite(Number(photo?.widthPx)) ? Number(photo?.widthPx) : null,
    heightPx: Number.isFinite(Number(photo?.heightPx)) ? Number(photo?.heightPx) : null,
    attributions: normalizeAttributions(photo),
  } satisfies GooglePhotoSlot;
}

export async function getGooglePhotoSlots(placeId: string, requestedLimit = 5) {
  const limit = Math.max(1, Math.min(10, Math.floor(Number(requestedLimit) || 5)));
  const photos = await getPhotoList(placeId);
  return photos.slice(0, limit).flatMap((photo, index) => {
    const name = clean(photo?.name);
    if (!name) return [];
    return [{
      index,
      name,
      widthPx: Number.isFinite(Number(photo?.widthPx)) ? Number(photo?.widthPx) : null,
      heightPx: Number.isFinite(Number(photo?.heightPx)) ? Number(photo?.heightPx) : null,
      attributions: normalizeAttributions(photo),
    } satisfies GooglePhotoSlot];
  });
}
