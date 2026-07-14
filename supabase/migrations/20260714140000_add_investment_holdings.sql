-- 자산에 종목 정보를 붙여요. ticker(종목코드)와 quantity(보유수량)가 있으면
-- 야후 파이낸스 시세로 평가액(current_value)을 자동 계산·갱신해요.
-- 국내주식은 005930.KS(코스피)·247540.KQ(코스닥), 해외는 AAPL 처럼 넣어요.

alter table public.investment_assets
  add column if not exists ticker text,
  add column if not exists quantity numeric(18, 6);

comment on column public.investment_assets.ticker is
  'Yahoo Finance symbol (e.g. 005930.KS, AAPL); null for manually valued assets.';
comment on column public.investment_assets.quantity is
  'Shares held; combined with a live quote to compute current_value.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'investment_assets_quantity_nonneg'
  ) then
    alter table public.investment_assets
      add constraint investment_assets_quantity_nonneg
      check (quantity is null or quantity >= 0);
  end if;
end $$;
