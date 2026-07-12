begin;

-- Shared savings goals for a household. Couples set a target amount and track
-- how much they have put aside so far. Data stays isolated per household by the
-- same RLS boundary used across the app.
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  target_amount numeric(14, 2) not null,
  current_amount numeric(14, 2) not null default 0,
  target_date date,
  is_achieved boolean not null default false,
  color text,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_name_not_blank check (length(btrim(name)) > 0),
  constraint savings_goals_target_positive check (target_amount > 0),
  constraint savings_goals_current_nonneg check (current_amount >= 0)
);

comment on table public.savings_goals is
  'Household savings goals. A couple tracks progress toward a shared target amount.';
comment on column public.savings_goals.account_id is
  'Optional savings account this goal is kept in.';
comment on column public.savings_goals.current_amount is
  'Amount put aside so far toward the goal.';
comment on column public.savings_goals.is_achieved is
  'Set when the goal is marked complete or the target is reached.';

create index savings_goals_household_idx
  on public.savings_goals(household_id, is_achieved, created_at desc);
create index savings_goals_account_id_idx
  on public.savings_goals(account_id);

alter table public.savings_goals enable row level security;

create policy "Members can view savings goals"
  on public.savings_goals
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create savings goals"
  on public.savings_goals
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update savings goals"
  on public.savings_goals
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete savings goals"
  on public.savings_goals
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create or replace function public.validate_savings_goal_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'savings_goals.account_id'
  );

  return new;
end;
$$;

create trigger set_savings_goals_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

create trigger prevent_savings_goals_household_id_change
  before update on public.savings_goals
  for each row execute function public.prevent_household_id_change();

create trigger validate_savings_goals_household_refs
  before insert or update on public.savings_goals
  for each row execute function public.validate_savings_goal_household_refs();

commit;
