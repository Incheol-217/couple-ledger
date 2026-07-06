begin;

create extension if not exists pgcrypto;

create type public.household_member_role as enum ('owner', 'member');
create type public.account_type as enum ('bank', 'card', 'cash', 'savings', 'virtual');
create type public.account_owner_type as enum ('shared', 'husband', 'wife');
create type public.category_type as enum ('expense', 'income', 'transfer');
create type public.transaction_type as enum ('expense', 'income', 'transfer');
create type public.transaction_source as enum ('manual', 'shortcut', 'recurring', 'csv', 'ocr', 'api');
create type public.recurring_item_kind as enum ('subscription', 'fixed_expense');
create type public.recurring_item_status as enum ('active', 'paused', 'canceled');
create type public.billing_cycle as enum ('monthly', 'yearly', 'weekly', 'custom');
create type public.budget_period as enum ('monthly', 'yearly', 'custom');
create type public.ai_advice_severity as enum ('info', 'warning', 'critical');
create type public.import_job_source as enum ('csv', 'ocr', 'api', 'shortcut');
create type public.import_job_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'User-facing profile for each Supabase Auth user. Profiles are shared only with the user and household co-members.';

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency_code text not null default 'KRW',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.households is
  'Shared budget workspace. Every finance record is isolated by household_id for one couple or family unit.';

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_member_role not null default 'member',
  member_label public.account_owner_type,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_members_member_label_check
    check (member_label is null or member_label in ('husband', 'wife')),
  constraint household_members_unique_user unique (household_id, user_id)
);

comment on table public.household_members is
  'Membership join table that decides which authenticated users can access a household and its data.';

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type public.account_type not null,
  owner_type public.account_owner_type not null default 'shared',
  default_withdrawal_account_id uuid references public.accounts(id) on delete set null,
  institution_name text,
  masked_identifier text,
  color text,
  icon text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounts is
  'Accounts and payment methods. Bank accounts, cards, cash, savings, and virtual wallets are all modeled here.';
comment on column public.accounts.default_withdrawal_account_id is
  'Optional source account used to pay a card bill or settle a card payment method.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  type public.category_type not null default 'expense',
  icon text,
  color text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_unique_name_per_type unique (household_id, type, name)
);

comment on table public.categories is
  'Household-owned transaction categories for expense, income, and transfer analysis.';

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  payer_user_id uuid references auth.users(id) on delete set null,
  kind public.recurring_item_kind not null,
  name text not null,
  merchant text,
  amount numeric(14, 2) not null,
  currency_code text not null default 'KRW',
  billing_cycle public.billing_cycle not null,
  billing_interval integer not null default 1,
  custom_interval_days integer,
  billing_day integer,
  day_of_week integer,
  next_due_date date not null,
  status public.recurring_item_status not null default 'active',
  starts_on date,
  ends_on date,
  auto_create_transaction boolean not null default true,
  reminder_days_before integer not null default 3,
  memo text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_items_amount_positive check (amount > 0),
  constraint recurring_items_billing_interval_positive check (billing_interval > 0),
  constraint recurring_items_custom_interval_check
    check (billing_cycle <> 'custom' or custom_interval_days is not null),
  constraint recurring_items_billing_day_check
    check (billing_day is null or billing_day between 1 and 31),
  constraint recurring_items_day_of_week_check
    check (day_of_week is null or day_of_week between 0 and 6),
  constraint recurring_items_reminder_days_before_check
    check (reminder_days_before >= 0),
  constraint recurring_items_date_range_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table public.recurring_items is
  'Subscriptions and fixed expenses. Active rows can automatically create future transactions from next_due_date.';
comment on column public.recurring_items.auto_create_transaction is
  'When true, this recurring item is eligible for automatic transaction creation.';

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  recurring_item_id uuid references public.recurring_items(id) on delete set null,
  transfer_account_id uuid references public.accounts(id) on delete set null,
  type public.transaction_type not null,
  source public.transaction_source not null default 'manual',
  amount numeric(14, 2) not null,
  currency_code text not null default 'KRW',
  transaction_date date not null default current_date,
  occurred_at timestamptz,
  merchant text,
  memo text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_positive check (amount > 0)
);

