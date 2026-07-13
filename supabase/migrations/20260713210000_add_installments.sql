-- Installment purchases (할부): a recurring item that stops after a fixed
-- number of payments. The daily recurring job creates the monthly transaction
-- and cancels the item once the final installment is paid.
-- ALTER TYPE ... ADD VALUE runs outside an explicit transaction on purpose.

alter type public.recurring_item_kind add value if not exists 'installment';

alter table public.recurring_items
  add column if not exists total_installments integer;

comment on column public.recurring_items.total_installments is
  'Total number of installments for kind=installment items; null otherwise.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recurring_items_total_installments_positive'
  ) then
    alter table public.recurring_items
      add constraint recurring_items_total_installments_positive
      check (total_installments is null or total_installments > 0);
  end if;
end $$;
