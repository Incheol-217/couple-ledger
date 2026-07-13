begin;

-- Per-account vault (금고): money set aside inside an account, with its own
-- nickname and amount. Toggled per account; values stay when toggled off so
-- re-enabling restores them.
alter table public.accounts
  add column if not exists vault_enabled boolean not null default false,
  add column if not exists vault_name text,
  add column if not exists vault_amount numeric(14, 2) not null default 0;

comment on column public.accounts.vault_enabled is
  'Whether the vault (금고) is turned on for this account.';
comment on column public.accounts.vault_name is
  'User-facing nickname for the vault.';
comment on column public.accounts.vault_amount is
  'Amount set aside in the vault.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_vault_amount_nonneg'
  ) then
    alter table public.accounts
      add constraint accounts_vault_amount_nonneg check (vault_amount >= 0);
  end if;
end $$;

commit;
