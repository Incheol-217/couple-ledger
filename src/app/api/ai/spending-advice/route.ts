import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  accountTypeLabels,
  ownerTypeLabels,
  type AccountType,
  type OwnerType,
} from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";
import type { BillingCycle, RecurringKind } from "@/app/recurring/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_ZONE = "Asia/Seoul";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_PLANNED_OCCURRENCES_PER_ITEM = 60;

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

type Household = {
  id: string;
  name: string;
};

type TransactionRow = {
  id: string;
  account_id: string;
  category_id: string | null;
  recurring_item_id: string | null;
  type: "expense" | "income" | "transfer";
  amount: number | string;
  transaction_date: string;
};

type BudgetRow = {
  id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number | string;
  period_start: string;
  period_end: string | null;
};

type AdviceAccountRow = {
  id: string;
  name: string;
  type: AccountType;
  owner_type: OwnerType;
};

type AdviceRecurringItemRow = {
  id: string;
  account_id: string;
  kind: RecurringKind;
  amount: number | string;
  billing_cycle: BillingCycle;
  billing_interval: number;
  custom_interval_days: number | null;
  billing_day: number | null;
  next_due_date: string;
  status: "active" | "paused" | "canceled";
};

type PlannedOccurrence = {
  recurringItemId: string;
  accountId: string;
  amount: number;
  dueDate: string;
  kind: "subscription" | "fixed_expense";
};

type SpendingAdviceSnapshot = {
  currency: "KRW";
  period: {
    start: string;
    end: string;
    today: string;
    recent7DaysStart: string;
  };
  monthlyTotalExpense: number;
  monthlyBudget: number;
  budgetUsageRate: number | null;
  categoryExpenseSummary: Array<{
    category: string;
    amount: number;
    shareOfExpense: number;
  }>;
  accountExpenseSummary: Array<{
    accountLabel: string;
    accountType: string;
    ownerType: string;
    amount: number;
  }>;
  monthlyFixedExpenseTotal: number;
  monthlySubscriptionTotal: number;
  remainingScheduledExpenseThisMonth: number;
  recent7DaySpendingPace: {
    total: number;
    dailyAverage: number;
    projectedMonthlyExpense: number;
  };
};

type OpenAIAdvice = {
  title: string;
  severity: "info" | "warning" | "critical";
  bullets: string[];
};

type OpenAIResponsesResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      output_text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
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

function minDate(...dates: string[]) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function diffDays(from: string, to: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / msPerDay,
  );
}

