"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  Landmark,
  PiggyBank,
  ReceiptText,
  Repeat2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
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
  DashboardAccountBalance,
  DashboardPageData,
  DashboardTransactionRow,
  ExpenseTypeFilter,
  PlannedRecurringOccurrence,
} from "./types";
import { cn } from "@/lib/utils";

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

function formatCompactMoney(value: number) {
  const rounded = Math.round(value);

  if (Math.abs(rounded) >= 10000) {
    return `${numberFormatter.format(Math.round(rounded / 10000))}만`;
  }

  return numberFormatter.format(rounded);
}

function formatChartLabel(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCompactMoney(amount) : "";
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

function monthStart(value: string) {
  const date = parseDateOnly(value);
  return formatDateOnly(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
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

function monthCalendarDays(today: string) {
  const start = monthStart(today);
  const end = monthEnd(today);
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  const leadingEmptyDays = startDate.getUTCDay();
  const dayCount = endDate.getUTCDate();
  const days: Array<string | null> = Array.from(
    { length: leadingEmptyDays },
    () => null,
  );

  for (let day = 1; day <= dayCount; day += 1) {
    days.push(
      formatDateOnly(
        new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), day)),
      ),
    );
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
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
    { label: "신용카드", value: "type:card" },
    { label: "체크카드", value: "type:check_card" },
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
  return accountsById.get(accountId)?.name ?? "계좌";
}

function normalizedAccountName(account: AccountRow) {
  return account.name.replace(/\s+/g, "");
}

function findMainAccount(accounts: AccountRow[]) {
  return (
    accounts.find((account) => normalizedAccountName(account) === "생활비통장") ??
    accounts.find((account) => normalizedAccountName(account).includes("생활비")) ??
    accounts.find(
      (account) => account.owner_type === "shared" && account.type === "bank",
    ) ??
    accounts.find((account) => account.type === "bank") ??
    accounts[0] ??
    null
  );
}

function accountBalance(
  accountBalances: DashboardAccountBalance[],
  accountId: string,
) {
  return (
    accountBalances.find((balance) => balance.account_id === accountId)
      ?.balance ?? 0
  );
}

function accountPeriodFlow(
  transactions: DashboardTransactionRow[],
  accountId: string,
) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = toAmount(transaction.amount);

      if (transaction.type === "income" && transaction.account_id === accountId) {
        summary.inflow += amount;
        summary.transactionCount += 1;
      }

      if (transaction.type === "expense" && transaction.account_id === accountId) {
        summary.outflow += amount;
        summary.transactionCount += 1;
      }

      if (transaction.type === "transfer") {
        if (transaction.account_id === accountId) {
          summary.outflow += amount;
          summary.transactionCount += 1;
        }

        if (transaction.transfer_account_id === accountId) {
          summary.inflow += amount;
          summary.transactionCount += 1;
        }
      }

      return summary;
    },
    { inflow: 0, outflow: 0, transactionCount: 0 },
  );
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