comment on table public.transactions is
  'All income, expense, and transfer records. Every row must belong to exactly one household and one account.';
comment on column public.transactions.recurring_item_id is
  'Nullable link to the subscription or fixed expense that generated this transaction.';
comment on column public.transactions.source is
  'Input path for the transaction: manual, shortcut, recurring, csv, ocr, or api.';

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  period public.budget_period not null default 'monthly',
  period_start date not null,
  period_end date,
  amount numeric(14, 2) not null,
  currency_code text not null default 'KRW',
  is_active boolean not null default true,
  memo text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_amount_positive check (amount > 0),
  constraint budgets_period_range_check
    check (period_end is null or period_end >= period_start)
);

comment on table public.budgets is
  'Household budget targets. A budget can apply to the whole household, one account, one category, or both.';

create table public.ai_advice_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  severity public.ai_advice_severity not null default 'info',
  title text not null,
  body text not null,
  model text,
  period_start date,
  period_end date,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_advice_logs_period_range_check
    check (period_end is null or period_start is null or period_end >= period_start)
);

comment on table public.ai_advice_logs is
  'Stored AI advice shown to the household. Inputs and outputs are snapshotted for audit and debugging.';

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  source public.import_job_source not null,
  status public.import_job_status not null default 'pending',
  file_name text,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  failed_rows integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_jobs_row_counts_non_negative
    check (total_rows >= 0 and processed_rows >= 0 and failed_rows >= 0),
  constraint import_jobs_completed_after_started
    check (completed_at is null or started_at is null or completed_at >= started_at)
);

comment on table public.import_jobs is
  'Import pipeline tracking table for CSV, OCR, API, and shortcut-origin batch ingestion.';

create index household_members_user_id_idx on public.household_members(user_id);
create index household_members_household_id_idx on public.household_members(household_id);

create index accounts_household_order_idx on public.accounts(household_id, is_active, display_order);
create index accounts_default_withdrawal_idx on public.accounts(default_withdrawal_account_id);

create index categories_household_type_idx on public.categories(household_id, type, is_active, display_order);
create index categories_parent_id_idx on public.categories(parent_id);

create index recurring_items_household_next_due_idx
  on public.recurring_items(household_id, status, auto_create_transaction, next_due_date);
create index recurring_items_account_id_idx on public.recurring_items(account_id);
create index recurring_items_payer_user_id_idx on public.recurring_items(payer_user_id);

create index transactions_household_date_idx
  on public.transactions(household_id, transaction_date desc, created_at desc);
create index transactions_account_date_idx
  on public.transactions(account_id, transaction_date desc);
create index transactions_category_date_idx
  on public.transactions(category_id, transaction_date desc);
create index transactions_recurring_item_id_idx on public.transactions(recurring_item_id);
create index transactions_user_id_idx on public.transactions(user_id);

create index budgets_household_period_idx on public.budgets(household_id, period_start, period_end);
create index budgets_account_id_idx on public.budgets(account_id);
create index budgets_category_id_idx on public.budgets(category_id);

create index ai_advice_logs_household_created_idx
  on public.ai_advice_logs(household_id, created_at desc);

create index import_jobs_household_status_idx
  on public.import_jobs(household_id, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_new_household_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.household_members (household_id, user_id, role, invited_by)
    values (new.id, new.created_by, 'owner', new.created_by)
    on conflict (household_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_household_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'household_id cannot be changed after creation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.is_household_member(target_household_id uuid)
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
    );
$$;

create or replace function public.shares_household_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      target_user_id = auth.uid()
      or exists (
        select 1
        from public.household_members mine
        join public.household_members theirs
          on theirs.household_id = mine.household_id
        where mine.user_id = auth.uid()
          and theirs.user_id = target_user_id
      )
    );
$$;

