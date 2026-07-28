/** Canonical database contract. Maintained from forward migrations when generation is unavailable. */
export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
type Relationship = {
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
};
type GenericTable = {
    Row: Record<string, string | number | boolean | null | string[]>;
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: Relationship[];
};
type ProfileRow = {
    location_id: string;
    primary_domain: string;
    supported_domains: string[];
    restaurant_categories: string[];
    cuisines: string[];
    foods: string[];
    activity_categories: string[];
    nightlife_categories: string[];
    meal_periods: string[];
    features: string[];
    audiences: string[];
    occasions: string[];
    vibes: string[];
    canonical_terms: string[];
    exclusions: string[];
    search_text: string;
    search_tsv: unknown;
    latitude: number | null;
    longitude: number | null;
    market: string | null;
    city: string | null;
    neighborhood: string | null;
    borough: string | null;
    county: string | null;
    state: string | null;
    classification_sources: Json;
    evidence: Json;
    manual_overrides: Json;
    confidence: number;
    needs_review: boolean;
    review_reasons: string[];
    reviewed_at: string | null;
    reviewed_by: string | null;
    profile_version: number;
    profile_hash: string;
    generated_at: string;
    updated_at: string;
};
type QueueRow = {
    id: string;
    location_id: string;
    reason: string;
    status: string;
    requested_by: string | null;
    requested_at: string;
    available_at: string;
    attempts: number;
    max_attempts: number;
    locked_at: string | null;
    locked_by: string | null;
    lease_expires_at: string | null;
    completed_at: string | null;
    last_error: string | null;
    created_at: string;
    updated_at: string;
};
type RunRow = {
    id: string;
    run_type: string;
    status: string;
    filters: Json;
    requested_by: string | null;
    requested_at: string;
    started_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    total_targeted: number;
    total_processed: number;
    total_succeeded: number;
    total_failed: number;
    total_skipped: number;
    total_needs_review: number;
    cursor_value: string | null;
    batch_size: number;
    current_batch: number;
    error_summary: Json;
    metadata: Json;
    created_at: string;
    updated_at: string;
};
type RunItemRow = {
    id: string;
    run_id: string;
    location_id: string;
    status: string;
    attempt_count: number;
    error: string | null;
    review_reasons: string[];
    profile_version: number | null;
    profile_hash: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
};
type ShadowRow = {
    id: string;
    request_id: string;
    created_at: string;
    query_hash: string;
    normalized_search_type: string | null;
    primary_domain: string | null;
    current_candidate_ids: string[];
    profile_candidate_ids: string[];
    current_qualified_lane_ids: Json;
    profile_qualified_lane_ids: Json;
    pair_keys: string[];
    fulfillment: Json;
    result_counts: Json;
    recall_metrics: Json;
    precision_metrics: Json;
    divergence_reasons: string[];
    timings: Json;
    errors: Json;
};
type Table<Row> = {
    Row: Row;
    Insert: Partial<Row>;
    Update: Partial<Row>;
    Relationships: Relationship[];
};
type LocationRow = {
    id: string;
    name: string | null;
    restaurant_name: string | null;
    activity_name: string | null;
    location_type: string | null;
    primary_category: string | null;
    market: string | null;
    address: string | null;
    city: string | null;
    neighborhood: string | null;
    borough: string | null;
    county: string | null;
    state: string | null;
    zip_code: string | null;
    zip: string | null;
    phone: string | null;
    website: string | null;
    category: string | null;
    cuisine: string | string[] | null;
    rating: number | null;
    google_place_id: string | null;
    source_table: string | null;
    source_id: string | null;
    intent_tags: string[] | null;
    updated_at: string | null;
    is_searchable: boolean | null;
    is_hidden: boolean | null;
    is_low_level: boolean | null;
    active: boolean | null;
} & Record<string, unknown>;
export type Database = {
    public: {
        Tables: Record<string, GenericTable> & {
            locations: Table<LocationRow>;
        marketing_campaigns: Table<{ id: string; name: string | null; campaign_type: string | null; audience_segment: string | null; status: string | null; selected_platforms: string[] | null; scheduled_at: string | null; sent_at: string | null; created_at: string | null; updated_at: string | null; }>;

            location_search_profiles: Table<ProfileRow> & {
                Relationships: [
                    {
                        foreignKeyName: 'location_search_profiles_location_id_fkey';
                        columns: [
                            'location_id'
                        ];
                        isOneToOne: true;
                        referencedRelation: 'locations';
                        referencedColumns: [
                            'id'
                        ];
                    }
                ];
            };
            location_search_profile_refresh_queue: Table<QueueRow> & {
                Relationships: [
                    {
                        foreignKeyName: 'location_search_profile_refresh_queue_location_id_fkey';
                        columns: [
                            'location_id'
                        ];
                        isOneToOne: false;
                        referencedRelation: 'locations';
                        referencedColumns: [
                            'id'
                        ];
                    }
                ];
            };
            location_search_profile_runs: Table<RunRow>;
            location_search_profile_run_items: Table<RunItemRow> & {
                Relationships: [
                    {
                        foreignKeyName: 'location_search_profile_run_items_run_id_fkey';
                        columns: [
                            'run_id'
                        ];
                        isOneToOne: false;
                        referencedRelation: 'location_search_profile_runs';
                        referencedColumns: [
                            'id'
                        ];
                    },
                    {
                        foreignKeyName: 'location_search_profile_run_items_location_id_fkey';
                        columns: [
                            'location_id'
                        ];
                        isOneToOne: false;
                        referencedRelation: 'locations';
                        referencedColumns: [
                            'id'
                        ];
                    }
                ];
            };
            search_profile_shadow_comparisons: Table<ShadowRow>;
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
};
