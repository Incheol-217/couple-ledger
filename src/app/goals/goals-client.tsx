"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import {
  contributeGoalAction,
  createGoalAction,
  deleteGoalAction,
  toggleGoalAchievedAction,
  updateGoalAction,
  type GoalActionResult,
} from "./actions";
import type { GoalPageData, SavingsGoalRow } from "./types";
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

function toAmount(value: SavingsGoalRow["target_amount"]) {
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

function daysUntil(targetDate: string) {
  const today = new Date(`${todayString()}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function targetDateLabel(targetDate: string) {
  const distance = daysUntil(targetDate);

  if (distance < 0) {
    return `${targetDate} · ${Math.abs(distance)}일 지남`;
  }

  if (distance === 0) {
    return `${targetDate} · 오늘까지`;
  }

  return `${targetDate} · ${distance}일 남음`;
}

function resultClassName(result: GoalActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function getAccountName(accounts: GoalPageData["accounts"], id: string | null) {
  if (!id) {
    return null;
  }

  const account = accounts.find((candidate) => candidate.id === id);
  return account ? `${account.name} · ${accountTypeLabels[account.type]}` : null;
}

function GoalForm({
  accounts,
  goal,
  householdId,
  mode,
  onDone,
}: {
  accounts: GoalPageData["accounts"];
  goal: SavingsGoalRow | null;
  householdId: string;
  mode: "create" | "edit";
  onDone: (result?: GoalActionResult) => void;
}) {
  const [result, setResult] = useState<GoalActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createGoalAction(formData)
          : await updateGoalAction(formData);

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
          {mode === "create" ? "저축 목표 추가하기" : "저축 목표 고치기"}
        </CardTitle>
        <CardDescription>
          무엇을 위해, 얼마를, 언제까지 모을지 정해요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {goal ? (
            <input name="goal_id" type="hidden" value={goal.id} />
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
              <Label htmlFor="goal-name">목표 이름</Label>
              <Input
                autoComplete="off"
                defaultValue={goal?.name ?? ""}
                id="goal-name"
                name="name"
                placeholder="제주도 여행, 비상금, 전세금"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-target">목표 금액</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  goal
                    ? formatAmountInput(String(Math.round(toAmount(goal.target_amount))))
                    : ""
                }
                id="goal-target"
                inputMode="numeric"
                name="target_amount"
                onInput={formatAmountField}
                placeholder="2,000,000"
                required
                type="text"
              />
            </div>

            {mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="goal-current">이미 모은 금액 (선택)</Label>
                <Input
                  autoComplete="off"
                  id="goal-current"
                  inputMode="numeric"
                  name="current_amount"
                  onInput={formatAmountField}
                  placeholder="0"
                  type="text"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="goal-date">목표 날짜 (선택)</Label>
              <Input
                defaultValue={goal?.target_date ?? ""}
                id="goal-date"
                name="target_date"
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-account">저축 계좌 (선택)</Label>
              <Select
                defaultValue={goal?.account_id ?? ""}
                id="goal-account"
                name="account_id"
              >
                <option value="">연결 안 함</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabels[account.type]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-memo">메모</Label>
            <Textarea
              defaultValue={goal?.memo ?? ""}
              id="goal-memo"
              name="memo"
              placeholder="예: 매달 20만원씩 모으기"
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

function ContributeControl({
  goal,
  householdId,
  onResult,
}: {
  goal: SavingsGoalRow;
  householdId: string;
  onResult: (result: GoalActionResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function run(formData: FormData, direction: "add" | "withdraw") {
    formData.set("direction", direction);
    startTransition(async () => {
      const result = await contributeGoalAction(formData);
      onResult(result);
    });
  }

  return (
    <form className="flex flex-wrap items-center gap-2">
      <input name="household_id" type="hidden" value={householdId} />
      <input name="goal_id" type="hidden" value={goal.id} />
      <Input
        aria-label="적립할 금액"
        className="h-9 w-32"
        inputMode="numeric"
        name="amount"
        onInput={formatAmountField}
        placeholder="금액"
        type="text"
      />
      <Button
        disabled={isPending}
        formAction={(formData) => run(formData, "add")}
        size="sm"
        type="submit"
      >
        <Plus className="size-4" aria-hidden="true" />
        적립
      </Button>
      <Button
        disabled={isPending}
        formAction={(formData) => run(formData, "withdraw")}
        size="sm"
        type="submit"
        variant="outline"
      >
        <Minus className="size-4" aria-hidden="true" />
        인출
      </Button>
    </form>
  );
}

function InlineAction({
  children,
  extraFields,
  goalId,
  householdId,
  onResult,
  action,
}: {
  children: React.ReactNode;
  extraFields?: Record<string, string>;
  goalId: string;
  householdId: string;
  onResult: (result: GoalActionResult) => void;
  action: (formData: FormData) => Promise<GoalActionResult>;
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
      <input name="goal_id" type="hidden" value={goalId} />
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

export function GoalsClient({
  accounts,
  errorMessage,
  goals,
  household,
  isConfigured,
  isSignedIn,
}: GoalPageData) {
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoalRow | null>(null);
  const [result, setResult] = useState<GoalActionResult | null>(null);

  const summary = useMemo(() => {
    const active = goals.filter((goal) => !goal.is_achieved);
    const targetTotal = active.reduce(
      (sum, goal) => sum + toAmount(goal.target_amount),
      0,
    );
    const savedTotal = active.reduce(
      (sum, goal) => sum + toAmount(goal.current_amount),
      0,
    );

    return {
      achievedCount: goals.length - active.length,
      activeCount: active.length,
      percent: targetTotal > 0 ? (savedTotal / targetTotal) * 100 : 0,
      savedTotal,
      targetTotal,
    };
  }, [goals]);

  function openCreate() {
    setSelectedGoal(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(goal: SavingsGoalRow) {
    setSelectedGoal(goal);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: GoalActionResult) {
    setMode(null);
    setSelectedGoal(null);
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
            `.env.local`에 Supabase URL과 anon key를 넣으면 저축 목표를 볼 수 있어요.
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
            로그인하면 함께 정한 저축 목표를 볼 수 있어요.
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
            멤버 연결을 마치면 저축 목표를 정할 수 있어요.
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
            <p className="text-sm text-muted-foreground">진행 중 목표</p>
            <p className="mt-2 text-xl font-semibold">{summary.activeCount}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">모은 금액</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.savedTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">목표 금액</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.targetTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">달성한 목표</p>
            <p className="mt-2 text-xl font-semibold">{summary.achievedCount}개</p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            함께 모을 목표를 정하고 진행 상황을 같이 확인해요.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
          <Plus className="size-4" aria-hidden="true" />
          목표 추가하기
        </Button>
      </div>

      {mode ? (
        <GoalForm
          accounts={accounts}
          goal={selectedGoal}
          householdId={household.id}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {goals.length > 0 ? (
          goals.map((goal) => {
            const target = toAmount(goal.target_amount);
            const saved = toAmount(goal.current_amount);
            const remaining = target - saved;
            const percent = target > 0 ? (saved / target) * 100 : 0;
            const done = goal.is_achieved || remaining <= 0;
            const accountName = getAccountName(accounts, goal.account_id);

            return (
              <Card
                key={goal.id}
                className={cn(
                  "border-l-4",
                  done ? "border-l-chart-2" : "border-l-primary",
                  goal.is_achieved && "bg-muted/20",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{goal.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {goal.target_date
                          ? targetDateLabel(goal.target_date)
                          : "목표 날짜 없음"}
                        {accountName ? ` · ${accountName}` : ""}
                      </CardDescription>
                    </div>
                    {goal.is_achieved ? (
                      <Badge variant="secondary">
                        <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                        달성
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {formatMoney(saved)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        목표 {formatMoney(target)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        done ? "text-chart-2" : "text-muted-foreground",
                      )}
                    >
                      {remaining > 0
                        ? `${formatMoney(remaining)} 남음`
                        : "목표 달성"}
                    </p>
                  </div>

                  <div
                    aria-hidden="true"
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        done ? "bg-chart-2" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(percent)}% 달성
                  </p>

                  {goal.memo ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {goal.memo}
                    </p>
                  ) : null}

                  <ContributeControl
                    goal={goal}
                    householdId={household.id}
                    onResult={setResult}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => openEdit(goal)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      수정
                    </Button>
                    <InlineAction
                      action={toggleGoalAchievedAction}
                      extraFields={{ is_achieved: String(!goal.is_achieved) }}
                      goalId={goal.id}
                      householdId={household.id}
                      onResult={setResult}
                    >
                      {goal.is_achieved ? (
                        <>
                          <RotateCcw className="size-4" aria-hidden="true" />
                          다시 진행
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                          달성 완료
                        </>
                      )}
                    </InlineAction>
                    <InlineAction
                      action={deleteGoalAction}
                      goalId={goal.id}
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
              <Target className="size-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">아직 정한 저축 목표가 없어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  여행, 비상금, 전세금처럼 함께 모을 목표를 만들어 보세요.
                </p>
              </div>
              <Button onClick={openCreate} type="button">
                <Plus className="size-4" aria-hidden="true" />
                목표 추가하기
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
