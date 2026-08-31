from pathlib import Path

MIGRATION = Path('supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql')
PROMOTION = Path('.github/workflows/oregon-dr-promotion.yml')
FAILBACK = Path('scripts/dr/oregon-failback.sh')

migration = MIGRATION.read_text()
old_setting = "  write_fence text := lower(coalesce(current_setting('theouthaven.dr_write_fence', true), 'off'));"
new_setting = "  write_fence text := lower(coalesce(current_setting('default_transaction_read_only', true), 'off'));"
assert migration.count(old_setting) == 1, 'migration custom-fence setting anchor mismatch'
migration = migration.replace(old_setting, new_setting, 1)
old_condition = "  if write_fence = 'on' and request_method in ('POST', 'PATCH', 'PUT', 'DELETE') then"
new_condition = "  if write_fence in ('on', 'true') and request_method in ('POST', 'PATCH', 'PUT', 'DELETE') then"
assert migration.count(old_condition) == 1, 'migration fence condition anchor mismatch'
migration = migration.replace(old_condition, new_condition, 1)
custom_default = 'alter database postgres set "theouthaven.dr_write_fence" = \'off\';\n'
assert migration.count(custom_default) == 1, 'migration custom GUC default anchor mismatch'
migration = migration.replace(custom_default, '', 1)
assert 'theouthaven.dr_write_fence' not in migration
assert "current_setting('default_transaction_read_only', true)" in migration
MIGRATION.write_text(migration)

api_projection = ",(select count(*) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname='postgres' and s.setrole=0 and coalesce(array_to_string(s.setconfig,','),'') like '%theouthaven.dr_write_fence=on%') api_fences"

def remove_custom_database_flag(text: str, label: str) -> str:
    original = text
    text = text.replace(api_projection, '')
    text = text.replace(' and .[0].api_fences==0', '')
    text = text.replace(' and .[0].api_fences==1', '')
    text = text.replace('.api_fences==0 and ', '')
    text = text.replace('.api_fences==1 and ', '')
    text = text.replace('alter database postgres set \\"theouthaven.dr_write_fence\\"=on; ', '')
    text = text.replace('alter database postgres set \\"theouthaven.dr_write_fence\\"=off; ', '')
    text = text.replace('alter database postgres set "theouthaven.dr_write_fence"=on; ', '')
    text = text.replace('alter database postgres set "theouthaven.dr_write_fence"=off; ', '')
    text = text.replace('alter database postgres set \\"theouthaven.dr_write_fence\\"=on;', '')
    text = text.replace('alter database postgres set \\"theouthaven.dr_write_fence\\"=off;', '')
    text = text.replace('alter database postgres set "theouthaven.dr_write_fence"=on;', '')
    text = text.replace('alter database postgres set "theouthaven.dr_write_fence"=off;', '')
    lines = []
    for line in text.splitlines(keepends=True):
        if 'theouthaven.dr_write_fence' in line and 'grep -F' in line:
            continue
        lines.append(line)
    text = ''.join(lines)
    assert text != original, f'{label} did not change'
    assert 'theouthaven.dr_write_fence' not in text, f'{label} still contains unsupported custom GUC'
    return text

promotion = PROMOTION.read_text()
promotion = remove_custom_database_flag(promotion, 'promotion workflow')
validation_anchor = "          grep -F 'pgrst.db_pre_request' supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql >/dev/null\n"
validation_add = validation_anchor + "          grep -F \"current_setting('default_transaction_read_only', true)\" supabase/migrations/20260831233000_enable_dr_data_api_write_fence.sql >/dev/null\n"
assert promotion.count(validation_anchor) == 1, 'promotion migration validation anchor mismatch'
promotion = promotion.replace(validation_anchor, validation_add, 1)
assert "current_setting('default_transaction_read_only', true)" in promotion
assert 'DR write-fence probe' in promotion
assert "'25006'" in promotion
assert 'default_transaction_read_only=on' in promotion
PROMOTION.write_text(promotion)

failback = FAILBACK.read_text()
failback = remove_custom_database_flag(failback, 'failback script')
assert 'Oregon DR write-fence probe' in failback
assert "'25006'" in failback
assert 'default_transaction_read_only=on' in failback
assert 'pg_wal_lsn_diff' in failback
FAILBACK.write_text(failback)
