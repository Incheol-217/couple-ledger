"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  createAssetAction,
  deleteAssetAction,
  refreshAssetPricesAction,
  updateAssetAction,
  updateAssetValueAction,
  type InvestActionResult,
} from "./actions";
import {
  assetClassLabels,
  assetClasses,
  assetOwnerLabels,
  assetOwners,
  type AssetClass,
  type InvestPageData,
  type InvestmentAssetRow,
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

const classAccents: Record<AssetClass, string> = {
  deposit: "bg-chart-1",
  stock: "bg-chart-2",
  fund: "bg-chart-3",
  pension: "bg-chart-4",
  crypto: "bg-chart-5",
  other: "bg-muted-foreground",
};

// 종목코드로 시세를 붙일 수 있는 자산 종류예요.
const tickerClasses: AssetClass[] = ["stock", "pension"];

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return moneyFormatter.format(Math.round(value));
}

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

function returnLabel(principal: number, value: number) {
  if (principal <= 0) {
    return null;
  }

  const rate = ((value - principal) / principal) * 100;
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
}

function resultClassName(result: InvestActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function AssetForm({
  accounts,
  asset,
  householdId,
  mode,
  onDone,
}: {
  accounts: InvestPageData["accounts"];
  asset: InvestmentAssetRow | null;
  householdId: string;
  mode: "create" | "edit";
  onDone: (result?: InvestActionResult) => void;
}) {
  const [result, setResult] = useState<InvestActionResult | null>(null);
  const [assetClass, setAssetClass] = useState<AssetClass>(
    asset?.asset_class ?? "deposit",
  );
  const [isPending, startTransition] = useTransition();
  const showTicker = tickerClasses.includes(assetClass);

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createAssetAction(formData)
          : await updateAssetAction(formData);

      setResult(actionResult);

      if (actionResult.ok) {
        onDone(actionResult);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "자산 추가하기" : "자산 고치기"}</CardTitle>
        <CardDescription>
          투입한 원금과 지금 평가액을 적으면 수익률을 계산해 드려요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {asset ? <input name="asset_id" type="hidden" value={asset.id} /> : null}

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
              <Label htmlFor="asset-name">이름</Label>
              <Input
                autoComplete="off"
                defaultValue={asset?.name ?? ""}
                id="asset-name"
                name="name"
                placeholder="삼성전자, 청년희망적금"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-class">종류</Label>
              <Select
                id="asset-class"
                name="asset_class"
                onChange={(event) =>
                  setAssetClass(event.target.value as AssetClass)
                }
                value={assetClass}
              >
                {assetClasses.map((option) => (
                  <option key={option} value={option}>
                    {assetClassLabels[option]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-owner">명의</Label>
              <Select
                defaultValue={asset?.owner_label ?? "shared"}
                id="asset-owner"
                name="owner_label"
              >
                {assetOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {assetOwnerLabels[owner]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-account">담은 계좌 (선택)</Label>
              <Select
                defaultValue={asset?.account_id ?? ""}
                id="asset-account"
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

            {showTicker ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="asset-ticker">종목코드 (선택)</Label>
                  <Input
                    autoComplete="off"
                    defaultValue={asset?.ticker ?? ""}
                    id="asset-ticker"
                    name="ticker"
                    placeholder="005930.KS, AAPL"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="asset-quantity">보유 수량 (선택)</Label>
                  <Input
                    autoComplete="off"
                    defaultValue={
                      asset?.quantity != null ? String(toAmount(asset.quantity)) : ""
                    }
                    id="asset-quantity"
                    inputMode="decimal"
                    name="quantity"
                    placeholder="10"
                  />
                </div>

                <p className="text-xs text-muted-foreground md:col-span-2">
                  종목코드와 보유 수량을 넣으면 야후 파이낸스 시세(약 15분 지연)로
                  평가액을 자동 계산해요. 코스피는 <code>005930.KS</code>, 코스닥은{" "}
                  <code>247540.KQ</code>, 미국은 <code>AAPL</code>처럼 넣어요.
                  해외 종목은 원화로 환산돼요.
                </p>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="asset-principal">투입 원금</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  asset
                    ? formatAmountInput(String(Math.round(toAmount(asset.principal))))
                    : ""
                }
                id="asset-principal"
                inputMode="numeric"
                name="principal"
                onInput={formatAmountField}
                placeholder="5,000,000"
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-value">현재 평가액 (선택)</Label>
              <Input
                autoComplete="off"
                defaultValue={
                  asset
                    ? formatAmountInput(
                        String(Math.round(toAmount(asset.current_value))),
                      )
                    : ""
                }
                id="asset-value"
                inputMode="numeric"
                name="current_value"
                onInput={formatAmountField}
                placeholder={
                  showTicker
                    ? "종목코드가 있으면 시세로 자동 계산돼요"
                    : "비우면 원금과 같게 저장돼요"
                }
                type="text"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-memo">메모</Label>
            <Textarea
              defaultValue={asset?.memo ?? ""}
              id="asset-memo"
              name="memo"
              placeholder="증권사, 만기일, 목표가"
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

function ValueUpdateForm({
  asset,
  householdId,
  onResult,
}: {
  asset: InvestmentAssetRow;
  householdId: string;
  onResult: (result: InvestActionResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await updateAssetValueAction(formData);
          onResult(result);
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="asset_id" type="hidden" value={asset.id} />
      <Input
        aria-label="새 평가액"
        className="h-9 w-36"
        inputMode="numeric"
        name="current_value"
        onInput={formatAmountField}
        placeholder="새 평가액"
        required
        type="text"
      />
      <Button disabled={isPending} size="sm" type="submit" variant="outline">
        <RefreshCcw className="size-4" aria-hidden="true" />
        평가액 갱신
      </Button>
    </form>
  );
}

function DeleteButton({
  asset,
  householdId,
  onResult,
}: {
  asset: InvestmentAssetRow;
  householdId: string;
  onResult: (result: InvestActionResult) => void;
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
          const result = await deleteAssetAction(formData);
          onResult(result);
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <input name="asset_id" type="hidden" value={asset.id} />
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

function RefreshPricesButton({
  householdId,
  onResult,
}: {
  householdId: string;
  onResult: (result: InvestActionResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          onResult(await refreshAssetPricesAction(formData));
        });
      }}
    >
      <input name="household_id" type="hidden" value={householdId} />
      <Button
        className="w-full sm:w-auto"
        disabled={isPending}
        type="submit"
        variant="outline"
      >
        <RefreshCcw className="size-4" aria-hidden="true" />
        {isPending ? "시세 불러오는 중" : "시세 새로고침"}
      </Button>
    </form>
  );
}

export function InvestClient({
  accounts,
  assets,
  errorMessage,
  household,
  isConfigured,
  isSignedIn,
  monthIncome,
  monthSavedToSavings,
}: InvestPageData) {
  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<InvestmentAssetRow | null>(
    null,
  );
  const [result, setResult] = useState<InvestActionResult | null>(null);

  const summary = useMemo(() => {
    const principalTotal = assets.reduce(
      (sum, asset) => sum + toAmount(asset.principal),
      0,
    );
    const valueTotal = assets.reduce(
      (sum, asset) => sum + toAmount(asset.current_value),
      0,
    );
    const byClass = assetClasses
      .map((assetClass) => ({
        assetClass,
        value: assets
          .filter((asset) => asset.asset_class === assetClass)
          .reduce((sum, asset) => sum + toAmount(asset.current_value), 0),
      }))
      .filter((row) => row.value > 0);
    const savingsRate =
      monthIncome > 0 ? (monthSavedToSavings / monthIncome) * 100 : null;

    return {
      byClass,
      gain: valueTotal - principalTotal,
      principalTotal,
      savingsRate,
      valueTotal,
    };
  }, [assets, monthIncome, monthSavedToSavings]);

  function openCreate() {
    setSelectedAsset(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(asset: InvestmentAssetRow) {
    setSelectedAsset(asset);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: InvestActionResult) {
    setMode(null);
    setSelectedAsset(null);
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
            `.env.local`에 Supabase URL과 anon key를 넣으면 자산을 볼 수 있어요.
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
          <CardDescription>로그인하면 자산 현황을 볼 수 있어요.</CardDescription>
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
            멤버 연결을 마치면 자산을 관리할 수 있어요.
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
            <p className="text-sm text-muted-foreground">총 평가액</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.valueTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">투입 원금</p>
            <p className="mt-2 text-xl font-semibold">
              {formatMoney(summary.principalTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">평가 손익</p>
            <p
              className={cn(
                "mt-2 text-xl font-semibold",
                summary.gain > 0 && "text-primary",
                summary.gain < 0 && "text-destructive",
              )}
            >
              {summary.gain >= 0 ? "+" : ""}
              {formatMoney(summary.gain)}
              {summary.principalTotal > 0 ? (
                <span className="ml-1 text-sm font-normal">
                  ({returnLabel(summary.principalTotal, summary.valueTotal)})
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">이번 달 저축률</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.savingsRate === null
                ? "-"
                : `${Math.round(summary.savingsRate)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              수입 대비 저축 계좌 이체 기준
            </p>
          </CardContent>
        </Card>
      </section>

      {summary.byClass.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>자산 배분</CardTitle>
            <CardDescription>평가액 기준 비중이에요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {summary.byClass.map((row) => (
                <div
                  className={classAccents[row.assetClass]}
                  key={row.assetClass}
                  style={{
                    width: `${(row.value / summary.valueTotal) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {summary.byClass.map((row) => (
                <span className="inline-flex items-center gap-1.5" key={row.assetClass}>
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      classAccents[row.assetClass],
                    )}
                  />
                  {assetClassLabels[row.assetClass]}{" "}
                  <span className="text-muted-foreground">
                    {Math.round((row.value / summary.valueTotal) * 100)}%
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            종목코드가 있는 자산은 시세로 자동 계산돼요(약 15분 지연). 나머지는
            평가액을 직접 갱신해요.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <RefreshPricesButton householdId={household.id} onResult={setResult} />
          <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
            <Plus className="size-4" aria-hidden="true" />
            자산 추가하기
          </Button>
        </div>
      </div>

      {mode ? (
        <AssetForm
          accounts={accounts}
          asset={selectedAsset}
          householdId={household.id}
          key={`${mode}-${selectedAsset?.id ?? "new"}`}
          mode={mode}
          onDone={closeForm}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {assets.length > 0 ? (
          assets.map((asset) => {
            const principal = toAmount(asset.principal);
            const value = toAmount(asset.current_value);
            const gain = value - principal;
            const rate = returnLabel(principal, value);
            const quantity = asset.quantity != null ? toAmount(asset.quantity) : 0;
            const hasTicker = Boolean(asset.ticker) && quantity > 0;
            const perShare = hasTicker ? value / quantity : null;

            return (
              <Card className="border-l-4 border-l-primary" key={asset.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{asset.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {assetClassLabels[asset.asset_class]} ·{" "}
                        {assetOwnerLabels[asset.owner_label]}
                        {asset.account_id &&
                        accountNameById.has(asset.account_id)
                          ? ` · ${accountNameById.get(asset.account_id)}`
                          : ""}{" "}
                        · 평가일 {asset.valued_at}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      {assetClassLabels[asset.asset_class]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold">{formatMoney(value)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        원금 {formatMoney(principal)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        gain > 0 && "text-primary",
                        gain < 0 && "text-destructive",
                        gain === 0 && "text-muted-foreground",
                      )}
                    >
                      {gain >= 0 ? "+" : ""}
                      {formatMoney(gain)}
                      {rate ? ` (${rate})` : ""}
                    </p>
                  </div>

                  {hasTicker ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <Badge variant="outline" className="font-mono">
                        {asset.ticker}
                      </Badge>
                      <span className="text-muted-foreground">
                        {quantity}주 · 주당 {formatMoney(perShare ?? 0)} · 약 15분
                        지연 시세
                      </span>
                    </div>
                  ) : null}

                  {asset.memo ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {asset.memo}
                    </p>
                  ) : null}

                  {hasTicker ? null : (
                    <ValueUpdateForm
                      asset={asset}
                      householdId={household.id}
                      onResult={setResult}
                    />
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => openEdit(asset)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      수정
                    </Button>
                    <DeleteButton
                      asset={asset}
                      householdId={household.id}
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
              <TrendingUp
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">아직 등록한 자산이 없어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  예적금, 주식, 연금을 등록하면 수익률과 자산 배분을 보여드려요.
                </p>
              </div>
              <Button onClick={openCreate} type="button">
                <Plus className="size-4" aria-hidden="true" />
                자산 추가하기
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
