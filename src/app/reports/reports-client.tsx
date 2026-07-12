"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  FileText,
  Printer,
  Sparkles,
  WalletCards,
} from "lucide-react";
import {
  accountTypeLabels,
  ownerTypeLabels,
  type AccountRow,
} from "@/app/accounts/types";
import { transactionTypeLabels } from "@/app/m/new/types";
import { recurringKindLabels } from "@/app/recurring/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSheet } from "@/components/filter-sheet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type {
  ReportMember,
  ReportPageData,
  ReportPeriod,
  ReportRecurringOccurrence,
  ReportTransactionRow,
} from "./types";

type ReportsClientProps = ReportPageData;

type GroupedAmount = {
  amount: number;
  count: number;
  id: string;
  name: string;
};

const periodLabels: Record<ReportPeriod, string> = {
  custom: "직접 선택",
  last_3_months: "최근 3개월",
  last_month: "지난 달",
  this_month: "이번 달",
};

const sourceLabels: Record<string, string> = {
  api: "API",
  csv: "CSV",
  manual: "직접",
  ocr: "영수증",
  recurring: "자동",
  shortcut: "단축어",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  currency: "KRW",
  maximumFractionDigits: 0,
  style: "currency",
});

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}.${month}.${day}`;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}.${day}`;
}

function memberName(member: ReportMember | undefined) {
  if (!member) {
    return "-";
  }

  if (member.display_name) {
    return member.display_name;
  }

  if (member.member_label === "husband") {
    return "남편";
  }

  if (member.member_label === "wife") {
    return "아내";
  }

  return member.role === "owner" ? "관리자" : "멤버";
}

function transactionTitle(transaction: ReportTransactionRow) {
  return (
    transaction.merchant ??
    transaction.memo ??
    transactionTypeLabels[transaction.type]
  );
}

function accountName(accountsById: Map<string, AccountRow>, accountId: string | null) {
  if (!accountId) {
    return "-";
  }

  return accountsById.get(accountId)?.name ?? "계좌";
}

function adviceLines(body: string) {
  return body
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function friendlyAdviceLine({
  totalExpense,
  totalIncome,
  upcomingTotal,
}: {
  totalExpense: number;
  totalIncome: number;
  upcomingTotal: number;
}) {
  if (totalIncome > 0 && totalExpense > totalIncome) {
    return "이번 기간은 지출이 수입보다 조금 앞서 있어요. 다음 결제 예정 금액부터 함께 확인해볼게요.";
  }

  if (upcomingTotal > 0) {
    return `이번 기간에 나갈 돈이 ${formatMoney(
      upcomingTotal,
    )} 남아 있어요. 미리 빼두면 마음이 한결 편해져요.`;
  }

  return "현재 흐름은 차분해 보여요. 작은 변동비만 꾸준히 기록하면 다음 보고서가 더 또렷해집니다.";
}

function groupByCategory({
  categoriesById,
  transactions,
}: {
  categoriesById: Map<string, { name: string }>;
  transactions: ReportTransactionRow[];
}) {
  const grouped = new Map<string, GroupedAmount>();

  transactions
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      const id = transaction.category_id ?? "uncategorized";
      const current = grouped.get(id) ?? {
        amount: 0,
        count: 0,
        id,
        name: transaction.category_id
          ? categoriesById.get(transaction.category_id)?.name ?? "미분류"
          : "미분류",
      };

      current.amount += toAmount(transaction.amount);
      current.count += 1;
      grouped.set(id, current);
    });

  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
}

