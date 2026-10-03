import type { LocationIntelligenceProfile } from "@/lib/search-framework";
import { normalizeAlias } from "./supabaseKnowledgeGraphProvider";

export interface KnowledgeGraphMutationClient {
  from(table: string): any;
}

export async function upsertLocationIntelligenceIntoKnowledgeGraph(
  client: KnowledgeGraphMutationClient,
  profile: LocationIntelligenceProfile,
): Promise<string> {
  const locationKey = `location:${profile.locationId}`;
  const { data: entity, error: entityError } = await client
    .from("knowledge_entities")
    .upsert(
      {
        entity_type: "location",
        canonical_key: locationKey,
        canonical_name: profile.identity.name,
        location_id: profile.locationId,
        attributes: {
          primaryDomain: profile.identity.primaryDomain,
          supportedDomains: profile.identity.supportedDomains,
        },
        confidence: profile.quality.confidence,
        source: "location_intelligence",
        source_updated_at: profile.freshness.sourceUpdatedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,canonical_key" },
    )
    .select("id")
    .single();

  if (entityError) throw new Error(entityError.message);
  const entityId = entity.id as string;

  const aliases = [
    profile.identity.name,
    ...profile.identity.aliases,
  ]
    .map((alias) => ({ alias, normalized: normalizeAlias(alias) }))
    .filter((item, index, items) =>
      item.normalized &&
      items.findIndex((candidate) => candidate.normalized === item.normalized) === index,
    );

  if (aliases.length) {
    const { error } = await client
      .from("knowledge_entity_aliases")
      .upsert(
        aliases.map((item) => ({
          entity_id: entityId,
          alias: item.alias,
          normalized_alias: item.normalized,
          source: "location_intelligence",
          confidence: 1,
        })),
        { onConflict: "entity_id,normalized_alias" },
      );
    if (error) throw new Error(error.message);
  }

  const featureRows = buildFeatureRows(entityId, profile);
  if (featureRows.length) {
    const { error } = await client
      .from("knowledge_entity_features")
      .upsert(featureRows, { onConflict: "entity_id,feature_key,source" });
    if (error) throw new Error(error.message);
  }

  return entityId;
}

function buildFeatureRows(
  entityId: string,
  profile: LocationIntelligenceProfile,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const add = (key: string, value: unknown) => {
    if (value == null) return;
    if (Array.isArray(value) && value.length === 0) return;
    rows.push({
      entity_id: entityId,
      feature_key: key,
      feature_value: value,
      source: "location_intelligence",
      confidence: profile.quality.confidence,
      freshness: profile.freshness.generatedAt,
      verified_at: null,
      updated_at: new Date().toISOString(),
    });
  };

  add("geo", profile.geo);
  add("restaurant_categories", profile.taxonomy.restaurantCategories);
  add("activity_categories", profile.taxonomy.activityCategories);
  add("nightlife_categories", profile.taxonomy.nightlifeCategories);
  add("cuisines", profile.taxonomy.cuisines);
  add("foods", profile.taxonomy.foods);
  add("dishes", profile.taxonomy.dishes);
  add("meal_periods", profile.taxonomy.mealPeriods);
  add("features", profile.taxonomy.features);
  add("offerings", profile.taxonomy.offerings);
  add("vibes", profile.taxonomy.vibes);
  add("occasions", profile.taxonomy.occasions);
  add("audiences", profile.taxonomy.audiences);
  add("reviews", profile.reviews);
  add("visual", profile.visual);
  add("availability", profile.availability);
  add("quality", profile.quality);
  add("behavior", profile.behavior);

  return rows;
}