function MainAccountBalanceCard({
  account,
  balance,
  dateRangeLabel,
  periodInflow,
  periodOutflow,
  scheduledOutflow,
}: {
  account: AccountRow | null;
  balance: number;
  dateRangeLabel: string;
  periodInflow: number;
  periodOutflow: number;
  scheduledOutflow: number;
}) {
  if (!account) {
    return <EmptyState message="메인 계좌를 추가하면 잔액을 보여드릴게요." />;
  }

  const netFlow = periodInflow - periodOutflow;

  return (
    <section className="overflow-hidden rounded-lg bg-secondary p-2 text-secondary-foreground shadow-[0_24px_60px_rgba(18,18,18,0.2)] sm:p-3">
      <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <div className="rounded-lg bg-primary p-4 text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-md bg-primary-foreground/12 sm:size-10">
                  <Landmark className="size-4 sm:size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs opacity-75 sm:text-sm">
                    메인 계좌
                  </p>
                  <h2 className="truncate text-lg font-semibold tracking-normal sm:text-xl">
                    {account.name}
                  </h2>
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary-foreground px-2.5 py-1 text-[11px] font-bold text-secondary sm:px-3 sm:text-xs">
              {ownerTypeLabels[account.owner_type]}
            </span>
          </div>

          <div className="mt-5 sm:mt-8">
            <p className="text-xs opacity-70 sm:text-sm">현재 잔액</p>
            <p className="mt-2 break-keep text-3xl font-semibold tracking-normal sm:text-5xl">
              {formatMoney(balance)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
              <span className="rounded-full bg-primary-foreground/14 px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs">
                {dateRangeLabel}
              </span>
              <span className="rounded-full bg-primary-foreground/14 px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs">
                기간 흐름 {netFlow >= 0 ? "+" : "-"}
                {formatMoney(Math.abs(netFlow))}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-1">
          {[
            {
              icon: ArrowDownLeft,
              label: "들어온 돈",
              value: periodInflow,
            },
            {
              icon: ArrowUpRight,
              label: "나간 돈",
              value: periodOutflow,
            },
            {
              icon: WalletCards,
              label: "남은 예정",
              value: scheduledOutflow,
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                className="rounded-lg border border-white/10 bg-white/[0.06] p-3 sm:p-4"
                key={item.label}
              >
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <span className="grid size-8 place-items-center rounded-md bg-primary text-secondary sm:size-9">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="hidden text-xs text-white/45 sm:inline">
                    KRW
                  </span>
                </div>
                <p className="mt-3 truncate text-[11px] text-white/55 sm:mt-4 sm:text-xs">
                  {item.label}
                </p>
                <p className="mt-1 truncate text-sm font-semibold sm:text-lg">
                  {formatMoney(item.value)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  emphasis = "light",
  helper,
  icon: Icon,
  label,
  value,
}: {
  emphasis?: "dark" | "light" | "primary";
  helper: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden shadow-[0_16px_34px_rgba(18,18,18,0.08)]",
        emphasis === "dark" &&
          "border-secondary bg-secondary text-secondary-foreground",
        emphasis === "primary" &&
          "border-primary bg-primary text-primary-foreground",
      )}
    >
      <CardContent className="flex min-h-28 flex-col justify-between p-3 sm:min-h-36 sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div
            className={cn(
              "grid size-8 place-items-center rounded-md sm:size-10",
              emphasis === "dark"
                ? "bg-primary text-secondary"
                : emphasis === "primary"
                  ? "bg-primary-foreground text-primary"
                  : "bg-secondary text-primary",
            )}
          >
            <Icon className="size-4 sm:size-5" aria-hidden="true" />
          </div>
          <span
            className={cn(
              "max-w-[5.5rem] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold sm:max-w-none sm:px-2.5 sm:py-1 sm:text-xs",
              emphasis === "light"
                ? "bg-muted text-muted-foreground"
                : "bg-white/12 text-current",
            )}
          >
            {helper}
          </span>
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs sm:text-sm",
              emphasis === "light" ? "text-muted-foreground" : "opacity-70",
            )}
          >
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold tracking-normal sm:mt-2 sm:text-2xl">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryExpenseChart({ data }: { data: ChartRow[] }) {
  if (data.length === 0) {
    return <EmptyState message="카테고리별 지출이 생기면 보여드릴게요." />;
  }

  const chartData = data.slice(0, 6).map((item) => ({
    ...item,
    shortName: item.name.length > 4 ? `${item.name.slice(0, 4)}…` : item.name,
  }));
  const totalExpense = data.reduce((sum, item) => sum + item.amount, 0);
  const topCategory = data[0];
  const averageExpense = totalExpense / data.length;
  const topCategoryShare =
    totalExpense > 0 ? Math.round((topCategory.amount / totalExpense) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-full bg-muted/50 p-1 text-sm font-semibold">
        <div className="rounded-full bg-primary px-3 py-2 text-center text-primary-foreground">
          카테고리별
        </div>
        <div className="px-3 py-2 text-center text-muted-foreground">
          전체 분석
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-background p-4 shadow-[inset_0_0_0_1px_rgba(18,18,18,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 text-center">
            <p className="text-xs text-muted-foreground">이번 기간</p>
            <h3 className="truncate text-xl font-semibold tracking-normal">
              {topCategory.name}
            </h3>
          </div>
          <Badge className="bg-primary text-primary-foreground">
            {topCategoryShare}%
          </Badge>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {chartData.map((item, index) => (
            <span
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                index === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              key={item.name}
            >
              {item.name}
              {index === 0 ? " ×" : null}
            </span>
          ))}
        </div>

        <div className="mt-5 h-[230px] w-full">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={chartData}
              margin={{ bottom: 0, left: 0, right: 0, top: 28 }}
            >
              <XAxis
                axisLine={false}
                dataKey="shortName"
                interval={0}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--foreground)",
                }}
                formatter={(value) => [formatMoney(Number(value ?? 0)), "지출"]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.name ?? "카테고리"
                }
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Bar dataKey="amount" maxBarSize={42} radius={[10, 10, 10, 10]}>
                <LabelList
                  className="fill-muted-foreground text-[11px]"
                  dataKey="amount"
                  formatter={formatChartLabel}
                  position="top"
                />
                {chartData.map((item, index) => (
                  <Cell
                    fill={index === 0 ? "var(--primary)" : "var(--muted)"}
                    key={item.name}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          {
            helper: "가장 많이 쓴 곳",
            label: topCategory.name,
            value: formatCompactMoney(topCategory.amount),
          },
          {
            helper: "평균 지출",
            label: "카테고리당",
            value: formatCompactMoney(averageExpense),
          },
          {
            helper: "비중",
            label: "전체 지출 중",
            value: `${topCategoryShare}%`,
          },
        ].map((item) => (
          <div
            className="min-w-0 rounded-lg border bg-card p-3 shadow-sm"
            key={item.helper}
          >
            <p className="truncate text-lg font-semibold tracking-normal">
              {item.value}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.label}
            </p>
          </div>
        ))}
      </div>
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
          Supabase 환경변수를 넣으면 대시보드를 볼 수 있어요.
        </CardContent>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          로그인하면 공동 가계부 대시보드를 볼 수 있어요.
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

  return `괜찮아요. ${firstLine}`;
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
                      계좌를 추가하면 여기에 보여요.
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
    return <EmptyState message="계좌를 추가하면 여기에 보여요." />;
  }

  return (
    <div className={compact ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
      {accountSummaries.map((summary) => (
        <div
          className="min-w-0 overflow-hidden rounded-lg border bg-card p-2 shadow-[0_14px_32px_rgba(18,18,18,0.08)] sm:p-3"
          key={summary.account.id}
        >
          <div className="rounded-lg bg-secondary p-3 text-secondary-foreground sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-white/50">Account</p>
                <h3 className="mt-1 truncate text-base font-semibold sm:text-lg">
                  {summary.account.name}
                </h3>
                <p className="mt-1 truncate text-xs text-white/55 sm:text-sm">
                  {accountTypeLabels[summary.account.type]} ·{" "}
                  {ownerTypeLabels[summary.account.owner_type]}
                </p>
              </div>
              <Badge className="shrink-0 bg-primary text-[11px] text-secondary sm:text-xs">
                {summary.recentTransactions.length}건
              </Badge>
            </div>

            <div className="mt-5 sm:mt-7">
              <p className="text-xs text-white/50">기간 지출</p>
              <p className="mt-1 truncate text-xl font-semibold tracking-normal sm:text-2xl">
                {formatMoney(summary.expense)}
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/35 px-2.5 py-2.5 sm:px-3 sm:py-3">
              <dt className="text-xs text-muted-foreground">고정비 예정</dt>
              <dd className="mt-1 truncate font-semibold">
                {formatMoney(summary.fixedPlanned)}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/35 px-2.5 py-2.5 sm:px-3 sm:py-3">
              <dt className="text-xs text-muted-foreground">구독비 예정</dt>
              <dd className="mt-1 truncate font-semibold">
                {formatMoney(summary.subscriptionPlanned)}
              </dd>
            </div>
          </dl>

          <div className="mt-2 min-w-0 rounded-lg border bg-background/70 p-2.5 sm:mt-3 sm:p-3">
            <p className="mb-2 text-xs text-muted-foreground">최근 거래</p>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {summary.recentTransactions.length > 0 ? (
                summary.recentTransactions.map((transaction) => (
                  <Badge
                    className="max-w-full truncate bg-card"
                    key={transaction.id}
                    variant="outline"
                  >
                    {transactionTitle(transaction)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  최근 거래가 생기면 보여요
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UpcomingMoneyCalendar({
  accountsById,
  occurrences,
  today,
}: {
  accountsById: Map<string, AccountRow>;
  occurrences: PlannedRecurringOccurrence[];
  today: string;
}) {
  const start = monthStart(today);
  const end = monthEnd(today);
  const monthOccurrences = occurrences.filter(
    (occurrence) => occurrence.due_date >= start && occurrence.due_date <= end,
  );
  const byDate = new Map<string, PlannedRecurringOccurrence[]>();

  monthOccurrences.forEach((occurrence) => {
    byDate.set(occurrence.due_date, [
      ...(byDate.get(occurrence.due_date) ?? []),
      occurrence,
    ]);
  });

  const total = monthOccurrences.reduce(
    (sum, occurrence) => sum + occurrence.amount,
    0,
  );
  const [, month] = today.split("-").map(Number);

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-secondary text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{month}월 결제 달력</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              이번 달 예정 {monthOccurrences.length.toLocaleString("ko-KR")}건
            </p>
          </div>
        </div>
        <Badge variant="secondary">{formatMoney(total)}</Badge>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <div className="py-1" key={day}>
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCalendarDays(today).map((date, index) => {
          const dayOccurrences = date ? byDate.get(date) ?? [] : [];
          const dayTotal = dayOccurrences.reduce(
            (sum, occurrence) => sum + occurrence.amount,
            0,
          );
          const isToday = date === today;
          const isPastDue = Boolean(date && date < today && dayOccurrences.length > 0);

          return (
            <div
              className={cn(
                "min-h-16 rounded-md border bg-card p-1.5 text-left text-xs",
                !date && "border-transparent bg-transparent",
                isToday && "border-primary ring-2 ring-primary/20",
                isPastDue && "border-destructive/30 bg-destructive/5",
              )}
              key={date ?? `empty-${index}`}
            >
              {date ? (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium">
                      {Number(date.slice(-2))}
                    </span>
                    {dayOccurrences.length > 0 ? (
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          isPastDue ? "bg-destructive" : "bg-primary",
                        )}
                      />
                    ) : null}
                  </div>
                  {dayOccurrences.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="truncate font-semibold">
                        {formatCompactMoney(dayTotal)}원
                      </p>
                      <p className="truncate text-[10px] leading-4 text-muted-foreground">
                        {dayOccurrences[0].name}
                        {dayOccurrences.length > 1
                          ? ` 외 ${dayOccurrences.length - 1}건`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {monthOccurrences.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {monthOccurrences.slice(0, 3).map((occurrence) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2 text-sm"
              key={`calendar-${occurrence.id}`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{occurrence.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatShortDate(occurrence.due_date)} ·{" "}
                  {accountName(accountsById, occurrence.account_id)}
                </p>
              </div>
              <p className="shrink-0 font-semibold">
                {formatMoney(occurrence.amount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          이번 달 결제 예정이 생기면 달력에 보여요.
        </div>
      )}
    </section>
  );
}

export function DashboardClient(props: DashboardClientProps) {
  const {
    accounts,
    accountBalances,
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
  const reviewNeededTransactions = transactions.filter(
    (transaction) => transaction.review_status === "needs_review",
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
  const mainAccount = findMainAccount(accounts);
  const mainAccountFlow = mainAccount
    ? accountPeriodFlow(transactions, mainAccount.id)
    : { inflow: 0, outflow: 0, transactionCount: 0 };
  const mainAccountScheduledOutflow = mainAccount
    ? plannedOccurrences
        .filter(
          (occurrence) =>
            occurrence.account_id === mainAccount.id &&
            occurrence.due_date >= today &&
            occurrence.due_date <= currentMonthEnd,
        )
        .reduce((sum, occurrence) => sum + occurrence.amount, 0)
    : 0;

  const latestAdvice = adviceLogs[0];
  const generatedAdvice = (() => {
    if (latestAdvice) {
      return latestAdvice;
    }

    if (totalIncome > 0 && totalExpense > totalIncome) {
      return {
        body: "선택한 기간에는 지출이 수입보다 조금 커요. 다음 7일에 나갈 돈부터 함께 확인해요.",
        severity: "warning" as const,
        title: "현금흐름을 확인해요",
      };
    }

    if (currentMonthRemainingTotal > 0) {
      return {
        body: `이번 달에 나갈 돈이 ${formatMoney(
          currentMonthRemainingTotal,
        )} 남아 있어요. 먼저 빼두면 쓸 수 있는 돈이 더 또렷해져요.`,
        severity: "info" as const,
        title: "곧 나갈 돈을 확인해요",
      };
    }

    return {
      body: "흐름이 차분해 보여요. 거래가 더 쌓이면 고정비와 변동비를 나눠 볼게요.",
      severity: "info" as const,
      title: "흐름이 안정적이에요",
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

      {reviewNeededTransactions.length > 0 ? (
        <Link
          className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 text-sm shadow-sm transition hover:border-primary/60"
          href="/transactions"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">확인 필요한 거래</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                함께 봐야 할 거래가 {reviewNeededTransactions.length.toLocaleString("ko-KR")}건 있어요.
              </span>
            </span>
          </span>
          <Badge variant="secondary">보러 가기</Badge>
        </Link>
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
          description="기간과 계좌를 골라요."
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

      <MainAccountBalanceCard
        account={mainAccount}
        balance={mainAccount ? accountBalance(accountBalances, mainAccount.id) : 0}
        dateRangeLabel={dateRange.label}
        periodInflow={mainAccountFlow.inflow}
        periodOutflow={mainAccountFlow.outflow}
        scheduledOutflow={mainAccountScheduledOutflow}
      />

      <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            emphasis: "dark" as const,
            helper: "쓴 금액",
            icon: TrendingDown,
            label: "총 지출",
            value: formatMoney(totalExpense),
          },
          {
            emphasis: "primary" as const,
            helper: "들어온 돈",
            icon: TrendingUp,
            label: "총 수입",
            value: formatMoney(totalIncome),
          },
          {
            emphasis: "light" as const,
            helper: budgetTotal > 0 ? `예산 ${formatMoney(budgetTotal)}` : "예산을 정할 수 있어요",
            icon: PiggyBank,
            label: "남은 예산",
            value: formatMoney(remainingBudget),
          },
          {
            emphasis: "light" as const,
            helper: "쓴 돈과 나갈 돈",
            icon: CalendarCheck2,
            label: "고정비 합계",
            value: formatMoney(actualFixedExpense + plannedFixedExpense),
          },
          {
            emphasis: "light" as const,
            helper: "쓴 돈과 나갈 돈",
            icon: Repeat2,
            label: "구독비 합계",
            value: formatMoney(
              actualSubscriptionExpense + plannedSubscriptionExpense,
            ),
          },
          {
            emphasis: "light" as const,
            helper: "고정비·구독비 제외",
            icon: ReceiptText,
            label: "변동비 합계",
            value: formatMoney(variableExpense),
          },
        ].map((metric) => (
          <MetricCard
            emphasis={metric.emphasis}
            helper={metric.helper}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <Card>
          <CardHeader>
            <CardTitle>카테고리별 지출</CardTitle>
            <CardDescription>
              많이 쓴 순서로 보여요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryExpenseChart data={categoryChartData} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-secondary bg-secondary text-secondary-foreground shadow-[0_18px_44px_rgba(18,18,18,0.18)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>AI 소비 조언</CardTitle>
                <CardDescription className="text-secondary-foreground/55">
                  최근 기록과 곧 나갈 돈을 함께 봤어요.
                </CardDescription>
              </div>
              <Badge className="bg-primary text-secondary">
                {generatedAdvice.severity === "warning"
                  ? "주의"
                  : generatedAdvice.severity === "critical"
                    ? "위험"
                    : "정보"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-primary p-4 text-primary-foreground">
              <div className="flex items-center justify-between gap-3">
                <Sparkles className="size-5 shrink-0" aria-hidden="true" />
                {latestAdvice ? (
                  <span className="text-xs opacity-70">
                    {formatShortDate(latestAdvice.created_at.slice(0, 10))}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-normal">
                {generatedAdvice.title}
              </h2>
              <p className="mt-3 text-sm leading-6 opacity-75">
                {generatedAdvice.body}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {[
                {
                  label: "변동비 비중",
                  value:
                    totalExpense > 0
                      ? `${Math.round((variableExpense / totalExpense) * 100)}%`
                      : "0%",
                },
                {
                  label: "다음 7일",
                  value: formatMoney(
                    nextSevenOccurrences.reduce(
                      (sum, occurrence) => sum + occurrence.amount,
                      0,
                    ),
                  ),
                },
                {
                  label: "수입 대비 지출",
                  value:
                    totalIncome > 0
                      ? `${Math.round((totalExpense / totalIncome) * 100)}%`
                      : "-",
                },
              ].map((item) => (
                <div
                  className="rounded-lg border border-white/10 bg-white/[0.06] p-3"
                  key={item.label}
                >
                  <p className="text-xs text-white/50">{item.label}</p>
                  <p className="mt-1 font-semibold">{item.value}</p>
                </div>
              ))}
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
                  계좌별 지출과 곧 나갈 돈을 봐요.
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
                  <TabsTrigger value="table">목록</TabsTrigger>
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
            <CardTitle>곧 나갈 돈</CardTitle>
            <CardDescription>
              다음 결제 일정을 봐요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UpcomingMoneyCalendar
              accountsById={accountsById}
              occurrences={plannedOccurrences}
              today={today}
            />

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">다음 7일 예정</h2>
                <Badge variant="secondary">{nextSevenOccurrences.length}건</Badge>
              </div>
              <div className="space-y-2">
                {nextSevenOccurrences.length === 0 ? (
                  <EmptyState message="다음 7일 안에 결제가 생기면 보여요." />
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
                  <EmptyState message="이번 달 남은 결제가 생기면 보여요." />
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
