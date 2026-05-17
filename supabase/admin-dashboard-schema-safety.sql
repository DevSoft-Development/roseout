-- Admin dashboard schema safety columns.
-- Run this before using claim tools, imports, sync-locations, or owner-aware admin pages.

alter table locations
add column if not exists claim_status text,
add column if not exists claimed_by_email text,
add column if not exists claimed_at timestamptz,
add column if not exists is_claimed boolean default false,
add column if not exists owner_user_id uuid;

alter table activities
add column if not exists owner_user_id uuid;
