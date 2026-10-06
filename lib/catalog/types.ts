export const UNIVERSAL_CATALOG_ITEM_TYPES = [
  "food_beverage",
  "retail",
  "service",
  "timed_resource",
  "admission_experience",
  "rental",
  "package_bundle",
  "fee_deposit",
] as const;

export type UniversalCatalogItemType = (typeof UNIVERSAL_CATALOG_ITEM_TYPES)[number];

export const UNIVERSAL_CATALOG_CHANNELS = [
  "website",
  "profile",
  "pos",
  "reserve",
  "online_ordering",
  "qr_ordering",
  "kiosk",
] as const;

export type UniversalCatalogChannel = (typeof UNIVERSAL_CATALOG_CHANNELS)[number];

export type UniversalCatalogChannelVisibility = Partial<Record<UniversalCatalogChannel, boolean>>;

export type UniversalCatalogModifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
  sku: string | null;
  isAvailable: boolean;
  sortOrder: number;
};

export type UniversalCatalogModifierGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isActive: boolean;
  modifiers: UniversalCatalogModifier[];
};

export type UniversalCatalogChannelOverride = {
  channel: UniversalCatalogChannel;
  isEnabled: boolean;
  displayName: string | null;
  description: string | null;
  priceCents: number | null;
  metadata: Record<string, unknown>;
};

export type UniversalCatalogItem = {
  id: string;
  locationId: string;
  commercePageId: string;
  sectionId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number | null;
  priceLabel: string | null;
  tags: unknown[];
  dietaryTags: unknown[];
  sortOrder: number;
  metadata: Record<string, unknown>;
  itemType: UniversalCatalogItemType;
  posShortName: string | null;
  sku: string | null;
  taxCategory: string | null;
  revenueCategory: string | null;
  prepStation: string | null;
  durationMinutes: number | null;
  capacity: number | null;
  resourceType: string | null;
  requiresBooking: boolean;
  requiresWaiver: boolean;
  minimumAge: number | null;
  depositCents: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  channelVisibility: UniversalCatalogChannelVisibility;
  fulfillmentMetadata: Record<string, unknown>;
  bookingMetadata: Record<string, unknown>;
  modifiers: UniversalCatalogModifierGroup[];
  channelOverrides: UniversalCatalogChannelOverride[];
};

export type UniversalCatalogPage = {
  id: string;
  locationId: string;
  title: string;
  status: string | null;
  isActive: boolean;
  catalogRevision: number;
  publishedRevision: number | null;
  publishedAt: string | null;
};
