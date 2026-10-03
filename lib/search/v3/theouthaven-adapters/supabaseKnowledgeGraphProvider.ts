import type {
  FactEvidence,
  KnowledgeEdge,
  KnowledgeEntity,
  KnowledgeEntityContext,
  KnowledgeGraphProvider,
} from "@/lib/search-framework";

type QueryResult<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;

export interface KnowledgeGraphSupabaseClient {
  from(table: string): {
    select(columns?: string): any;
  };
}

export class SupabaseKnowledgeGraphProvider implements KnowledgeGraphProvider {
  readonly providerId = "theouthaven.supabase-knowledge-graph.v1";

  constructor(private readonly client: KnowledgeGraphSupabaseClient) {}

  async resolveEntity(query: string): Promise<KnowledgeEntity | null> {
    const normalized = normalizeAlias(query);
    const alias = await this.resolveAlias(normalized);
    if (alias) return alias;

    const { data, error } = await this.client
      .from("knowledge_entities")
      .select("*")
      .ilike("canonical_name", query.trim())
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapEntity(data) : null;
  }

  async resolveAlias(alias: string): Promise<KnowledgeEntity | null> {
    const normalized = normalizeAlias(alias);
    const { data, error } = await this.client
      .from("knowledge_entity_aliases")
      .select("entity:knowledge_entities(*)")
      .eq("normalized_alias", normalized)
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.entity ? mapEntity(data.entity) : null;
  }

  async getEntity(entityId: string): Promise<KnowledgeEntity | null> {
    const { data, error } = await this.client
      .from("knowledge_entities")
      .select("*")
      .eq("id", entityId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapEntity(data) : null;
  }

  async getRelationships(entityId: string): Promise<readonly KnowledgeEdge[]> {
    const { data, error } = await this.client
      .from("knowledge_edges")
      .select("*")
      .or(`subject_entity_id.eq.${entityId},object_entity_id.eq.${entityId}`);

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapEdge);
  }

  async getFeatures(entityId: string): Promise<Readonly<Record<string, unknown>>> {
    const { data, error } = await this.client
      .from("knowledge_entity_features")
      .select("*")
      .eq("entity_id", entityId);

    if (error) throw new Error(error.message);

    return Object.fromEntries(
      (data ?? []).map((row: any) => [
        row.feature_key,
        {
          value: row.feature_value,
          source: row.source,
          confidence: Number(row.confidence ?? 0),
          freshness: row.freshness,
          verifiedAt: row.verified_at,
        } satisfies FactEvidence,
      ]),
    );
  }

  async getEvidence(entityId: string): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const relationships = await this.getRelationships(entityId);
    const edgeIds = relationships.map((edge) => edge.id);
    if (edgeIds.length === 0) return [];

    const { data, error } = await this.client
      .from("knowledge_edge_evidence")
      .select("*")
      .in("edge_id", edgeIds);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findRelated(
    entityId: string,
    relationship?: string,
  ): Promise<readonly KnowledgeEntity[]> {
    let query = this.client
      .from("knowledge_edges")
      .select("object:knowledge_entities!knowledge_edges_object_entity_id_fkey(*)")
      .eq("subject_entity_id", entityId);

    if (relationship) query = query.eq("predicate", relationship);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? [])
      .map((row: any) => row.object)
      .filter(Boolean)
      .map(mapEntity);
  }

  async resolveHierarchy(entityId: string): Promise<readonly KnowledgeEntity[]> {
    return this.findRelated(entityId, "located_in");
  }

  async searchEntities(query: string, limit = 25): Promise<readonly KnowledgeEntity[]> {
    const token = query.trim().replace(/[%_,]/g, " ");
    if (!token) return [];

    const { data, error } = await this.client
      .from("knowledge_entities")
      .select("*")
      .ilike("canonical_name", `%${token}%`)
      .limit(Math.max(1, Math.min(limit, 100)));

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapEntity);
  }

  async getEntityContext(entityId: string): Promise<KnowledgeEntityContext | null> {
    const entity = await this.getEntity(entityId);
    if (!entity) return null;

    const [aliasesResult, relationships, features, evidence] = await Promise.all([
      this.client
        .from("knowledge_entity_aliases")
        .select("alias")
        .eq("entity_id", entityId) as QueryResult<any[]>,
      this.getRelationships(entityId),
      this.getFeatures(entityId),
      this.getEvidence(entityId),
    ]);

    if (aliasesResult.error) throw new Error(aliasesResult.error.message);

    return {
      entity,
      aliases: (aliasesResult.data ?? []).map((row: any) => row.alias),
      features: features as Readonly<Record<string, FactEvidence>>,
      outgoing: relationships.filter((edge) => edge.subjectEntityId === entityId),
      incoming: relationships.filter((edge) => edge.objectEntityId === entityId),
      evidence,
    };
  }
}

export function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function mapEntity(row: any): KnowledgeEntity {
  return {
    id: row.id,
    entityType: row.entity_type,
    canonicalKey: row.canonical_key,
    canonicalName: row.canonical_name,
    locationId: row.location_id ?? null,
    attributes: row.attributes ?? {},
    confidence: Number(row.confidence ?? 0),
    source: row.source,
    sourceUpdatedAt: row.source_updated_at ?? null,
  };
}

function mapEdge(row: any): KnowledgeEdge {
  return {
    id: row.id,
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    objectEntityId: row.object_entity_id,
    confidence: Number(row.confidence ?? 0),
    source: row.source,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
  };
}
