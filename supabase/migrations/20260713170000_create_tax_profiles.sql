begin;

-- Per-member yearly salary used to estimate the card-spending tax deduction.
-- One row per household member label; the household RLS boundary applies.
create table public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_label text not null,
  annual_salary numeric(14, 0) not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_profiles_member_label_check
    check (member_label in ('husband', 'wife')),
  constraint tax_profiles_salary_nonneg check (annual_salary >= 0),
  constraint tax_profiles_household_member_unique
    unique (household_id, member_label)
);

comment on table public.tax_profiles is
  'Annual gross salary per household member for year-end tax estimates.';

alter table public.tax_profiles enable row level security;

create policy "Members can view tax profiles"
  on public.tax_profiles
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create tax profiles"
  on public.tax_profiles
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update tax profiles"
  on public.tax_profiles
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete tax profiles"
  on public.tax_profiles
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create trigger set_tax_profiles_updated_at
  before update on public.tax_profiles
  for each row execute function public.set_updated_at();

create trigger prevent_tax_profiles_household_id_change
  before update on public.tax_profiles
  for each row execute function public.prevent_household_id_change();

commit;
