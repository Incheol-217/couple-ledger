begin;

create unique index if not exists transactions_recurring_unique_due_idx
  on public.transactions(recurring_item_id, transaction_date)
  where recurring_item_id is not null;

comment on index public.transactions_recurring_unique_due_idx is
  'Prevents duplicate transactions for the same recurring item and due date, including automatically generated recurring transactions.';

commit;
