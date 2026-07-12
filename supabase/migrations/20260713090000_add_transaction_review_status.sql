begin;

-- Stores whether a transaction should be checked by the couple before it is
-- treated as settled. The row still belongs to the same household boundary as
-- the transaction itself, so existing transaction RLS continues to apply.
alter table public.transactions
  add column if not exists review_status text not null default 'none',
  add column if not exists review_reason text,
  add column if not exists review_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

comment on column public.transactions.review_status is
  'Review state for household coordination: none, needs_review, or reviewed.';
comment on column public.transactions.review_reason is
  'Short user-facing reason shown when a transaction needs review.';
comment on column public.transactions.review_requested_by is
  'Household member who created or requested the review.';
comment on column public.transactions.reviewed_by is
  'Household member who marked the transaction as reviewed.';
comment on column public.transactions.reviewed_at is
  'Timestamp when the transaction review was completed.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_review_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_review_status_check
      check (review_status in ('none', 'needs_review', 'reviewed'));
  end if;
end $$;

create index if not exists transactions_household_review_idx
  on public.transactions(household_id, review_status, transaction_date desc, created_at desc)
  where review_status = 'needs_review';

create or replace function public.normalize_transaction_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.review_status not in ('none', 'needs_review', 'reviewed') then
    raise exception 'transactions.review_status is invalid'
      using errcode = '23514';
  end if;

  if new.review_status = 'needs_review' then
    if new.review_requested_by is null and auth.uid() is not null then
      new.review_requested_by := auth.uid();
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif new.review_status = 'reviewed' then
    if new.reviewed_by is null and auth.uid() is not null then
      new.reviewed_by := auth.uid();
    end if;

    if auth.uid() is not null and new.reviewed_by is distinct from auth.uid() then
      raise exception 'transactions.reviewed_by must match the current user'
        using errcode = '42501';
    end if;

    if new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  else
    new.review_reason := null;
    new.review_requested_by := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  if new.review_requested_by is not null then
    perform public.assert_user_belongs_to_household(
      new.review_requested_by,
      new.household_id,
      'transactions.review_requested_by'
    );
  end if;

  if new.reviewed_by is not null then
    perform public.assert_user_belongs_to_household(
      new.reviewed_by,
      new.household_id,
      'transactions.reviewed_by'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_transaction_review_fields
  on public.transactions;
create trigger normalize_transaction_review_fields
  before insert or update of
    household_id,
    review_status,
    review_reason,
    review_requested_by,
    reviewed_by,
    reviewed_at
  on public.transactions
  for each row execute function public.normalize_transaction_review_fields();

revoke all on function public.normalize_transaction_review_fields() from public;

commit;