create or replace function public.assert_account_belongs_to_household(
  target_account_id uuid,
  target_household_id uuid,
  column_name text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actual_household_id uuid;
begin
  if target_account_id is null then
    return;
  end if;

  select account.household_id
  into actual_household_id
  from public.accounts account
  where account.id = target_account_id;

  if actual_household_id is distinct from target_household_id then
    raise exception '% must reference an account in the same household', column_name
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_category_belongs_to_household(
  target_category_id uuid,
  target_household_id uuid,
  column_name text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actual_household_id uuid;
begin
  if target_category_id is null then
    return;
  end if;

  select category.household_id
  into actual_household_id
  from public.categories category
  where category.id = target_category_id;

  if actual_household_id is distinct from target_household_id then
    raise exception '% must reference a category in the same household', column_name
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_recurring_item_belongs_to_household(
  target_recurring_item_id uuid,
  target_household_id uuid,
  column_name text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actual_household_id uuid;
begin
  if target_recurring_item_id is null then
    return;
  end if;

  select recurring.household_id
  into actual_household_id
  from public.recurring_items recurring
  where recurring.id = target_recurring_item_id;

  if actual_household_id is distinct from target_household_id then
    raise exception '% must reference a recurring item in the same household', column_name
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.assert_user_belongs_to_household(
  target_user_id uuid,
  target_household_id uuid,
  column_name text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_member boolean;
begin
  if target_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and member.user_id = target_user_id
  )
  into is_member;

  if not is_member then
    raise exception '% must reference a user in the same household', column_name
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.validate_account_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.default_withdrawal_account_id is not null then
    if new.type <> 'card' then
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

create or replace function public.validate_category_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'parent_id cannot reference the same category'
        using errcode = '23514';
    end if;

    perform public.assert_category_belongs_to_household(
      new.parent_id,
      new.household_id,
      'categories.parent_id'
    );
  end if;

  return new;
end;
$$;

create or replace function public.validate_recurring_item_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'recurring_items.account_id'
  );

  perform public.assert_category_belongs_to_household(
    new.category_id,
    new.household_id,
    'recurring_items.category_id'
  );

  perform public.assert_user_belongs_to_household(
    new.payer_user_id,
    new.household_id,
    'recurring_items.payer_user_id'
  );

  return new;
end;
$$;

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

  return new;
end;
$$;

create or replace function public.validate_budget_household_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_account_belongs_to_household(
    new.account_id,
    new.household_id,
    'budgets.account_id'
  );

  perform public.assert_category_belongs_to_household(
    new.category_id,
    new.household_id,
    'budgets.category_id'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger create_owner_membership_after_household_insert
  after insert on public.households
  for each row execute function public.handle_new_household_owner();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_households_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create trigger set_household_members_updated_at
  before update on public.household_members
  for each row execute function public.set_updated_at();

create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger set_recurring_items_updated_at
  before update on public.recurring_items
  for each row execute function public.set_updated_at();

create trigger set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger set_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

create trigger set_import_jobs_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

create trigger prevent_household_members_household_id_change
  before update on public.household_members
  for each row execute function public.prevent_household_id_change();

create trigger prevent_accounts_household_id_change
  before update on public.accounts
  for each row execute function public.prevent_household_id_change();

create trigger prevent_categories_household_id_change
  before update on public.categories
  for each row execute function public.prevent_household_id_change();

create trigger prevent_recurring_items_household_id_change
  before update on public.recurring_items
  for each row execute function public.prevent_household_id_change();

create trigger prevent_transactions_household_id_change
  before update on public.transactions
  for each row execute function public.prevent_household_id_change();

create trigger prevent_budgets_household_id_change
  before update on public.budgets
  for each row execute function public.prevent_household_id_change();

create trigger prevent_ai_advice_logs_household_id_change
  before update on public.ai_advice_logs
  for each row execute function public.prevent_household_id_change();

create trigger prevent_import_jobs_household_id_change
  before update on public.import_jobs
  for each row execute function public.prevent_household_id_change();

create trigger validate_accounts_household_refs
  before insert or update on public.accounts
  for each row execute function public.validate_account_household_refs();

create trigger validate_categories_household_refs
  before insert or update on public.categories
  for each row execute function public.validate_category_household_refs();

create trigger validate_recurring_items_household_refs
  before insert or update on public.recurring_items
  for each row execute function public.validate_recurring_item_household_refs();

create trigger validate_transactions_household_refs
  before insert or update on public.transactions
  for each row execute function public.validate_transaction_household_refs();

create trigger validate_budgets_household_refs
  before insert or update on public.budgets
  for each row execute function public.validate_budget_household_refs();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_items enable row level security;
alter table public.ai_advice_logs enable row level security;
alter table public.import_jobs enable row level security;

alter table public.profiles force row level security;
alter table public.households force row level security;
alter table public.household_members force row level security;
alter table public.accounts force row level security;
alter table public.categories force row level security;
alter table public.transactions force row level security;
alter table public.budgets force row level security;
alter table public.recurring_items force row level security;
alter table public.ai_advice_logs force row level security;
alter table public.import_jobs force row level security;

create policy "Profiles are visible to household co-members"
  on public.profiles
  for select
  to authenticated
  using (public.shares_household_with(id));

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using (id = auth.uid());

create policy "Members can view households"
  on public.households
  for select
  to authenticated
  using (public.is_household_member(id));

create policy "Authenticated users can create households"
  on public.households
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Members can update households"
  on public.households
  for update
  to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "Members can delete households"
  on public.households
  for delete
  to authenticated
  using (public.is_household_member(id));

create policy "Members can view household members"
  on public.household_members
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can add household members"
  on public.household_members
  for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy "Members can update household members"
  on public.household_members
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete household members"
  on public.household_members
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view accounts"
  on public.accounts
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create accounts"
  on public.accounts
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update accounts"
  on public.accounts
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete accounts"
  on public.accounts
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view categories"
  on public.categories
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create categories"
  on public.categories
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update categories"
  on public.categories
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete categories"
  on public.categories
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view recurring items"
  on public.recurring_items
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create recurring items"
  on public.recurring_items
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update recurring items"
  on public.recurring_items
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete recurring items"
  on public.recurring_items
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view transactions"
  on public.transactions
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create transactions"
  on public.transactions
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (user_id is null or user_id = auth.uid())
  );

create policy "Members can update transactions"
  on public.transactions
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete transactions"
  on public.transactions
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view budgets"
  on public.budgets
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create budgets"
  on public.budgets
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (created_by is null or created_by = auth.uid())
  );

create policy "Members can update budgets"
  on public.budgets
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete budgets"
  on public.budgets
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view ai advice logs"
  on public.ai_advice_logs
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create ai advice logs"
  on public.ai_advice_logs
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (requested_by is null or requested_by = auth.uid())
  );

