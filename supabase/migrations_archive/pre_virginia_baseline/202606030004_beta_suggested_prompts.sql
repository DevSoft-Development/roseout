create table if not exists public.beta_suggested_prompts (
  id text primary key,
  category_id text not null,
  category_label text not null,
  category_description text,
  label text not null,
  prompt text not null,
  recommended_path text not null default '/create',
  notes text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists beta_suggested_prompts_set_updated_at on public.beta_suggested_prompts;
create trigger beta_suggested_prompts_set_updated_at
before update on public.beta_suggested_prompts
for each row execute function public.set_updated_at();

alter table public.beta_tasks add column if not exists prompt_category_id text;
alter table public.beta_tasks add column if not exists suggested_prompt text;
alter table public.beta_tasks add column if not exists test_url_label text;

create table if not exists public.beta_task_prompt_options (
  task_id uuid not null references public.beta_tasks(id) on delete cascade,
  prompt_id text not null references public.beta_suggested_prompts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, prompt_id)
);

with prompts(id, category_id, category_label, category_description, label, prompt, recommended_path, notes, sort_order) as (
  values
  ('quality-theater-filter','quality_targets','Quality Targets','Prompts that check category matching, intent parsing, and result quality.','Theater filtering','group dinner and drinks','/create','Results should not be mostly theaters unless the search clearly asks for a show, theater, or performance.',10),
  ('edge-not-theater','quality_targets','Quality Targets','Prompts that check category matching, intent parsing, and result quality.','Restaurant intent','group dinner with cocktails not a theater','/create',null,20),
  ('group-night-dinner-drinks','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Group dinner + drinks','group dinner and drinks','/create','Important test. Should not over-return theaters unless clearly relevant.',100),
  ('group-night-lounge','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Group dinner + lounge','group dinner and lounge after','/create',null,110),
  ('group-night-cocktails','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Cocktails outing','cocktails and fun food for a group night','/create',null,120),
  ('group-night-birthday','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Birthday group night','birthday group dinner and activity','/create',null,130),
  ('group-night-brunch','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Group brunch','group brunch and something fun after','/create',null,140),
  ('group-night-upscale','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Upscale group night','upscale group dinner and drinks','/create',null,150),
  ('group-night-chill','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Chill group night','chill group dinner and relaxed activity','/create',null,160),
  ('group-night-photo-friendly','group_night','Group Night','Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.','Photo-friendly group night','cute photo friendly dinner spot and drinks for a group','/create',null,170)
)
insert into public.beta_suggested_prompts (id, category_id, category_label, category_description, label, prompt, recommended_path, notes, sort_order)
select * from prompts
on conflict (id) do update set
  category_id = excluded.category_id,
  category_label = excluded.category_label,
  category_description = excluded.category_description,
  label = excluded.label,
  prompt = excluded.prompt,
  recommended_path = excluded.recommended_path,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

update public.beta_suggested_prompts
set
  category_id = 'group_night',
  category_label = 'Group Night',
  category_description = 'Prompts for friend groups, social outings, dinner, drinks, lounges, and fun group plans.',
  updated_at = now()
where category_id = concat('girls', '_night');

update public.beta_suggested_prompts
set
  id = replace(id, concat('girls', '-night-'), 'group-night-'),
  prompt = replace(prompt, concat('girls', ' night'), 'group night'),
  label = replace(label, concat('Girls', ' night'), 'Group night'),
  updated_at = now()
where id like concat('girls', '-night-%')
and not exists (
  select 1 from public.beta_suggested_prompts existing
  where existing.id = replace(public.beta_suggested_prompts.id, concat('girls', '-night-'), 'group-night-')
);

delete from public.beta_suggested_prompts
where id like concat('girls', '-night-%')
or category_id = concat('girls', '_night');

insert into public.beta_tasks (title, description, feature_area, tester_type, priority, test_url, prompt_mode, predefined_prompt, suggested_prompt, prompt_category_id, allow_custom_prompt, custom_prompt_required, button_label, estimated_minutes, instructions, status)
values (
  'Test group night search',
  'Check if TheOutHaven understands a group social outing search.',
  'search_quality',
  'user',
  'high',
  '/create?prompt=group%20dinner%20and%20drinks',
  'either',
  'group dinner and drinks',
  'group dinner and drinks',
  'group_night',
  true,
  false,
  'Test group dinner and drinks',
  5,
  'Confirm the results match a group dinner or social outing. Results should not be mostly theaters unless the prompt clearly asks for entertainment. Report mismatched categories.',
  'active'
)
on conflict do nothing;

update public.beta_tasks
set
  title = 'Test group night search',
  description = 'Check if TheOutHaven understands a group social outing search.',
  test_url = '/create?prompt=group%20dinner%20and%20drinks',
  test_url_label = 'Test group dinner and drinks',
  predefined_prompt = 'group dinner and drinks',
  suggested_prompt = 'group dinner and drinks',
  prompt_category_id = 'group_night',
  instructions = 'Confirm the results match a group dinner or social outing. Results should not be mostly theaters unless the prompt clearly asks for entertainment. Report mismatched categories.',
  updated_at = now()
where title = concat('Test ', 'girls', ' night search');

update public.beta_tasks
set
  prompt_category_id = 'group_night',
  suggested_prompt = case when suggested_prompt = concat('girls', ' night dinner and drinks') then 'group dinner and drinks' else suggested_prompt end,
  predefined_prompt = case when predefined_prompt = concat('girls', ' night dinner and drinks') then 'group dinner and drinks' else predefined_prompt end,
  updated_at = now()
where prompt_category_id = concat('girls', '_night')
or suggested_prompt = concat('girls', ' night dinner and drinks')
or predefined_prompt = concat('girls', ' night dinner and drinks');

insert into public.beta_task_prompt_options (task_id, prompt_id)
select tasks.id, options.prompt_id
from public.beta_tasks tasks
cross join (values
  ('group-night-dinner-drinks'),
  ('group-night-lounge'),
  ('group-night-cocktails'),
  ('group-night-photo-friendly')
) as options(prompt_id)
where tasks.title = 'Test group night search'
on conflict do nothing;

insert into public.beta_task_prompt_options (task_id, prompt_id)
select old_options.task_id, replace(old_options.prompt_id, concat('girls', '-night-'), 'group-night-')
from public.beta_task_prompt_options old_options
where old_options.prompt_id like concat('girls', '-night-%')
and exists (
  select 1 from public.beta_suggested_prompts prompts
  where prompts.id = replace(old_options.prompt_id, concat('girls', '-night-'), 'group-night-')
)
on conflict do nothing;

delete from public.beta_task_prompt_options
where prompt_id like concat('girls', '-night-%');
