"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  createInstallmentAction,
  updateInstallmentAction,
  updateInstallmentStatusAction,
  type InstallmentActionResult,
} from "./actions";
import {
  installmentStatusLabels,
  type InstallmentPageData,
  type InstallmentRow,
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

function toAmount(value: InstallmentRow["amount"]) {
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
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 마지막 회차 예상 월 (다음 결제일 + 남은 회차 - 1개월)
function estimatedEndLabel(item: InstallmentRow, paid: number) {
  const total = item.total_installments ?? 0;
  const remaining = Math.max(0, total - paid);

  if (remaining === 0) {
    return "완납";
  }

  const [year, month] = item.next_due_date.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1 + (remaining - 1), 1));
  return `${end.getUTCFullYear()}.${String(end.getUTCMonth() + 1).padStart(2, "0")} 끝`;
}

function resultClassName(result: InstallmentActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function statusVariant(status: InstallmentRow["status"]) {
  if (status === "active") {
    return "default" as const;
  }

  return status === "paused" ? ("secondary" as const) : ("outline" as const);
}

function InstallmentForm({
  accounts,
  categories,
  householdId,
  item,
  mode,
  onDone,
}: {
  accounts: InstallmentPageData["accounts"];
  categories: InstallmentPageData["categories"];
  householdId: string;
  item: InstallmentRow | null;
  mode: "create" | "edit";
  onDone: (result?: InstallmentActionResult) => void;
}) {
  const [result, setResult] = useState<InstallmentActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);
  const totalPriceRef = useRef<HTMLInputElement>(null);
  const monthsRef = useRef<HTMLInputElement>(null);
  const today = todayString();

  // 총 금액과 개월수를 넣으면 회차 금액을 자동으로 채워줘요(직접 수정 가능).
  function recalcAmount() {
    const totalPrice = Number(
      (totalPriceRef.current?.value ?? "").replaceAll(",", ""),
    );
    const months = Number(monthsRef.current?.value ?? "");

    if (
      amountRef.current &&
      Number.isFinite(totalPrice) &&
      totalPrice > 0 &&
      Number.isFinite(months) &&
      months >= 1
    ) {
      amountRef.current.value = formatAmountInput(
        String(Math.ceil(totalPrice / months)),
      );
    }
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createInstallmentAction(formData)
          : await updateInstallmentAction(formData);

      setResult(actionResult);

      if (actionResult.ok) {
        onDone(actionResult);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "할부 추가하기" : "할부 고치기"}</CardTitle>
        <CardDescription>
          총 금액과 개월수를 넣으면 회차 금액을 계산해 드려요. 수수료가 있으면
          회차 금액을 직접 고쳐주세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {item ? (
            <input name="installment_id" type="hidden" value={item.id} />
          ) : null}

          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              resultClassName(result),
            )}
          >
            {result?.message}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="installment-name">이름</Label>
              <Input
                autoComplete="off"
                defaultValue={item?.name ?? ""}
                id="installment-name"
                name="name"
                placeholder="아이폰 16 Pro, 냉장고"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment-merchant">구매처 (선택)</Label>
              <Input
                autoComplete="off"
                defaultValue={item?.merchant ?? ""}
                id="installment-merchant"
                name="merchant"
                placeholder="Apple, 하이마트"
              />
            </div>

            {mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="installment-total-price">총 금액</Label>
                <Input
                  autoComplete="off"
                  id="installment-total-price"
                  inputMode="numeric"
                  onInput={(event) => {
                    formatAmountField(event);
                    recalcAmount();
                  }}
                  placeholder="1,500,000"
                  ref={totalPriceRef}
                  type="text"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="installment-months">할부 개월수</Label>
              <Input
                defaultValue={item?.total_installments ?? ""}
                id="installment-months"
                inputMode="numeric"
                max={120}
                min={1}
                name="total_installments"
                onInput={recalcAmount}
                placeholder="24"
                ref={monthsRef}
                required
                type="number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment-amount">회차 금액</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  item
                    ? formatAmountInput(String(Math.round(toAmount(item.amount))))
                    : ""
                }
                id="installment-amount"
                inputMode="numeric"
                name="amount"
                onInput={formatAmountField}
                placeholder="62,500"
                ref={amountRef}
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment-next-due">다음 결제일</Label>
              <Input
                defaultValue={item?.next_due_date ?? today}
                id="installment-next-due"
                name="next_due_date"
                required
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment-billing-day">매달 결제일 (선택)</Label>
              <Input
                defaultValue={item?.billing_day ?? ""}
                id="installment-billing-day"
                inputMode="numeric"
                max={31}
                min={1}
                name="billing_day"
                placeholder="25"
                type="number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment-account">결제 계좌</Label>
              <Select
                defaultValue={item?.account_id ?? accounts[0]?.id ?? ""}
                id="installment-account"
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
              <Label htmlFor="installment-category">카테고리 (선택)</Label>
              <Select
                defaultValue={item?.category_id ?? ""}
                id="installment-category"
                name="category_id"
              >
                <option value="">선택 안 함</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="installment-memo">메모</Label>
            <Textarea
              defaultValue={item?.memo ?? ""}
              id="installment-memo"
              name="memo"
              placeholder="무이자 12개월, 카드 프로모션"
              rows={2}
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

