"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  accountTypeLabels,
  ownerTypeLabels,
  type AccountRow,
} from "@/app/accounts/types";
import { recurringKindLabels } from "@/app/recurring/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FilterSheet } from "@/components/filter-sheet";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  AccountFilter,
  AiAdviceLogRow,
  DashboardPageData,
  DashboardTransactionRow,
  ExpenseTypeFilter,
  PlannedRecurringOccurrence,
} from "./types";

type DashboardClientProps = DashboardPageData;

type ChartRow = {
  name: string;
  amount: number;
};

type AccountSummaryView = {
  account: AccountRow;
  expense: number;
  fixedPlanned: number;
  recentTransactions: DashboardTransactionRow[];
  subscriptionPlanned: number;
};

type AdvicePreview = Pick<AiAdviceLogRow, "body" | "severity" | "title">;

const periodLabels = {
  this_month: "이번 달",
  last_month: "지난 달",
  last_3_months: "최근 3개월",
  custom: "직접 선택",
};

const expenseTypeLabels: Record<ExpenseTypeFilter, string> = {
  all: "전체",
  variable: "변동비",
  fixed_expense: "고정비",
  subscription: "구독비",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  currency: "KRW",
  maximumFractionDigits: 0,
  style: "currency",
});

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
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

function monthEnd(value: string) {
  const date = parseDateOnly(value);
  return formatDateOnly(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  );
}

function diffDays(from: string, to: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / msPerDay,
  );
}

function dueLabel(today: string, dueDate: string) {
  const distance = diffDays(today, dueDate);

  if (distance < 0) {
    return `${Math.abs(distance)}일 지남`;
  }

  if (distance === 0) {
    return "오늘";
  }

  if (distance === 1) {
    return "내일";
  }

  return `${distance}일 후`;
}

function transactionSortValue(transaction: DashboardTransactionRow) {
  return transaction.occurred_at ?? `${transaction.transaction_date}T00:00:00`;
}

function transactionTitle(transaction: DashboardTransactionRow) {
  return (
    transaction.merchant ??
    transaction.memo ??
    (transaction.type === "income" ? "수입" : "거래")
  );
}

function makeAccountFilterOptions(accounts: AccountRow[]) {
  return [
    { label: "전체", value: "all" },
    { label: "공동 계좌", value: "owner:shared" },
    { label: "남편 계좌", value: "owner:husband" },
    { label: "아내 계좌", value: "owner:wife" },
    { label: "카드", value: "type:card" },
    { label: "현금", value: "type:cash" },
    ...accounts.map((account) => ({
      label: account.name,
      value: `account:${account.id}`,
    })),
  ];
}

function accountMatchesFilter(account: AccountRow, filter: AccountFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter.startsWith("owner:")) {
    return account.owner_type === filter.replace("owner:", "");
  }

  if (filter.startsWith("type:")) {
    return account.type === filter.replace("type:", "");
  }

  return filter === `account:${account.id}`;
}

function selectedAccounts(accounts: AccountRow[], filter: AccountFilter) {
  return accounts.filter((account) => accountMatchesFilter(account, filter));
}

function accountName(accountsById: Map<string, AccountRow>, accountId: string) {
  return accountsById.get(accountId)?.name ?? "알 수 없는 계좌";
}

function recurringKindForTransaction(
  transaction: DashboardTransactionRow,
  recurringKindById: Map<string, PlannedRecurringOccurrence["kind"]>,
) {
  if (!transaction.recurring_item_id) {
    return "variable";
  }

  return recurringKindById.get(transaction.recurring_item_id) ?? "variable";
}

function matchesExpenseType(
  kind: "variable" | PlannedRecurringOccurrence["kind"],
  filter: ExpenseTypeFilter,
) {
  return filter === "all" || kind === filter;
}

function transactionMatchesExpenseType(
  transaction: DashboardTransactionRow,
  filter: ExpenseTypeFilter,
  recurringKindById: Map<string, PlannedRecurringOccurrence["kind"]>,
) {
  if (transaction.type !== "expense") {
    return true;
  }

  return matchesExpenseType(
    recurringKindForTransaction(transaction, recurringKindById),
    filter,
  );
}