function normalizeHousehold(row: MembershipRow | null): Household | null {
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

function sanitizeLabel(value: string) {
  return value.replace(/\d{2,}/g, "*").slice(0, 40);
}

function monthlyEquivalent(item: AdviceRecurringItemRow) {
  const amount = toAmount(item.amount);
  const interval = item.billing_interval || 1;

  if (item.billing_cycle === "weekly") {
    return (amount * 52) / 12 / interval;
  }

  if (item.billing_cycle === "yearly") {
    return amount / 12 / interval;
  }

  if (item.billing_cycle === "monthly") {
    return amount / interval;
  }

  if (item.custom_interval_days) {
    return (amount * 30.4375) / item.custom_interval_days;
  }

  return 0;
}

function nextRecurringDate(item: AdviceRecurringItemRow, dueDate: string) {
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
  recurringItems: AdviceRecurringItemRow[],
  start: string,
  end: string,
) {
  const occurrences: PlannedOccurrence[] = [];

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
            accountId: item.account_id,
            amount: toAmount(item.amount),
            dueDate,
            kind: item.kind,
            recurringItemId: item.id,
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

  return occurrences;
}

function buildSummarySnapshot({
  accounts,
  budgets,
  categories,
  monthEndDate,
  monthStartDate,
  recent7DaysStart,
  recurringItems,
  today,
  transactions,
}: {
  accounts: AdviceAccountRow[];
  budgets: BudgetRow[];
  categories: CategoryRow[];
  monthEndDate: string;
  monthStartDate: string;
  recent7DaysStart: string;
  recurringItems: AdviceRecurringItemRow[];
  today: string;
  transactions: TransactionRow[];
}): SpendingAdviceSnapshot {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const monthTransactions = transactions.filter(
    (transaction) =>
      transaction.transaction_date >= monthStartDate &&
      transaction.transaction_date <= today,
  );
  const monthExpenseTransactions = monthTransactions.filter(
    (transaction) => transaction.type === "expense",
  );
  const recent7DayExpenseTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.transaction_date >= recent7DaysStart &&
      transaction.transaction_date <= today,
  );
  const monthlyTotalExpense = monthExpenseTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const monthlyBudget = budgets.reduce(
    (sum, budget) => sum + toAmount(budget.amount),
    0,
  );
  const categoryTotals = new Map<string, number>();
  const accountTotals = new Map<string, number>();

  monthExpenseTransactions.forEach((transaction) => {
    const categoryName = transaction.category_id
      ? categoriesById.get(transaction.category_id)?.name
      : null;
    const account = accountsById.get(transaction.account_id);

    categoryTotals.set(
      categoryName ?? "미분류",
      (categoryTotals.get(categoryName ?? "미분류") ?? 0) +
        toAmount(transaction.amount),
    );

    if (account) {
      accountTotals.set(
        account.id,
        (accountTotals.get(account.id) ?? 0) + toAmount(transaction.amount),
      );
    }
  });

  const existingRecurringTransactionKeys = new Set(
    monthExpenseTransactions
      .filter((transaction) => transaction.recurring_item_id)
      .map(
        (transaction) =>
          `${transaction.recurring_item_id}:${transaction.transaction_date}`,
      ),
  );
  const remainingOccurrences = plannedOccurrencesForRange(
    recurringItems,
    today,
    monthEndDate,
  ).filter(
    (occurrence) =>
      !existingRecurringTransactionKeys.has(
        `${occurrence.recurringItemId}:${occurrence.dueDate}`,
      ),
  );
  const activeRecurringItems = recurringItems.filter(
    (item) => item.status === "active",
  );
  const recent7DayTotal = recent7DayExpenseTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const elapsedDaysThisMonth = Math.max(1, diffDays(monthStartDate, today) + 1);

  return {
    accountExpenseSummary: Array.from(accountTotals.entries())
      .map(([accountId, amount]) => {
        const account = accountsById.get(accountId);

        return {
          accountLabel: sanitizeLabel(account?.name ?? "알 수 없는 계좌"),
          accountType: account ? accountTypeLabels[account.type] : "알 수 없음",
          amount: Math.round(amount),
          ownerType: account ? ownerTypeLabels[account.owner_type] : "알 수 없음",
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
    budgetUsageRate:
      monthlyBudget > 0 ? Number((monthlyTotalExpense / monthlyBudget).toFixed(4)) : null,
    categoryExpenseSummary: Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        amount: Math.round(amount),
        category,
        shareOfExpense:
          monthlyTotalExpense > 0
            ? Number((amount / monthlyTotalExpense).toFixed(4))
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10),
    currency: "KRW",
    monthlyBudget: Math.round(monthlyBudget),
    monthlyFixedExpenseTotal: Math.round(
      activeRecurringItems
        .filter((item) => item.kind === "fixed_expense")
        .reduce((sum, item) => sum + monthlyEquivalent(item), 0),
    ),
    monthlySubscriptionTotal: Math.round(
      activeRecurringItems
        .filter((item) => item.kind === "subscription")
        .reduce((sum, item) => sum + monthlyEquivalent(item), 0),
    ),
    monthlyTotalExpense: Math.round(monthlyTotalExpense),
    period: {
      end: monthEndDate,
      recent7DaysStart,
      start: monthStartDate,
      today,
    },
    recent7DaySpendingPace: {
      dailyAverage: Math.round(recent7DayTotal / 7),
      projectedMonthlyExpense: Math.round(
        (monthlyTotalExpense / elapsedDaysThisMonth) *
          (diffDays(monthStartDate, monthEndDate) + 1),
      ),
      total: Math.round(recent7DayTotal),
    },
    remainingScheduledExpenseThisMonth: Math.round(
      remainingOccurrences.reduce(
        (sum, occurrence) => sum + occurrence.amount,
        0,
      ),
    ),
  };
}

async function readJsonBody(request: NextRequest) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as { household_id?: unknown };
}

async function getHouseholdForRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  householdId?: string,
) {
  let query = supabase
    .from("household_members")
    .select("household_id, households(id, name)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1);

  if (householdId) {
    query = query.eq("household_id", householdId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeHousehold(data as MembershipRow | null);
}

function systemPrompt() {
  return [
    "당신은 부부가 함께 보는 공동 가계부의 소비 코치입니다.",
    "입력에는 원본 거래가 아니라 집계 데이터만 들어 있습니다.",
    "한국어 해요체로, 차분하고 비난하지 않는 말투로 말해요.",
    "최대 3개의 bullet만 작성하고, 각 bullet은 바로 실행할 수 있는 조언이어야 해요.",
    "투자, 대출, 세금, 법률 조언은 하지 않습니다.",
    "상점명, 계좌번호, 카드번호, 원본 거래를 추정하거나 언급하지 않습니다.",
    "정해진 JSON 형식으로만 응답해요.",
  ].join("\n");
}

async function callOpenAI(snapshot: SpendingAdviceSnapshot) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY 환경변수를 넣어주세요.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content: [{ text: systemPrompt(), type: "input_text" }],
          role: "system",
        },
        {
          content: [
            {
              text: JSON.stringify(
                {
                  instruction:
                    "다음 집계 데이터를 보고 부부가 함께 실행할 수 있는 소비 조언을 작성해 주세요.",
                  snapshot,
                },
                null,
                2,
              ),
              type: "input_text",
            },
          ],
          role: "user",
        },
      ],
      max_output_tokens: 700,
      model: OPENAI_MODEL,
      text: {
        format: {
          name: "spending_advice",
          schema: {
            additionalProperties: false,
            properties: {
              bullets: {
                items: {
                  maxLength: 180,
                  type: "string",
                },
                maxItems: 3,
                minItems: 1,
                type: "array",
              },
              severity: {
                enum: ["info", "warning", "critical"],
                type: "string",
              },
              title: {
                maxLength: 40,
                type: "string",
              },
            },
            required: ["title", "severity", "bullets"],
            type: "object",
          },
          strict: true,
          type: "json_schema",
        },
      },
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = (await response.json()) as OpenAIResponsesResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? "OpenAI API를 호출하지 못했어요.");
  }

  return {
    advice: parseAdvice(extractOutputText(data)),
    responseId: data.id,
  };
}

