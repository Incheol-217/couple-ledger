"use client";

import { useMemo, useState, useTransition } from "react";
import { Calculator, Info, Save } from "lucide-react";
import { saveTaxProfilesAction, type TaxActionResult } from "./actions";
import {
  memberLabels,
  type MemberSpending,
  type TaxPageData,
  type TaxProfileRow,
} from "./types";
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
import { formatAmountInput } from "@/lib/formatters/money";
import {
  cardDeduction,
  estimatedTaxBase,
  estimatedTaxSavings,
  marginalRate,
} from "@/lib/tax/estimate";
import { cn } from "@/lib/utils";

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "KRW",
});

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

function toNumber(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function salaryFor(profiles: TaxProfileRow[], label: "husband" | "wife") {
  const profile = profiles.find((row) => row.member_label === label);
  return profile ? toNumber(profile.annual_salary) : 0;
}

function resultClassName(result: TaxActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function MemberEstimateCard({
  member,
  salary,
}: {
  member: MemberSpending;
  salary: number;
}) {
  const credit = member.own.credit + member.sharedShare.credit;
  const checkCash = member.own.checkCash + member.sharedShare.checkCash;
  const excluded = member.own.excluded + member.sharedShare.excluded;
  const totalEligible = credit + checkCash;

  const result = cardDeduction(salary, { credit, checkCash });
  const savings = estimatedTaxSavings(salary, result.deduction);
  const thresholdPercent =
    result.threshold > 0
      ? Math.min(100, (totalEligible / result.threshold) * 100)
      : 0;
  const limitPercent =
    result.limit > 0 ? Math.min(100, (result.deduction / result.limit) * 100) : 0;
  const overThreshold = result.remainingToThreshold <= 0 && salary > 0;
  const rate = salary > 0 ? marginalRate(estimatedTaxBase(salary)) : 0;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{member.displayName}</CardTitle>
            <CardDescription className="mt-2">
              {memberLabels[member.label]} · 총급여{" "}
              {salary > 0 ? formatMoney(salary) : "미입력"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {salary <= 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            아래에서 총급여를 입력하면 공제 예상액을 계산해 드려요.
          </p>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted-foreground">예상 절세액</p>
              <p
                className={cn(
                  "mt-1 text-3xl font-semibold",
                  savings > 0 ? "text-primary" : undefined,
                )}
              >
                {formatMoney(savings)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                소득공제 {formatMoney(result.deduction)} × 한계세율{" "}
                {Math.round(rate * 100)}% (지방세 포함)
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  공제 문턱 (총급여의 25%)
                </span>
                <span>
                  {formatMoney(totalEligible)} / {formatMoney(result.threshold)}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    overThreshold ? "bg-primary" : "bg-chart-3",
                  )}
                  style={{ width: `${thresholdPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {overThreshold
                  ? "문턱을 넘었어요. 지금부터 쓰는 금액이 공제돼요."
                  : `문턱까지 ${formatMoney(result.remainingToThreshold)} 남았어요. 그 전까지는 공제가 없어요.`}
              </p>
            </div>

            {overThreshold ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">공제 한도</span>
                  <span>
                    {formatMoney(result.deduction)} / {formatMoney(result.limit)}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${limitPercent}%` }}
                  />
                </div>
                {result.deduction >= result.limit ? (
                  <p className="text-xs text-muted-foreground">
                    한도를 다 채웠어요. 추가 사용해도 공제는 늘지 않아요.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    문턱을 넘었으니 공제율 높은 체크카드·현금영수증(30%)이
                    신용카드(15%)보다 유리해요.
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}

        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">신용카드 사용액 (15%)</dt>
            <dd>{formatMoney(credit)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">현금영수증 사용액 (30%)</dt>
            <dd>{formatMoney(checkCash)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">계좌이체 등 공제 제외</dt>
            <dd>{formatMoney(excluded)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function TaxClient({
  errorMessage,
  household,
  isConfigured,
  isSignedIn,
  members,
  profiles,
  year,
}: TaxPageData) {
  const [result, setResult] = useState<TaxActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    const husbandSalary = salaryFor(profiles, "husband");
    const wifeSalary = salaryFor(profiles, "wife");

    const savingsTotal = members.reduce((sum, member) => {
      const salary = member.label === "husband" ? husbandSalary : wifeSalary;
      const deduction = cardDeduction(salary, {
        credit: member.own.credit + member.sharedShare.credit,
        checkCash: member.own.checkCash + member.sharedShare.checkCash,
      });
      return sum + estimatedTaxSavings(salary, deduction.deduction);
    }, 0);

    return { husbandSalary, wifeSalary, savingsTotal };
  }, [members, profiles]);

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult = await saveTaxProfilesAction(formData);
      setResult(actionResult);
    });
  }

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supabase 설정을 확인해 주세요</CardTitle>
          <CardDescription>
            `.env.local`에 Supabase URL과 anon key를 넣으면 사용할 수 있어요.
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
            로그인하면 연말정산 예상 환급을 볼 수 있어요.
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
            멤버 연결을 마치면 연말정산 예상 환급을 볼 수 있어요.
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

      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {year}년 부부 합산 예상 절세액
            </p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {formatMoney(totals.savingsTotal)}
            </p>
          </div>
          <Calculator
            className="hidden size-8 text-muted-foreground sm:block"
            aria-hidden="true"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>총급여 입력</CardTitle>
          <CardDescription>
            세전 연봉(총급여)을 입력하면 공제 문턱과 한도를 계산해요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submit} className="grid gap-4 sm:grid-cols-2">
            <input name="household_id" type="hidden" value={household.id} />
            <div className="space-y-2">
              <Label htmlFor="salary-husband">남편 총급여 (연)</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  totals.husbandSalary > 0
                    ? formatAmountInput(String(totals.husbandSalary))
                    : ""
                }
                id="salary-husband"
                inputMode="numeric"
                name="salary_husband"
                onInput={formatAmountField}
                placeholder="50,000,000"
                type="text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary-wife">아내 총급여 (연)</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  totals.wifeSalary > 0
                    ? formatAmountInput(String(totals.wifeSalary))
                    : ""
                }
                id="salary-wife"
                inputMode="numeric"
                name="salary_wife"
                onInput={formatAmountField}
                placeholder="40,000,000"
                type="text"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button disabled={isPending} type="submit">
                <Save className="size-4" aria-hidden="true" />
                {isPending ? "저장하고 있어요" : "저장하기"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {members.map((member) => (
          <MemberEstimateCard
            key={member.label}
            member={member}
            salary={
              member.label === "husband"
                ? totals.husbandSalary
                : totals.wifeSalary
            }
          />
        ))}
      </section>

      <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            신용카드 등 사용금액 소득공제만 추정한 값이에요. 의료비·교육비·연금
            등 다른 공제와 전통시장·대중교통 추가한도는 반영하지 않아요.
          </p>
          <p>
            카드 계좌는 신용카드(15%), 현금 계좌는 현금영수증(30%)으로
            가정하고, 계좌이체 지출은 공제 대상에서 빼요. 공용 계좌 지출은
            절반씩 나눠 계산해요.
          </p>
        </div>
      </div>
    </div>
  );
}
