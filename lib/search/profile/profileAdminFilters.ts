import type { SearchProfileStatus } from './adminProfileTypes';
export const PROFILE_PAGE_SIZES = [25, 50, 100, 250] as const;
export type ProfileAdminFilters = {
    search: string;
    market: string;
    state: string;
    county: string;
    borough: string;
    city: string;
    neighborhood: string;
    status: SearchProfileStatus | '';
    domain: string;
    cuisine: string;
    activityCategory: string;
    mealPeriod: string;
    feature: string;
    audience: string;
    minConfidence: number | null;
    maxConfidence: number | null;
    version: number | null;
    active: '' | 'true' | 'false';
    searchable: '' | 'true' | 'false';
    hidden: '' | 'true' | 'false';
    lowLevel: '' | 'true' | 'false';
    sort: 'name' | 'market' | 'city' | 'confidence' | 'profile_updated' | 'location_updated' | 'review' | 'version';
    direction: 'asc' | 'desc';
    page: number;
    pageSize: typeof PROFILE_PAGE_SIZES[number];
};
const text = (v: string | string[] | undefined, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const boolean = (v: string): '' | 'true' | 'false' => v === 'true' || v === 'false' ? v : '';
export function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function safePostgrestSearch(value: string): string { return value.replace(/[,%()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); }
export function buildLocationSearchOr(search: string): string | null { const term = safePostgrestSearch(search); if (!term)
    return null; if (isUuid(term))
    return `id.eq.${term}`; return ['name', 'restaurant_name', 'activity_name', 'address', 'city', 'neighborhood', 'borough', 'county', 'state', 'zip_code', 'market'].map(field => `${field}.ilike.%${term}%`).join(','); }
export function parseProfileAdminFilters(params: Record<string, string | string[] | undefined>): ProfileAdminFilters { const size = Number(text(params.pageSize)); return { search: text(params.search, 200), market: text(params.market), state: text(params.state), county: text(params.county), borough: text(params.borough), city: text(params.city), neighborhood: text(params.neighborhood), status: text(params.status) as ProfileAdminFilters['status'], domain: text(params.domain), cuisine: text(params.cuisine), activityCategory: text(params.activityCategory), mealPeriod: text(params.mealPeriod), feature: text(params.feature), audience: text(params.audience), minConfidence: text(params.minConfidence) ? Number(text(params.minConfidence)) : null, maxConfidence: text(params.maxConfidence) ? Number(text(params.maxConfidence)) : null, version: text(params.version) ? Number(text(params.version)) : null, active: boolean(text(params.active)), searchable: boolean(text(params.searchable)), hidden: boolean(text(params.hidden)), lowLevel: boolean(text(params.lowLevel)), sort: (['name', 'market', 'city', 'confidence', 'profile_updated', 'location_updated', 'review', 'version'].includes(text(params.sort)) ? text(params.sort) : 'name') as ProfileAdminFilters['sort'], direction: text(params.direction) === 'desc' ? 'desc' : 'asc', page: Math.max(1, Number(text(params.page)) || 1), pageSize: (PROFILE_PAGE_SIZES.includes(size as typeof PROFILE_PAGE_SIZES[number]) ? size : 25) as ProfileAdminFilters['pageSize'] }; }
type FilterQuery<T> = {
    eq(column: string, value: unknown): T;
    or(filters: string): T;
};
export function applyLocationAdminFilters<T extends FilterQuery<T>>(initial: T, filters: ProfileAdminFilters): T { let q = initial; const search = buildLocationSearchOr(filters.search); if (search)
    q = q.or(search); for (const key of ['market', 'state', 'county', 'borough', 'city', 'neighborhood'] as const)
    if (filters[key])
        q = q.eq(key, filters[key]); if (filters.active)
    q = q.eq('active', filters.active === 'true'); if (filters.searchable)
    q = q.eq('is_searchable', filters.searchable === 'true'); if (filters.hidden)
    q = q.eq('is_hidden', filters.hidden === 'true'); if (filters.lowLevel)
    q = q.eq('is_low_level', filters.lowLevel === 'true'); return q; }
