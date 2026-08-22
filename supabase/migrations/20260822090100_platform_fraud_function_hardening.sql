alter function public.fraud_recalculate_subject(text, text) security invoker;
alter function public.fraud_ensure_case(text, text, text) security invoker;
alter function public.fraud_after_signal() security invoker;
alter function public.fraud_apply_action_state() security invoker;

revoke execute on function public.fraud_risk_band(integer) from public, anon, authenticated;
revoke execute on function public.fraud_recalculate_subject(text, text) from public, anon, authenticated;
revoke execute on function public.fraud_ensure_case(text, text, text) from public, anon, authenticated;
revoke execute on function public.fraud_after_signal() from public, anon, authenticated;
revoke execute on function public.fraud_apply_action_state() from public, anon, authenticated;

grant execute on function public.fraud_risk_band(integer) to service_role;
grant execute on function public.fraud_recalculate_subject(text, text) to service_role;
grant execute on function public.fraud_ensure_case(text, text, text) to service_role;
