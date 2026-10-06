import "server-only";

import { getUniversalLocationCatalog } from "@/lib/catalog/universalCatalog";
import type { UniversalCatalogChannel, UniversalCatalogItem } from "@/lib/catalog/types";

function legacyPrice(item: UniversalCatalogItem) {
  if (item.priceLabel) return item.priceLabel;
  if (item.basePriceCents == null) return null;
  return `$${(item.basePriceCents / 100).toFixed(2)}`;
}

function toLegacyMenuItem(item: UniversalCatalogItem) {
  return {
    id: item.id,
    location_id: item.locationId,
    commerce_page_id: item.commercePageId,
    page_id: item.commercePageId,
    section_id: item.sectionId,
    name: item.name,
    description: item.description,
    price_cents: item.basePriceCents,
    price_label: item.priceLabel,
    price: legacyPrice(item),
    image_url: item.imageUrl,
    tags: item.tags,
    dietary_tags: item.dietaryTags,
    is_available: item.isAvailable,
    is_featured: item.isFeatured,
    sort_order: item.sortOrder,
    metadata: item.metadata,
    item_type: item.itemType,
    pos_short_name: item.posShortName,
    sku: item.sku,
    tax_category: item.taxCategory,
    revenue_category: item.revenueCategory,
    prep_station: item.prepStation,
    duration_minutes: item.durationMinutes,
    capacity: item.capacity,
    resource_type: item.resourceType,
    requires_booking: item.requiresBooking,
    requires_waiver: item.requiresWaiver,
    minimum_age: item.minimumAge,
    deposit_cents: item.depositCents,
    channel_visibility: item.channelVisibility,
    fulfillment_metadata: item.fulfillmentMetadata,
    booking_metadata: item.bookingMetadata,
    catalog_modifiers: item.modifiers,
    catalog_channel_overrides: item.channelOverrides,
  };
}

export async function getLegacyMenuRowsFromUniversalCatalog(
  locationId: string,
  commercePageId: string,
  options: {
    channel?: UniversalCatalogChannel;
    publicOnly?: boolean;
  } = {},
) {
  const catalog = await getUniversalLocationCatalog(locationId, {
    commercePageId,
    channel: options.channel,
    includeUnavailable: !options.publicOnly,
  });

  const sections = (catalog.sections || []).filter(
    (section: Record<string, any>) => !options.publicOnly || section.is_active !== false,
  );

  return {
    sections,
    items: (catalog.items || []).map(toLegacyMenuItem),
  };
}
