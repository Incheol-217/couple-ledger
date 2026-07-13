begin;

-- Check cards pull money straight from a linked bank account, so allow
-- default_withdrawal_account_id on check_card accounts too (it acts as the
-- linked funding account there, not a card-bill account).
create or replace function public.validate_account_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.default_withdrawal_account_id is not null then
    if new.type not in ('card', 'check_card') then
      raise exception 'default_withdrawal_account_id is only allowed for card accounts'
        using errcode = '23514';
    end if;

    if new.default_withdrawal_account_id = new.id then
      raise exception 'default_withdrawal_account_id cannot reference the same account'
        using errcode = '23514';
    end if;

    perform public.assert_account_belongs_to_household(
      new.default_withdrawal_account_id,
      new.household_id,
      'accounts.default_withdrawal_account_id'
    );
  end if;

  return new;
end;
$$;

commit;
