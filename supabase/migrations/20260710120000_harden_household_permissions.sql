begin;

-- Keeps administrator-only operations protected even when the database is
-- called directly instead of through the Next.js server actions.
create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = target_household_id
        and hm.user_id = auth.uid()
        and hm.role = 'owner'
    );
$$;

drop policy if exists "Members can update households" on public.households;
drop policy if exists "Members can delete households" on public.households;
drop policy if exists "Members can add household members" on public.household_members;
drop policy if exists "Members can update household members" on public.household_members;
drop policy if exists "Members can delete household members" on public.household_members;
drop policy if exists "Members can create accounts" on public.accounts;
drop policy if exists "Members can update accounts" on public.accounts;
drop policy if exists "Members can delete accounts" on public.accounts;

create policy "Owners can update households"
  on public.households
  for update
  to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

create policy "Owners can delete households"
  on public.households
  for delete
  to authenticated
  using (public.is_household_owner(id));

create policy "Owners can add household members"
  on public.household_members
  for insert
  to authenticated
  with check (public.is_household_owner(household_id));

create policy "Owners can update household members"
  on public.household_members
  for update
  to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

create policy "Owners can delete household members"
  on public.household_members
  for delete
  to authenticated
  using (public.is_household_owner(household_id));

create policy "Owners can create accounts"
  on public.accounts
  for insert
  to authenticated
  with check (
    public.is_household_owner(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Owners can update accounts"
  on public.accounts
  for update
  to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

create policy "Owners can delete accounts"
  on public.accounts
  for delete
  to authenticated
  using (public.is_household_owner(household_id));

-- A household must always keep at least one administrator. The parent-row
-- existence check lets household deletion continue through its cascade.
create or replace function public.prevent_last_household_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
  elsif old.role <> 'owner' then
    return old;
  end if;

  if tg_op = 'DELETE' and not exists (
    select 1 from public.households household where household.id = old.household_id
  ) then
    return old;
  end if;

  if not exists (
    select 1
    from public.household_members member
    where member.household_id = old.household_id
      and member.role = 'owner'
      and member.id <> old.id
  ) then
    raise exception 'A household must keep at least one owner'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_last_household_owner_removal
  on public.household_members;
create trigger prevent_last_household_owner_removal
  before update of role or delete on public.household_members
  for each row execute function public.prevent_last_household_owner_removal();

-- The person and source attached at creation time are audit information and
-- must not be reassigned later through a direct API update.
create or replace function public.prevent_transaction_attribution_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'transactions.user_id cannot be changed after creation'
      using errcode = '23514';
  end if;

  if new.source is distinct from old.source then
    raise exception 'transactions.source cannot be changed after creation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_transaction_attribution_change
  on public.transactions;
create trigger prevent_transaction_attribution_change
  before update on public.transactions
  for each row execute function public.prevent_transaction_attribution_change();

-- New transfers must always name a different destination account. NOT VALID
-- preserves any old rows that need manual cleanup while protecting new data.
alter table public.transactions
  add constraint transactions_transfer_accounts_check
  check (
    (
      type = 'transfer'
      and transfer_account_id is not null
      and transfer_account_id <> account_id
    )
    or (
      type <> 'transfer'
      and transfer_account_id is null
    )
  ) not valid;

-- Optional idempotency keys make webhook retries safe without changing the
-- existing Shortcuts request format.
create unique index if not exists transactions_source_external_unique_idx
  on public.transactions(household_id, source, external_id)
  where external_id is not null;

revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.prevent_last_household_owner_removal() from public;
revoke all on function public.prevent_transaction_attribution_change() from public;
grant execute on function public.is_household_owner(uuid) to authenticated;

commit;
