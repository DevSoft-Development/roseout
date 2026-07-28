import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PROFILE_VERSION } from '../v2/taxonomy';
import { LOW_CONFIDENCE_THRESHOLD } from './adminProfileTypes';
import { applyLocationAdminFilters, type ProfileAdminFilters } from './profileAdminFilters';
export type ProfileAdminSummary = {
    eligibleLocations: number;
    profilesGenerated: number;
    missingProfiles: number;
    staleProfiles: number;
    needsReview: number;
    lowConfidence: number;
    failedQueueItems: number;
    activeBackfillRuns: number;
};
const countOf = (result: {
    count: number | null;
    error: unknown;
}, label: string) => { if (result.error)
    throw new Error(`Unable to load ${label}`); return result.count ?? 0; };
export async function getProfileAdminSummary(filters: ProfileAdminFilters): Promise<ProfileAdminSummary> {
    const eligible = applyLocationAdminFilters(supabaseAdmin.from('locations').select('id', { head: true, count: 'exact' }).eq('active', true).eq('is_searchable', true).eq('is_hidden', false).eq('is_low_level', false), filters);
    const profiled = applyLocationAdminFilters(supabaseAdmin.from('locations').select('id,location_search_profiles!inner(location_id)', { head: true, count: 'exact' }), filters);
    const stale = applyLocationAdminFilters(supabaseAdmin.from('locations').select('id,location_search_profiles!inner(location_id)', { head: true, count: 'exact' }).neq('location_search_profiles.profile_version', PROFILE_VERSION), filters);
    const review = applyLocationAdminFilters(supabaseAdmin.from('locations').select('id,location_search_profiles!inner(location_id)', { head: true, count: 'exact' }).eq('location_search_profiles.needs_review', true), filters);
    const low = applyLocationAdminFilters(supabaseAdmin.from('locations').select('id,location_search_profiles!inner(location_id)', { head: true, count: 'exact' }).lt('location_search_profiles.confidence', LOW_CONFIDENCE_THRESHOLD), filters);
    const [e, p, s, r, l, f, a] = await Promise.all([eligible, profiled, stale, review, low, supabaseAdmin.from('location_search_profile_refresh_queue').select('id', { head: true, count: 'exact' }).eq('status', 'failed'), supabaseAdmin.from('location_search_profile_runs').select('id', { head: true, count: 'exact' }).in('status', ['queued', 'running', 'cancelling'])]);
    const eligibleLocations = countOf(e, 'eligible locations'), profilesGenerated = countOf(p, 'generated profiles');
    return { eligibleLocations, profilesGenerated, missingProfiles: Math.max(0, eligibleLocations - profilesGenerated), staleProfiles: countOf(s, 'stale profiles'), needsReview: countOf(r, 'review profiles'), lowConfidence: countOf(l, 'low confidence profiles'), failedQueueItems: countOf(f, 'failed queue'), activeBackfillRuns: countOf(a, 'active runs') };
}
