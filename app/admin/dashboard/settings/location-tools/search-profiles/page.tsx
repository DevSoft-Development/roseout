import Link from 'next/link';
import { requireAdminRole } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSearchProfileRelation, getSearchProfileStatus, hasNextPage, type SearchProfileListLocation } from '@/lib/search/profile/adminProfileTypes';
import { applyLocationAdminFilters, parseProfileAdminFilters, PROFILE_PAGE_SIZES, type ProfileAdminFilters } from '@/lib/search/profile/profileAdminFilters';
import { getProfileAdminSummary, type ProfileAdminSummary } from '@/lib/search/profile/profileAdminSummary';
export const dynamic = 'force-dynamic';
const PROFILE_SELECT = `id,name,restaurant_name,activity_name,location_type,primary_category,market,address,city,neighborhood,borough,county,state,zip_code,updated_at,is_searchable,is_hidden,is_low_level,active,location_search_profiles(location_id,primary_domain,supported_domains,restaurant_categories,cuisines,foods,activity_categories,nightlife_categories,meal_periods,features,audiences,occasions,vibes,confidence,needs_review,review_reasons,profile_version,profile_hash,generated_at,updated_at)`;
const labels: Record<string, string> = { current: 'Current', missing: 'Missing', stale: 'Stale', needs_review: 'Needs Review', low_confidence: 'Low Confidence', refresh_queued: 'Refresh Queued', refresh_failed: 'Refresh Failed', not_eligible: 'Not Eligible' };
function url(filters: ProfileAdminFilters, changes: Record<string, string | number>) { const values = new URLSearchParams(); for (const [key, value] of Object.entries({ ...filters, ...changes }))
    if (value !== '' && value !== null && key !== 'pageSize')
        values.set(key, String(value)); if ((changes.pageSize ?? filters.pageSize) !== 25)
    values.set('pageSize', String(changes.pageSize ?? filters.pageSize)); return `?${values}`; }
