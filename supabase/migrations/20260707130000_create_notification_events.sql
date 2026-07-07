begin;

create type public.notification_event_type as enum (
  'transaction_created',
  'account_created',
  'account_updated',
  'account_deactivated',
  'account_reordered',
  'recurring_created',
  'recurring_updated',
  'recurring_status_changed'
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type public.notification_event_type not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.notification_events is
  'Household activity feed used for in-app notifications, such as partner transactions and admin setting changes.';
comment on column public.notification_events.actor_user_id is
  'The household member who caused the event. Null is reserved for future system-generated notifications.';
comment on column public.notification_events.metadata is
  'Small non-sensitive event context, such as ids, amount, type, or status. Avoid storing account/card numbers.';

create table public.notification_reads (
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.notification_reads is
  'Per-user read markers for household notification events. Each member can mark only their own feed items as read.';

create index notification_events_household_created_idx
  on public.notification_events(household_id, created_at desc);

create index notification_events_actor_idx
  on public.notification_events(actor_user_id, created_at desc);

create index notification_reads_user_idx
  on public.notification_reads(user_id, read_at desc);

alter table public.notification_events enable row level security;
alter table public.notification_events force row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_reads force row level security;

create policy "Members can view household notifications"
  on public.notification_events
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create household notifications"
  on public.notification_events
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and actor_user_id = auth.uid()
  );

create policy "Members can view own notification reads"
  on public.notification_reads
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members can mark own notifications as read"
  on public.notification_reads
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.notification_events event
      where event.id = event_id
        and public.is_household_member(event.household_id)
    )
  );

create policy "Members can refresh own notification reads"
  on public.notification_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.notification_events event
      where event.id = event_id
        and public.is_household_member(event.household_id)
    )
  );

create policy "Members can delete own notification reads"
  on public.notification_reads
  for delete
  to authenticated
  using (user_id = auth.uid());

grant usage on type public.notification_event_type to authenticated;

grant select, insert on table public.notification_events to authenticated;
grant select, insert, update, delete on table public.notification_reads to authenticated;

commit;
