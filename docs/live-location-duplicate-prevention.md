# Live Location Duplicate Prevention

This system prevents the same physical public location from being separately searchable because it appears under multiple categories such as restaurant, bar, lounge, rooftop, brunch, nightlife, or activity.

## What it prevents

- Exact `location_key` duplicates.
- Exact Google Place ID duplicates.
- Same normalized name and normalized address in the same city/state.
- Same normalized phone with a strongly similar name.
- Similar names at the same normalized address/city/state.

No records are deleted. Approved merges copy useful tags, categories, photos, keywords, and business metadata into the selected master, then mark the duplicate row hidden from public search.

## How to scan

From the admin page, open **Admin → Locations → Duplicate Review** and click **Scan for duplicates**.

SQL equivalent:

```sql
select public.oh_refresh_location_identity();
select public.oh_find_live_location_duplicates(500);
```

## How to review

Use `/admin/dashboard/locations/duplicates` to filter pending, high-confidence, merged, ignored, and not-duplicate pairs. Review the side-by-side names, addresses, type/category, searchability, quality score, review count, match reasons, and suggested master badge.

## How to merge

Choose **Keep A as master / merge B into A** or **Keep B as master / merge A into B**, then confirm. The merge calls `public.oh_merge_live_location_duplicate(master, duplicate, reason)`.

Safety behavior:

- merges arrays uniquely (`tags`, `vibe_tags`, `best_for_tags`, `search_keywords`, `google_types`, `images`)
- fills blank scalar category/photo/business fields on the master
- keeps the greatest quality/review/rating scores
- sets duplicate row to `duplicate_status = 'duplicate'`, `duplicate_of = master`, `is_searchable = false`, `is_hidden = true`, and updates `last_deduped_at`

## How to ignore false positives

Use **Mark not duplicate** for a reviewed pair that should remain separate, or **Ignore** for a pair that should leave the current queue without merging.

## Verification SQL

### 1. Find exact searchable duplicates that should be zero after fixing/merging

```sql
select
  normalized_name,
  normalized_address,
  city,
  state,
  count(*) as searchable_count,
  array_agg(id) as ids,
  array_agg(location_type) as types
from public.locations
where coalesce(duplicate_status, '') <> 'duplicate'
  and coalesce(is_searchable, false) = true
  and coalesce(is_hidden, false) = false
  and coalesce(trim(normalized_name), '') <> ''
  and coalesce(trim(normalized_address), '') <> ''
group by normalized_name, normalized_address, city, state
having count(*) > 1
order by searchable_count desc, normalized_name;
```

### 2. Scan duplicates

```sql
select public.oh_refresh_location_identity();
select public.oh_find_live_location_duplicates(500);
```

### 3. Review queue

```sql
select
  r.id,
  r.duplicate_score,
  r.match_reasons,
  r.status,
  a.name as location_a_name,
  b.name as location_b_name,
  a.address,
  a.location_type as a_type,
  b.location_type as b_type,
  r.suggested_master_id
from public.location_duplicate_review r
join public.locations a on a.id = r.location_a_id
join public.locations b on b.id = r.location_b_id
where r.status = 'pending'
order by r.duplicate_score desc, r.created_at desc
limit 100;
```

### 4. Confirm duplicate rows are hidden

```sql
select id, name, duplicate_status, duplicate_of, is_searchable, is_hidden
from public.locations
where duplicate_status = 'duplicate'
order by updated_at desc
limit 50;
```

## Safety notes

- Duplicate rows are hidden, not removed.
- Ambiguous same-building matches are queued for admin review instead of auto-merged.
- `public.oh_auto_merge_exact_live_duplicates(limit)` exists for future exact-match maintenance, but is not scheduled or called automatically.

## Troubleshooting: statement timeout during Duplicate Review

### Problem

`canceling statement due to statement timeout`

### Cause

Expensive duplicate scans should not run on page load or as unbounded self-joins. The live duplicate review page should load only existing rows from `public.location_duplicate_review`; scans should run manually in safe batches.

### Fix

- Open `/admin/dashboard/locations/duplicates`.
- Use **Scan for duplicates** in batches.
- Start with a limit of `250` or `500`.
- Review and merge high-confidence rows first.

### Verification SQL

```sql
-- Fast page load should only query review table:
select count(*)
from public.location_duplicate_review
where status = 'pending';

-- Scan in a small batch:
select public.oh_find_live_location_duplicates(250);

-- Check high-confidence pending:
select
  duplicate_score,
  match_reasons,
  status,
  location_a_id,
  location_b_id
from public.location_duplicate_review
where status = 'pending'
  and duplicate_score >= 95
order by duplicate_score desc, created_at desc
limit 50;

-- Check exact searchable duplicates after merges:
select
  normalized_name,
  normalized_address,
  city,
  state,
  count(*) as searchable_count,
  array_agg(id) as ids,
  array_agg(location_type) as types
from public.locations
where coalesce(duplicate_status, '') <> 'duplicate'
  and coalesce(is_searchable, false) = true
  and coalesce(is_hidden, false) = false
  and coalesce(trim(normalized_name), '') <> ''
  and coalesce(trim(normalized_address), '') <> ''
group by normalized_name, normalized_address, city, state
having count(*) > 1
order by searchable_count desc, normalized_name;
```