function FilterInput({ name, label, value }: {
    name: string;
    label: string;
    value: string | number | null;
}) { return <label className="space-y-1 text-xs font-bold text-white/60"><span>{label}</span><input name={name} defaultValue={value ?? ''} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/></label>; }
function SummaryCards({ summary }: {
    summary: ProfileAdminSummary;
}) { const cards = [['Eligible Locations', summary.eligibleLocations], ['Profiles Generated', summary.profilesGenerated], ['Missing Profiles', summary.missingProfiles], ['Stale Profiles', summary.staleProfiles], ['Needs Review', summary.needsReview], ['Low Confidence', summary.lowConfidence], ['Failed Queue Items', summary.failedQueueItems], ['Active Backfill Runs', summary.activeBackfillRuns]]; return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-[#111] p-4"><p className="text-xs font-black uppercase tracking-wider text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></article>)}</section>; }
function ProfileRow({ location }: {
    location: SearchProfileListLocation;
}) { const profile = normalizeSearchProfileRelation(location.location_search_profiles); const status = getSearchProfileStatus(location, profile, null); return <tr className="border-t border-white/10 align-top"><td className="p-3"><input type="checkbox" name="locationId" value={location.id} aria-label={`Select ${location.name ?? location.id}`}/></td><td className="p-3 font-bold">{location.name ?? location.restaurant_name ?? location.activity_name ?? 'Unnamed'}<small className="block max-w-xs text-white/45">{location.address}</small><small className="block font-mono text-white/35">{location.id}</small></td><td className="p-3">{location.location_type ?? '—'}</td><td className="p-3">{location.market ?? '—'}</td><td className="p-3">{[location.city, location.neighborhood, location.borough, location.state].filter(Boolean).join(' · ') || '—'}</td><td className="p-3"><span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold">{labels[status]}</span></td><td className="p-3">{profile?.primary_domain ?? '—'}</td><td className="p-3">{profile ? `${Math.round(profile.confidence * 100)}%` : '—'}</td><td className="p-3">{profile?.needs_review ? profile.review_reasons.join(', ') : '—'}</td><td className="p-3">{profile?.profile_version ?? '—'}</td><td className="p-3"><div className="flex flex-col gap-1"><Link className="text-rose-200" href={`/admin/dashboard/crm/${location.id}`}>Open CRM</Link><form action={`/api/admin/location-tools/search-profiles/${location.id}/rebuild`} method="post"><button className="text-rose-200">Rebuild</button></form></div></td></tr>; }
export default async function SearchProfilesPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireAdminRole(['superadmin', 'admin']);
    const filters = parseProfileAdminFilters(await searchParams);
    let query = applyLocationAdminFilters(supabaseAdmin.from('locations').select(PROFILE_SELECT, { count: 'exact' }), filters);
    if (filters.domain)
        query = query.eq('location_search_profiles.primary_domain', filters.domain);
    if (filters.cuisine)
        query = query.contains('location_search_profiles.cuisines', [filters.cuisine]);
    if (filters.activityCategory)
        query = query.contains('location_search_profiles.activity_categories', [filters.activityCategory]);
    if (filters.mealPeriod)
        query = query.contains('location_search_profiles.meal_periods', [filters.mealPeriod]);
    if (filters.feature)
        query = query.contains('location_search_profiles.features', [filters.feature]);
    if (filters.audience)
        query = query.contains('location_search_profiles.audiences', [filters.audience]);
    if (filters.version !== null)
        query = query.eq('location_search_profiles.profile_version', filters.version);
    if (filters.minConfidence !== null)
        query = query.gte('location_search_profiles.confidence', filters.minConfidence);
    if (filters.maxConfidence !== null)
        query = query.lte('location_search_profiles.confidence', filters.maxConfidence);
    if (filters.status === 'needs_review')
        query = query.eq('location_search_profiles.needs_review', true);
    if (filters.status === 'missing')
        query = query.is('location_search_profiles', null);
    const profileSort: Record<string, string> = { confidence: 'confidence', profile_updated: 'updated_at', review: 'needs_review', version: 'profile_version' };
    const locationSort: Record<string, string> = { name: 'name', market: 'market', city: 'city', location_updated: 'updated_at' };
    if (profileSort[filters.sort])
        query = query.order(profileSort[filters.sort], { ascending: filters.direction === 'asc', referencedTable: 'location_search_profiles' });
    else
        query = query.order(locationSort[filters.sort] ?? 'name', { ascending: filters.direction === 'asc' });
    const from = (filters.page - 1) * filters.pageSize;
    const [{ data, error, count }, summaryResult] = await Promise.all([query.range(from, from + filters.pageSize - 1).overrideTypes<SearchProfileListLocation[], {
            merge: false;
        }>(), getProfileAdminSummary(filters).then(data => ({ data, error: null })).catch(error => ({ data: null, error: error instanceof Error ? error : new Error('Summary failed') }))]);
    const total = count ?? 0;
    return <main className="min-h-screen bg-[#080407] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-[1600px] space-y-6"><header><p className="text-xs font-black uppercase tracking-[.3em] text-rose-200">Location Tools</p><h1 className="mt-2 text-4xl font-black">Search Profiles</h1><p className="mt-2 text-white/60">Inspect, validate, rebuild, and backfill the canonical search identity used by public search.</p></header>{summaryResult.data ? <SummaryCards summary={summaryResult.data}/> : <p role="alert" className="rounded-xl bg-red-950/50 p-4 text-red-200">{summaryResult.error?.message}</p>}<form className="rounded-2xl border border-white/10 bg-[#111] p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><FilterInput name="search" label="Search" value={filters.search}/>{(['market', 'state', 'county', 'borough', 'city', 'neighborhood'] as const).map(key => <FilterInput key={key} name={key} label={key[0].toUpperCase() + key.slice(1)} value={filters[key]}/>)}{(['domain', 'cuisine', 'activityCategory', 'mealPeriod', 'feature', 'audience'] as const).map(key => <FilterInput key={key} name={key} label={key.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, m => m.toUpperCase())} value={filters[key]}/>)}<FilterInput name="minConfidence" label="Minimum confidence" value={filters.minConfidence}/><FilterInput name="maxConfidence" label="Maximum confidence" value={filters.maxConfidence}/><FilterInput name="version" label="Profile version" value={filters.version}/><label className="space-y-1 text-xs font-bold text-white/60"><span>Status</span><select name="status" defaultValue={filters.status} className="w-full rounded-lg bg-white/5 px-3 py-2 text-white"><option value="">All</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-1 text-xs font-bold text-white/60"><span>Sort</span><select name="sort" defaultValue={filters.sort} className="w-full rounded-lg bg-white/5 px-3 py-2 text-white">{['name', 'market', 'city', 'confidence', 'profile_updated', 'location_updated', 'review', 'version'].map(value => <option key={value}>{value}</option>)}</select></label><label className="space-y-1 text-xs font-bold text-white/60"><span>Page size</span><select name="pageSize" defaultValue={filters.pageSize} className="w-full rounded-lg bg-white/5 px-3 py-2 text-white">{PROFILE_PAGE_SIZES.map(value => <option key={value}>{value}</option>)}</select></label></div><div className="mt-4 flex gap-3"><button className="rounded-xl bg-rose-600 px-5 py-2 font-bold">Apply filters</button><Link className="px-4 py-2" href="/admin/dashboard/settings/location-tools/search-profiles">Clear all filters</Link></div></form>{error ? <p role="alert" className="rounded-xl bg-red-950/50 p-4 text-red-200">Unable to load search profiles: {error.message}</p> : <form><div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5"><tr>{['Select', 'Location', 'Type', 'Market', 'City / Area', 'Profile Status', 'Primary Domain', 'Confidence', 'Review', 'Version', 'Actions'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{(data ?? []).map(location => <ProfileRow key={location.id} location={location}/>)}</tbody></table></div></form>}<nav className="flex items-center justify-between"><span>{total.toLocaleString()} matching locations · Page {filters.page}</span><div className="flex gap-4">{filters.page > 1 ? <Link href={url(filters, { page: filters.page - 1 })}>Previous</Link> : <span className="text-white/30">Previous</span>}{hasNextPage(filters.page, filters.pageSize, total) ? <Link href={url(filters, { page: filters.page + 1 })}>Next</Link> : <span aria-disabled="true" className="text-white/30">Next</span>}</div></nav></div></main>;
}
