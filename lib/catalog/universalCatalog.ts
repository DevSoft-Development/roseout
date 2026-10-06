import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  UniversalCatalogChannel,
  UniversalCatalogChannelOverride,
  UniversalCatalogChannelVisibility,
  UniversalCatalogItem,
  UniversalCatalogItemType,
  UniversalCatalogModifier,
  UniversalCatalogModifierGroup,
  UniversalCatalogPage,
} from "@/lib/catalog/types";
import { UNIVERSAL_CATALOG_ITEM_TYPES } from "@/lib/catalog/types";

const ITEM_TYPES = new Set<string>(UNIVERSAL_CATALOG_ITEM_TYPES);

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeItemType(value: unknown): UniversalCatalogItemType {
  const candidate = String(value || "food_beverage");
  return ITEM_TYPES.has(candidate) ? (candidate as UniversalCatalogItemType) : "food_beverage";
}

function visibilityValue(value: unknown): UniversalCatalogChannelVisibility {
  const source = objectValue(value);
  return {
    website: source.website !== false,
    profile: source.profile !== false,
    pos: source.pos !== false,
    reserve: source.reserve === true,
    online_ordering: source.online_ordering === true,
    qr_ordering: source.qr_ordering === true,
    kiosk: source.kiosk === true,
  };
}

function channelEnabled(
  visibility: UniversalCatalogChannelVisibility,
  channel: UniversalCatalogChannel,
  override?: UniversalCatalogChannelOverride,
) {
  if (override) return override.isEnabled;
  return visibility[channel] === true;
}

