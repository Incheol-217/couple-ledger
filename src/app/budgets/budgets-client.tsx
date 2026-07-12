"use client";

import { useMemo, useState, useTransition } from "react";
import {
  PiggyBank,
  Pencil,
  Plus,
  Power,
  Save,
  Trash2,
} from "lucide-react";
import {
  createBudgetAction,
  deleteBudgetAction,
  toggleBudgetActiveAction,
  updateBudgetAction,
  type BudgetActionResult,
} from "./actions";
import {
  budgetPeriodLabels,
  budgetPeriods,
  budgetScopeLabels,
  budgetScopes,
  scopeOf,
  type BudgetPageData,
  type BudgetPeriod,
  type BudgetRow,
  type BudgetScope,
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

function toAmount(value: BudgetRow["amount"]) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

function toDateString(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstOfMonth() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
}

function lastOfMonth() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function firstOfYear() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), 0, 1));
}

function lastOfYear() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), 11, 31));
}

function todayString() {
  return toDateString(new Date());
}

function defaultStartFor(period: BudgetPeriod) {
  if (period === "yearly") {
    return firstOfYear();
  }

  if (period === "custom") {
    return todayString();
  }

  return firstOfMonth();
}

// 이번 기간의 시작·끝을 예산 주기에 맞춰 계산해요.
function currentWindow(budget: BudgetRow) {
  let start: string;
  let end: string;

  if (budget.period === "yearly") {
    start = firstOfYear();
    end = lastOfYear();
  } else if (budget.period === "custom") {
    start = budget.period_start;
    end = budget.period_end ?? todayString();
  } else {
    start = firstOfMonth();
    end = lastOfMonth();
  }

  // 예산 자체의 시작·끝 범위 밖으로는 넘어가지 않아요.
  if (budget.period_start > start) {
    start = budget.period_start;
  }

  if (budget.period_end && budget.period_end < end) {
    end = budget.period_end;
  }

  return { end, start };
}

function computeSpent(
  budget: BudgetRow,
  expenses: BudgetPageData["expenses"],
) {
  const { start, end } = currentWindow(budget);
  const scope = scopeOf(budget);

  return expenses.reduce((sum, expense) => {
    if (expense.transaction_date < start || expense.transaction_date > end) {
      return sum;
    }

    if (scope === "category" && expense.category_id !== budget.category_id) {
      return sum;
    }

    if (scope === "account" && expense.account_id !== budget.account_id) {
      return sum;
    }

    return sum + toAmount(expense.amount);
  }, 0);
}

