-- Adds the notification event types the app already emits but the enum was
-- missing (transaction_reviewed) and a new budget_alert type for budget
-- threshold warnings. Also allows system events (null actor) so alerts that
-- concern both members are visible to everyone, including the spender.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction, so this file
-- intentionally has no begin/commit around those statements.

alter type public.notification_event_type add value if not exists 'transaction_reviewed';
alter type public.notification_event_type add value if not exists 'budget_alert';

drop policy if exists "Members can create household notifications"
  on public.notification_events;

create policy "Members can create household notifications"
  on public.notification_events
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (actor_user_id is null or actor_user_id = auth.uid())
  );
