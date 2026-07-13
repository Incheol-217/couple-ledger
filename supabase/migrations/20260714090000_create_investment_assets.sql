begin;

-- Savings and investment assets (자산): deposits, stocks, funds, pensions,
-- crypto. Principal is what the couple put in; current_value is updated by
-- hand and yields the return rate. Household RLS as everywhere else.
create table public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  asset_class text not null default 'deposit',
  owner_label text not null default 'shared',
  principal numeric(14, 2) not null default 0,
  current_value numeric(14, 2) not null default 0,
  valued_at date not null default current_date,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_assets_name_not_blank check (length(btrim(name)) > 0),
  constraint investment_assets_class_check
    check (asset_class in ('deposit', 'stock', 'fund', 'pension', 'crypto', 'other')),
  constraint investment_assets_owner_check
    check (owner_label in ('shared', 'husband', 'wife')),
  constraint investment_assets_principal_nonneg check (principal >= 0),
  constraint investment_assets_value_nonneg check (current_value >= 0)
);

comment on table public.investment_assets is
  'Household savings/investment assets with manually updated valuations.';

create index investment_assets_household_idx
  on public.investment_assets(household_id, asset_class, created_at);

alter table public.investment_assets enable row level security;

create policy "Members can view investment assets"
  on public.investment_assets
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create investment assets"
  on public.investment_assets
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update investment assets"
  on public.investment_assets
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete investment assets"
  on public.investment_assets
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create or replace function public.validate_investment_asset_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'investment_assets.account_id'
  );

  return new;
end;
$$;

create trigger set_investment_assets_updated_at
  before update on public.investment_assets
  for each row execute function public.set_updated_at();

create trigger prevent_investment_assets_household_id_change
  before update on public.investment_assets
  for each row execute function public.prevent_household_id_change();

create trigger validate_investment_assets_household_refs
  before insert or update on public.investment_assets
  for each row execute function public.validate_investment_asset_household_refs();

commit;
