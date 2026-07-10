import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus } from "lucide-react";
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
  manual: "직접 입력",
  ocr: "영수증",
  recurring: "자동 생성",
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

function typeIcon(type: TransactionRow["type"]) {
  if (type === "income") {
    return ArrowDownLeft;
  }

  if (type === "transfer") {
    return ArrowLeftRight;
  }

  return ArrowUpRight;
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

export default async function TransactionsPage() {
  const context = await getCurrentUserContext();
  let transactions: TransactionRow[] = [];
  let errorMessage: string | null = null;
  const accountNames = new Map<string, string>();
  const categoryNames = new Map<string, string>();
  const memberNames = new Map<string, string>();

  if (context.isSignedIn && context.householdId) {
    const supabase = await createClient();
    const [transactionsResult, accountsResult, categoriesResult, membersResult] =
      await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id, account_id, category_id, type, source, amount, transaction_date, merchant, memo, user_id, created_at",
          )
          .eq("household_id", context.householdId)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("accounts")
          .select("id, name")
          .eq("household_id", context.householdId),
        supabase
          .from("categories")
          .select("id, name")
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
    (accountsResult.data ?? []).forEach((account) =>
      accountNames.set(account.id, account.name),
    );
    (categoriesResult.data ?? []).forEach((category) =>
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="거래"
        title="거래 내역"
        description="직접 쓴 거래와 단축어, 반복비 기록을 함께 확인해요."
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
          연결된 공동 가계부가 없어요. 관리자에게 구성원 연결을 확인해 달라고 해주세요.
        </section>
      ) : errorMessage ? (
        <section className="rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
          거래 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </section>
      ) : transactions.length === 0 ? (
        <section className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-card px-6 text-center">
          <div>
            <p className="font-semibold">아직 기록한 거래가 없어요</p>
            <p className="mt-2 text-sm text-muted-foreground">
              첫 거래를 쓰면 날짜순으로 여기에 모여요.
            </p>
            <Button asChild className="mt-4">
              <Link href="/m/new">첫 거래 쓰기</Link>
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-2 md:hidden">
            {transactions.map((transaction) => {
              const Icon = typeIcon(transaction.type);

              return (
                <article
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm"
                  key={transaction.id}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {transaction.merchant ||
                            categoryNames.get(transaction.category_id ?? "") ||
                            typeLabels[transaction.type]}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {displayDate(transaction.transaction_date)} · {accountNames.get(transaction.account_id) ?? "계좌"}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "shrink-0 text-sm font-bold tabular-nums",
                          transaction.type === "expense" && "text-destructive",
                          transaction.type === "income" && "text-primary",
                        )}
                      >
                        {displayAmount(transaction)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {sourceLabels[transaction.source] ?? "기타"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {transaction.user_id
                          ? memberNames.get(transaction.user_id) ?? "멤버"
                          : "자동 기록"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{displayDate(transaction.transaction_date)}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">
                      {transaction.merchant || transaction.memo || typeLabels[transaction.type]}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <p className="text-xs text-muted-foreground">
            최근 거래 {transactions.length.toLocaleString("ko-KR")}건을 보여드려요.
          </p>
        </>
      )}
    </div>
  );
}
