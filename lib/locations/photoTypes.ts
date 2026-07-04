export type LocationPhotoSource = "upload" | "google" | "cached_google" | "fallback" | "external";

export type PublicLocationPhoto = {
  id?: string;
  url: string;
  alt: string;
  source?: LocationPhotoSource;
  isPrimary?: boolean;
  sortOrder?: number;
  dedupeKey?: string;
};

export type LocationPhoto = PublicLocationPhoto & {
  storagePath?: string | null;
  googlePhotoReference?: string | null;
  public?: boolean;
  approved?: boolean;
};

export type LocationLike = Record<string, unknown> & {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  main_image?: string | null;
  image_url?: string | null;
};

export type CacheGooglePhotoOptions = {
  force?: boolean;
  maxwidth?: string | number;
  preserveManualPrimary?: boolean;
};

export type MissingPhotoStatus = {
  locationId?: string | null;
  hasPublicPhoto: boolean;
  status: "has_photo" | "missing_photo";
  primaryPhotoUrl?: string | null;
  photoCount: number;
};