function EmptyReportState({ message }: { message: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/25 px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ReportsNotice({
  isConfigured,
  isSignedIn,
}: Pick<ReportsClientProps, "isConfigured" | "isSignedIn">) {
  if (!isConfigured) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Supabase 환경변수를 넣으면 보고서를 만들 수 있어요.
        </CardContent>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardContent className="grid gap-4 p-5 text-sm text-muted-foreground">
          <p>로그인하면 공동 가계부 보고서를 만들 수 있어요.</p>
          <div>
            <Button asChild>
              <Link href="/login?next=/reports">로그인</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function ReportToolbar({
  range,
}: Pick<ReportsClientProps, "range">) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateQuery(updates: Record<string, string | undefined>) {
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
  }

  return (
    <div className="print-hidden flex items-center justify-between gap-3 rounded-full border bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">보고서 조건</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {range.label}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <FilterSheet
          description="보고서에 담을 기간을 골라요."
          summary={range.label}
        >
          <div className="grid gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              기간
              <Select
                value={range.period}
                onChange={(event) =>
                  updateQuery({
                    end:
                      event.target.value === "custom" ? range.end : undefined,
                    period: event.target.value,
                    start:
                      event.target.value === "custom"
                        ? range.start
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                시작일
                <Input
                  max={range.end}
                  type="date"
                  value={range.start}
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
                  min={range.start}
                  type="date"
                  value={range.end}
                  onChange={(event) =>
                    updateQuery({
                      end: event.target.value,
                      period: "custom",
                    })
                  }
                />
              </label>
            </div>
          </div>
        </FilterSheet>

        <Button
          aria-label="인쇄 또는 PDF 저장"
          className="size-10"
          onClick={() => window.print()}
          size="icon"
          type="button"
        >
          <Printer className="size-4" aria-hidden="true" />
          <span className="sr-only">인쇄 또는 PDF 저장</span>
        </Button>
      </div>
    </div>
  );
}

function UpcomingRecurringTable({
  accountsById,
  occurrences,
}: {
  accountsById: Map<string, AccountRow>;
  occurrences: ReportRecurringOccurrence[];
}) {
  if (occurrences.length === 0) {
    return <EmptyReportState message="선택한 기간에 결제 예정이 생기면 보여요." />;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>예정일</TableHead>
            <TableHead>항목</TableHead>
            <TableHead>종류</TableHead>
            <TableHead>계좌</TableHead>
            <TableHead className="text-right">금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {occurrences.slice(0, 10).map((occurrence) => (
            <TableRow key={occurrence.id}>
              <TableCell>{formatShortDate(occurrence.due_date)}</TableCell>
              <TableCell className="font-medium">
                {occurrence.merchant ?? occurrence.name}
              </TableCell>
              <TableCell>{recurringKindLabels[occurrence.kind]}</TableCell>
              <TableCell>
                {accountName(accountsById, occurrence.account_id)}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(occurrence.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReportsClient(props: ReportsClientProps) {
  const {
    accounts,
    adviceLogs,
    budgets,
    categories,
    errorMessage,
    household,
    isConfigured,
    isSignedIn,
    members,
    plannedOccurrences,
    range,
    recurringItems,
    today,
    transactions,
  } = props;

  if (!isConfigured || !isSignedIn) {
    return (
      <ReportsNotice isConfigured={isConfigured} isSignedIn={isSignedIn} />
    );
  }

  if (!household) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          공동 가계부를 연결해 주세요.
        </CardContent>
      </Card>
    );
  }

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const recurringKindById = new Map(
    recurringItems.map((item) => [item.id, item.kind]),
  );
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.type === "expense",
  );
  const incomeTransactions = transactions.filter(
    (transaction) => transaction.type === "income",
  );
  const transferTransactions = transactions.filter(
    (transaction) => transaction.type === "transfer",
  );
  const totalExpense = expenseTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const totalIncome = incomeTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const totalTransfer = transferTransactions.reduce(
    (sum, transaction) => sum + toAmount(transaction.amount),
    0,
  );
  const budgetTotal = budgets.reduce(
    (sum, budget) => sum + toAmount(budget.amount),
    0,
  );
  const remainingBudget = budgetTotal - totalExpense;
  const actualFixedExpense = expenseTransactions
    .filter(
      (transaction) =>
        recurringKindById.get(transaction.recurring_item_id ?? "") ===
        "fixed_expense",
    )
    .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0);
  const actualSubscriptionExpense = expenseTransactions
    .filter(
      (transaction) =>
        recurringKindById.get(transaction.recurring_item_id ?? "") ===
        "subscription",
    )
    .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0);
  const variableExpense =
    totalExpense - actualFixedExpense - actualSubscriptionExpense;
  const plannedFixedExpense = plannedOccurrences
    .filter((occurrence) => occurrence.kind === "fixed_expense")
    .reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const plannedSubscriptionExpense = plannedOccurrences
    .filter((occurrence) => occurrence.kind === "subscription")
    .reduce((sum, occurrence) => sum + occurrence.amount, 0);
  const upcomingTotal = plannedFixedExpense + plannedSubscriptionExpense;
  const categorySummary = groupByCategory({
    categoriesById,
    transactions,
  });
  const latestAdvice = adviceLogs[0];
  const friendlyLine = latestAdvice
    ? `함께 보면 좋아요. ${adviceLines(latestAdvice.body)[0] ?? latestAdvice.title}`
    : friendlyAdviceLine({ totalExpense, totalIncome, upcomingTotal });
  const generatedAt = formatDate(today);
  const accountSummaries = accounts.map((account) => {
    const accountTransactions = transactions.filter(
      (transaction) => transaction.account_id === account.id,
    );
    const accountPlanned = plannedOccurrences.filter(
      (occurrence) => occurrence.account_id === account.id,
    );

    return {
      account,
      expense: accountTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0),
      income: accountTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + toAmount(transaction.amount), 0),
      planned: accountPlanned.reduce(
        (sum, occurrence) => sum + occurrence.amount,
        0,
      ),
      transactionCount: accountTransactions.length,
    };
  });

  return (
    <div className="space-y-6">
      <ReportToolbar range={range} />

      {errorMessage ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {errorMessage}
          </CardContent>
        </Card>
      ) : null}

      <section className="break-inside-avoid rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <FileText className="size-4" aria-hidden="true" />
              공동 가계부 보고서
            </div>
            <h2 className="mt-3 text-2xl font-semibold">
              {household.name} 소비 보고서
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {range.label} · 만든 날 {generatedAt}
            </p>
          </div>
          <Badge className="w-fit" variant="secondary">
            거래 {transactions.length}건
          </Badge>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-md border border-primary/30 bg-primary/15 p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm leading-6">
            <span className="font-semibold">AI 소비 조언 · </span>
            <span className="text-muted-foreground">{friendlyLine}</span>
          </p>
        </div>
      </section>

      <section className="grid break-inside-avoid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "총 지출", value: formatMoney(totalExpense), helper: "쓴 금액" },
          { label: "총 수입", value: formatMoney(totalIncome), helper: "들어온 돈" },
          {
            label: "순흐름",
            value: formatMoney(totalIncome - totalExpense),
            helper: "수입에서 지출을 뺀 금액",
          },
          {
            label: "남은 예산",
            value: formatMoney(remainingBudget),
            helper: budgetTotal > 0 ? `예산 ${formatMoney(budgetTotal)}` : "예산을 정할 수 있어요",
          },
          {
            label: "고정비",
            value: formatMoney(actualFixedExpense + plannedFixedExpense),
            helper: "쓴 돈과 나갈 돈",
          },
          {
            label: "구독비",
            value: formatMoney(
              actualSubscriptionExpense + plannedSubscriptionExpense,
            ),
            helper: "쓴 돈과 나갈 돈",
          },
        ].map((metric) => (
          <Card className="break-inside-avoid" key={metric.label}>
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

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>지출 구성</CardTitle>
            <CardDescription>
              지출을 세 가지로 나눠 봐요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "변동비", value: variableExpense },
              { label: "고정비", value: actualFixedExpense + plannedFixedExpense },
              {
                label: "구독비",
                value: actualSubscriptionExpense + plannedSubscriptionExpense,
              },
            ].map((item) => {
              const percent =
                totalExpense + upcomingTotal > 0
                  ? Math.round((item.value / (totalExpense + upcomingTotal)) * 100)
                  : 0;

              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">{formatMoney(item.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>카테고리별 지출</CardTitle>
            <CardDescription>
              많이 쓴 카테고리부터 보여요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categorySummary.length > 0 ? (
              <div className="space-y-3">
                {categorySummary.slice(0, 8).map((category) => {
                  const percent =
                    totalExpense > 0
                      ? Math.round((category.amount / totalExpense) * 100)
                      : 0;

                  return (
                    <div key={category.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{category.name}</span>
                        <span className="shrink-0 font-medium">
                          {formatMoney(category.amount)} · {category.count}건
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyReportState message="카테고리 지출이 쌓이면 보여요." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="size-5" aria-hidden="true" />
              계좌별 요약
            </CardTitle>
            <CardDescription>
              계좌별로 쓴 돈과 들어온 돈을 봐요.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계좌</TableHead>
                  <TableHead>소유</TableHead>
                  <TableHead className="text-right">지출</TableHead>
                  <TableHead className="text-right">수입</TableHead>
                  <TableHead className="text-right">예정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountSummaries.length > 0 ? (
                  accountSummaries.map((summary) => (
                    <TableRow key={summary.account.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{summary.account.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {accountTypeLabels[summary.account.type]} ·{" "}
                            {summary.transactionCount}건
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {ownerTypeLabels[summary.account.owner_type]}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(summary.expense)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(summary.income)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(summary.planned)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={5}
                    >
                      계좌를 추가하면 여기에 보여요.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5" aria-hidden="true" />
              예정 결제
            </CardTitle>
            <CardDescription>
              아직 거래로 저장되지 않은 예정 결제예요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UpcomingRecurringTable
              accountsById={accountsById}
              occurrences={plannedOccurrences}
            />
          </CardContent>
        </Card>
      </section>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>최근 거래</CardTitle>
          <CardDescription>
            최근 기록 20건을 볼 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>계좌</TableHead>
                <TableHead>기록자</TableHead>
                <TableHead>입력</TableHead>
                <TableHead className="text-right">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length > 0 ? (
                transactions.slice(0, 20).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatShortDate(transaction.transaction_date)}</TableCell>
                    <TableCell>{transactionTypeLabels[transaction.type]}</TableCell>
                    <TableCell className="min-w-44">
                      <div>
                        <p className="font-medium">
                          {transactionTitle(transaction)}
                        </p>
                        {transaction.category_id ? (
                          <p className="text-xs text-muted-foreground">
                            {categoriesById.get(transaction.category_id)?.name ??
                              "미분류"}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {transaction.type === "transfer"
                        ? `${accountName(
                            accountsById,
                            transaction.account_id,
                          )} → ${accountName(
                            accountsById,
                            transaction.transfer_account_id,
                          )}`
                        : accountName(accountsById, transaction.account_id)}
                    </TableCell>
                    <TableCell>
                      {memberName(
                        transaction.user_id
                          ? membersById.get(transaction.user_id)
                          : undefined,
                      )}
                    </TableCell>
                    <TableCell>
                      {sourceLabels[transaction.source] ?? transaction.source}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(toAmount(transaction.amount))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    선택한 기간에 거래가 생기면 보여요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalTransfer > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              이체 합계 {formatMoney(totalTransfer)}는 계좌 이동이라 총 지출에서 뺐어요.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {latestAdvice ? (
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>AI 조언 원문</CardTitle>
            <CardDescription>
              최근 AI 소비 조언이에요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/25 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary">{latestAdvice.title}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(latestAdvice.created_at.slice(0, 10))}
                </span>
              </div>
              <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                {adviceLines(latestAdvice.body).map((line) => (
                  <li key={line}>- {line}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
