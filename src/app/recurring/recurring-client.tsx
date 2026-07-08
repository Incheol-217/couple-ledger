"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Bell,
  CalendarClock,
  Check,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import {
  createRecurringItemAction,
  updateRecurringItemAction,
  updateRecurringStatusAction,
  type RecurringActionResult,
} from "./actions";
import {
  billingCycleLabels,
  billingCycles,
  recurringKindLabels,
  recurringKinds,
  recurringStatusLabels,
  recurringStatuses,
  type BillingCycle,
  type RecurringItemRow,
  type RecurringKind,
  type RecurringPageData,
  type RecurringStatus,
} from "./types";
import { accountTypeLabels } from "@/app/accounts/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatAmountInput } from "@/lib/formatters/money";
import { cn } from "@/lib/utils";

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "KRW",
});

function toAmount(value: RecurringItemRow["amount"]) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

function todayString() {
  const now = new Date();
  return toDateString(now);
}

function toDateString(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function endOfMonthString() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function dueDistance(nextDueDate: string) {
  const today = new Date(`${todayString()}T00:00:00`);
  const due = new Date(`${nextDueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function dueLabel(nextDueDate: string) {
  const distance = dueDistance(nextDueDate);

  if (distance < 0) {
    return `${Math.abs(distance)}일 지남`;
  }

  if (distance === 0) {
    return "오늘 결제";
  }

  return `${distance}일 남음`;
}

function monthlyEquivalent(item: RecurringItemRow) {
  const amount = toAmount(item.amount);
  const interval = Math.max(1, Number(item.billing_interval) || 1);

  switch (item.billing_cycle) {
    case "monthly":
      return amount / interval;
    case "yearly":
      return amount / (12 * interval);
    case "weekly":
      return (amount * 52) / (12 * interval);
    case "custom":
      return amount;
  }
}

function summarize(items: RecurringItemRow[]) {
  const active = items.filter((item) => item.status === "active");
  const today = todayString();
  const monthEnd = endOfMonthString();
  const nextWeek = toDateString(addDays(new Date(`${today}T00:00:00`), 7));
  const subscriptions = active.filter((item) => item.kind === "subscription");
  const fixedExpenses = active.filter((item) => item.kind === "fixed_expense");
  const monthlySubscriptionTotal = subscriptions.reduce(
    (sum, item) => sum + monthlyEquivalent(item),
    0,
  );
  const monthlyFixedTotal = fixedExpenses.reduce(
    (sum, item) => sum + monthlyEquivalent(item),
    0,
  );
  const remainingThisMonth = active
    .filter((item) => item.next_due_date >= today && item.next_due_date <= monthEnd)
    .reduce((sum, item) => sum + toAmount(item.amount), 0);
  const nextSevenDays = active.filter(
    (item) => item.next_due_date >= today && item.next_due_date <= nextWeek,
  );

  return {
    annualSubscriptionTotal: monthlySubscriptionTotal * 12,
    monthlyFixedTotal,
    monthlySubscriptionTotal,
    nextSevenDays,
    remainingThisMonth,
  };
}

function resultClassName(result: RecurringActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function statusVariant(status: RecurringStatus) {
  if (status === "active") {
    return "default" as const;
  }

  if (status === "paused") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function getItemAccountName(accounts: RecurringPageData["accounts"], id: string) {
  const account = accounts.find((candidate) => candidate.id === id);
  return account ? `${account.name} · ${accountTypeLabels[account.type]}` : "-";
}

function getItemCategoryName(
  categories: RecurringPageData["categories"],
  id: string | null,
) {
  if (!id) {
    return "-";
  }

  return categories.find((category) => category.id === id)?.name ?? "-";
}

function getPayerName(members: RecurringPageData["members"], id: string | null) {
  if (!id) {
    return "-";
  }

  return members.find((member) => member.user_id === id)?.label ?? "-";
}

function kindAccent(kind: RecurringKind) {
  return kind === "subscription"
    ? "border-l-chart-2"
    : "border-l-chart-3";
}

function RecurringForm({
  accounts,
  categories,
  householdId,
  initialKind,
  item,
  members,
  mode,
  onDone,
}: {
  accounts: RecurringPageData["accounts"];
  categories: RecurringPageData["categories"];
  householdId: string;
  initialKind: RecurringKind;
  item: RecurringItemRow | null;
  members: RecurringPageData["members"];
  mode: "create" | "edit";
  onDone: (result?: RecurringActionResult) => void;
}) {
  const [kind, setKind] = useState<RecurringKind>(item?.kind ?? initialKind);
  const [cycle, setCycle] = useState<BillingCycle>(
    item?.billing_cycle ?? "monthly",
  );
  const [status, setStatus] = useState<RecurringStatus>(item?.status ?? "active");
  const [autoCreate, setAutoCreate] = useState(
    item?.auto_create_transaction ?? true,
  );
  const [result, setResult] = useState<RecurringActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = todayString();

  function submit(formData: FormData) {
    formData.set("kind", kind);
    formData.set("billing_cycle", cycle);
    formData.set("status", status);

    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createRecurringItemAction(formData)
          : await updateRecurringItemAction(formData);

      setResult(actionResult);

      if (actionResult.ok) {
        onDone(actionResult);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create" ? "반복비 추가하기" : "반복비 고치기"}
        </CardTitle>
        <CardDescription>
          다음 결제일과 결제 계좌를 정해요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {item ? (
            <input name="recurring_item_id" type="hidden" value={item.id} />
          ) : null}

          <div className={cn("rounded-md border px-3 py-2 text-sm", resultClassName(result))}>
            {result?.message}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recurring-name">이름</Label>
              <Input
                autoComplete="off"
                defaultValue={item?.name ?? ""}
                id="recurring-name"
                name="name"
                placeholder="넷플릭스, 월세"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-kind">종류</Label>
              <Select
                id="recurring-kind"
                name="kind"
                onChange={(event) => setKind(event.target.value as RecurringKind)}
                value={kind}
              >
                {recurringKinds.map((nextKind) => (
                  <option key={nextKind} value={nextKind}>
                    {recurringKindLabels[nextKind]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-amount">금액</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  item ? formatAmountInput(String(Math.round(toAmount(item.amount)))) : ""
                }
                id="recurring-amount"
                inputMode="numeric"
                name="amount"
                onInput={formatAmountField}
                placeholder="12,900"
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-cycle">결제 주기</Label>
              <Select
                id="recurring-cycle"
                name="billing_cycle"
                onChange={(event) =>
                  setCycle(event.target.value as BillingCycle)
                }
                value={cycle}
              >
                {billingCycles.map((billingCycle) => (
                  <option key={billingCycle} value={billingCycle}>
                    {billingCycleLabels[billingCycle]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing-day">결제일</Label>
              <Input
                defaultValue={item?.billing_day ?? ""}
                id="billing-day"
                inputMode="numeric"
                max={31}
                min={1}
                name="billing_day"
                placeholder="25"
                type="number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="next-due-date">다음 결제일</Label>
              <Input
                defaultValue={item?.next_due_date ?? today}
                id="next-due-date"
                name="next_due_date"
                required
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-account">결제 계좌</Label>
              <Select
                defaultValue={item?.account_id ?? accounts[0]?.id ?? ""}
                id="recurring-account"
                name="account_id"
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabels[account.type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-category">카테고리</Label>
              <Select
                defaultValue={item?.category_id ?? ""}
                id="recurring-category"
                name="category_id"
              >
                <option value="">선택하지 않기</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-payer">결제 담당자</Label>
              <Select
                defaultValue={item?.payer_user_id ?? ""}
                id="recurring-payer"
                name="payer_user_id"
              >
                <option value="">선택하지 않기</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-status">상태</Label>
              <Select
                id="recurring-status"
                name="status"
                onChange={(event) =>
                  setStatus(event.target.value as RecurringStatus)
                }
                value={status}
              >
                {recurringStatuses.map((nextStatus) => (
                  <option key={nextStatus} value={nextStatus}>
                    {recurringStatusLabels[nextStatus]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminder-days">며칠 전에 알려줄까요?</Label>
              <Input
                defaultValue={item?.reminder_days_before ?? 3}
                id="reminder-days"
                inputMode="numeric"
                min={0}
                name="reminder_days_before"
                type="number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recurring-merchant">사용처</Label>
              <Input
                autoComplete="off"
                defaultValue={item?.merchant ?? ""}
                id="recurring-merchant"
                name="merchant"
                placeholder="Netflix, 집주인"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <input
              checked={autoCreate}
              className="mt-1 size-4 accent-[var(--primary)]"
              name="auto_create_transaction"
              onChange={(event) => setAutoCreate(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="font-medium">결제일에 거래로 저장하기</span>
              <span className="mt-1 block text-muted-foreground">
                켜두면 결제일에 반복 거래를 자동으로 만들어요.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="recurring-memo">메모</Label>
            <Textarea
              defaultValue={item?.memo ?? ""}
              id="recurring-memo"
              name="memo"
              placeholder="청구일, 확인할 점, 계약 조건"
              rows={3}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => onDone()} type="button" variant="outline">
              닫기
            </Button>
            <Button disabled={isPending} type="submit">
              <Save className="size-4" aria-hidden="true" />
              {isPending ? "저장하고 있어요" : "저장하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusActionButton({
  householdId,
  item,
  status,
  onResult,
}: {
  householdId: string;
  item: RecurringItemRow;
  status: RecurringStatus;
  onResult: (result: RecurringActionResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await updateRecurringStatusAction(formData);
          onResult(result);
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="recurring_item_id" type="hidden" value={item.id} />
      <input name="status" type="hidden" value={status} />
      <Button
        disabled={isPending || item.status === status}
        size="sm"
        type="submit"
        variant="outline"
      >
        {status === "paused" ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : status === "canceled" ? (
          <XCircle className="size-4" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
        {status === "paused" ? "멈추기" : status === "canceled" ? "취소하기" : "다시 켜기"}
      </Button>
    </form>
  );
}

export function RecurringClient({
  accounts,
  categories,
  errorMessage,
  household,
  isConfigured,
  isSignedIn,
  members,
  recurringItems,
}: RecurringPageData) {
  const [activeTab, setActiveTab] = useState<RecurringKind>("subscription");
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<RecurringItemRow | null>(null);
  const [result, setResult] = useState<RecurringActionResult | null>(null);
  const summary = useMemo(() => summarize(recurringItems), [recurringItems]);
  const filteredItems = recurringItems.filter((item) => item.kind === activeTab);

  function openCreate(kind: RecurringKind) {
    setActiveTab(kind);
    setSelectedItem(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(item: RecurringItemRow) {
    setSelectedItem(item);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: RecurringActionResult) {
    setMode(null);
    setSelectedItem(null);
    if (nextResult) {
      setResult(nextResult);
    }
  }

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supabase 설정을 확인해 주세요</CardTitle>
          <CardDescription>
            `.env.local`에 Supabase URL과 anon key를 넣으면 반복비를 볼 수 있어요.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>로그인해 주세요</CardTitle>
          <CardDescription>
            로그인하면 함께 쓰는 반복비만 보여요.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!household) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>공동 가계부를 연결해 주세요</CardTitle>
          <CardDescription>
            멤버 연결을 마치면 반복비를 추가할 수 있어요.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>결제 계좌를 먼저 추가해 주세요</CardTitle>
          <CardDescription>
            계좌나 카드를 추가하면 반복비를 등록할 수 있어요.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage || result ? (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            errorMessage
              ? "border-destructive/20 bg-destructive/10 text-destructive"
              : resultClassName(result),
          )}
        >
          {errorMessage ?? result?.message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">월 구독비</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.monthlySubscriptionTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">월 고정비</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.monthlyFixedTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">연간 구독비 환산</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.annualSubscriptionTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">이번 달 남은 예정</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.remainingThisMonth)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">다음 7일</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.nextSevenDays.length}건
            </p>
          </CardContent>
        </Card>
      </section>

      {summary.nextSevenDays.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>다음 7일 결제 예정</CardTitle>
            <CardDescription>
              곧 결제될 항목이에요.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.nextSevenDays.map((item) => (
              <div
                className="rounded-md border bg-muted/30 px-3 py-3 text-sm"
                key={item.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="secondary">{dueLabel(item.next_due_date)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {formatMoney(toAmount(item.amount))} · {item.next_due_date}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            결제일 기준으로 구독비와 고정비를 정리해요.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => openCreate(activeTab)}
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />
          추가하기
        </Button>
      </div>

      {mode ? (
        <RecurringForm
          accounts={accounts}
          categories={categories}
          householdId={household.id}
          initialKind={activeTab}
          item={selectedItem}
          members={members}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="space-y-4">
        <div
          aria-label="반복 항목 종류"
          className="grid grid-cols-2 rounded-lg border bg-muted p-1"
          role="tablist"
        >
          {recurringKinds.map((kind) => (
            <button
              aria-selected={activeTab === kind}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition",
                activeTab === kind
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={kind}
              onClick={() => setActiveTab(kind)}
              role="tab"
              type="button"
            >
              {recurringKindLabels[kind]}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const distance = dueDistance(item.next_due_date);
              const isNear = item.status === "active" && distance >= 0 && distance <= 7;
              const isOverdue = item.status === "active" && distance < 0;

              return (
                <Card
                  className={cn(
                    "border-l-4",
                    kindAccent(item.kind),
                    isNear && "ring-2 ring-chart-3/30",
                    isOverdue && "ring-2 ring-destructive/30",
                    item.status !== "active" && "opacity-70",
                  )}
                  key={item.id}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate">{item.name}</CardTitle>
                        <CardDescription className="mt-2">
                          {item.merchant ?? recurringKindLabels[item.kind]}
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge variant={statusVariant(item.status)}>
                          {recurringStatusLabels[item.status]}
                        </Badge>
                        {(isNear || isOverdue) && (
                          <Badge variant={isOverdue ? "outline" : "secondary"}>
                            <AlertCircle className="mr-1 size-3" aria-hidden="true" />
                            {dueLabel(item.next_due_date)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <p className="text-2xl font-semibold">
                        {formatMoney(toAmount(item.amount))}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {billingCycleLabels[item.billing_cycle]}
                        {item.billing_day ? ` · 매 ${item.billing_day}일` : ""}
                      </p>
                    </div>

                    <dl className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">다음 결제일</dt>
                        <dd>{item.next_due_date}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">결제 계좌</dt>
                        <dd className="truncate">
                          {getItemAccountName(accounts, item.account_id)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">카테고리</dt>
                        <dd>{getItemCategoryName(categories, item.category_id)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">담당자</dt>
                        <dd>{getPayerName(members, item.payer_user_id)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">자동 저장</dt>
                        <dd className="inline-flex items-center gap-1">
                          {item.auto_create_transaction ? (
                            <>
                              <Check className="size-4 text-primary" aria-hidden="true" />
                              켜짐
                            </>
                          ) : (
                            "꺼짐"
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">알림</dt>
                        <dd className="inline-flex items-center gap-1">
                          <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
                          {item.reminder_days_before}일 전
                        </dd>
                      </div>
                    </dl>

                    {item.memo ? (
                      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        {item.memo}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => openEdit(item)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        수정
                      </Button>
                      {item.status !== "paused" ? (
                        <StatusActionButton
                          householdId={household.id}
                          item={item}
                          onResult={setResult}
                          status="paused"
                        />
                      ) : (
                        <StatusActionButton
                          householdId={household.id}
                          item={item}
                          onResult={setResult}
                          status="active"
                        />
                      )}
                      {item.status !== "canceled" ? (
                        <StatusActionButton
                          householdId={household.id}
                          item={item}
                          onResult={setResult}
                          status="canceled"
                        />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="lg:col-span-2">
              <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                <CalendarClock
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    추가한 {recurringKindLabels[activeTab]}가 없어요
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    반복 결제가 생기면 여기서 볼 수 있어요.
                  </p>
                </div>
                <Button onClick={() => openCreate(activeTab)} type="button">
                  <Plus className="size-4" aria-hidden="true" />
                  추가하기
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
