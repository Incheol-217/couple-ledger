begin;

-- 부채(대출): 전세대출, 신용대출, 주택담보 등. principal은 최초 원금,
-- current_balance는 남은 원금이에요. 순자산 = 자산 − 부채로 계산해요.
create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  liability_type text not null default 'other',
  owner_label text not null default 'shared',
  principal numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  interest_rate numeric(6, 3),
  interest_day integer,
  started_on date,
  ends_on date,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liabilities_name_not_blank check (length(btrim(name)) > 0),
  constraint liabilities_type_check
    check (liability_type in ('jeonse', 'credit', 'mortgage', 'auto', 'other')),
  constraint liabilities_owner_check
    check (owner_label in ('shared', 'husband', 'wife')),
  constraint liabilities_principal_nonneg check (principal >= 0),
  constraint liabilities_balance_nonneg check (current_balance >= 0),
  constraint liabilities_interest_rate_nonneg
    check (interest_rate is null or interest_rate >= 0),
  constraint liabilities_interest_day_check
    check (interest_day is null or interest_day between 1 and 31),
  constraint liabilities_date_range_check
    check (ends_on is null or started_on is null or ends_on >= started_on)
);

comment on table public.liabilities is
  'Household debts (loans). current_balance is the outstanding principal.';

create index liabilities_household_idx
  on public.liabilities(household_id, created_at);

-- 원금 상환 기록. 상환하면 연결계좌에서 현금이 나가고 남은 원금이 줄어요.
create table public.liability_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  liability_id uuid not null references public.liabilities(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14, 2) not null,
  paid_on date not null default current_date,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liability_payments_amount_positive check (amount > 0)
);

comment on table public.liability_payments is
  'Principal repayments; reduces the liability balance and the linked account cash.';

create index liability_payments_household_idx
  on public.liability_payments(household_id, liability_id, paid_on);

create index liability_payments_account_idx
  on public.liability_payments(account_id, paid_on);

alter table public.liabilities enable row level security;
alter table public.liability_payments enable row level security;

create policy "Members can view liabilities"
  on public.liabilities for select to authenticated
  using (public.is_household_member(household_id));
create policy "Members can create liabilities"
  on public.liabilities for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );
create policy "Members can update liabilities"
  on public.liabilities for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members can delete liabilities"
  on public.liabilities for delete to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view liability payments"
  on public.liability_payments for select to authenticated
  using (public.is_household_member(household_id));
create policy "Members can create liability payments"
  on public.liability_payments for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );
create policy "Members can update liability payments"
  on public.liability_payments for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "Members can delete liability payments"
  on public.liability_payments for delete to authenticated
  using (public.is_household_member(household_id));

create or replace function public.validate_liability_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'liabilities.account_id'
  );

  return new;
end;
$$;

create or replace function public.validate_liability_payment_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  liability_household uuid;
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'liability_payments.account_id'
  );

  select household_id into liability_household
  from public.liabilities
  where id = new.liability_id;

  if liability_household is null or liability_household <> new.household_id then
    raise exception 'liability_payments.liability_id must belong to the same household';
  end if;

  return new;
end;
$$;

create trigger set_liabilities_updated_at
  before update on public.liabilities
  for each row execute function public.set_updated_at();
create trigger prevent_liabilities_household_id_change
  before update on public.liabilities
  for each row execute function public.prevent_household_id_change();
create trigger validate_liabilities_household_refs
  before insert or update on public.liabilities
  for each row execute function public.validate_liability_household_refs();

create trigger set_liability_payments_updated_at
  before update on public.liability_payments
  for each row execute function public.set_updated_at();
create trigger prevent_liability_payments_household_id_change
  before update on public.liability_payments
  for each row execute function public.prevent_household_id_change();
create trigger validate_liability_payments_household_refs
  before insert or update on public.liability_payments
  for each row execute function public.validate_liability_payment_household_refs();

commit;
