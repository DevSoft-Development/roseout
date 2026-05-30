do $$
declare
  target_table text;
  target_column text;
begin
  foreach target_table in array array['location_claim_codes','claim_qr_codes','business_claim_codes','qr_claim_codes'] loop
    if to_regclass('public.' || target_table) is not null then
      foreach target_column in array array['qr_url','claim_url','url','destination_url','target_url','qr_code_url','qr_link'] loop
        if exists (
          select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = target_table and c.column_name = target_column
        ) then
          execute format('update public.%I set %I = replace(%I, %L, %L) where %I ilike %L', target_table, target_column, target_column, 'https://roseout.com', 'https://theouthaven.com', target_column, '%roseout.com%');
          execute format('update public.%I set %I = replace(%I, %L, %L) where %I ilike %L', target_table, target_column, target_column, 'https://www.roseout.com', 'https://theouthaven.com', target_column, '%roseout.com%');
        end if;
      end loop;
    end if;
  end loop;
end $$;