function plannedMatchesExpenseType(
  occurrence: PlannedRecurringOccurrence,
  filter: ExpenseTypeFilter,
) {
  return filter === "all" || occurrence.kind === filter;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed bg-muted/25 px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function CategoryExpenseChart({ data }: { data: ChartRow[] }) {
  if (data.length === 0) {
    return <EmptyState message="표시할 카테고리 지출이 없습니다." />;
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) =>
              `${numberFormatter.format(value / 10000)}만`
            }
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="name"
            tickLine={false}
            type="category"
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
            }}
            formatter={(value) => [formatMoney(Number(value ?? 0)), "지출"]}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Bar
            dataKey="amount"
            fill="var(--chart-2)"
            maxBarSize={34}
            radius={[0, 6, 6, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardNotice({
  isConfigured,
  isSignedIn,
}: Pick<DashboardClientProps, "isConfigured" | "isSignedIn">) {
  if (!isConfigured) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Supabase 환경변수를 설정하면 대시보드 데이터가 표시됩니다.
        </CardContent>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          로그인 후 공동 가계부 대시보드를 볼 수 있습니다.
        </CardContent>
      </Card>
    );
  }

  return null;
}

function makeFriendlyAdviceLine(advice: AdvicePreview) {
  const firstLine =
    advice.body
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .find(Boolean) ?? advice.title;

  return `괜찮아요, 함께 살펴보면 좋아요. ${firstLine}`;
}