function StatusButton({
  householdId,
  item,
  label,
  icon,
  status,
  onResult,
}: {
  householdId: string;
  item: InstallmentRow;
  label: string;
  icon: React.ReactNode;
  status: InstallmentRow["status"];
  onResult: (result: InstallmentActionResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await updateInstallmentStatusAction(formData);
          onResult(result);
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="installment_id" type="hidden" value={item.id} />
      <input name="status" type="hidden" value={status} />
      <Button disabled={isPending} size="sm" type="submit" variant="outline">
        {icon}
        {label}
      </Button>
    </form>
  );
}

export function InstallmentsClient({
  accounts,
  categories,
  errorMessage,
  household,
  installments,
  isConfigured,
  isSignedIn,
  paidCounts,
}: InstallmentPageData) {
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InstallmentRow | null>(null);
  const [result, setResult] = useState<InstallmentActionResult | null>(null);

  const summary = useMemo(() => {
    const active = installments.filter((item) => item.status === "active");
    const monthlyTotal = active.reduce(
      (sum, item) => sum + toAmount(item.amount),
      0,
    );
    const remainingTotal = active.reduce((sum, item) => {
      const total = item.total_installments ?? 0;
      const paid = paidCounts[item.id] ?? 0;
      return sum + Math.max(0, total - paid) * toAmount(item.amount);
    }, 0);

    return {
      activeCount: active.length,
      doneCount: installments.filter((item) => item.status === "canceled").length,
      monthlyTotal,
      remainingTotal,
    };
  }, [installments, paidCounts]);

  function openCreate() {
    setSelectedItem(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(item: InstallmentRow) {
    setSelectedItem(item);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: InstallmentActionResult) {
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
            `.env.local`에 Supabase URL과 anon key를 넣으면 할부를 볼 수 있어요.
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
          <CardDescription>로그인하면 할부 현황을 볼 수 있어요.</CardDescription>
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
            멤버 연결을 마치면 할부를 관리할 수 있어요.
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
            계좌나 카드를 추가하면 할부를 등록할 수 있어요.
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">이번 달 할부금</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.monthlyTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">남은 할부 총액</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.remainingTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">진행 중</p>
            <p className="mt-2 text-xl font-semibold">{summary.activeCount}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">완납</p>
            <p className="mt-2 text-xl font-semibold">{summary.doneCount}건</p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            결제일마다 거래가 자동으로 기록되고, 마지막 회차가 끝나면 스스로
            멈춰요.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
          <Plus className="size-4" aria-hidden="true" />
          할부 추가하기
        </Button>
      </div>

      {mode ? (
        <InstallmentForm
          accounts={accounts}
          categories={categories}
          householdId={household.id}
          item={selectedItem}
          key={`${mode}-${selectedItem?.id ?? "new"}`}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {installments.length > 0 ? (
          installments.map((item) => {
            const total = item.total_installments ?? 0;
            const paid = Math.min(paidCounts[item.id] ?? 0, total);
            const remaining = Math.max(0, total - paid);
            const percent = total > 0 ? (paid / total) * 100 : 0;
            const done = item.status === "canceled" || remaining === 0;
            const accountName = accounts.find(
              (account) => account.id === item.account_id,
            )?.name;

            return (
              <Card
                key={item.id}
                className={cn(
                  "border-l-4",
                  done ? "border-l-chart-2" : "border-l-primary",
                  item.status !== "active" && "opacity-75",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{item.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {item.merchant ?? "할부"} · {accountName ?? "-"}
                      </CardDescription>
                    </div>
                    <Badge variant={statusVariant(item.status)}>
                      {done && item.status === "canceled"
                        ? "완납"
                        : installmentStatusLabels[item.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {formatMoney(toAmount(item.amount))}
                        <span className="text-sm font-normal text-muted-foreground">
                          {" "}
                          / 월
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.billing_day
                          ? `매달 ${item.billing_day}일 · `
                          : ""}
                        {estimatedEndLabel(item, paid)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      남은 금액{" "}
                      {formatMoney(remaining * toAmount(item.amount))}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {paid} / {total}회
                      </span>
                      <span>{Math.round(percent)}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          done ? "bg-chart-2" : "bg-primary",
                        )}
                        style={{ width: `${Math.min(100, percent)}%` }}
                      />
                    </div>
                  </div>

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
                    {item.status === "active" ? (
                      <>
                        <StatusButton
                          householdId={household.id}
                          icon={<Pause className="size-4" aria-hidden="true" />}
                          item={item}
                          label="잠시 멈추기"
                          onResult={setResult}
                          status="paused"
                        />
                        <StatusButton
                          householdId={household.id}
                          icon={
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          }
                          item={item}
                          label="조기 상환 완료"
                          onResult={setResult}
                          status="canceled"
                        />
                      </>
                    ) : item.status === "paused" ? (
                      <StatusButton
                        householdId={household.id}
                        icon={<RotateCcw className="size-4" aria-hidden="true" />}
                        item={item}
                        label="다시 진행"
                        onResult={setResult}
                        status="active"
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
              <CalendarRange
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">아직 등록한 할부가 없어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  휴대폰, 가전 할부를 등록하면 몇 회 남았는지 추적해 드려요.
                </p>
              </div>
              <Button onClick={openCreate} type="button">
                <Plus className="size-4" aria-hidden="true" />
                할부 추가하기
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
