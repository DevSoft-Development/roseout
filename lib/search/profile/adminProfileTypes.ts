import { PROFILE_VERSION } from '../v2/taxonomy';
export type SearchProfileListProfile = {
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
    confidence: number;
    needs_review: boolean;
    review_reasons: string[];
    profile_version: number;
    profile_hash: string;
    generated_at: string;
    updated_at: string;
};
export type SearchProfileListLocation = {
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
    updated_at: string | null;
    is_searchable: boolean | null;
    is_hidden: boolean | null;
    is_low_level: boolean | null;
    active: boolean | null;
    location_search_profiles: SearchProfileListProfile | SearchProfileListProfile[] | null;
};
export function normalizeSearchProfileRelation(value: SearchProfileListProfile | SearchProfileListProfile[] | null | undefined): SearchProfileListProfile | null { if (Array.isArray(value))
    return value[0] ?? null; return value ?? null; }
export const LOW_CONFIDENCE_THRESHOLD = .5;
export type SearchProfileStatus = 'current' | 'missing' | 'stale' | 'needs_review' | 'low_confidence' | 'refresh_queued' | 'refresh_failed' | 'not_eligible';
export function getSearchProfileStatus(location: Pick<SearchProfileListLocation, 'active' | 'is_hidden' | 'is_low_level' | 'is_searchable'>, profile: SearchProfileListProfile | null, queueState?: string | null): SearchProfileStatus { if (location.active === false || location.is_hidden === true || location.is_low_level === true || location.is_searchable !== true)
    return 'not_eligible'; if (queueState === 'failed')
    return 'refresh_failed'; if (queueState === 'pending' || queueState === 'processing')
    return 'refresh_queued'; if (!profile)
    return 'missing'; if (profile.profile_version !== PROFILE_VERSION)
    return 'stale'; if (profile.needs_review)
    return 'needs_review'; if (profile.confidence < LOW_CONFIDENCE_THRESHOLD)
    return 'low_confidence'; return 'current'; }
export function hasNextPage(page: number, pageSize: number, total: number): boolean { return page * pageSize < total; }