function AccountSummaryTable({
  accountSummaries,
}: {
  accountSummaries: AccountSummaryView[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>계좌</TableHead>
            <TableHead>타입</TableHead>
            <TableHead>소유</TableHead>
            <TableHead className="text-right">기간 지출</TableHead>
            <TableHead className="text-right">예정 고정비</TableHead>
            <TableHead className="text-right">예정 구독비</TableHead>
            <TableHead>최근 거래</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accountSummaries.length === 0 ? (
            <TableRow>
              <TableCell className="text-center text-muted-foreground" colSpan={7}>
                표시할 계좌가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            accountSummaries.map((summary) => (
              <TableRow key={summary.account.id}>
                <TableCell className="font-medium">
                  {summary.account.name}
                </TableCell>
                <TableCell>{accountTypeLabels[summary.account.type]}</TableCell>
                <TableCell>
                  {ownerTypeLabels[summary.account.owner_type]}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(summary.expense)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(summary.fixedPlanned)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(summary.subscriptionPlanned)}
                </TableCell>
                <TableCell className="min-w-52">
                  {summary.recentTransactions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {summary.recentTransactions.map((transaction) => (
                        <Badge key={transaction.id} variant="outline">
                          {formatShortDate(transaction.transaction_date)}{" "}
                          {transactionTitle(transaction)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AccountSummaryCards({
  accountSummaries,
  compact = false,
}: {
  accountSummaries: AccountSummaryView[];
  compact?: boolean;
}) {
  if (accountSummaries.length === 0) {
    return <EmptyState message="표시할 계좌가 없습니다." />;
  }

  return (
    <div className={compact ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
      {accountSummaries.map((summary) => (
        <div
          className="min-w-0 rounded-md border bg-muted/30 p-4"
          key={summary.account.id}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">
                  {summary.account.name}
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {accountTypeLabels[summary.account.type]} ·{" "}
                  {ownerTypeLabels[summary.account.owner_type]}
                </p>
              </div>
              <Badge className="shrink-0" variant="secondary">
                {formatMoney(summary.expense)}
              </Badge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">고정비</dt>
                <dd className="mt-1 truncate font-semibold">
                  {formatMoney(summary.fixedPlanned)}
                </dd>
              </div>
              <div className="rounded-md bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">구독비</dt>
                <dd className="mt-1 truncate font-semibold">
                  {formatMoney(summary.subscriptionPlanned)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 min-w-0">
              <p className="mb-2 text-xs text-muted-foreground">최근 거래</p>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {summary.recentTransactions.length > 0 ? (
                  summary.recentTransactions.map((transaction) => (
                    <Badge
                      className="max-w-full truncate"
                      key={transaction.id}
                      variant="outline"
                    >
                      {transactionTitle(transaction)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    최근 거래 없음
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient(props: DashboardClientProps) {
  const {
    accounts,
    adviceLogs,
    budgets,
    categories,
    dateRange,
    errorMessage,
    filters,
    household,
    isConfigured,
    isSignedIn,
    plannedOccurrences,
    recurringItems,
    today,
    transactions,
  } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const recurringKindById = useMemo(
    () => new Map(recurringItems.map((item) => [item.id, item.kind])),
    [recurringItems],
  );
  const visibleAccounts = useMemo(
    () => selectedAccounts(accounts, filters.account),
    [accounts, filters.account],
  );
  const visibleAccountIds = useMemo(
    () => new Set(visibleAccounts.map((account) => account.id)),
    [visibleAccounts],
  );

  const updateQuery = (updates: Record<string, string | undefined>) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    const queryString = nextParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  const accountOptions = useMemo(
    () => makeAccountFilterOptions(accounts),
    [accounts],
  );
  const selectedAccountLabel =
    accountOptions.find((option) => option.value === filters.account)?.label ??
    "전체";

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        if (!visibleAccountIds.has(transaction.account_id)) {
          return false;
        }

        return transactionMatchesExpenseType(
          transaction,
          filters.expenseType,
          recurringKindById,
        );
      }),
    [filters.expenseType, recurringKindById, transactions, visibleAccountIds],
  );

  const incomeTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          visibleAccountIds.has(transaction.account_id) &&
          transaction.type === "income",
      ),
    [transactions, visibleAccountIds],
  );

  const expenseTransactions = filteredTransactions.filter(
    (transaction) => transaction.type === "expense",
  );

  const plannedForSelection = plannedOccurrences.filter(
    (occurrence) =>
      visibleAccountIds.has(occurrence.account_id) &&
      occurrence.due_date >= dateRange.start &&
      occurrence.due_date <= dateRange.end &&
      plannedMatchesExpenseType(occurrence, filters.expenseType),
  );

  const actualFixedExpense = expenseTransactions
    .filter(
      (transaction) =>
        recurringKindForTransaction(transaction, recurringKindById) ===
        "fixed_expense",
    )
    .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0);
  const actualSubscriptionExpense = expenseTransactions
    .filter(
      (transaction) =>
        recurringKindForTransaction(transaction, recurringKindById) ===
        "subscription",
    )
    .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0);
  const variableExpense = expenseTransactions
    .filter(
      (transaction) =>
        recurringKindForTransaction(transaction, recurringKindById) ===
        "variable",
    )
    .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0);
  const plannedFixedExpense = plannedForSelection
    .filter((occurrence) => occurrence.kind === "fixed_expense")
    .reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const plannedSubscriptionExpense = plannedForSelection
    .filter((occurrence) => occurrence.kind === "subscription")
    .reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const totalExpense = expenseTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const totalIncome = incomeTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const budgetTotal = budgets
    .filter(
      (budget) =>
        budget.account_id === null || visibleAccountIds.has(budget.account_id),
    )
    .reduce((sum, budget) => sum + toAmount(budget.amount), 0);
  const remainingBudget = budgetTotal - totalExpense;
  const nextSevenDays = addDays(today, 7);
  const currentMonthEnd = monthEnd(today);
  const nextSevenOccurrences = plannedOccurrences
    .filter(
      (occurrence) =>
        visibleAccountIds.has(occurrence.account_id) &&
        occurrence.due_date >= today &&
        occurrence.due_date <= nextSevenDays &&
        plannedMatchesExpenseType(occurrence, filters.expenseType),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const currentMonthRemainingOccurrences = plannedOccurrences
    .filter(
      (occurrence) =>
        visibleAccountIds.has(occurrence.account_id) &&
        occurrence.due_date >= today &&
        occurrence.due_date <= currentMonthEnd &&
        plannedMatchesExpenseType(occurrence, filters.expenseType),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const currentMonthRemainingTotal = currentMonthRemainingOccurrences.reduce(
    (sum, occurrence) => sum + occurrence.amount,
    0,
  );

  const categoryChartData = (() => {
    const grouped = new Map<string, ChartRow>();

    expenseTransactions.forEach((transaction) => {
      const category = transaction.category_id
        ? categoriesById.get(transaction.category_id)
        : null;
      const name = category?.name ?? "미분류";
      const current = grouped.get(name) ?? { name, amount: 0 };
      current.amount += toAmount(transaction.amount);
      grouped.set(name, current);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  })();

  const accountSummaries = visibleAccounts.map((account) => {
    const accountExpenses = expenseTransactions.filter(
      (transaction) => transaction.account_id === account.id,
    );
    const accountPlanned = plannedOccurrences.filter(
      (occurrence) =>
        occurrence.account_id === account.id &&
        occurrence.due_date >= today &&
        occurrence.due_date <= currentMonthEnd &&
        plannedMatchesExpenseType(occurrence, filters.expenseType),
    );
    const recentTransactions = filteredTransactions
      .filter((transaction) => transaction.account_id === account.id)
      .sort((a, b) =>
        transactionSortValue(b).localeCompare(transactionSortValue(a)),
      )
      .slice(0, 3);

    return {
      account,
      expense: accountExpenses.reduce(
        (sum, transaction) => sum + toAmount(transaction.amount),
        0,
      ),
      fixedPlanned: accountPlanned
        .filter((occurrence) => occurrence.kind === "fixed_expense")
        .reduce((sum, occurrence) => sum + occurrence.amount, 0),
      recentTransactions,
      subscriptionPlanned: accountPlanned
        .filter((occurrence) => occurrence.kind === "subscription")
        .reduce((sum, occurrence) => sum + occurrence.amount, 0),
    };
  });

  const latestAdvice = adviceLogs[0];
  const generatedAdvice = (() => {
    if (latestAdvice) {
      return latestAdvice;
    }

    if (totalIncome > 0 && totalExpense > totalIncome) {
      return {
        body: "선택 기간의 지출이 수입보다 큽니다. 다음 7일 예정 지출을 먼저 확인하고 변동비 결제를 늦출 수 있는지 살펴보세요.",
        severity: "warning" as const,
        title: "현금흐름 주의",
      };
    }

    if (currentMonthRemainingTotal > 0) {
      return {
        body: `이번 달 남은 반복 지출은 ${formatMoney(
          currentMonthRemainingTotal,
        )}입니다. 예정 금액을 제외한 뒤 변동비 여유분을 보는 편이 좋습니다.`,
        severity: "info" as const,
        title: "예정 지출 반영",
      };
    }

    return {
      body: "아직 강한 소비 신호는 없습니다. 거래가 더 쌓이면 고정비와 변동비 흐름을 나눠 더 구체적으로 볼 수 있습니다.",
      severity: "info" as const,
      title: "흐름 안정",
    };
  })();
  const topAdviceLine = makeFriendlyAdviceLine(generatedAdvice);

  if (!isConfigured || !isSignedIn) {
    return (
      <DashboardNotice isConfigured={isConfigured} isSignedIn={isSignedIn} />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-4 py-3 text-sm shadow-[0_12px_28px_rgba(18,18,18,0.08)]">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 truncate">
          <span className="font-semibold">AI 소비 조언</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{topAdviceLine}</span>
        </p>
      </div>

      {errorMessage ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {errorMessage}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-full border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{household?.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {dateRange.label} · {selectedAccountLabel} ·{" "}
            {expenseTypeLabels[filters.expenseType]}
          </p>
        </div>
        <FilterSheet
          description="대시보드에 표시할 기간, 계좌, 지출 유형을 고릅니다."
          summary={dateRange.label}
        >
          <div className="grid gap-4">
            <p className="text-sm font-medium">{household?.name}</p>

            <label className="flex flex-col gap-1.5 text-sm">
              기간
              <Select
                value={filters.period}
                onChange={(event) =>
                  updateQuery({
                    period: event.target.value,
                    start:
                      event.target.value === "custom"
                        ? dateRange.start
                        : undefined,
                    end:
                      event.target.value === "custom"
                        ? dateRange.end
                        : undefined,
                  })
                }
              >
                {Object.entries(periodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              계좌
              <Select
                value={filters.account}
                onChange={(event) =>
                  updateQuery({ account: event.target.value || undefined })
                }
              >
                {accountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              지출 유형
              <Select
                value={filters.expenseType}
                onChange={(event) =>
                  updateQuery({ expenseType: event.target.value || undefined })
                }
              >
                {Object.entries(expenseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>

            {filters.period === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  시작일
                  <Input
                    max={dateRange.end}
                    type="date"
                    value={dateRange.start}
                    onChange={(event) =>
                      updateQuery({
                        period: "custom",
                        start: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  종료일
                  <Input
                    min={dateRange.start}
                    type="date"
                    value={dateRange.end}
                    onChange={(event) =>
                      updateQuery({
                        period: "custom",
                        end: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
          </div>
        </FilterSheet>
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          {
            helper: "발생 기준",
            label: "총 지출",
            value: formatMoney(totalExpense),
          },
          {
            helper: "입금 거래",
            label: "총 수입",
            value: formatMoney(totalIncome),
          },
          {
            helper: budgetTotal > 0 ? `예산 ${formatMoney(budgetTotal)}` : "예산 없음",
            label: "남은 예산",
            value: formatMoney(remainingBudget),
          },
          {
            helper: "발생 + 예정",
            label: "고정비 합계",
            value: formatMoney(actualFixedExpense + plannedFixedExpense),
          },
          {
            helper: "발생 + 예정",
            label: "구독비 합계",
            value: formatMoney(
              actualSubscriptionExpense + plannedSubscriptionExpense,
            ),
          },
          {
            helper: "반복비 제외",
            label: "변동비 합계",
            value: formatMoney(variableExpense),
          },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-3 text-xl font-semibold tracking-normal">
                {metric.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metric.helper}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <Card>
          <CardHeader>
            <CardTitle>카테고리별 지출</CardTitle>
            <CardDescription>
              선택한 기간과 계좌 조건에 맞는 지출입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryExpenseChart data={categoryChartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI 소비 조언</CardTitle>
            <CardDescription>
              최근 거래와 예정 지출을 바탕으로 본 흐름입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  generatedAdvice.severity === "critical"
                    ? "default"
                    : "secondary"
                }
              >
                {generatedAdvice.severity === "warning"
                  ? "주의"
                  : generatedAdvice.severity === "critical"
                    ? "위험"
                    : "정보"}
              </Badge>
              {latestAdvice ? (
                <span className="text-xs text-muted-foreground">
                  {formatShortDate(latestAdvice.created_at.slice(0, 10))}
                </span>
              ) : null}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{generatedAdvice.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {generatedAdvice.body}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">변동비 비중</p>
                <p className="mt-1 font-semibold">
                  {totalExpense > 0
                    ? `${Math.round((variableExpense / totalExpense) * 100)}%`
                    : "0%"}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">다음 7일</p>
                <p className="mt-1 font-semibold">
                  {formatMoney(
                    nextSevenOccurrences.reduce(
                      (sum, occurrence) => sum + occurrence.amount,
                      0,
                    ),
                  )}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">수입 대비 지출</p>
                <p className="mt-1 font-semibold">
                  {totalIncome > 0
                    ? `${Math.round((totalExpense / totalIncome) * 100)}%`
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>계좌별 요약</CardTitle>
                <CardDescription>
                  지출, 예정 반복비, 최근 거래를 계좌별로 봅니다.
                </CardDescription>
              </div>
              <Badge variant="secondary">{visibleAccounts.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="md:hidden">
              <AccountSummaryCards accountSummaries={accountSummaries} compact />
            </div>

            <div className="hidden md:block">
              <Tabs defaultValue="table">
                <TabsList>
                  <TabsTrigger value="table">테이블</TabsTrigger>
                  <TabsTrigger value="cards">카드</TabsTrigger>
                </TabsList>

                <TabsContent value="table">
                  <AccountSummaryTable accountSummaries={accountSummaries} />
                </TabsContent>

                <TabsContent value="cards">
                  <AccountSummaryCards accountSummaries={accountSummaries} />
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>예정 반복 지출</CardTitle>
            <CardDescription>
              다음 7일과 이번 달 남은 결제 예정입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">다음 7일 예정</h2>
                <Badge variant="secondary">{nextSevenOccurrences.length}건</Badge>
              </div>
              <div className="space-y-2">
                {nextSevenOccurrences.length === 0 ? (
                  <EmptyState message="다음 7일 예정 지출이 없습니다." />
                ) : (
                  nextSevenOccurrences.map((occurrence) => (
                    <div
                      className="rounded-md border bg-muted/15 p-3"
                      key={`${occurrence.recurring_item_id}-${occurrence.due_date}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{occurrence.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {accountName(accountsById, occurrence.account_id)} ·{" "}
                            {recurringKindLabels[occurrence.kind]}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {formatMoney(occurrence.amount)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {dueLabel(today, occurrence.due_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">이번 달 남은 예정</h2>
                <Badge variant="secondary">
                  {formatMoney(currentMonthRemainingTotal)}
                </Badge>
              </div>
              <div className="space-y-2">
                {currentMonthRemainingOccurrences.length === 0 ? (
                  <EmptyState message="이번 달 남은 예정 지출이 없습니다." />
                ) : (
                  currentMonthRemainingOccurrences.map((occurrence) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-md border bg-muted/15 p-3"
                      key={`${occurrence.id}-${occurrence.due_date}`}
                    >
                      <div>
                        <p className="font-medium">{occurrence.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatShortDate(occurrence.due_date)} ·{" "}
                          {accountName(accountsById, occurrence.account_id)}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatMoney(occurrence.amount)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
