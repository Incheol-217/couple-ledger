begin;

-- Stores the manual starting balance entered when an account is created.
-- This keeps money that already exists in an account out of income transactions.
alter table public.accounts
  add column if not exists opening_balance numeric(14, 2) not null default 0,
  add column if not exists opening_balance_as_of date not null default current_date;

comment on column public.accounts.opening_balance is
  'Manual starting balance recorded when an account or payment method is added. This is not treated as income.';

comment on column public.accounts.opening_balance_as_of is
  'Date the manual opening balance is considered valid from.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_opening_balance_non_negative'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_opening_balance_non_negative
      check (opening_balance >= 0)
      not valid;

    alter table public.accounts
      validate constraint accounts_opening_balance_non_negative;
  end if;
end $$;

commit;
