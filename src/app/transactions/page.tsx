import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { markTransactionReviewedAction } from "./actions";
import {
  ManageTransaction,
  type ManageCategoryOption,
  type ManageOption,
} from "./manage-transaction";
import { TransactionSwipeCard } from "./transaction-swipe-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUserContext } from "@/lib/auth/session";
import { formatWon } from "@/lib/formatters/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type TransactionRow = {
  account_id: string;
  amount: number | string;
  category_id: string | null;
  created_at: string;
  id: string;
  merchant: string | null;
  memo: string | null;
  review_reason: string | null;
  review_status: "none" | "needs_review" | "reviewed";
  reviewed_at: string | null;
  reviewed_by: string | null;
  source: "manual" | "shortcut" | "recurring" | "csv" | "ocr" | "api";
  transaction_date: string;
  type: "expense" | "income" | "transfer";
  user_id: string | null;
};

const typeLabels = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
} as const;

const sourceLabels: Record<TransactionRow["source"], string> = {
  api: "API",
  csv: "CSV",
  manual: "직접",
  ocr: "영수증",
  recurring: "자동",
  shortcut: "단축어",
};

function displayDate(value: string) {
  return value.replaceAll("-", ".");
}

function displayAmount(transaction: TransactionRow) {
  const amount = Number(transaction.amount);

  if (transaction.type === "expense") {
    return `-${formatWon(amount)}`;
  }

  if (transaction.type === "income") {
    return `+${formatWon(amount)}`;
  }

  return formatWon(amount);
}

function memberFallback(
  member:
    | { member_label: "husband" | "wife" | null; role: "owner" | "member" }
    | undefined,
) {
  if (member?.role === "owner") return "관리자";
  if (member?.member_label === "husband") return "남편";
  if (member?.member_label === "wife") return "아내";
  return "멤버";
}

const PERIODS = ["day", "week", "month"] as const;
type Period = (typeof PERIODS)[number];
const periodLabels: Record<Period, string> = { day: "일", week: "주", month: "월" };

function todayKST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

// 선택한 기간(일/주/월)의 시작·끝 날짜를 구해요. 주는 일요일 시작.
function periodRange(period: Period, anchor: string) {
  const a = parseYmd(anchor);

  if (period === "day") {
    return { start: anchor, end: anchor };
  }

  if (period === "week") {
    // getUTCDay: 0=일 … 6=토. 일요일까지 되돌아가 한 주(일~토)를 잡아요.
    const start = addDays(a, -a.getUTCDay());
    return { start: toYmd(start), end: toYmd(addDays(start, 6)) };
  }

  const start = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  const end = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
  return { start: toYmd(start), end: toYmd(end) };
}

function shiftAnchor(period: Period, anchor: string, dir: 1 | -1) {
  const a = parseYmd(anchor);
  if (period === "day") return toYmd(addDays(a, dir));
  if (period === "week") return toYmd(addDays(a, dir * 7));
  return toYmd(addMonths(a, dir));
}