export async function getUniversalLocationCatalog(
  locationId: string,
  options: {
    commercePageId?: string | null;
    channel?: UniversalCatalogChannel;
    includeUnavailable?: boolean;
  } = {},
) {
  let pageQuery = supabaseAdmin
    .from("location_commerce_pages")
    .select("*")
    .eq("location_id", locationId);

  if (options.commercePageId) {
    pageQuery = pageQuery.eq("id", options.commercePageId);
  } else {
    pageQuery = pageQuery.order("sort_order", { ascending: true }).limit(1);
  }

  const { data: pageRow, error: pageError } = await pageQuery.maybeSingle();
  if (pageError) throw pageError;
  if (!pageRow) return { page: null, sections: [], items: [] };

  const pageId = String(pageRow.id);

  const [
    { data: sections, error: sectionsError },
    { data: itemRows, error: itemsError },
    { data: modifierGroupRows, error: groupsError },
    { data: modifierRows, error: modifiersError },
    { data: overrideRows, error: overridesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("location_commerce_sections")
      .select("*")
      .eq("location_id", locationId)
      .eq("commerce_page_id", pageId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_commerce_items")
      .select("*")
      .eq("location_id", locationId)
      .eq("commerce_page_id", pageId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_catalog_modifier_groups")
      .select("*")
      .eq("location_id", locationId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_catalog_modifiers")
      .select("*")
      .eq("location_id", locationId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_catalog_channel_overrides")
      .select("*")
      .eq("location_id", locationId),
  ]);

  for (const error of [sectionsError, itemsError, groupsError, modifiersError, overridesError]) {
    if (error) throw error;
  }

  const pageItems = (itemRows || []) as Record<string, any>[];
  const pageItemIds = new Set(pageItems.map((item) => String(item.id)));

  const modifiersByGroup = new Map<string, UniversalCatalogModifier[]>();
  for (const row of (modifierRows || []) as Record<string, any>[]) {
    const groupId = String(row.modifier_group_id || "");
    const bucket = modifiersByGroup.get(groupId) || [];
    bucket.push({
      id: String(row.id),
      name: String(row.name || "Modifier"),
      priceDeltaCents: Number(row.price_delta_cents || 0),
      sku: stringOrNull(row.sku),
      isAvailable: row.is_available !== false,
      sortOrder: Number(row.sort_order || 0),
    });
    modifiersByGroup.set(groupId, bucket);
  }

  const groupsByItem = new Map<string, UniversalCatalogModifierGroup[]>();
  for (const row of (modifierGroupRows || []) as Record<string, any>[]) {
    const itemId = String(row.commerce_item_id || "");
    if (!pageItemIds.has(itemId)) continue;
    const bucket = groupsByItem.get(itemId) || [];
    bucket.push({
      id: String(row.id),
      name: String(row.name || "Options"),
      isRequired: row.is_required === true,
      minSelect: Number(row.min_select || 0),
      maxSelect: integerOrNull(row.max_select),
      sortOrder: Number(row.sort_order || 0),
      isActive: row.is_active !== false,
      modifiers: modifiersByGroup.get(String(row.id)) || [],
    });
    groupsByItem.set(itemId, bucket);
  }

  const overridesByItem = new Map<string, UniversalCatalogChannelOverride[]>();
  for (const row of (overrideRows || []) as Record<string, any>[]) {
    const itemId = String(row.commerce_item_id || "");
    if (!pageItemIds.has(itemId)) continue;
    const bucket = overridesByItem.get(itemId) || [];
    bucket.push({
      channel: String(row.channel) as UniversalCatalogChannel,
      isEnabled: row.is_enabled !== false,
      displayName: stringOrNull(row.display_name),
      description: stringOrNull(row.description),
      priceCents: integerOrNull(row.price_cents),
      metadata: objectValue(row.metadata),
    });
    overridesByItem.set(itemId, bucket);
  }

  const items: UniversalCatalogItem[] = pageItems
    .map((row) => {
      const visibility = visibilityValue(row.channel_visibility);
      const overrides = overridesByItem.get(String(row.id)) || [];
      const channelOverride = options.channel
        ? overrides.find((override) => override.channel === options.channel)
        : undefined;

      return {
        id: String(row.id),
        locationId: String(row.location_id),
        commercePageId: String(row.commerce_page_id),
        sectionId: row.section_id ? String(row.section_id) : null,
        name: channelOverride?.displayName || String(row.name || "Catalog item"),
        description:
          channelOverride?.description !== null && channelOverride?.description !== undefined
            ? channelOverride.description
            : stringOrNull(row.description),
        imageUrl: stringOrNull(row.image_url),
        basePriceCents:
          channelOverride?.priceCents !== null && channelOverride?.priceCents !== undefined
            ? channelOverride.priceCents
            : integerOrNull(row.price_cents),
        priceLabel: stringOrNull(row.price_label) || stringOrNull(row.price),
        tags: Array.isArray(row.tags) ? row.tags : [],
        dietaryTags: Array.isArray(row.dietary_tags) ? row.dietary_tags : [],
        sortOrder: Number(row.sort_order || 0),
        metadata: objectValue(row.metadata),
        itemType: normalizeItemType(row.item_type),
        posShortName: stringOrNull(row.pos_short_name),
        sku: stringOrNull(row.sku),
        taxCategory: stringOrNull(row.tax_category),
        revenueCategory: stringOrNull(row.revenue_category),
        prepStation: stringOrNull(row.prep_station),
        durationMinutes: integerOrNull(row.duration_minutes),
        capacity: integerOrNull(row.capacity),
        resourceType: stringOrNull(row.resource_type),
        requiresBooking: row.requires_booking === true,
        requiresWaiver: row.requires_waiver === true,
        minimumAge: integerOrNull(row.minimum_age),
        depositCents: integerOrNull(row.deposit_cents),
        isAvailable: row.is_available !== false,
        isFeatured: row.is_featured === true,
        channelVisibility: visibility,
        fulfillmentMetadata: objectValue(row.fulfillment_metadata),
        bookingMetadata: objectValue(row.booking_metadata),
        modifiers: (groupsByItem.get(String(row.id)) || []).filter((group) => group.isActive),
        channelOverrides: overrides,
        __channelEnabled: options.channel
          ? channelEnabled(visibility, options.channel, channelOverride)
          : true,
      };
    })
    .filter((item) => options.includeUnavailable === true || item.isAvailable)
    .filter((item) => (item as UniversalCatalogItem & { __channelEnabled: boolean }).__channelEnabled)
    .map(({ __channelEnabled: _ignored, ...item }) => item);

  const page: UniversalCatalogPage = {
    id: pageId,
    locationId: String(pageRow.location_id),
    title: String(pageRow.title || "Catalog"),
    status: stringOrNull(pageRow.status),
    isActive: pageRow.is_active !== false,
    catalogRevision: Number(pageRow.catalog_revision || 1),
    publishedRevision: integerOrNull(pageRow.published_revision),
    publishedAt: stringOrNull(pageRow.published_at),
  };

  return {
    page,
    sections: (sections || []) as Record<string, any>[],
    items,
  };
}
