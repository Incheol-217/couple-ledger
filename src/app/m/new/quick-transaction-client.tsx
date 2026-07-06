"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  Check,
  CircleDollarSign,
  CreditCard,
  ReceiptText,
  RotateCcw,
  Save,
  WalletCards,
} from "lucide-react";
import {
  createQuickTransactionAction,
  type QuickTransactionActionResult,
} from "./actions";
import {
  transactionTypeLabels,
  transactionTypes,
  type CategoryRow,
  type QuickEntryData,
  type TransactionType,
} from "./types";
import { accountTypeLabels, type AccountRow } from "@/app/accounts/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function nowParts() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function toLocalIso(date: string, time: string) {
  const value = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function quickAccounts(accounts: AccountRow[], recentAccountIds: string[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const recent = recentAccountIds
    .map((id) => byId.get(id))
    .filter((account): account is AccountRow => Boolean(account));

  return uniqueById([...recent, ...accounts]).slice(0, 5);
}

function quickCategories(
  categories: CategoryRow[],
  recentCategoryIds: string[],
  type: TransactionType,
) {
  const filtered = categories.filter((category) => category.type === type);
  const byId = new Map(filtered.map((category) => [category.id, category]));
  const recent = recentCategoryIds
    .map((id) => byId.get(id))
    .filter((category): category is CategoryRow => Boolean(category));

  return uniqueById([...recent, ...filtered]).slice(0, 6);
}

function formatAmountInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function ResultMessage({ result }: { result: QuickTransactionActionResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        result.ok
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      {result.message}
    </div>
  );
}

function OptionChip({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:border-primary/40",
        disabled && "cursor-not-allowed opacity-45 hover:border-border",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
      {active ? <Check className="size-4" aria-hidden="true" /> : null}
    </button>
  );
}

export function QuickTransactionClient({
  accounts,
  categories,
  errorMessage,
  household,
  isConfigured,
  isSignedIn,
  recentAccountIds,
  recentCategoryIds,
}: QuickEntryData) {
  const activeAccounts = accounts.filter((account) => account.is_active);
  const initialType: TransactionType = "expense";
  const initialQuickAccounts = quickAccounts(activeAccounts, recentAccountIds);
  const initialQuickCategories = quickCategories(
    categories,
    recentCategoryIds,
    initialType,
  );
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>(initialType);
  const [accountId, setAccountId] = useState(initialQuickAccounts[0]?.id ?? "");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState(
    initialQuickCategories[0]?.id ?? "",
  );
  const [merchant, setMerchant] = useState("");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(nowParts().date);
  const [time, setTime] = useState(nowParts().time);
  const [result, setResult] = useState<QuickTransactionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );
  const visibleQuickAccounts = useMemo(
    () => quickAccounts(activeAccounts, recentAccountIds),
    [activeAccounts, recentAccountIds],
  );
  const visibleQuickCategories = useMemo(
    () => quickCategories(categories, recentCategoryIds, type),
    [categories, recentCategoryIds, type],
  );
  const selectableTransferAccounts = activeAccounts.filter(
    (account) => account.id !== accountId,
  );
  const selectedAccount = activeAccounts.find((account) => account.id === accountId);

  function resetForm() {
    const nextNow = nowParts();
    const nextQuickCategories = quickCategories(
      categories,
      recentCategoryIds,
      "expense",
    );

    setAmount("");
    setType("expense");
    setAccountId(visibleQuickAccounts[0]?.id ?? "");
    setTransferAccountId("");
    setCategoryId(nextQuickCategories[0]?.id ?? "");
    setMerchant("");
    setMemo("");
    setDate(nextNow.date);
    setTime(nextNow.time);
  }

  function changeType(nextType: TransactionType) {
    const nextCategories = quickCategories(
      categories,
      recentCategoryIds,
      nextType,
    );

    setType(nextType);
    setCategoryId(nextCategories[0]?.id ?? "");
    if (nextType !== "transfer") {
      setTransferAccountId("");
    }
  }

  function submit(formData: FormData) {
    formData.set("amount", amount);
    formData.set("type", type);
    formData.set("account_id", accountId);
    formData.set("category_id", categoryId);
    formData.set("transfer_account_id", transferAccountId);
    formData.set("merchant", merchant);
    formData.set("memo", memo);
    formData.set("transaction_date", date);
    formData.set("transaction_time", time);
    formData.set("occurred_at", toLocalIso(date, time));

    setResult(null);
    startTransition(async () => {
      const actionResult = await createQuickTransactionAction(formData);
      setResult(actionResult);

      if (actionResult.ok) {
        resetForm();
      }
    });
  }

  if (!isConfigured) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="font-medium">Supabase 설정 필요</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          `.env.local`에 Supabase URL과 anon key를 채우면 모바일 입력을
          사용할 수 있습니다.
        </p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="font-medium">로그인이 필요합니다</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          거래는 household 멤버에게만 저장됩니다.
        </p>
      </div>
    );
  }

  if (!household) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="font-medium">공동 가계부가 없습니다</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          household와 멤버 연결이 완료되면 거래를 입력할 수 있습니다.
        </p>
      </div>
    );
  }

  if (activeAccounts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="font-medium">활성 계좌가 없습니다</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          `/accounts`에서 생활비 통장이나 결제수단을 먼저 추가해 주세요.
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-5">
      <input name="household_id" type="hidden" value={household.id} />
      <input name="amount" type="hidden" value={amount} />
      <input name="type" type="hidden" value={type} />
      <input name="account_id" type="hidden" value={accountId} />
      <input name="category_id" type="hidden" value={categoryId} />
      <input name="transfer_account_id" type="hidden" value={transferAccountId} />
      <input name="occurred_at" type="hidden" value={toLocalIso(date, time)} />

      {errorMessage ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <ResultMessage result={result} />

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <Label className="text-muted-foreground" htmlFor="quick-amount">
          금액
        </Label>
        <div className="mt-3 flex items-center gap-2">
          <input
            autoComplete="off"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-5xl font-semibold leading-none outline-none placeholder:text-muted-foreground/35"
            enterKeyHint="next"
            id="quick-amount"
            inputMode="numeric"
            name="amount_display"
            onChange={(event) => setAmount(formatAmountInput(event.target.value))}
            pattern="[0-9]*"
            placeholder="0"
            type="text"
            value={amount}
          />
          <span className="text-lg text-muted-foreground">원</span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">거래 타입</p>
          <Badge variant="secondary">{household.name}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {transactionTypes.map((transactionType) => (
            <OptionChip
              active={type === transactionType}
              key={transactionType}
              onClick={() => changeType(transactionType)}
            >
              {transactionType === "transfer" ? (
                <ArrowRightLeft className="size-4" aria-hidden="true" />
              ) : (
                <CircleDollarSign className="size-4" aria-hidden="true" />
              )}
              {transactionTypeLabels[transactionType]}
            </OptionChip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">
            {type === "transfer" ? "출금 계좌" : "계좌 또는 결제수단"}
          </p>
        </div>
        <div className="grid gap-2">
          {visibleQuickAccounts.map((account) => (
            <OptionChip
              active={accountId === account.id}
              key={account.id}
              onClick={() => {
                setAccountId(account.id);
                if (transferAccountId === account.id) {
                  setTransferAccountId("");
                }
              }}
            >
              <CreditCard className="size-4" aria-hidden="true" />
              <span className="truncate">
                {account.name} · {accountTypeLabels[account.type]}
              </span>
            </OptionChip>
          ))}
        </div>
        <Select
          aria-label="계좌 전체 목록"
          onChange={(event) => setAccountId(event.target.value)}
          value={accountId}
        >
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {accountTypeLabels[account.type]}
            </option>
          ))}
        </Select>
      </section>

      {type === "transfer" ? (
        <section className="space-y-2">
          <Label htmlFor="transfer-account">입금 계좌</Label>
          <Select
            id="transfer-account"
            name="transfer_account_display"
            onChange={(event) => setTransferAccountId(event.target.value)}
            value={transferAccountId}
          >
            <option value="">선택 안 함</option>
            {selectableTransferAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {accountTypeLabels[account.type]}
              </option>
            ))}
          </Select>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">카테고리</p>
        </div>
        {visibleQuickCategories.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {visibleQuickCategories.map((category) => (
              <OptionChip
                active={categoryId === category.id}
                key={category.id}
                onClick={() => setCategoryId(category.id)}
              >
                <span className="truncate">{category.name}</span>
              </OptionChip>
            ))}
          </div>
        ) : (
          <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            선택 가능한 카테고리가 없습니다.
          </div>
        )}
        <Select
          aria-label="카테고리 전체 목록"
          onChange={(event) => setCategoryId(event.target.value)}
          value={categoryId}
        >
          <option value="">카테고리 없음</option>
          {visibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="merchant">사용처</Label>
          <Input
            autoComplete="off"
            enterKeyHint="next"
            id="merchant"
            name="merchant_display"
            onChange={(event) => setMerchant(event.target.value)}
            placeholder={selectedAccount ? `${selectedAccount.name} 결제` : "쿠팡"}
            type="text"
            value={merchant}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Textarea
            id="memo"
            name="memo_display"
            onChange={(event) => setMemo(event.target.value)}
            placeholder="간단한 메모"
            rows={3}
            value={memo}
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">날짜와 시간</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="transaction-date">날짜</Label>
            <Input
              id="transaction-date"
              name="transaction_date"
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transaction-time">시간</Label>
            <Input
              id="transaction-time"
              name="transaction_time"
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
          </div>
        </div>
      </section>

      <div className="sticky bottom-16 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-0">
        <div className="mx-auto grid max-w-md grid-cols-[auto_1fr] gap-2">
          <Button
            disabled={isPending}
            onClick={() => {
              resetForm();
              setResult(null);
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className="sr-only">초기화</span>
          </Button>
          <Button
            className="h-11 text-base"
            disabled={isPending || !amount || !accountId}
            type="submit"
          >
            <Save className="size-4" aria-hidden="true" />
            {isPending ? "저장 중" : "저장"}
          </Button>
        </div>
      </div>
    </form>
  );
}