create policy "Members can update ai advice logs"
  on public.ai_advice_logs
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete ai advice logs"
  on public.ai_advice_logs
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can view import jobs"
  on public.import_jobs
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members can create import jobs"
  on public.import_jobs
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and (requested_by is null or requested_by = auth.uid())
  );

create policy "Members can update import jobs"
  on public.import_jobs
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members can delete import jobs"
  on public.import_jobs
  for delete
  to authenticated
  using (public.is_household_member(household_id));

grant usage on schema public to authenticated;

grant usage on type
  public.household_member_role,
  public.account_type,
  public.account_owner_type,
  public.category_type,
  public.transaction_type,
  public.transaction_source,
  public.recurring_item_kind,
  public.recurring_item_status,
  public.billing_cycle,
  public.budget_period,
  public.ai_advice_severity,
  public.import_job_source,
  public.import_job_status
to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.households,
  public.household_members,
  public.accounts,
  public.categories,
  public.transactions,
  public.budgets,
  public.recurring_items,
  public.ai_advice_logs,
  public.import_jobs
to authenticated;

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_household_owner() from public;
revoke all on function public.prevent_household_id_change() from public;
revoke all on function public.assert_account_belongs_to_household(uuid, uuid, text) from public;
revoke all on function public.assert_category_belongs_to_household(uuid, uuid, text) from public;
revoke all on function public.assert_recurring_item_belongs_to_household(uuid, uuid, text) from public;
revoke all on function public.assert_user_belongs_to_household(uuid, uuid, text) from public;
revoke all on function public.validate_account_household_refs() from public;
revoke all on function public.validate_category_household_refs() from public;
revoke all on function public.validate_recurring_item_household_refs() from public;
revoke all on function public.validate_transaction_household_refs() from public;
revoke all on function public.validate_budget_household_refs() from public;
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.shares_household_with(uuid) from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

commit;
