import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import {
  expenseTypeFilters,
  periodFilters,
  type AccountFilter,
  type DashboardAccountBalance,
  type AiAdviceLogRow,
  type DashboardBudgetRow,
  type DashboardDateRange,
  type DashboardFilters,
  type DashboardHousehold,
  type DashboardPageData,
  type DashboardTransactionRow,
  type ExpenseTypeFilter,
  type PeriodFilter,
  type PlannedRecurringOccurrence,
} from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";
import type { RecurringItemRow } from "@/app/recurring/types";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MembershipRow = {
  household_id: string;
  households:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type BalanceTransactionRow = {
  account_id: string;
  amount: number | string;
  transaction_date: string;
  transfer_account_id: string | null;
  type: "expense" | "income" | "transfer";
};

const TIME_ZONE = "Asia/Seoul";
const MAX_PLANNED_OCCURRENCES_PER_ITEM = 60;

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateOnly(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function todayInTimeZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function addMonths(value: string, months: number, preferredDay?: number | null) {
  const date = parseDateOnly(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = preferredDay ?? date.getUTCDate();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + 1, 0),
  ).getUTCDate();

  return formatDateOnly(
    new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth))),
  );
}

function monthStart(value: string) {
  const date = parseDateOnly(value);
  return formatDateOnly(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
  );
}

function monthEnd(value: string) {
  const date = parseDateOnly(value);
  return formatDateOnly(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  );
}

function monthLabel(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  if (startYear === endYear) {
    return `${startYear}.${startMonth}.${startDay} - ${endMonth}.${endDay}`;
  }

  return `${startYear}.${startMonth}.${startDay} - ${endYear}.${endMonth}.${endDay}`;
}

