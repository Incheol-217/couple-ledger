begin;

-- 주식·ETF 매매(매수/매도) 기록이에요. 매수는 연결계좌에서 현금이 나가고,
-- 매도는 들어와요. 이 현금흐름은 계좌 잔액 계산에는 반영되지만, 가계부의
-- 지출/수입 통계(transactions)에는 들어가지 않아요(투자 전용).
create table public.investment_trades (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.investment_assets(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  side text not null,
  quantity numeric(18, 6) not null,
  price numeric(18, 4) not null,
  fee numeric(14, 2) not null default 0,
  cash_amount numeric(14, 2) not null,
  traded_at date not null default current_date,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_trades_side_check check (side in ('buy', 'sell')),
  constraint investment_trades_quantity_positive check (quantity > 0),
  constraint investment_trades_price_nonneg check (price >= 0),
  constraint investment_trades_fee_nonneg check (fee >= 0),
  constraint investment_trades_cash_nonneg check (cash_amount >= 0)
);

comment on table public.investment_trades is
  'Stock/ETF buy and sell records; affects the linked account cash balance only.';

create index investment_trades_household_idx
  on public.investment_trades(household_id, asset_id, traded_at);

create index investment_trades_account_idx
  on public.investment_trades(account_id, traded_at);

alter table public.investment_trades enable row level security;

create policy "Members can view investment trades"
  on public.investment_trades
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create investment trades"
  on public.investment_trades
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update investment trades"
  on public.investment_trades
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete investment trades"
  on public.investment_trades
  for delete
  to authenticated
  using (public.is_household_member(household_id));

-- 연결계좌와 자산이 모두 같은 가계부 소속인지 확인해요.
create or replace function public.validate_investment_trade_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  asset_household uuid;
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'investment_trades.account_id'
  );

  select household_id into asset_household
  from public.investment_assets
  where id = new.asset_id;

  if asset_household is null or asset_household <> new.household_id then
    raise exception 'investment_trades.asset_id must belong to the same household';
  end if;

  return new;
end;
$$;

create trigger set_investment_trades_updated_at
  before update on public.investment_trades
  for each row execute function public.set_updated_at();

create trigger prevent_investment_trades_household_id_change
  before update on public.investment_trades
  for each row execute function public.prevent_household_id_change();

create trigger validate_investment_trades_household_refs
  before insert or update on public.investment_trades
  for each row execute function public.validate_investment_trade_household_refs();

commit;
