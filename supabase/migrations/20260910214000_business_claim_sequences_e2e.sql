begin;

create table if not exists public.crm_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  sequence_enrollment_id uuid references public.crm_sequence_enrollments(id) on delete set null,
  email text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days')
);
create index if not exists crm_unsubscribe_tokens_lookup_idx on public.crm_unsubscribe_tokens(token) where used_at is null;
alter table public.crm_unsubscribe_tokens enable row level security;
revoke all on table public.crm_unsubscribe_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_unsubscribe_tokens to service_role;

-- System-owned approved CRM email templates. The template/version split preserves the
-- existing approval model while ensuring sequence steps can only use an active approved version.
do $$
declare
  v_id uuid;
  v_version uuid;
begin
  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Business listing notice','gtm_claim_listing_notice','email','claim_outreach','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Your business is listed on TheOutHaven',
    'Hi {{business_name}} team,\n\nYour business is listed on TheOutHaven, where customers discover restaurants and activities for complete outings. Your profile is currently unclaimed. Claiming is free and lets you verify the information customers see.\n\nClaim your business: {{claim_url}}\nClaim code: {{claim_code}}\n\nQuestions? {{support_url}}\n\nYou received this because this business email is publicly listed for {{business_name}}. Unsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Your business is on TheOutHaven</h2><p>Hi {{business_name}} team,</p><p><strong>{{business_name}}</strong> is listed on TheOutHaven, where customers discover restaurants and activities for complete outings.</p><p>Your profile is currently unclaimed. Claiming is free and lets you verify the information customers see.</p><p><a href="{{claim_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Claim Your Business</a></p><p><strong>Claim code:</strong> {{claim_code}}</p><p>Questions? <a href="{{support_url}}">TheOutHaven Support</a></p><hr/><p style="font-size:12px;color:#666">You received this because this business email is publicly listed for {{business_name}}. <a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","claim_code","support_url","unsubscribe_url"]'::jsonb,'Initial GTM business claim template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Why claim your business','gtm_claim_why_claim','email','claim_outreach','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Manage what customers see for {{business_name}}','Claiming {{business_name}} on TheOutHaven gives your team control over business details, reservation links, events and experiences, and business analytics.\n\nClaim your business: {{claim_url}}\n\nUnsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Manage what customers see</h2><p>Claiming <strong>{{business_name}}</strong> gives your team control over your business presence on TheOutHaven.</p><ul><li>Verify business information</li><li>Manage reservation links and availability</li><li>Add Events &amp; Experiences</li><li>Access business analytics as activity grows</li></ul><p><a href="{{claim_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Claim Your Business</a></p><p style="font-size:12px;color:#666"><a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","unsubscribe_url"]'::jsonb,'Initial GTM why-claim template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Business opportunity','gtm_claim_opportunity','email','claim_outreach','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'A growth opportunity for {{business_name}}','TheOutHaven helps customers turn a search into a complete outing. Claim {{business_name}} so your team can manage how the business appears and see the customer activity tied to your location.\n\nClaim: {{claim_url}}\n\nUnsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Turn discovery into customers</h2><p>TheOutHaven helps customers turn a search into a complete outing. Claim <strong>{{business_name}}</strong> so your team can manage how the business appears and see customer activity tied to your location.</p><p><strong>Current opportunity:</strong> {{opportunity_reason}}</p><p><a href="{{claim_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Claim {{business_name}}</a></p><p style="font-size:12px;color:#666"><a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","opportunity_reason","unsubscribe_url"]'::jsonb,'Initial GTM opportunity template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Final claim reminder','gtm_claim_final_reminder','email','claim_outreach','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Final reminder: claim {{business_name}}','Your TheOutHaven business profile is still unclaimed. If you own or manage {{business_name}}, you can verify and manage it here: {{claim_url}}\n\nWe will stop this claim outreach sequence after this reminder.\n\nUnsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Your profile is still unclaimed</h2><p>If you own or manage <strong>{{business_name}}</strong>, you can verify and manage it on TheOutHaven.</p><p><a href="{{claim_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Claim Your Business</a></p><p>We will stop this claim outreach sequence after this reminder.</p><p style="font-size:12px;color:#666"><a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","unsubscribe_url"]'::jsonb,'Initial GTM final-reminder template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Continue your claim','gtm_claim_continue','email','claim_follow_up','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Finish claiming {{business_name}}','You started claiming {{business_name}} but the claim is not complete yet. Continue here: {{claim_url}}\n\nNeed help? {{support_url}}\n\nUnsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Finish your business claim</h2><p>You started claiming <strong>{{business_name}}</strong>, but the claim is not complete yet.</p><p><a href="{{claim_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Continue Claim</a></p><p>Need help? <a href="{{support_url}}">Contact support</a>.</p><p style="font-size:12px;color:#666"><a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","support_url","unsubscribe_url"]'::jsonb,'Initial claim-completion template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Claim help','gtm_claim_help','email','claim_follow_up','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Need help with your {{business_name}} claim?','If verification or setup stopped you from completing the claim, our team can help. Continue: {{claim_url}} or visit {{support_url}}.\n\nUnsubscribe: {{unsubscribe_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Need help finishing your claim?</h2><p>If verification or setup stopped you from completing the claim for <strong>{{business_name}}</strong>, our team can help.</p><p><a href="{{claim_url}}">Continue your claim</a> or visit <a href="{{support_url}}">TheOutHaven Support</a>.</p><p style="font-size:12px;color:#666"><a href="{{unsubscribe_url}}">Unsubscribe from business outreach</a>.</p></div>',
    '["business_name","claim_url","support_url","unsubscribe_url"]'::jsonb,'Initial claim-help template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Owner welcome','gtm_owner_welcome','email','onboarding','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Welcome to TheOutHaven, {{business_name}}','Your claim is approved. You can now manage {{business_name}} on TheOutHaven. Open your dashboard: {{dashboard_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Welcome to TheOutHaven</h2><p>Your claim for <strong>{{business_name}}</strong> is approved.</p><p><a href="{{dashboard_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Manage Your Business</a></p><p>Start by confirming your hours, photos, website, and reservation setup.</p></div>',
    '["business_name","dashboard_url"]'::jsonb,'Initial owner welcome template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Complete business setup','gtm_owner_complete_setup','email','onboarding','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Complete your {{business_name}} setup','Your business profile is {{profile_completion_score}}% complete. Finish setup in your dashboard: {{dashboard_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Complete your business setup</h2><p>Your <strong>{{business_name}}</strong> profile is <strong>{{profile_completion_score}}% complete</strong>.</p><p>Confirm the details customers rely on, then configure the business tools that fit your operation.</p><p><a href="{{dashboard_url}}">Continue setup</a></p></div>',
    '["business_name","profile_completion_score","dashboard_url"]'::jsonb,'Initial owner setup template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Business activity','gtm_owner_activity','email','onboarding','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'See how customers are discovering {{business_name}}','Your TheOutHaven dashboard now brings your business activity and local performance context together. View analytics: {{analytics_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>See your TheOutHaven activity</h2><p>Your dashboard brings <strong>{{business_name}}</strong> activity and local performance context together.</p><p><a href="{{analytics_url}}">View business analytics</a></p></div>',
    '["business_name","analytics_url"]'::jsonb,'Initial owner analytics template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Essentials value proof','gtm_essentials_value','email','essentials_conversion','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Your TheOutHaven activity for {{business_name}}','Your location has {{search_impressions_30d}} search appearances, {{views_30d}} profile views, and {{outing_inclusions_30d}} outing selections in the last 30 days. See your dashboard: {{analytics_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Your business activity</h2><p>In the last 30 days, <strong>{{business_name}}</strong> has:</p><ul><li>{{search_impressions_30d}} search appearances</li><li>{{views_30d}} profile views</li><li>{{outing_inclusions_30d}} outing selections</li></ul><p><a href="{{analytics_url}}">View your analytics</a></p><p>Essentials is designed to help you turn that visibility into more customer actions and give your team the tools to manage the business relationship end to end.</p></div>',
    '["business_name","search_impressions_30d","views_30d","outing_inclusions_30d","analytics_url"]'::jsonb,'Initial Essentials value template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;

  insert into public.crm_templates(name,template_key,channel,category,status,requires_approval,is_system_template)
  values('Essentials introduction','gtm_essentials_intro','email','essentials_conversion','approved',true,true)
  on conflict (template_key) do update set name=excluded.name,status='approved',requires_approval=true,is_system_template=true,updated_at=now()
  returning id into v_id;
  insert into public.crm_template_versions(template_id,version_number,subject,body_text,body_html,variables,change_summary,approval_status,approved_at)
  values(v_id,1,'Put TheOutHaven to work for {{business_name}}','Essentials brings together business visibility, customer conversion tools, analytics, and TheOutHaven business features for $99/month. Review your plan options: {{plans_url}}',
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Put TheOutHaven to work for {{business_name}}</h2><p>Essentials brings together business visibility, customer conversion tools, analytics, and TheOutHaven business features for <strong>$99/month</strong>.</p><p><a href="{{plans_url}}" style="display:inline-block;background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Review Essentials</a></p></div>',
    '["business_name","plans_url"]'::jsonb,'Initial Essentials introduction template','approved',now())
  on conflict (template_id,version_number) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,approval_status='approved',approved_at=now()
  returning id into v_version;
  update public.crm_templates set active_version_id=v_version where id=v_id;
end $$;

-- Rebuild the four lifecycle sequences against the approved system templates.
do $$
declare
  v_seq uuid;
  t_notice uuid; t_why uuid; t_opp uuid; t_final uuid; t_continue uuid; t_help uuid;
  t_welcome uuid; t_setup uuid; t_activity uuid; t_value uuid; t_essentials uuid;
begin
  select id into t_notice from public.crm_templates where template_key='gtm_claim_listing_notice';
  select id into t_why from public.crm_templates where template_key='gtm_claim_why_claim';
  select id into t_opp from public.crm_templates where template_key='gtm_claim_opportunity';
  select id into t_final from public.crm_templates where template_key='gtm_claim_final_reminder';
  select id into t_continue from public.crm_templates where template_key='gtm_claim_continue';
  select id into t_help from public.crm_templates where template_key='gtm_claim_help';
  select id into t_welcome from public.crm_templates where template_key='gtm_owner_welcome';
  select id into t_setup from public.crm_templates where template_key='gtm_owner_complete_setup';
  select id into t_activity from public.crm_templates where template_key='gtm_owner_activity';
  select id into t_value from public.crm_templates where template_key='gtm_essentials_value';
  select id into t_essentials from public.crm_templates where template_key='gtm_essentials_intro';

  insert into public.crm_sequences(sequence_key,name,description,category,status,requires_approval,allowed_roles,allowed_teams,exit_rules)
  values('business-claim-outreach','Business Claim Outreach','Four-touch business claim sequence with event-driven exits.','claim_outreach','active',false,array['superadmin','admin','ambassador'],array['sales_team'],
    '{"stop_on_reply":true,"stop_on_suppression":true,"stop_on_claim_started":true,"stop_on_claim_completed":true,"stop_on_customer":true}'::jsonb)
  on conflict (sequence_key) do update set name=excluded.name,description=excluded.description,status='active',exit_rules=excluded.exit_rules,updated_at=now()
  returning id into v_seq;
  delete from public.crm_sequence_steps where sequence_id=v_seq;
  insert into public.crm_sequence_steps(sequence_id,step_order,step_type,delay_config,template_id,conditions) values
    (v_seq,1,'email','{}',t_notice,'{}'),
    (v_seq,2,'wait','{"days":3}',null,'{}'),
    (v_seq,3,'exit_check','{}',null,'{"mode":"claim_outreach"}'),
    (v_seq,4,'email','{}',t_why,'{}'),
    (v_seq,5,'wait','{"days":4}',null,'{}'),
    (v_seq,6,'exit_check','{}',null,'{"mode":"claim_outreach"}'),
    (v_seq,7,'email','{}',t_opp,'{}'),
    (v_seq,8,'task','{}',null,'{"task_title":"Follow up with engaged business","task_description":"Business Claim outreach has reached the human follow-up stage. Review engagement and contact the owner or manager.","task_type":"outreach","queue_key":"outreach","priority":"high"}'),
    (v_seq,9,'wait','{"days":4}',null,'{}'),
    (v_seq,10,'exit_check','{}',null,'{"mode":"claim_outreach"}'),
    (v_seq,11,'email','{}',t_final,'{}');

  insert into public.crm_sequences(sequence_key,name,description,category,status,requires_approval,allowed_roles,allowed_teams,exit_rules)
  values('business-claim-follow-up','Claim Completion','Helps owners finish a started but incomplete claim.','claim_follow_up','active',false,array['superadmin','admin','ambassador','experience_team'],array['sales_team','experience_team'],
    '{"stop_on_reply":true,"stop_on_suppression":true,"stop_on_claim_completed":true,"stop_on_customer":true}'::jsonb)
  on conflict (sequence_key) do update set name=excluded.name,description=excluded.description,status='active',exit_rules=excluded.exit_rules,updated_at=now()
  returning id into v_seq;
  delete from public.crm_sequence_steps where sequence_id=v_seq;
  insert into public.crm_sequence_steps(sequence_id,step_order,step_type,delay_config,template_id,conditions) values
    (v_seq,1,'email','{}',t_continue,'{}'),
    (v_seq,2,'wait','{"days":2}',null,'{}'),
    (v_seq,3,'exit_check','{}',null,'{"mode":"claim_completion"}'),
    (v_seq,4,'task','{}',null,'{"task_title":"Help finish business claim","task_description":"The owner started a claim but has not submitted it. Offer help with verification or setup.","task_type":"follow_up","queue_key":"claims","priority":"high"}'),
    (v_seq,5,'wait','{"days":3}',null,'{}'),
    (v_seq,6,'exit_check','{}',null,'{"mode":"claim_completion"}'),
    (v_seq,7,'email','{}',t_help,'{}');

  insert into public.crm_sequences(sequence_key,name,description,category,status,requires_approval,allowed_roles,allowed_teams,exit_rules)
  values('owner-onboarding','Owner Activation','Moves an approved claim from ownership verification to meaningful product activation.','onboarding','active',false,array['superadmin','admin','ambassador','experience_team'],array['sales_team','experience_team'],
    '{"stop_on_suppression":true,"stop_on_customer":false}'::jsonb)
  on conflict (sequence_key) do update set name=excluded.name,description=excluded.description,status='active',exit_rules=excluded.exit_rules,updated_at=now()
  returning id into v_seq;
  delete from public.crm_sequence_steps where sequence_id=v_seq;
  insert into public.crm_sequence_steps(sequence_id,step_order,step_type,delay_config,template_id,conditions) values
    (v_seq,1,'email','{}',t_welcome,'{}'),
    (v_seq,2,'wait','{"days":2}',null,'{}'),
    (v_seq,3,'email','{}',t_setup,'{}'),
    (v_seq,4,'wait','{"days":4}',null,'{}'),
    (v_seq,5,'email','{}',t_activity,'{}'),
    (v_seq,6,'task','{}',null,'{"task_title":"Review owner activation","task_description":"Review activation progress and help the business complete high-value setup items.","task_type":"onboarding","queue_key":"onboarding","priority":"normal"}');

  insert into public.crm_sequences(sequence_key,name,description,category,status,requires_approval,allowed_roles,allowed_teams,exit_rules)
  values('essentials-conversion','Essentials Conversion','Value-led conversion sequence for activated, claimed, unpaid businesses.','essentials_conversion','active',false,array['superadmin','admin','ambassador'],array['sales_team'],
    '{"stop_on_reply":true,"stop_on_suppression":true,"stop_on_customer":true}'::jsonb)
  on conflict (sequence_key) do update set name=excluded.name,description=excluded.description,status='active',exit_rules=excluded.exit_rules,updated_at=now()
  returning id into v_seq;
  delete from public.crm_sequence_steps where sequence_id=v_seq;
  insert into public.crm_sequence_steps(sequence_id,step_order,step_type,delay_config,template_id,conditions) values
    (v_seq,1,'email','{}',t_value,'{}'),
    (v_seq,2,'wait','{"days":3}',null,'{}'),
    (v_seq,3,'exit_check','{}',null,'{"mode":"essentials_conversion"}'),
    (v_seq,4,'email','{}',t_essentials,'{}'),
    (v_seq,5,'task','{}',null,'{"task_title":"Follow up on Essentials","task_description":"The claimed business has received its value proof and Essentials overview. Follow up based on current activity and needs.","task_type":"sales","queue_key":"sales","priority":"high"}');
end $$;

-- Idempotent sequence enrollment helper used by contact discovery and lifecycle triggers.
create or replace function public.gtm_enroll_location_sequence(p_location_id uuid,p_sequence_key text)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_sequence_id uuid; v_account_id uuid; v_contact_id uuid; v_owner uuid; v_existing uuid; v_source text;
begin
  select id into v_sequence_id from public.crm_sequences where sequence_key=p_sequence_key and status='active' and archived_at is null;
  if v_sequence_id is null then return null; end if;
  select crm_account_id into v_account_id from public.gtm_location_state where location_id=p_location_id and association_level='full' and suppressed=false;
  if v_account_id is null then return null; end if;
  select d.contact_id into v_contact_id from public.gtm_contact_discoveries d
    join public.crm_contacts c on c.id=d.contact_id
    where d.location_id=p_location_id and d.contact_kind='email' and d.confidence>=80
      and d.verification_status in ('discovered','verified') and c.archived_at is null and c.do_not_contact=false
    order by case when d.verification_status='verified' then 0 else 1 end,d.confidence desc,d.created_at asc limit 1;
  if v_contact_id is null then return null; end if;
  if exists(select 1 from public.crm_suppression_entries s join public.crm_contacts c on c.id=v_contact_id where s.is_active=true and s.channel='email' and lower(s.address)=lower(c.email)) then return null; end if;
  select owner_user_id into v_owner from public.crm_location_territories where location_id=p_location_id limit 1;
  v_source='gtm:'||p_location_id::text||':'||p_sequence_key;
  select id into v_existing from public.crm_sequence_enrollments where source_system='gtm' and source_record_id=v_source limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.crm_sequence_enrollments(sequence_id,contact_id,account_id,location_id,owner_user_id,status,current_step_order,next_step_at,source_system,source_record_id)
  values(v_sequence_id,v_contact_id,v_account_id,p_location_id,v_owner,'active',1,now(),'gtm',v_source) returning id into v_existing;
  return v_existing;
end $$;
revoke all on function public.gtm_enroll_location_sequence(uuid,text) from public,anon,authenticated;
grant execute on function public.gtm_enroll_location_sequence(uuid,text) to service_role;

create or replace function public.gtm_exit_location_sequences(p_location_id uuid,p_reason text,p_keys text[] default null)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;
begin
  update public.crm_sequence_enrollments e set status='exited',next_step_at=null,exit_reason=p_reason,updated_at=now()
  from public.crm_sequences s where s.id=e.sequence_id and e.location_id=p_location_id and e.status in ('active','paused') and (p_keys is null or s.sequence_key=any(p_keys));
  get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.gtm_exit_location_sequences(uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.gtm_exit_location_sequences(uuid,text,text[]) to service_role;

create or replace function public.gtm_claim_sequence_lifecycle()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_paid boolean; v_score integer;
begin
  v_paid=coalesce(new.subscription_status,'') in ('active','paid') or coalesce(new.is_pro,false)=true or (coalesce(new.subscription_plan,'free') not in ('','free','free_discovery'));
  if tg_op='UPDATE' and new.claim_started_at is not null and old.claim_started_at is distinct from new.claim_started_at then
    perform public.gtm_exit_location_sequences(new.id,'claim_started',array['business-claim-outreach']);
    perform public.gtm_enroll_location_sequence(new.id,'business-claim-follow-up');
  end if;
  if tg_op='UPDATE' and new.claim_submitted_at is not null and old.claim_submitted_at is distinct from new.claim_submitted_at then
    perform public.gtm_exit_location_sequences(new.id,'claim_submitted',array['business-claim-outreach','business-claim-follow-up']);
  end if;
  if tg_op='UPDATE' and ((new.claim_approved_at is not null and old.claim_approved_at is distinct from new.claim_approved_at) or (coalesce(new.is_claimed,false)=true and coalesce(old.is_claimed,false)=false)) then
    perform public.gtm_exit_location_sequences(new.id,'claim_approved',array['business-claim-outreach','business-claim-follow-up']);
    perform public.gtm_enroll_location_sequence(new.id,'owner-onboarding');
  end if;
  if v_paid then perform public.gtm_exit_location_sequences(new.id,'customer',array['business-claim-outreach','business-claim-follow-up','essentials-conversion']); end if;
  if coalesce(new.is_claimed,false)=true and not v_paid and coalesce(new.profile_completion_score,0)>=70 then
    perform public.gtm_enroll_location_sequence(new.id,'essentials-conversion');
  end if;
  select opportunity_score into v_score from public.gtm_location_state where location_id=new.id;
  if not coalesce(new.is_claimed,false) and not v_paid and coalesce(v_score,0)>=60 then perform public.gtm_enroll_location_sequence(new.id,'business-claim-outreach'); end if;
  return new;
end $$;
revoke all on function public.gtm_claim_sequence_lifecycle() from public,anon,authenticated;
grant execute on function public.gtm_claim_sequence_lifecycle() to service_role;
drop trigger if exists trg_gtm_claim_sequence_lifecycle on public.locations;
create trigger trg_gtm_claim_sequence_lifecycle after update of claim_started_at,claim_submitted_at,claim_approved_at,is_claimed,subscription_status,subscription_plan,is_pro,profile_completion_score,opportunity_score on public.locations for each row execute function public.gtm_claim_sequence_lifecycle();

create or replace function public.gtm_contact_sequence_activation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_score integer; v_claimed boolean;
begin
  if new.contact_kind='email' and new.contact_id is not null and new.confidence>=80 and new.verification_status in ('discovered','verified') then
    select s.opportunity_score,coalesce(l.is_claimed,false) into v_score,v_claimed from public.gtm_location_state s join public.locations l on l.id=s.location_id where s.location_id=new.location_id;
    if coalesce(v_score,0)>=60 and not coalesce(v_claimed,false) then perform public.gtm_enroll_location_sequence(new.location_id,'business-claim-outreach'); end if;
  end if;
  return new;
end $$;
revoke all on function public.gtm_contact_sequence_activation() from public,anon,authenticated;
grant execute on function public.gtm_contact_sequence_activation() to service_role;
drop trigger if exists trg_gtm_contact_sequence_activation on public.gtm_contact_discoveries;
create trigger trg_gtm_contact_sequence_activation after insert or update of contact_id,confidence,verification_status on public.gtm_contact_discoveries for each row execute function public.gtm_contact_sequence_activation();

-- Provider-independent reply handling: any inbound CRM message tied to a location pauses active
-- acquisition/conversion automation and raises an owner_reply GTM signal.
create or replace function public.gtm_pause_on_inbound_crm_message()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_location uuid;
begin
  if new.direction<>'inbound' then return new; end if;
  select location_id into v_location from public.crm_conversations where id=new.conversation_id;
  if v_location is null then return new; end if;
  update public.crm_sequence_enrollments e set status='paused',paused_at=now(),pause_reason='owner_reply',next_step_at=null,updated_at=now()
  from public.crm_sequences s where s.id=e.sequence_id and e.location_id=v_location and e.status='active' and s.sequence_key in ('business-claim-outreach','business-claim-follow-up','essentials-conversion');
  insert into public.gtm_events(location_id,contact_id,event_type,channel,source,occurred_at,metadata)
  values(v_location,new.contact_id,'owner_reply','email','crm_inbound',now(),jsonb_build_object('crm_message_id',new.id));
  update public.gtm_location_state set gtm_status='engaged',last_signal_at=now(),last_touch_source='email',assisted_sources=array(select distinct x from unnest(assisted_sources||array['email']) x),updated_at=now() where location_id=v_location and gtm_status not in ('customer','suppressed');
  return new;
end $$;
revoke all on function public.gtm_pause_on_inbound_crm_message() from public,anon,authenticated;
grant execute on function public.gtm_pause_on_inbound_crm_message() to service_role;
drop trigger if exists trg_gtm_pause_on_inbound_crm_message on public.crm_messages;
create trigger trg_gtm_pause_on_inbound_crm_message after insert on public.crm_messages for each row execute function public.gtm_pause_on_inbound_crm_message();

-- Delivery feedback is bridged into GTM from the existing Resend delivery ledger.
create or replace function public.gtm_capture_crm_delivery_event()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_location uuid; v_contact uuid; v_enrollment uuid; v_gtm_event text;
begin
  select e.location_id,m.contact_id,m.sequence_enrollment_id into v_location,v_contact,v_enrollment
  from public.crm_messages m left join public.crm_sequence_enrollments e on e.id=m.sequence_enrollment_id where m.id=new.message_id;
  if v_location is null or v_enrollment is null then return new; end if;
  v_gtm_event=case new.event_type when 'delivered' then 'email_delivered' when 'opened' then 'email_open' when 'clicked' then 'email_click' when 'hard_bounce' then 'email_bounce' when 'complaint' then 'email_complaint' when 'suppressed' then 'email_suppressed' else null end;
  if v_gtm_event is not null then
    insert into public.gtm_events(location_id,contact_id,event_type,channel,source,occurred_at,metadata) values(v_location,v_contact,v_gtm_event,'email','crm_delivery',new.event_at,jsonb_build_object('crm_message_id',new.message_id,'delivery_event_id',new.id));
  end if;
  if new.event_type in ('clicked','opened') then update public.gtm_location_state set last_signal_at=new.event_at,last_touch_source='email',assisted_sources=array(select distinct x from unnest(assisted_sources||array['email']) x),gtm_status=case when gtm_status in ('observed','evaluated','qualified','sales_active') then 'engaged' else gtm_status end,updated_at=now() where location_id=v_location; end if;
  if new.event_type in ('hard_bounce','complaint','suppressed') then perform public.gtm_exit_location_sequences(v_location,'email_'||new.event_type,array['business-claim-outreach','business-claim-follow-up','essentials-conversion']); end if;
  return new;
end $$;
revoke all on function public.gtm_capture_crm_delivery_event() from public,anon,authenticated;
grant execute on function public.gtm_capture_crm_delivery_event() to service_role;
drop trigger if exists trg_gtm_capture_crm_delivery_event on public.crm_delivery_events;
create trigger trg_gtm_capture_crm_delivery_event after insert on public.crm_delivery_events for each row execute function public.gtm_capture_crm_delivery_event();

commit;