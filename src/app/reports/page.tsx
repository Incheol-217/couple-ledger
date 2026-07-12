import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";
import {
  reportPeriods,
  type ReportBudgetRow,
  type ReportMember,
  type ReportPageData,
  type ReportPeriod,
  type ReportRange,
  type ReportRecurringOccurrence,
  type ReportTransactionRow,
} from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";
import type { RecurringItemRow } from "@/app/recurring/types";

type ReportsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MemberRow = {
  user_id: string;
  member_label: "husband" | "wife" | null;
  role: "owner" | "member";
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

const TIME_ZONE = "Asia/Seoul";
const MAX_PLANNED_OCCURRENCES_PER_ITEM = 60;

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

function rangeLabel(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  if (startYear === endYear) {
    return `${startYear}.${startMonth}.${startDay} - ${endMonth}.${endDay}`;
  }

  return `${startYear}.${startMonth}.${startDay} - ${endYear}.${endMonth}.${endDay}`;
}

function normalizePeriod(value: string | undefined): ReportPeriod {
  return reportPeriods.includes(value as ReportPeriod)
    ? (value as ReportPeriod)
    : "this_month";
}

function dateRangeForPeriod(
  period: ReportPeriod,
  today: string,
  start?: string,
  end?: string,
): ReportRange {
  if (period === "custom" && isDateOnly(start) && isDateOnly(end)) {
    const normalizedStart = start! <= end! ? start! : end!;
    const normalizedEnd = start! <= end! ? end! : start!;

    return {
      end: normalizedEnd,
      label: rangeLabel(normalizedStart, normalizedEnd),
      period,
      start: normalizedStart,
    };
  }

  if (period === "last_month") {
    const previousMonthStart = addMonths(monthStart(today), -1);

    return {
      end: monthEnd(previousMonthStart),
      label: "지난 달",
      period,
      start: previousMonthStart,
    };
  }

  if (period === "last_3_months") {
    return {
      end: monthEnd(today),
      label: "최근 3개월",
      period,
      start: addMonths(monthStart(today), -2),
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
): ReportRecurringOccurrence[] {
  const occurrences: ReportRecurringOccurrence[] = [];

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
            category_id: item.category_id,
            currency_code: item.currency_code,
            due_date: dueDate,
            kind: item.kind,
            merchant: item.merchant,
            name: item.name,
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

async function getReportData(
  range: ReportRange,
  today: string,
): Promise<ReportPageData> {
  if (!hasSupabaseAuthEnv()) {
    return {
      accounts: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      household: null,
      isConfigured: false,
      isSignedIn: false,
      members: [],
      plannedOccurrences: [],
      range,
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  // 레이아웃에서 이미 계산한 사용자/가계부 컨텍스트를 재사용해요.
  const context = await getCurrentUserContext();

  if (!context.isSignedIn) {
    return {
      accounts: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      household: null,
      isConfigured: true,
      isSignedIn: false,
      members: [],
      plannedOccurrences: [],
      range,
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const supabase = await createClient();
  const household = context.householdId
    ? { id: context.householdId, name: context.householdName ?? "공동 가계부" }
    : null;

  if (!household) {
    return {
      accounts: [],
      adviceLogs: [],
      budgets: [],
      categories: [],
      household: null,
      isConfigured: true,
      isSignedIn: true,
      members: [],
      plannedOccurrences: [],
      range,
      recurringItems: [],
      today,
      transactions: [],
    };
  }

  const [
    accountsResult,
    categoriesResult,
    transactionsResult,
    budgetsResult,
    recurringResult,
    adviceResult,
    membersResult,
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
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id, household_id, account_id, transfer_account_id, category_id, recurring_item_id, type, source, amount, currency_code, transaction_date, occurred_at, merchant, memo, user_id, created_at",
      )
      .eq("household_id", household.id)
      .gte("transaction_date", range.start)
      .lte("transaction_date", range.end)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("budgets")
      .select(
        "id, household_id, account_id, category_id, amount, currency_code, period_start, period_end, is_active",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .lte("period_start", range.end)
      .or(`period_end.is.null,period_end.gte.${range.start}`),
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
      .limit(1),
    supabase
      .from("household_members")
      .select("user_id, member_label, role")
      .eq("household_id", household.id),
  ]);

  const memberRows = (membersResult.data ?? []) as unknown as MemberRow[];
  const profileIds = memberRows.map((member) => member.user_id);
  const profilesResult =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds)
      : { data: [] as ProfileRow[], error: null };
  const profilesById = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const members: ReportMember[] = memberRows.map((member) => ({
    display_name: profilesById.get(member.user_id)?.display_name ?? null,
    member_label: member.member_label,
    role: member.role,
    user_id: member.user_id,
  }));
  const recurringItems =
    (recurringResult.data ?? []) as unknown as RecurringItemRow[];
  const transactions =
    (transactionsResult.data ?? []) as unknown as ReportTransactionRow[];
  const existingRecurringTransactionKeys = new Set(
    transactions
      .filter((transaction) => transaction.recurring_item_id)
      .map(
        (transaction) =>
          `${transaction.recurring_item_id}:${transaction.transaction_date}`,
      ),
  );
  const plannedOccurrences = plannedOccurrencesForRange(
    recurringItems,
    range.start,
    range.end,
  ).filter(
    (occurrence) =>
      !existingRecurringTransactionKeys.has(
        `${occurrence.recurring_item_id}:${occurrence.due_date}`,
      ),
  );

  return {
    accounts: (accountsResult.data ?? []) as unknown as AccountRow[],
    adviceLogs: (adviceResult.data ?? []) as ReportPageData["adviceLogs"],
    budgets: (budgetsResult.data ?? []) as unknown as ReportBudgetRow[],
    categories: (categoriesResult.data ?? []) as unknown as CategoryRow[],
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      transactionsResult.error?.message ??
      budgetsResult.error?.message ??
      recurringResult.error?.message ??
      adviceResult.error?.message ??
      membersResult.error?.message ??
      profilesResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    members,
    plannedOccurrences,
    range,
    recurringItems,
    today,
    transactions,
  };
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = (await searchParams) ?? {};
  const today = todayInTimeZone();
  const period = normalizePeriod(firstParam(params.period));
  const range = dateRangeForPeriod(
    period,
    today,
    firstParam(params.start),
    firstParam(params.end),
  );
  const data = await getReportData(range, today);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="보고서"
        title="보고서"
        description="수입과 지출 흐름을 PDF로 저장해요."
      />

      <ReportsClient {...data} />
    </div>
  );
}