function maxDate(...dates: string[]) {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function minDate(...dates: string[]) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

function normalizeHousehold(row: MembershipRow | null): DashboardHousehold | null {
  if (!row) {
    return null;
  }

  const household = Array.isArray(row.households)
    ? row.households[0]
    : row.households;

  return {
    id: household?.id ?? row.household_id,
    name: household?.name ?? "공동 가계부",
  };
}

function normalizePeriod(value: string | undefined): PeriodFilter {
  return periodFilters.includes(value as PeriodFilter)
    ? (value as PeriodFilter)
    : "this_month";
}

function normalizeExpenseType(value: string | undefined): ExpenseTypeFilter {
  return expenseTypeFilters.includes(value as ExpenseTypeFilter)
    ? (value as ExpenseTypeFilter)
    : "all";
}

function normalizeAccountFilter(value: string | undefined): AccountFilter {
  if (!value) {
    return "all";
  }

  if (
    value === "all" ||
    value === "owner:shared" ||
    value === "owner:husband" ||
    value === "owner:wife" ||
    value === "type:bank" ||
    value === "type:card" ||
    value === "type:cash" ||
    value === "type:savings" ||
    value === "type:virtual" ||
    value.startsWith("account:")
  ) {
    return value as AccountFilter;
  }

  return "all";
}

function dateRangeForFilters(
  period: PeriodFilter,
  today: string,
  start?: string,
  end?: string,
): DashboardDateRange {
  if (period === "custom" && isDateOnly(start) && isDateOnly(end)) {
    const normalizedStart = start! <= end! ? start! : end!;
    const normalizedEnd = start! <= end! ? end! : start!;

    return {
      end: normalizedEnd,
      label: monthLabel(normalizedStart, normalizedEnd),
      period,
      start: normalizedStart,
    };
  }

  if (period === "last_month") {
    const previousMonthStart = addMonths(monthStart(today), -1);
    const previousMonthEnd = monthEnd(previousMonthStart);

    return {
      end: previousMonthEnd,
      label: "지난 달",
      period,
      start: previousMonthStart,
    };
  }

  if (period === "last_3_months") {
    const startOfThreeMonthRange = addMonths(monthStart(today), -2);

    return {
      end: monthEnd(today),
      label: "최근 3개월",
      period,
      start: startOfThreeMonthRange,
    };
  }

  return {
    end: monthEnd(today),
    label: "이번 달",
    period: "this_month",
    start: monthStart(today),
  };
}

function nextRecurringDate(item: RecurringItemRow, dueDate: string) {
  const interval = item.billing_interval || 1;

  if (item.billing_cycle === "weekly") {
    return addDays(dueDate, interval * 7);
  }

  if (item.billing_cycle === "monthly") {
    return addMonths(dueDate, interval, item.billing_day);
  }

  if (item.billing_cycle === "yearly") {
    return addMonths(dueDate, interval * 12, item.billing_day);
  }

  if (item.custom_interval_days) {
    return addDays(dueDate, item.custom_interval_days);
  }

  return null;
}

function plannedOccurrencesForRange(
  recurringItems: RecurringItemRow[],
  start: string,
  end: string,
): PlannedRecurringOccurrence[] {
  const occurrences: PlannedRecurringOccurrence[] = [];

  recurringItems
    .filter((item) => item.status === "active")
    .forEach((item) => {
      let dueDate = item.next_due_date;
      let count = 0;

      while (dueDate < start && count < MAX_PLANNED_OCCURRENCES_PER_ITEM) {
        const nextDate = nextRecurringDate(item, dueDate);

        if (!nextDate) {
          break;
        }

        dueDate = nextDate;
        count += 1;
      }

      while (dueDate <= end && count < MAX_PLANNED_OCCURRENCES_PER_ITEM) {
        if (dueDate >= start) {
          occurrences.push({
            id: `${item.id}-${dueDate}`,
            recurring_item_id: item.id,
            account_id: item.account_id,
            amount: Number(item.amount),
            billing_cycle: item.billing_cycle,
            category_id: item.category_id,
            currency_code: item.currency_code,
            due_date: dueDate,
            kind: item.kind,
            merchant: item.merchant,
            name: item.name,
            status: item.status,
          });
        }

        const nextDate = nextRecurringDate(item, dueDate);

        if (!nextDate) {
          break;
        }

        dueDate = nextDate;
        count += 1;
      }
    });

  return occurrences.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function buildAccountBalances(
  accounts: AccountRow[],
  balanceTransactions: BalanceTransactionRow[],
  today: string,
): DashboardAccountBalance[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const balances = new Map<string, number>(
    accounts.map((account) => [
      account.id,
      account.opening_balance_as_of <= today
        ? Number(account.opening_balance) || 0
        : 0,
    ]),
  );

  function appliesToAccount(accountId: string, transactionDate: string) {
    const account = accountsById.get(accountId);
    return Boolean(account && transactionDate >= account.opening_balance_as_of);
  }

  balanceTransactions.forEach((transaction) => {
    const amount = Number(transaction.amount);

    if (!Number.isFinite(amount)) {
      return;
    }

    if (transaction.type === "income") {
      if (!appliesToAccount(transaction.account_id, transaction.transaction_date)) {
        return;
      }

      balances.set(
        transaction.account_id,
        (balances.get(transaction.account_id) ?? 0) + amount,
      );
      return;
    }

    if (transaction.type === "expense") {
      if (!appliesToAccount(transaction.account_id, transaction.transaction_date)) {
        return;
      }

      balances.set(
        transaction.account_id,
        (balances.get(transaction.account_id) ?? 0) - amount,
      );
      return;
    }

    if (appliesToAccount(transaction.account_id, transaction.transaction_date)) {
      balances.set(
        transaction.account_id,
        (balances.get(transaction.account_id) ?? 0) - amount,
      );
    }

    if (
      transaction.transfer_account_id &&
      appliesToAccount(
        transaction.transfer_account_id,
        transaction.transaction_date,
      )
    ) {
      balances.set(
        transaction.transfer_account_id,
        (balances.get(transaction.transfer_account_id) ?? 0) + amount,
      );
    }
  });

  return Array.from(balances.entries()).map(([accountId, balance]) => ({
    account_id: accountId,
    balance,
  }));
}

async function getDashboardData(
  filters: DashboardFilters,
  dateRange: DashboardDateRange,
  today: string,
): Promise<DashboardPageData> {
  if (!hasSupabaseEnv()) {
    return {
      accounts: [],
      accountBalances: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      dateRange,
      filters,
      household: null,
      isConfigured: false,
      isSignedIn: false,
      plannedOccurrences: [],
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      accounts: [],
      accountBalances: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      dateRange,
      filters,
      household: null,
      isConfigured: true,
      isSignedIn: false,
      plannedOccurrences: [],
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      accounts: [],
      accountBalances: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      dateRange,
      errorMessage: membershipError.message,
      filters,
      household: null,
      isConfigured: true,
      isSignedIn: true,
      plannedOccurrences: [],
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const household = normalizeHousehold(membership as MembershipRow | null);

  if (!household) {
    return {
      accounts: [],
      accountBalances: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      dateRange,
      filters,
      household: null,
      isConfigured: true,
      isSignedIn: true,
      plannedOccurrences: [],
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const plannedRangeEnd = maxDate(dateRange.end, monthEnd(today), addDays(today, 7));
  const plannedRangeStart = minDate(dateRange.start, today);

  const [
    accountsResult,
    categoriesResult,
    transactionsResult,
    budgetsResult,
    recurringResult,
    adviceResult,
    balanceTransactionsResult,
    existingRecurringTransactionsResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, display_order, is_active, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select(
        "id, household_id, name, type, icon, color, display_order, is_active",
      )
      .eq("household_id", household.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id, household_id, account_id, transfer_account_id, category_id, recurring_item_id, type, source, amount, currency_code, transaction_date, occurred_at, merchant, memo, review_status, review_reason, created_at",
      )
      .eq("household_id", household.id)
      .gte("transaction_date", dateRange.start)
      .lte("transaction_date", dateRange.end)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("budgets")
      .select(
        "id, household_id, account_id, category_id, amount, currency_code, period_start, period_end, is_active",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .lte("period_start", dateRange.end)
      .or(`period_end.is.null,period_end.gte.${dateRange.start}`),
    supabase
      .from("recurring_items")
      .select(
        "id, household_id, account_id, category_id, payer_user_id, kind, name, merchant, amount, currency_code, billing_cycle, billing_interval, custom_interval_days, billing_day, day_of_week, next_due_date, status, auto_create_transaction, reminder_days_before, memo, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .order("status", { ascending: true })
      .order("next_due_date", { ascending: true }),
    supabase
      .from("ai_advice_logs")
      .select("id, severity, title, body, created_at")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("transactions")
      .select("account_id, transfer_account_id, type, amount, transaction_date")
      .eq("household_id", household.id)
      .lte("transaction_date", today),
    supabase
      .from("transactions")
      .select("recurring_item_id, transaction_date")
      .eq("household_id", household.id)
      .not("recurring_item_id", "is", null)
      .gte("transaction_date", plannedRangeStart)
      .lte("transaction_date", plannedRangeEnd),
  ]);

  const recurringItems =
    (recurringResult.data ?? []) as unknown as RecurringItemRow[];
  const accounts = (accountsResult.data ?? []) as unknown as AccountRow[];
  const transactions =
    (transactionsResult.data ?? []) as unknown as DashboardTransactionRow[];
  const existingRecurringTransactionKeys = new Set(
    (existingRecurringTransactionsResult.data ?? [])
      .filter((transaction) => transaction.recurring_item_id)
      .map(
        (transaction) =>
          `${transaction.recurring_item_id}:${transaction.transaction_date}`,
      ),
  );
  const plannedOccurrences = plannedOccurrencesForRange(
    recurringItems,
    plannedRangeStart,
    plannedRangeEnd,
  ).filter(
    (occurrence) =>
      !existingRecurringTransactionKeys.has(
        `${occurrence.recurring_item_id}:${occurrence.due_date}`,
      ),
  );

  return {
    accounts,
    accountBalances: buildAccountBalances(
      accounts,
      (balanceTransactionsResult.data ?? []) as unknown as BalanceTransactionRow[],
      today,
    ),
    adviceLogs: (adviceResult.data ?? []) as unknown as AiAdviceLogRow[],
    budgets: (budgetsResult.data ?? []) as unknown as DashboardBudgetRow[],
    categories: (categoriesResult.data ?? []) as unknown as CategoryRow[],
    dateRange,
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      transactionsResult.error?.message ??
      budgetsResult.error?.message ??
      recurringResult.error?.message ??
      adviceResult.error?.message ??
      balanceTransactionsResult.error?.message ??
      existingRecurringTransactionsResult.error?.message,
    filters,
    household,
    isConfigured: true,
    isSignedIn: true,
    plannedOccurrences,
    recurringItems,
    today,
    transactions,
  };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const today = todayInTimeZone();
  const period = normalizePeriod(firstParam(params.period));
  const filters: DashboardFilters = {
    account: normalizeAccountFilter(firstParam(params.account)),
    end: firstParam(params.end),
    expenseType: normalizeExpenseType(firstParam(params.expenseType)),
    period,
    start: firstParam(params.start),
  };
  const dateRange = dateRangeForFilters(
    period,
    today,
    filters.start,
    filters.end,
  );
  const data = await getDashboardData(filters, dateRange, today);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="대시보드"
        title="월간 대시보드"
        description="지출, 계좌 흐름, 곧 나갈 돈을 한곳에서 봐요."
      />

      <DashboardClient {...data} />
    </div>
  );
}
