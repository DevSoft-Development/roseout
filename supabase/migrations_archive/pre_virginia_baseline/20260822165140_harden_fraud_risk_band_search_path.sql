create or replace function public.fraud_risk_band(score integer)
returns text
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when score >= 85 then 'critical'
    when score >= 65 then 'high'
    when score >= 40 then 'elevated'
    when score >= 20 then 'guarded'
    else 'low'
  end;
$$;

revoke execute on function public.fraud_risk_band(integer) from public, anon, authenticated;
grant execute on function public.fraud_risk_band(integer) to service_role;
