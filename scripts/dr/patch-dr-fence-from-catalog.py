from pathlib import Path
import re

MIGRATION = Path('supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql')
MIGRATION.write_text("""-- Keep Supabase Data API reads available during a regional DR write fence while
-- rejecting mutating PostgREST requests before their main query executes.
-- The Data API guard derives its state from the same database-level read-only
-- setting used by the rest of the DR fence, so there is only one source of truth.
create or replace function public.theouthaven_dr_pre_request()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  request_method text := upper(coalesce(current_setting('request.method', true), ''));
  write_fence boolean := false;
begin
  select exists (
    select 1
    from pg_catalog.pg_db_role_setting s
    join pg_catalog.pg_database d on d.oid = s.setdatabase
    where d.datname = current_database()
      and s.setrole = 0
      and coalesce(array_to_string(s.setconfig, ','), '') like '%default_transaction_read_only=on%'
  ) into write_fence;

  if write_fence and request_method in ('POST', 'PATCH', 'PUT', 'DELETE') then
    raise sqlstate '25006' using message = 'TheOutHaven DR write fence is active';
  end if;
end;
$function$;

comment on function public.theouthaven_dr_pre_request() is
  'Rejects mutating Supabase Data API requests while the database-level DR read-only fence is active.';

alter role authenticator set pgrst.db_pre_request = 'public.theouthaven_dr_pre_request';
notify pgrst, 'reload config';
""")

API_FRAGMENT = ",(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%theouthaven.dr_write_fence=on%') api_fences"
CUSTOM_GUC_SET = re.compile(
    r'alter database postgres set (?:"|\\")theouthaven\.dr_write_fence(?:"|\\")=(?:on|off); ?'
)
API_FENCE_JQ_CLAUSES = (
    ' and .[0].api_fences==1',
    ' and .[0].api_fences==0',
    '.[0].api_fences==1 and ',
    '.[0].api_fences==0 and ',
)


def clean_runtime_file(path: Path) -> None:
    text = path.read_text()
    before = text.count('theouthaven.dr_write_fence')
    assert before > 0, f'expected unsupported DR GUC references in {path}'
    text = text.replace(API_FRAGMENT, '')
    text = CUSTOM_GUC_SET.sub('', text)
    for clause in API_FENCE_JQ_CLAUSES:
        text = text.replace(clause, '')
    path.write_text(text)


promotion = Path('.github/workflows/oregon-dr-promotion.yml')
p = promotion.read_text()
old_validation = "          grep -F 'theouthaven.dr_write_fence' .github/workflows/oregon-dr-promotion.yml >/dev/null\n"
new_validation = "          grep -F 'pg_catalog.pg_db_role_setting' supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql >/dev/null\n          unsupported_guc='theouthaven.dr_''write_fence'\n          ! grep -F \"$unsupported_guc\" .github/workflows/oregon-dr-promotion.yml scripts/dr/oregon-failback.sh supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql >/dev/null\n"
assert p.count(old_validation) == 1, 'promotion unsupported-GUC validation anchor mismatch'
p = p.replace(old_validation, new_validation, 1)
promotion.write_text(p)

clean_runtime_file(promotion)
clean_runtime_file(Path('scripts/dr/oregon-failback.sh'))

for path in (promotion, Path('scripts/dr/oregon-failback.sh'), MIGRATION):
    text = path.read_text()
    assert 'theouthaven.dr_write_fence' not in text, f'unsupported DR GUC remains in {path}'

p = promotion.read_text()
assert 'pgrst.db_pre_request=public.theouthaven_dr_pre_request' in p
assert 'database_fences==1' in p
assert "'25006'" in p
s = Path('scripts/dr/oregon-failback.sh').read_text()
assert 'pgrst.db_pre_request=public.theouthaven_dr_pre_request' in s
assert 'database_fences==1' in s
assert "'25006'" in s
