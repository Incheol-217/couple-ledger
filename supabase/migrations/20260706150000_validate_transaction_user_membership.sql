begin;

create or replace function public.validate_transaction_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'transactions.account_id'
  );

  perform public.assert_account_belongs_to_household(
    new.transfer_account_id,
    new.household_id,
    'transactions.transfer_account_id'
  );

  perform public.assert_category_belongs_to_household(
    new.category_id,
    new.household_id,
    'transactions.category_id'
  );

  perform public.assert_recurring_item_belongs_to_household(
    new.recurring_item_id,
    new.household_id,
    'transactions.recurring_item_id'
  );

  perform public.assert_user_belongs_to_household(
    new.user_id,
    new.household_id,
    'transactions.user_id'
  );

  return new;
end;
$$;

commit;