function periodTitle(period: Period, range: { start: string; end: string }) {
  const [sy, sm, sd] = range.start.split("-").map(Number);
  if (period === "day") return `${sy}. ${sm}. ${sd}`;
  if (period === "week") {
    const [, em, ed] = range.end.split("-").map(Number);
    return `${sm}.${sd} ~ ${em}.${ed}`;
  }
  return `${sy}년 ${sm}월`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const periodParam = firstParam(params.period);
  const period: Period = PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "month";
  const dateParam = firstParam(params.date);
  const anchor =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKST();
  const range = periodRange(period, anchor);

  const context = await getCurrentUserContext();
  let transactions: TransactionRow[] = [];
  let errorMessage: string | null = null;
  const accountNames = new Map<string, string>();
  const categoryNames = new Map<string, string>();
  const memberNames = new Map<string, string>();
  let accountOptions: ManageOption[] = [];
  let categoryOptions: ManageCategoryOption[] = [];

  if (context.isSignedIn && context.householdId) {
    const supabase = await createClient();
    const [transactionsResult, accountsResult, categoriesResult, membersResult] =
      await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id, account_id, category_id, type, source, amount, transaction_date, merchant, memo, user_id, review_status, review_reason, reviewed_by, reviewed_at, created_at",
          )
          .eq("household_id", context.householdId)
          .gte("transaction_date", range.start)
          .lte("transaction_date", range.end)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("accounts")
          .select("id, name")
          .eq("household_id", context.householdId),
        supabase
          .from("categories")
          .select("id, name, type")
          .eq("household_id", context.householdId),
        supabase
          .from("household_members")
          .select("user_id, role, member_label")
          .eq("household_id", context.householdId),
      ]);

    const memberRows = (membersResult.data ?? []) as Array<{
      member_label: "husband" | "wife" | null;
      role: "owner" | "member";
      user_id: string;
    }>;
    const profileIds = memberRows.map((member) => member.user_id);
    const profilesResult =
      profileIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", profileIds)
        : { data: [], error: null };
    const profiles = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.id as string,
        profile.display_name as string | null,
      ]),
    );

    transactions = (transactionsResult.data ?? []) as TransactionRow[];
    accountOptions = (accountsResult.data ?? []) as ManageOption[];
    categoryOptions = (categoriesResult.data ?? []) as ManageCategoryOption[];
    accountOptions.forEach((account) =>
      accountNames.set(account.id, account.name),
    );
    categoryOptions.forEach((category) =>
      categoryNames.set(category.id, category.name),
    );
    memberRows.forEach((member) =>
      memberNames.set(
        member.user_id,
        profiles.get(member.user_id) ?? memberFallback(member),
      ),
    );
    errorMessage =
      transactionsResult.error?.message ??
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      membersResult.error?.message ??
      profilesResult.error?.message ??
      null;
  }
  const reviewNeededTransactions = transactions.filter(
    (transaction) => transaction.review_status === "needs_review",
  );
  const periodIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const periodExpense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const prevAnchor = shiftAnchor(period, anchor, -1);
  const nextAnchor = shiftAnchor(period, anchor, 1);
  const periodHeading = periodTitle(period, range);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="거래"
        title="거래 내역"
        description="직접 쓴 내역, 단축어 내역, 자동 기록을 함께 봐요."
        action={
          <Button asChild>
            <Link href="/m/new">
              <Plus className="size-4" aria-hidden="true" />
              거래 쓰기
            </Link>
          </Button>
        }
      />

      {!context.isConfigured ? (
        <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Supabase 환경변수를 넣으면 거래 내역을 볼 수 있어요.
        </section>
      ) : !context.isSignedIn ? (
        <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          <p>로그인하면 함께 기록한 거래를 볼 수 있어요.</p>
          <Button asChild className="mt-4">
            <Link href="/login?next=/transactions">로그인</Link>
          </Button>
        </section>
      ) : !context.householdId ? (
        <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          공동 가계부 연결이 필요해요. 관리자에게 멤버 연결을 확인해 달라고 해주세요.
        </section>
      ) : errorMessage ? (
        <section className="rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
          거래 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </section>
      ) : (
        <>
          <section className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full overflow-hidden rounded-md border sm:w-auto">
                {PERIODS.map((option) => (
                  <Button
                    asChild
                    className={cn(
                      "flex-1 rounded-none sm:flex-none",
                      period === option
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "hover:bg-muted/60",
                    )}
                    key={option}
                    size="sm"
                    variant="ghost"
                  >
                    <Link href={`/transactions?period=${option}&date=${anchor}`}>
                      {periodLabels[option]}
                    </Link>
                  </Button>
                ))}
              </div>

              <div className="flex items-center justify-center gap-1">
                <Button asChild size="icon" variant="ghost">
                  <Link
                    aria-label="이전 기간"
                    href={`/transactions?period=${period}&date=${prevAnchor}`}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <span className="min-w-28 text-center text-sm font-semibold tabular-nums">
                  {periodHeading}
                </span>
                <Button asChild size="icon" variant="ghost">
                  <Link
                    aria-label="다음 기간"
                    href={`/transactions?period=${period}&date=${nextAnchor}`}
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm sm:justify-end">
                <span className="text-muted-foreground">
                  수입{" "}
                  <span className="font-semibold tabular-nums text-primary">
                    +{formatWon(periodIncome)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  지출{" "}
                  <span className="font-semibold tabular-nums text-destructive">
                    -{formatWon(periodExpense)}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {transactions.length === 0 ? (
            <section className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-card px-6 text-center">
              <div>
                <p className="font-semibold">이 기간엔 거래가 없어요</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  위에서 일/주/월을 바꾸거나 이전·다음으로 이동해 보세요.
                </p>
              </div>
            </section>
          ) : (
            <>
          {reviewNeededTransactions.length > 0 ? (
            <section className="rounded-lg border border-primary/30 bg-primary/10 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                    <AlertTriangle className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-semibold">확인 필요한 거래</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      큰 금액, 영수증 인식, 카테고리 미확인 거래를 함께 확인해요.
                    </p>
                  </div>
                </div>
                <Badge className="w-fit" variant="secondary">
                  {reviewNeededTransactions.length.toLocaleString("ko-KR")}건
                </Badge>
              </div>

              <div className="mt-4 grid gap-2">
                {reviewNeededTransactions.slice(0, 5).map((transaction) => (
                  <div
                    className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    key={`review-${transaction.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {transaction.merchant ||
                            categoryNames.get(transaction.category_id ?? "") ||
                            typeLabels[transaction.type]}
                        </p>
                        <Badge variant="outline">확인 필요</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {displayDate(transaction.transaction_date)} ·{" "}
                        {accountNames.get(transaction.account_id) ?? "계좌"} ·{" "}
                        {displayAmount(transaction)}
                      </p>
                      {transaction.review_reason ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {transaction.review_reason}
                        </p>
                      ) : null}
                    </div>
                    <form action={markTransactionReviewedAction}>
                      <input
                        name="household_id"
                        type="hidden"
                        value={context.householdId ?? ""}
                      />
                      <input
                        name="transaction_id"
                        type="hidden"
                        value={transaction.id}
                      />
                      <Button className="w-full sm:w-auto" size="sm" type="submit">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        확인 완료
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid gap-2 md:hidden">
            <p className="px-1 text-xs text-muted-foreground">
              왼쪽으로 밀면 수정·삭제할 수 있어요.
            </p>
            {transactions.map((transaction) => (
              <TransactionSwipeCard
                accounts={accountOptions}
                categories={categoryOptions}
                data={{
                  transaction: {
                    id: transaction.id,
                    type: transaction.type,
                    amount: Number(transaction.amount) || 0,
                    transaction_date: transaction.transaction_date,
                    account_id: transaction.account_id,
                    category_id: transaction.category_id,
                    merchant: transaction.merchant,
                    memo: transaction.memo,
                  },
                  title:
                    transaction.merchant ||
                    categoryNames.get(transaction.category_id ?? "") ||
                    typeLabels[transaction.type],
                  subtitle: `${displayDate(transaction.transaction_date)} · ${accountNames.get(transaction.account_id) ?? "계좌"}`,
                  amountText: displayAmount(transaction),
                  sourceLabel: sourceLabels[transaction.source] ?? "기타",
                  reviewStatus: transaction.review_status,
                  memberLabel: transaction.user_id
                    ? (memberNames.get(transaction.user_id) ?? "멤버")
                    : "자동 기록",
                }}
                householdId={context.householdId ?? ""}
                key={transaction.id}
              />
            ))}
          </section>

          <section className="hidden overflow-hidden rounded-lg border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead>계좌</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>작성자</TableHead>
                  <TableHead>입력</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{displayDate(transaction.transaction_date)}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">
                      <span>
                        {transaction.merchant || transaction.memo || typeLabels[transaction.type]}
                      </span>
                      {transaction.review_status === "needs_review" ? (
                        <Badge className="ml-2" variant="outline">
                          확인 필요
                        </Badge>
                      ) : transaction.review_status === "reviewed" ? (
                        <Badge className="ml-2" variant="outline">
                          확인 완료
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {accountNames.get(transaction.account_id) ?? "-"}
                    </TableCell>
                    <TableCell>
                      {categoryNames.get(transaction.category_id ?? "") ?? "-"}
                    </TableCell>
                    <TableCell>
                      {transaction.user_id
                        ? memberNames.get(transaction.user_id) ?? "멤버"
                        : "자동 기록"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {sourceLabels[transaction.source] ?? "기타"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-bold tabular-nums",
                        transaction.type === "expense" && "text-destructive",
                        transaction.type === "income" && "text-primary",
                      )}
                    >
                      {displayAmount(transaction)}
                    </TableCell>
                    <TableCell>
                      <ManageTransaction
                        accounts={accountOptions}
                        categories={categoryOptions}
                        householdId={context.householdId ?? ""}
                        transaction={{
                          id: transaction.id,
                          type: transaction.type,
                          amount: Number(transaction.amount) || 0,
                          transaction_date: transaction.transaction_date,
                          account_id: transaction.account_id,
                          category_id: transaction.category_id,
                          merchant: transaction.merchant,
                          memo: transaction.memo,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <p className="text-xs text-muted-foreground">
            이 기간 거래 {transactions.length.toLocaleString("ko-KR")}건이에요.
          </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
