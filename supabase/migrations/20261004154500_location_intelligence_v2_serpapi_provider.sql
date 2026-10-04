insert into public.location_provider_registry(
  provider,
  enabled,
  priority,
  capabilities,
  credential_ref,
  paid,
  maintenance_class,
  health_status,
  metadata,
  updated_at
)
values (
  'serpapi',
  true,
  40,
  array['website_discovery','web_context','status_verification'],
  'serpapi.apiKey',
  true,
  'external_paid',
  'unknown',
  '{"role":"fallback_only","quota_mode":"free_tier"}'::jsonb,
  now()
)
on conflict (provider) do update
set
  enabled = excluded.enabled,
  priority = excluded.priority,
  capabilities = excluded.capabilities,
  credential_ref = excluded.credential_ref,
  paid = excluded.paid,
  maintenance_class = excluded.maintenance_class,
  metadata = coalesce(public.location_provider_registry.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