function extractOutputText(data: OpenAIResponsesResponse) {
  if (data.output_text) {
    return data.output_text;
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? content.output_text ?? "")
      .join("") ?? ""
  );
}

function normalizeSeverity(
  severity: unknown,
): OpenAIAdvice["severity"] {
  return severity === "warning" || severity === "critical" || severity === "info"
    ? severity
    : "info";
}

function parseAdvice(text: string): OpenAIAdvice {
  const parsed = JSON.parse(text) as Partial<OpenAIAdvice>;
  const severity = normalizeSeverity(parsed.severity);
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets
        .filter((bullet) => typeof bullet === "string")
        .map((bullet) => bullet.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (!parsed.title || bullets.length === 0) {
    throw new Error("AI 응답 형식을 읽지 못했어요.");
  }

  return {
    bullets,
    severity,
    title: parsed.title.slice(0, 40),
  };
}

function adviceBody(bullets: string[]) {
  return bullets.map((bullet) => `- ${bullet}`).join("\n");
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, message: "Supabase 환경변수를 넣어주세요." },
      { status: 500 },
    );
  }

  let requestedHouseholdId: string | undefined;

  try {
    const body = await readJsonBody(request);
    requestedHouseholdId =
      typeof body.household_id === "string" ? body.household_id : undefined;
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 본문을 JSON 형식으로 보내주세요." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "로그인해 주세요." },
        { status: 401 },
      );
    }

    const household = await getHouseholdForRequest(
      supabase,
      user.id,
      requestedHouseholdId,
    );

    if (!household) {
      return NextResponse.json(
        { ok: false, message: "공동 가계부를 찾을 수 없어요." },
        { status: 404 },
      );
    }

    const today = todayInTimeZone();
    const monthStartDate = monthStart(today);
    const monthEndDate = monthEnd(today);
    const recent7DaysStart = addDays(today, -6);
    const transactionStartDate = minDate(monthStartDate, recent7DaysStart);

    const [
      accountsResult,
      categoriesResult,
      transactionsResult,
      budgetsResult,
      recurringResult,
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, owner_type")
        .eq("household_id", household.id)
        .eq("is_active", true),
      supabase
        .from("categories")
        .select(
          "id, household_id, name, type, icon, color, display_order, is_active",
        )
        .eq("household_id", household.id)
        .eq("type", "expense")
        .eq("is_active", true),
      supabase
        .from("transactions")
        .select(
          "id, account_id, category_id, recurring_item_id, type, amount, transaction_date",
        )
        .eq("household_id", household.id)
        .gte("transaction_date", transactionStartDate)
        .lte("transaction_date", today),
      supabase
        .from("budgets")
        .select(
          "id, account_id, category_id, amount, period_start, period_end",
        )
        .eq("household_id", household.id)
        .eq("is_active", true)
        .lte("period_start", monthEndDate)
        .or(`period_end.is.null,period_end.gte.${monthStartDate}`),
      supabase
        .from("recurring_items")
        .select(
          "id, account_id, kind, amount, billing_cycle, billing_interval, custom_interval_days, billing_day, next_due_date, status",
        )
        .eq("household_id", household.id)
        .eq("status", "active"),
    ]);

    const queryError =
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      transactionsResult.error?.message ??
      budgetsResult.error?.message ??
      recurringResult.error?.message;

    if (queryError) {
      throw new Error(queryError);
    }

    const snapshot = buildSummarySnapshot({
      accounts: (accountsResult.data ?? []) as unknown as AdviceAccountRow[],
      budgets: (budgetsResult.data ?? []) as unknown as BudgetRow[],
      categories: (categoriesResult.data ?? []) as unknown as CategoryRow[],
      monthEndDate,
      monthStartDate,
      recent7DaysStart,
      recurringItems:
        (recurringResult.data ?? []) as unknown as AdviceRecurringItemRow[],
      today,
      transactions:
        (transactionsResult.data ?? []) as unknown as TransactionRow[],
    });
    const { advice, responseId } = await callOpenAI(snapshot);
    const body = adviceBody(advice.bullets);

    const { data: log, error: logError } = await supabase
      .from("ai_advice_logs")
      .insert({
        household_id: household.id,
        requested_by: user.id,
        severity: advice.severity,
        title: advice.title,
        body,
        model: OPENAI_MODEL,
        period_start: monthStartDate,
        period_end: monthEndDate,
        input_snapshot: snapshot,
        output_snapshot: advice,
        metadata: {
          openai_response_id: responseId,
          route: "/api/ai/spending-advice",
        },
      })
      .select("id, created_at")
      .single();

    if (logError) {
      throw new Error(logError.message);
    }

    revalidatePath("/dashboard");

    return NextResponse.json({
      advice: {
        ...advice,
        body,
      },
      log,
      ok: true,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "AI 소비 조언을 만들지 못했어요.",
      },
      { status: 500 },
    );
  }
}
