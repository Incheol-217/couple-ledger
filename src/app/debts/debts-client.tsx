"use client";

import { useMemo, useState, useTransition } from "react";
import { Landmark, Pencil, Plus, Save, Trash2, Wallet } from "lucide-react";
import {
  createLiabilityAction,
  deleteLiabilityAction,
  recordRepaymentAction,
  updateLiabilityAction,
  type DebtActionResult,
} from "./actions";
import {
  liabilityOwnerLabels,
  liabilityOwners,
  liabilityTypeLabels,
  liabilityTypes,
  type DebtsPageData,
  type LiabilityRow,
} from "./types";
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

function toAmount(value: number | string | null) {
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

function resultClassName(result: DebtActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function LiabilityForm({
  accounts,
  householdId,
  liability,
  mode,
  onDone,
}: {
  accounts: DebtsPageData["accounts"];
  householdId: string;
  liability: LiabilityRow | null;
  mode: "create" | "edit";
  onDone: (result?: DebtActionResult) => void;
}) {
  const [result, setResult] = useState<DebtActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createLiabilityAction(formData)
          : await updateLiabilityAction(formData);

      setResult(actionResult);

      if (actionResult.ok) {
        onDone(actionResult);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "부채 추가하기" : "부채 고치기"}</CardTitle>
        <CardDescription>
          최초 원금과 남은 원금을 적으면 상환율을 계산해 드려요. 월 이자는
          고정비로 등록하면 매달 자동 기록돼요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {liability ? (
            <input name="liability_id" type="hidden" value={liability.id} />
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
              <Label htmlFor="debt-name">이름</Label>
              <Input
                autoComplete="off"
                defaultValue={liability?.name ?? ""}
                id="debt-name"
                name="name"
                placeholder="전세자금대출, 마이너스통장"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-type">종류</Label>
              <Select
                defaultValue={liability?.liability_type ?? "jeonse"}
                id="debt-type"
                name="liability_type"
              >
                {liabilityTypes.map((type) => (
                  <option key={type} value={type}>
                    {liabilityTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-owner">명의</Label>
              <Select
                defaultValue={liability?.owner_label ?? "shared"}
                id="debt-owner"
                name="owner_label"
              >
                {liabilityOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {liabilityOwnerLabels[owner]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-account">이자·상환 계좌 (선택)</Label>
              <Select
                defaultValue={liability?.account_id ?? ""}
                id="debt-account"
                name="account_id"
              >
                <option value="">연결 안 함</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-principal">최초 원금</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  liability
                    ? formatAmountInput(
                        String(Math.round(toAmount(liability.principal))),
                      )
                    : ""
                }
                id="debt-principal"
                inputMode="numeric"
                name="principal"
                onInput={formatAmountField}
                placeholder="200,000,000"
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-balance">남은 원금 (선택)</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  liability
                    ? formatAmountInput(
                        String(Math.round(toAmount(liability.current_balance))),
                      )
                    : ""
                }
                id="debt-balance"
                inputMode="numeric"
                name="current_balance"
                onInput={formatAmountField}
                placeholder="비우면 최초 원금과 같게 저장돼요"
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-rate">금리 (%, 선택)</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  liability?.interest_rate != null
                    ? String(toAmount(liability.interest_rate))
                    : ""
                }
                id="debt-rate"
                inputMode="decimal"
                name="interest_rate"
                placeholder="3.5"
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-interest-day">이자 납부일 (선택)</Label>
              <Input
                defaultValue={liability?.interest_day ?? ""}
                id="debt-interest-day"
                inputMode="numeric"
                max={31}
                min={1}
                name="interest_day"
                placeholder="25"
                type="number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-started">시작일 (선택)</Label>
              <Input
                defaultValue={liability?.started_on ?? ""}
                id="debt-started"
                name="started_on"
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-ends">만기일 (선택)</Label>
              <Input
                defaultValue={liability?.ends_on ?? ""}
                id="debt-ends"
                name="ends_on"
                type="date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="debt-memo">메모</Label>
            <Textarea
              defaultValue={liability?.memo ?? ""}
              id="debt-memo"
              name="memo"
              placeholder="은행, 거치식/원리금, 중도상환수수료"
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

function RepayPanel({
  householdId,
  liability,
  linkedAccountName,
  onResult,
}: {
  householdId: string;
  liability: LiabilityRow;
  linkedAccountName: string | null;
  onResult: (result: DebtActionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await recordRepaymentAction(formData);
      onResult(result);
      if (result.ok) {
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        원금 상환 기록
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-md border bg-muted/30 p-3">
      <input name="household_id" type="hidden" value={householdId} />
      <input name="liability_id" type="hidden" value={liability.id} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">원금 상환</p>
        <span className="text-xs text-muted-foreground">
          {linkedAccountName
            ? `연결계좌: ${linkedAccountName}`
            : "연결계좌 없음 (잔액 반영 안 됨)"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`repay-amount-${liability.id}`}>
            상환액
          </Label>
          <Input
            autoComplete="off"
            className="h-9"
            id={`repay-amount-${liability.id}`}
            inputMode="numeric"
            name="amount"
            onInput={formatAmountField}
            placeholder="1,000,000"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`repay-date-${liability.id}`}>
            상환일
          </Label>
          <Input
            className="h-9"
            defaultValue={todayString()}
            id={`repay-date-${liability.id}`}
            name="paid_on"
            type="date"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          onClick={() => setOpen(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          닫기
        </Button>
        <Button disabled={isPending} size="sm" type="submit">
          {isPending ? "기록 중" : "상환 기록"}
        </Button>
      </div>
    </form>
  );
}

function DeleteButton({
  householdId,
  liability,
  onResult,
}: {
  householdId: string;
  liability: LiabilityRow;
  onResult: (result: DebtActionResult) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        삭제
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          onResult(await deleteLiabilityAction(formData));
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="liability_id" type="hidden" value={liability.id} />
      <Button
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={isPending}
        size="sm"
        type="submit"
        variant="outline"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        정말 삭제할까요?
      </Button>
    </form>
  );
}

export function DebtsClient({
  accounts,
  liabilities,
  errorMessage,
  household,
  isConfigured,
  isSignedIn,
}: DebtsPageData) {
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<LiabilityRow | null>(null);
  const [result, setResult] = useState<DebtActionResult | null>(null);

  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const summary = useMemo(() => {
    const principalTotal = liabilities.reduce(
      (sum, item) => sum + toAmount(item.principal),
      0,
    );
    const balanceTotal = liabilities.reduce(
      (sum, item) => sum + toAmount(item.current_balance),
      0,
    );

    return {
      balanceTotal,
      count: liabilities.length,
      paidTotal: Math.max(0, principalTotal - balanceTotal),
      principalTotal,
    };
  }, [liabilities]);

  function openCreate() {
    setSelected(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(liability: LiabilityRow) {
    setSelected(liability);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: DebtActionResult) {
    setMode(null);
    setSelected(null);
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
            `.env.local`에 Supabase URL과 anon key를 넣으면 부채를 볼 수 있어요.
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
          <CardDescription>로그인하면 부채 현황을 볼 수 있어요.</CardDescription>
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
            멤버 연결을 마치면 부채를 관리할 수 있어요.
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
            <p className="text-sm text-muted-foreground">남은 원금</p>
            <p className="mt-2 text-xl font-semibold text-destructive">
              {formatMoney(summary.balanceTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">최초 원금</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.principalTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">지금까지 갚은 원금</p>
            <p className="mt-2 text-xl font-semibold text-primary">
              {formatMoney(summary.paidTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">부채 건수</p>
            <p className="mt-2 text-xl font-semibold">{summary.count}건</p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            월 이자는 고정비로, 원금 상환은 여기서 기록하면 연결계좌 잔액에
            반영돼요.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
          <Plus className="size-4" aria-hidden="true" />
          부채 추가하기
        </Button>
      </div>

      {mode ? (
        <LiabilityForm
          accounts={accounts}
          householdId={household.id}
          key={`${mode}-${selected?.id ?? "new"}`}
          liability={selected}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {liabilities.length > 0 ? (
          liabilities.map((liability) => {
            const principal = toAmount(liability.principal);
            const balance = toAmount(liability.current_balance);
            const paid = Math.max(0, principal - balance);
            const percent = principal > 0 ? (paid / principal) * 100 : 0;
            const done = balance <= 0;
            const linkedAccountName =
              liability.account_id &&
              accountNameById.has(liability.account_id)
                ? (accountNameById.get(liability.account_id) as string)
                : null;

            return (
              <Card
                className={cn(
                  "border-l-4",
                  done ? "border-l-chart-2" : "border-l-destructive",
                )}
                key={liability.id}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{liability.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {liabilityTypeLabels[liability.liability_type]} ·{" "}
                        {liabilityOwnerLabels[liability.owner_label]}
                        {linkedAccountName ? ` · ${linkedAccountName}` : ""}
                      </CardDescription>
                    </div>
                    <Badge variant={done ? "secondary" : "outline"}>
                      {done ? "상환 완료" : "상환 중"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {formatMoney(balance)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        최초 {formatMoney(principal)}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {liability.interest_rate != null ? (
                        <p>연 {toAmount(liability.interest_rate)}%</p>
                      ) : null}
                      {liability.interest_day ? (
                        <p>매달 {liability.interest_day}일 이자</p>
                      ) : null}
                      {liability.ends_on ? <p>만기 {liability.ends_on}</p> : null}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>지금까지 {formatMoney(paid)} 갚음</span>
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

                  {liability.memo ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {liability.memo}
                    </p>
                  ) : null}

                  <RepayPanel
                    householdId={household.id}
                    liability={liability}
                    linkedAccountName={linkedAccountName}
                    onResult={setResult}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => openEdit(liability)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      수정
                    </Button>
                    <DeleteButton
                      householdId={household.id}
                      liability={liability}
                      onResult={setResult}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="lg:col-span-2">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <Landmark
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">아직 등록한 부채가 없어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  전세대출, 신용대출을 등록하면 남은 원금과 순자산을 볼 수 있어요.
                </p>
              </div>
              <Button onClick={openCreate} type="button">
                <Plus className="size-4" aria-hidden="true" />
                부채 추가하기
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet className="size-3.5" aria-hidden="true" />
        월 이자는 고정비(구독·고정비)에서 매달 자동으로 기록하는 걸 추천해요.
      </p>
    </div>
  );
}