function resultClassName(result: BudgetActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function scopeLabel(budget: BudgetRow, data: BudgetPageData) {
  const scope = scopeOf(budget);

  if (scope === "category") {
    const category = data.categories.find(
      (candidate) => candidate.id === budget.category_id,
    );
    return category ? category.name : "카테고리";
  }

  if (scope === "account") {
    const account = data.accounts.find(
      (candidate) => candidate.id === budget.account_id,
    );
    return account
      ? `${account.name} · ${accountTypeLabels[account.type]}`
      : "계좌";
  }

  return "전체 지출";
}

function BudgetForm({
  accounts,
  budget,
  categories,
  householdId,
  mode,
  onDone,
}: {
  accounts: BudgetPageData["accounts"];
  budget: BudgetRow | null;
  categories: BudgetPageData["categories"];
  householdId: string;
  mode: "create" | "edit";
  onDone: (result?: BudgetActionResult) => void;
}) {
  const [scope, setScope] = useState<BudgetScope>(
    budget ? scopeOf(budget) : "overall",
  );
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? "monthly");
  const [periodStart, setPeriodStart] = useState(
    budget?.period_start ?? defaultStartFor(budget?.period ?? "monthly"),
  );
  const [periodEnd, setPeriodEnd] = useState(budget?.period_end ?? "");
  const [result, setResult] = useState<BudgetActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function changePeriod(next: BudgetPeriod) {
    setPeriod(next);
    // 주기를 바꾸면 시작일 기본값도 맞춰줘요(직접 입력한 값이 없을 때만 자연스럽게).
    setPeriodStart(defaultStartFor(next));

    if (next !== "custom") {
      setPeriodEnd("");
    }
  }

  function submit(formData: FormData) {
    formData.set("scope", scope);
    formData.set("period", period);
    formData.set(
      "period_start",
      period === "custom" ? periodStart : defaultStartFor(period),
    );
    formData.set("period_end", period === "custom" ? periodEnd : "");

    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createBudgetAction(formData)
          : await updateBudgetAction(formData);

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
          {mode === "create" ? "예산 추가하기" : "예산 고치기"}
        </CardTitle>
        <CardDescription>
          무엇에, 얼마를, 어느 기간 동안 쓸지 정해요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {budget ? (
            <input name="budget_id" type="hidden" value={budget.id} />
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
              <Label htmlFor="budget-scope">예산 대상</Label>
              <Select
                id="budget-scope"
                name="scope"
                onChange={(event) => setScope(event.target.value as BudgetScope)}
                value={scope}
              >
                {budgetScopes.map((nextScope) => (
                  <option key={nextScope} value={nextScope}>
                    {budgetScopeLabels[nextScope]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-amount">예산 금액</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  budget
                    ? formatAmountInput(String(Math.round(toAmount(budget.amount))))
                    : ""
                }
                id="budget-amount"
                inputMode="numeric"
                name="amount"
                onInput={formatAmountField}
                placeholder="500,000"
                required
                type="text"
              />
            </div>

            {scope === "category" ? (
              <div className="space-y-2">
                <Label htmlFor="budget-category">지출 카테고리</Label>
                <Select
                  defaultValue={budget?.category_id ?? ""}
                  id="budget-category"
                  name="category_id"
                >
                  <option value="">카테고리 선택</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    거래를 저장하면 카테고리가 생겨요. 그때 카테고리별 예산을 걸 수 있어요.
                  </p>
                ) : null}
              </div>
            ) : null}

            {scope === "account" ? (
              <div className="space-y-2">
                <Label htmlFor="budget-account">계좌</Label>
                <Select
                  defaultValue={budget?.account_id ?? accounts[0]?.id ?? ""}
                  id="budget-account"
                  name="account_id"
                >
                  <option value="">계좌 선택</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {accountTypeLabels[account.type]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="budget-period">주기</Label>
              <Select
                id="budget-period"
                name="period"
                onChange={(event) =>
                  changePeriod(event.target.value as BudgetPeriod)
                }
                value={period}
              >
                {budgetPeriods.map((nextPeriod) => (
                  <option key={nextPeriod} value={nextPeriod}>
                    {budgetPeriodLabels[nextPeriod]}
                  </option>
                ))}
              </Select>
            </div>

            {period === "custom" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="budget-start">시작일</Label>
                  <Input
                    id="budget-start"
                    name="period_start"
                    onChange={(event) => setPeriodStart(event.target.value)}
                    required
                    type="date"
                    value={periodStart}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-end">종료일</Label>
                  <Input
                    id="budget-end"
                    name="period_end"
                    onChange={(event) => setPeriodEnd(event.target.value)}
                    required
                    type="date"
                    value={periodEnd}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2 md:col-span-1">
                <Label>적용 기간</Label>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {period === "monthly"
                    ? "매월 1일부터 말일까지 자동으로 계산해요."
                    : "매년 1월 1일부터 12월 31일까지 계산해요."}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-memo">메모</Label>
            <Textarea
              defaultValue={budget?.memo ?? ""}
              id="budget-memo"
              name="memo"
              placeholder="예: 외식은 이 안에서 해결하기"
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

function InlineAction({
  budget,
  children,
  extraFields,
  householdId,
  onResult,
  action,
}: {
  budget: BudgetRow;
  children: React.ReactNode;
  extraFields?: Record<string, string>;
  householdId: string;
  onResult: (result: BudgetActionResult) => void;
  action: (formData: FormData) => Promise<BudgetActionResult>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await action(formData);
          onResult(result);
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="budget_id" type="hidden" value={budget.id} />
      {extraFields
        ? Object.entries(extraFields).map(([key, value]) => (
            <input key={key} name={key} type="hidden" value={value} />
          ))
        : null}
      <Button disabled={isPending} size="sm" type="submit" variant="outline">
        {children}
      </Button>
    </form>
  );
}

export function BudgetsClient(props: BudgetPageData) {
  const {
    accounts,
    budgets,
    categories,
    errorMessage,
    household,
    isConfigured,
    isSignedIn,
  } = props;

  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<BudgetRow | null>(null);
  const [result, setResult] = useState<BudgetActionResult | null>(null);

  const budgetsWithUsage = useMemo(
    () =>
      budgets.map((budget) => ({
        budget,
        spent: computeSpent(budget, props.expenses),
      })),
    [budgets, props.expenses],
  );

  const summary = useMemo(() => {
    const active = budgetsWithUsage.filter(({ budget }) => budget.is_active);
    const totalBudget = active.reduce(
      (sum, { budget }) => sum + toAmount(budget.amount),
      0,
    );
    const totalSpent = active.reduce((sum, { spent }) => sum + spent, 0);

    return {
      count: active.length,
      remaining: totalBudget - totalSpent,
      totalBudget,
      totalSpent,
    };
  }, [budgetsWithUsage]);

  function openCreate() {
    setSelectedBudget(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(budget: BudgetRow) {
    setSelectedBudget(budget);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: BudgetActionResult) {
    setMode(null);
    setSelectedBudget(null);
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
            `.env.local`에 Supabase URL과 anon key를 넣으면 예산을 볼 수 있어요.
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
            로그인하면 함께 정한 예산을 볼 수 있어요.
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
            멤버 연결을 마치면 예산을 정할 수 있어요.
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
            <p className="text-sm text-muted-foreground">이번 기간 예산</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.totalBudget)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">지금까지 쓴 돈</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.totalSpent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">남은 예산</p>
            <p
              className={cn(
                "mt-2 text-xl font-semibold",
                summary.remaining < 0 && "text-destructive",
              )}
            >
              {formatMoney(summary.remaining)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">켜둔 예산</p>
            <p className="mt-2 text-xl font-semibold">{summary.count}개</p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            카테고리·계좌·전체 지출에 예산을 걸어 과소비를 막아요.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
          <Plus className="size-4" aria-hidden="true" />
          예산 추가하기
        </Button>
      </div>

      {mode ? (
        <BudgetForm
          accounts={accounts}
          budget={selectedBudget}
          categories={categories}
          householdId={household.id}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {budgetsWithUsage.length > 0 ? (
          budgetsWithUsage.map(({ budget, spent }) => {
            const amount = toAmount(budget.amount);
            const remaining = amount - spent;
            const percent = amount > 0 ? (spent / amount) * 100 : 0;
            const over = remaining < 0;

            return (
              <Card
                key={budget.id}
                className={cn(
                  "border-l-4",
                  over ? "border-l-destructive" : "border-l-primary",
                  !budget.is_active && "opacity-70",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        {scopeLabel(budget, props)}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {budgetPeriodLabels[budget.period]}
                        {budget.period === "custom"
                          ? ` · ${budget.period_start} ~ ${budget.period_end ?? "계속"}`
                          : ""}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={over ? "outline" : "secondary"}>
                        {budgetScopeLabels[scopeOf(budget)]}
                      </Badge>
                      {!budget.is_active ? (
                        <Badge variant="outline">꺼둠</Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {formatMoney(spent)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        예산 {formatMoney(amount)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        over ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {over
                        ? `${formatMoney(Math.abs(remaining))} 초과`
                        : `${formatMoney(remaining)} 남음`}
                    </p>
                  </div>

                  <div
                    aria-hidden="true"
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        over ? "bg-destructive" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {amount > 0 ? `${Math.round(percent)}% 사용` : "예산 미설정"}
                  </p>

                  {budget.memo ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {budget.memo}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => openEdit(budget)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      수정
                    </Button>
                    <InlineAction
                      action={toggleBudgetActiveAction}
                      budget={budget}
                      extraFields={{ is_active: String(!budget.is_active) }}
                      householdId={household.id}
                      onResult={setResult}
                    >
                      <Power className="size-4" aria-hidden="true" />
                      {budget.is_active ? "끄기" : "켜기"}
                    </InlineAction>
                    <InlineAction
                      action={deleteBudgetAction}
                      budget={budget}
                      householdId={household.id}
                      onResult={setResult}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      삭제
                    </InlineAction>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="lg:col-span-2">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <PiggyBank
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">아직 정한 예산이 없어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  이번 달 카테고리별 한도를 정해 함께 지켜보세요.
                </p>
              </div>
              <Button onClick={openCreate} type="button">
                <Plus className="size-4" aria-hidden="true" />
                예산 추가하기
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
