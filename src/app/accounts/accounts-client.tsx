"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Banknote,
  Building2,
  CreditCard,
  Layers,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Wallet,
} from "lucide-react";
import {
  createAccountAction,
  deactivateAccountAction,
  moveAccountAction,
  updateAccountAction,
  type AccountActionResult,
} from "./actions";
import {
  accountTypeLabels,
  accountTypes,
  ownerTypeLabels,
  ownerTypes,
  type AccountRow,
  type AccountType,
  type HouseholdOption,
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
import { formatAmountInput, formatWon } from "@/lib/formatters/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const typeIconMap: Record<AccountType, typeof Landmark> = {
  bank: Landmark,
  card: CreditCard,
  cash: Wallet,
  savings: PiggyBank,
  virtual: Layers,
};

const suggestedColors = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"];

function resultClassName(result: AccountActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function getWithdrawalName(accounts: AccountRow[], id: string | null) {
  if (!id) {
    return "-";
  }

  return accounts.find((account) => account.id === id)?.name ?? "-";
}

function readableAccountId(account: AccountRow) {
  return account.masked_identifier
    ? `•••• ${account.masked_identifier}`
    : "별칭 없음";
}

function formatAccountBalance(value: AccountRow["opening_balance"]) {
  return formatWon(Number(value) || 0);
}

function formatAccountBalanceInput(value: AccountRow["opening_balance"] | null) {
  if (value === null || value === "") {
    return "";
  }

  return formatAmountInput(String(Math.round(Number(value) || 0)));
}

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function walletCardBackground(account: AccountRow, selected: boolean) {
  const color = account.color ?? "#aeee00";

  if (!selected) {
    return `linear-gradient(135deg, ${color} 0%, #f7f7f2 58%, #111214 130%)`;
  }

  return `radial-gradient(circle at 84% 18%, rgba(255,255,255,0.35), transparent 26%), linear-gradient(145deg, ${color} 0%, #202124 62%, #111214 100%)`;
}

function handleKeyboardSelect(
  event: React.KeyboardEvent<HTMLElement>,
  onSelect: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function AccountIcon({
  account,
  className,
}: {
  account: AccountRow;
  className?: string;
}) {
  const Icon = typeIconMap[account.type];

  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md text-white",
        className,
      )}
      style={{ backgroundColor: account.color ?? "var(--primary)" }}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function WalletAccountCard({
  account,
  accounts,
  householdId,
  isAdmin,
  isPending,
  onDeactivate,
  onEdit,
  onSelect,
  selected,
  stackIndex,
}: {
  account: AccountRow;
  accounts: AccountRow[];
  householdId: string;
  isAdmin: boolean;
  isPending: boolean;
  onDeactivate: (formData: FormData) => void;
  onEdit: (account: AccountRow) => void;
  onSelect: (accountId: string) => void;
  selected: boolean;
  stackIndex: number;
}) {
  const offsetIndex = Math.max(stackIndex, 0);
  const mobileTranslateY = selected ? 0 : 70 + offsetIndex * 32;
  const desktopTranslateY = selected ? 0 : 92 + offsetIndex * 44;
  const translateX = selected ? 0 : Math.min(offsetIndex + 1, 4) * 5;
  const scale = selected ? 1 : 1 - Math.min(offsetIndex + 1, 5) * 0.025;
  const rotate = selected ? 0 : -Math.min(offsetIndex + 1, 4) * 0.45;
  const baseColor = account.color ?? "#aeee00";

  return (
    <article
      aria-label={`${account.name} 계좌`}
      aria-pressed={selected}
      className={cn(
        "absolute inset-x-0 top-0 h-60 cursor-pointer overflow-hidden rounded-[1.65rem] border p-4 shadow-[0_22px_50px_rgba(18,18,18,0.28)] outline-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:translate3d(var(--card-x),var(--mobile-card-y),0)_scale(var(--card-scale))_rotate(var(--card-rotate))] focus-visible:ring-4 focus-visible:ring-primary/40 sm:h-80 sm:rounded-[2rem] sm:p-5 sm:[transform:translate3d(var(--card-x),var(--desktop-card-y),0)_scale(var(--card-scale))_rotate(var(--card-rotate))]",
        selected
          ? "border-white/20 text-white"
          : "border-black/10 text-[#111214] hover:brightness-105",
      )}
      onClick={() => onSelect(account.id)}
      onKeyDown={(event) => handleKeyboardSelect(event, () => onSelect(account.id))}
      role="button"
      style={{
        "--card-rotate": `${rotate}deg`,
        "--card-scale": String(scale),
        "--card-x": `${translateX}px`,
        "--desktop-card-y": `${desktopTranslateY}px`,
        "--mobile-card-y": `${mobileTranslateY}px`,
        background: walletCardBackground(account, selected),
        zIndex: selected ? 40 : 30 - offsetIndex,
      } as React.CSSProperties}
      tabIndex={0}
    >
      <span
        className="absolute right-6 top-0 h-7 w-24 -translate-y-2 rounded-t-[1.15rem] border border-white/20 border-b-0 sm:right-8 sm:h-9 sm:w-28 sm:-translate-y-3 sm:rounded-t-[1.35rem]"
        style={{ background: baseColor }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <AccountIcon
              account={account}
              className={cn("size-9 rounded-full sm:size-10", selected ? "bg-white/20" : "")}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold sm:text-lg">
                {account.name}
              </p>
              <p
                className={cn(
                  "mt-1 truncate text-xs sm:text-sm",
                  selected ? "text-white/68" : "text-black/58",
                )}
              >
                {accountTypeLabels[account.type]} ·{" "}
                {ownerTypeLabels[account.owner_type]}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              "shrink-0",
              selected ? "bg-white text-secondary" : "bg-secondary text-white",
            )}
          >
            {selected ? "앞면" : ownerTypeLabels[account.owner_type]}
          </Badge>
        </div>

        <div className={selected ? "mt-6 sm:mt-8" : "mt-auto"}>
          <p
            className={cn(
              "text-xs",
              selected ? "text-white/58" : "text-black/55",
            )}
          >
            {account.institution_name ?? "기관 없음"}
          </p>
          <p className="mt-1 font-mono text-xs tracking-normal sm:text-sm">
            {readableAccountId(account)}
          </p>
          <p
            className={cn(
              "mt-3 text-lg font-semibold tracking-normal sm:text-2xl",
              selected ? "text-white" : "text-black",
            )}
          >
            {formatAccountBalance(account.opening_balance)}
          </p>
          <p
            className={cn(
              "mt-1 text-xs",
              selected ? "text-white/58" : "text-black/55",
            )}
          >
            등록 잔액
          </p>
        </div>

        <div
          className={cn(
            "mt-5 gap-2 transition-all duration-500 sm:grid sm:grid-cols-4",
            selected
              ? "hidden opacity-100 sm:grid"
              : "pointer-events-none hidden max-h-0 opacity-0",
          )}
        >
          <div className="rounded-[1.15rem] bg-white/14 p-3 backdrop-blur">
            <p className={cn("text-xs", selected ? "text-white/56" : "")}>기관</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {account.institution_name ?? "-"}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-white/14 p-3 backdrop-blur">
            <p className={cn("text-xs", selected ? "text-white/56" : "")}>기본 출금</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {account.type === "card"
                ? getWithdrawalName(accounts, account.default_withdrawal_account_id)
                : "-"}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-white/14 p-3 backdrop-blur">
            <p className={cn("text-xs", selected ? "text-white/56" : "")}>표시 순서</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {account.display_order}
            </p>
          </div>
          <div className="rounded-[1.15rem] bg-white/14 p-3 backdrop-blur">
            <p className={cn("text-xs", selected ? "text-white/56" : "")}>기준일</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {account.opening_balance_as_of}
            </p>
          </div>
        </div>

        {selected && isAdmin ? (
          <div
            className="mt-auto flex gap-2 pt-4 sm:mt-4 sm:pt-0"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              className="flex-1 bg-white text-secondary hover:bg-white/90"
              onClick={() => onEdit(account)}
              type="button"
              variant="outline"
            >
              <Pencil className="size-4" aria-hidden="true" />
              수정
            </Button>
            <form action={onDeactivate}>
              <input name="household_id" type="hidden" value={householdId} />
              <input name="account_id" type="hidden" value={account.id} />
              <Button
                className="bg-white/12 px-3 text-white hover:bg-white/20 sm:px-4"
                disabled={isPending}
                type="submit"
                variant="outline"
              >
                <Archive className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">숨기기</span>
                <span className="sr-only sm:hidden">숨기기</span>
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function WalletDeck({
  accounts,
  allAccounts,
  householdId,
  isAdmin,
  isPending,
  onCreate,
  onDeactivate,
  onEdit,
  onSelect,
  selectedAccountId,
}: {
  accounts: AccountRow[];
  allAccounts: AccountRow[];
  householdId: string;
  isAdmin: boolean;
  isPending: boolean;
  onCreate: () => void;
  onDeactivate: (formData: FormData) => void;
  onEdit: (account: AccountRow) => void;
  onSelect: (accountId: string) => void;
  selectedAccountId: string | null;
}) {
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts[0] ??
    null;
  const stackedAccounts = selectedAccount
    ? [
        selectedAccount,
        ...accounts.filter((account) => account.id !== selectedAccount.id),
      ]
    : [];
  const mobileDeckHeight = Math.max(
    278,
    Math.min(430, 278 + Math.max(stackedAccounts.length - 1, 0) * 32),
  );
  const desktopDeckHeight = Math.max(
    430,
    Math.min(660, 372 + Math.max(stackedAccounts.length - 1, 0) * 44),
  );

  if (accounts.length === 0) {
    return (
      <Card className="overflow-hidden rounded-[2rem]">
        <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center">
          <Banknote className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">계좌를 추가해 주세요</p>
            <p className="mt-1 text-sm text-muted-foreground">
              생활비 통장, 공용 카드, 현금을 먼저 넣어보세요.
            </p>
          </div>
          {isAdmin ? (
            <Button onClick={onCreate} type="button">
              <Plus className="size-4" aria-hidden="true" />
              계좌 추가
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] bg-[#111214] p-3 text-white shadow-[0_24px_70px_rgba(18,18,18,0.22)] sm:rounded-[2rem] sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/58">Wallet</p>
          <h2 className="text-xl font-semibold tracking-normal sm:text-2xl">
            계좌 지갑
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-white text-secondary">{accounts.length}개</Badge>
          {isAdmin ? (
            <Button
              className="bg-primary text-secondary hover:bg-primary/90"
              onClick={onCreate}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              계좌 추가
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div
          className="relative min-h-[var(--mobile-deck-height)] sm:min-h-[var(--desktop-deck-height)]"
          style={
            {
              "--desktop-deck-height": `${desktopDeckHeight}px`,
              "--mobile-deck-height": `${mobileDeckHeight}px`,
            } as React.CSSProperties
          }
        >
          {stackedAccounts.map((account, index) => (
            <WalletAccountCard
              account={account}
              accounts={allAccounts}
              householdId={householdId}
              isAdmin={isAdmin}
              isPending={isPending}
              key={account.id}
              onDeactivate={onDeactivate}
              onEdit={onEdit}
              onSelect={onSelect}
              selected={account.id === selectedAccount?.id}
              stackIndex={index - 1}
            />
          ))}
        </div>

        <aside className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/55">선택된 계좌</p>
              <h3 className="mt-1 text-xl font-semibold tracking-normal">
                {selectedAccount?.name}
              </h3>
            </div>
            {selectedAccount ? <AccountIcon account={selectedAccount} /> : null}
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="flex items-center gap-2 text-white/58">
                <Building2 className="size-4" aria-hidden="true" />
                기관
              </dt>
              <dd className="truncate font-medium">
                {selectedAccount?.institution_name ?? "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">타입</dt>
              <dd className="font-medium">
                {selectedAccount ? accountTypeLabels[selectedAccount.type] : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">소유</dt>
              <dd className="font-medium">
                {selectedAccount
                  ? ownerTypeLabels[selectedAccount.owner_type]
                  : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">등록 잔액</dt>
              <dd className="font-medium">
                {selectedAccount
                  ? formatAccountBalance(selectedAccount.opening_balance)
                  : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">잔액 기준일</dt>
              <dd className="font-medium">
                {selectedAccount?.opening_balance_as_of ?? "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">카드 출금</dt>
              <dd className="truncate font-medium">
                {selectedAccount?.type === "card"
                  ? getWithdrawalName(
                      allAccounts,
                      selectedAccount.default_withdrawal_account_id,
                    )
                  : "-"}
              </dd>
            </div>
          </dl>

          <div className="mt-5 rounded-[1rem] bg-primary px-3 py-2 text-sm font-semibold text-secondary">
            사용 중인 계좌 {accounts.length}개
          </div>
        </aside>
      </div>
    </section>
  );
}

function AccountForm({
  accounts,
  householdId,
  mode,
  onDone,
  selectedAccount,
}: {
  accounts: AccountRow[];
  householdId: string;
  mode: "create" | "edit";
  onDone: (result?: AccountActionResult) => void;
  selectedAccount: AccountRow | null;
}) {
  const [type, setType] = useState<AccountType>(selectedAccount?.type ?? "bank");
  const [color, setColor] = useState(selectedAccount?.color ?? suggestedColors[0]);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const withdrawalAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.is_active &&
          account.type !== "card" &&
          account.id !== selectedAccount?.id,
      ),
    [accounts, selectedAccount?.id],
  );

  function submit(formData: FormData) {
    formData.set("type", type);
    formData.set("color", color);

    startTransition(async () => {
      const actionResult =
        mode === "create"
          ? await createAccountAction(formData)
          : await updateAccountAction(formData);

      setResult(actionResult);

      if (actionResult.ok) {
        onDone(actionResult);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "계좌 추가하기" : "계좌 고치기"}</CardTitle>
        <CardDescription>
          통장에 들어있는 돈도 함께 적어주세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-5">
          <input name="household_id" type="hidden" value={householdId} />
          {selectedAccount ? (
            <input name="account_id" type="hidden" value={selectedAccount.id} />
          ) : null}

          <div className={cn("rounded-md border px-3 py-2 text-sm", resultClassName(result))}>
            {result?.message}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-name">계좌 이름</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.name ?? ""}
                id="account-name"
                name="name"
                placeholder="생활비 통장"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-type">계좌 종류</Label>
              <Select
                id="account-type"
                name="type"
                onChange={(event) => setType(event.target.value as AccountType)}
                value={type}
              >
                {accountTypes.map((accountType) => (
                  <option key={accountType} value={accountType}>
                    {accountTypeLabels[accountType]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner-type">소유 구분</Label>
              <Select
                defaultValue={selectedAccount?.owner_type ?? "shared"}
                id="owner-type"
                name="owner_type"
              >
                {ownerTypes.map((ownerType) => (
                  <option key={ownerType} value={ownerType}>
                    {ownerTypeLabels[ownerType]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution-name">은행·카드사</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.institution_name ?? ""}
                id="institution-name"
                name="institution_name"
                placeholder="신한은행, 현대카드"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="masked-identifier">끝자리나 별칭</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.masked_identifier ?? ""}
                id="masked-identifier"
                name="masked_identifier"
                placeholder="1234"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opening-balance">등록 잔액</Label>
              <Input
                autoComplete="off"
                defaultValue={formatAccountBalanceInput(
                  selectedAccount?.opening_balance ?? null,
                )}
                id="opening-balance"
                inputMode="numeric"
                name="opening_balance"
                onInput={formatAmountField}
                placeholder="1,000,000"
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opening-balance-as-of">잔액 기준일</Label>
              <Input
                defaultValue={
                  selectedAccount?.opening_balance_as_of ?? todayString()
                }
                id="opening-balance-as-of"
                name="opening_balance_as_of"
                type="date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-color">색상</Label>
              <div className="flex gap-2">
                <Input
                  className="w-20 px-2"
                  id="account-color"
                  onChange={(event) => setColor(event.target.value)}
                  type="color"
                  value={color}
                />
                <div className="flex flex-wrap gap-2">
                  {suggestedColors.map((suggestedColor) => (
                    <button
                      aria-label={`${suggestedColor} 색상 선택`}
                      className={cn(
                        "size-9 rounded-md border transition",
                        color === suggestedColor
                          ? "ring-2 ring-ring ring-offset-2"
                          : "hover:scale-105",
                      )}
                      key={suggestedColor}
                      onClick={() => setColor(suggestedColor)}
                      style={{ backgroundColor: suggestedColor }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {type === "card" ? (
            <div className="space-y-2">
              <Label htmlFor="default-withdrawal-account">
                카드값이 빠져나갈 계좌
              </Label>
              <Select
                defaultValue={selectedAccount?.default_withdrawal_account_id ?? ""}
                id="default-withdrawal-account"
                name="default_withdrawal_account_id"
              >
                <option value="">선택하지 않기</option>
                {withdrawalAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabels[account.type]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => onDone()} type="button" variant="outline">
              닫기
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending
                ? "저장하고 있어요"
                : mode === "create"
                  ? "추가하기"
                  : "저장하기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountsClient({
  accounts,
  errorMessage,
  household,
  isAdmin,
  isConfigured,
  isSignedIn,
}: {
  accounts: AccountRow[];
  errorMessage?: string;
  household: HouseholdOption | null;
  isAdmin: boolean;
  isConfigured: boolean;
  isSignedIn: boolean;
}) {
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    accounts.find((account) => account.is_active)?.id ?? null,
  );
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeAccounts = accounts.filter((account) => account.is_active);
  const inactiveAccounts = accounts.filter((account) => !account.is_active);
  const resolvedSelectedWalletId =
    activeAccounts.find((account) => account.id === selectedWalletId)?.id ??
    activeAccounts[0]?.id ??
    null;

  function openCreate() {
    if (!isAdmin) {
      setResult({
        ok: false,
        message: "관리자 계정으로 계좌를 추가할 수 있어요.",
      });
      return;
    }

    setSelectedAccount(null);
    setMode("create");
    setResult(null);
  }

  function openEdit(account: AccountRow) {
    if (!isAdmin) {
      setResult({
        ok: false,
        message: "관리자 계정으로 계좌를 바꿀 수 있어요.",
      });
      return;
    }

    setSelectedAccount(account);
    setMode("edit");
    setResult(null);
  }

  function closeForm(nextResult?: AccountActionResult) {
    setMode(null);
    setSelectedAccount(null);
    if (nextResult) {
      setResult(nextResult);
    }
  }

  function runSimpleAction(
    action: typeof deactivateAccountAction | typeof moveAccountAction,
    formData: FormData,
  ) {
    if (!isAdmin) {
      setResult({
        ok: false,
        message: "관리자 계정으로 계좌를 바꿀 수 있어요.",
      });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const actionResult = await action(formData);
      setResult(actionResult);
    });
  }

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supabase 설정을 확인해 주세요</CardTitle>
          <CardDescription>
            `.env.local`에 Supabase URL과 anon key를 넣으면 계좌를 볼 수 있어요.
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
            로그인하면 함께 쓰는 계좌만 보여요.
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
            멤버 연결을 마치면 계좌를 추가할 수 있어요.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{household.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            사용 중 {activeAccounts.length}개 · 숨김{" "}
            {inactiveAccounts.length}개
          </p>
        </div>
        {isAdmin ? (
          <Button className="w-full sm:w-auto" onClick={openCreate} type="button">
            <Plus className="size-4" aria-hidden="true" />
            계좌 추가
          </Button>
        ) : (
          <Badge className="w-fit" variant="secondary">
            볼 수만 있어요
          </Badge>
        )}
      </div>

      {!isAdmin ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            계좌 추가와 변경은 관리자 계정으로 할 수 있어요.
          </CardContent>
        </Card>
      ) : null}

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

      {mode && isAdmin ? (
        <AccountForm
          accounts={accounts}
          householdId={household.id}
          mode={mode}
          onDone={closeForm}
          selectedAccount={selectedAccount}
        />
      ) : null}

      <WalletDeck
        accounts={activeAccounts}
        allAccounts={accounts}
        householdId={household.id}
        isAdmin={isAdmin}
        isPending={isPending}
        onCreate={openCreate}
        onDeactivate={(formData) =>
          runSimpleAction(deactivateAccountAction, formData)
        }
        onEdit={openEdit}
        onSelect={setSelectedWalletId}
        selectedAccountId={resolvedSelectedWalletId}
      />

      <Card className="md:hidden">
        <CardHeader>
          <CardTitle>계좌 보기</CardTitle>
          <CardDescription>
            등록한 계좌와 카드를 한눈에 볼 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accounts.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              추가한 계좌가 없어요.
            </div>
          ) : (
            accounts.map((account, index) => (
              <div
                className={cn(
                  "rounded-[1.25rem] border bg-muted/20 p-3",
                  !account.is_active && "opacity-55",
                )}
                key={account.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountIcon account={account} className="size-9 rounded-full" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{account.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {accountTypeLabels[account.type]} ·{" "}
                        {ownerTypeLabels[account.owner_type]}
                      </p>
                    </div>
                  </div>
                  <Badge variant={account.is_active ? "default" : "outline"}>
                    {account.is_active ? "사용 중" : "숨김"}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">기관</span>
                    <span className="truncate">
                      {account.institution_name ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">등록 잔액</span>
                    <span className="truncate font-medium">
                      {formatAccountBalance(account.opening_balance)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">카드 출금</span>
                    <span className="truncate">
                      {account.type === "card"
                        ? getWithdrawalName(
                            accounts,
                            account.default_withdrawal_account_id,
                          )
                        : "-"}
                    </span>
                  </div>
                </div>

                {isAdmin ? (
                  <div className="mt-3 grid grid-cols-[auto_auto_1fr_auto] gap-2">
                    <form
                      action={(formData) =>
                        runSimpleAction(moveAccountAction, formData)
                      }
                    >
                      <input
                        name="household_id"
                        type="hidden"
                        value={household.id}
                      />
                      <input name="account_id" type="hidden" value={account.id} />
                      <input name="direction" type="hidden" value="up" />
                      <Button
                        disabled={!account.is_active || index === 0 || isPending}
                        size="icon"
                        type="submit"
                        variant="outline"
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                        <span className="sr-only">위로 이동</span>
                      </Button>
                    </form>
                    <form
                      action={(formData) =>
                        runSimpleAction(moveAccountAction, formData)
                      }
                    >
                      <input
                        name="household_id"
                        type="hidden"
                        value={household.id}
                      />
                      <input name="account_id" type="hidden" value={account.id} />
                      <input name="direction" type="hidden" value="down" />
                      <Button
                        disabled={
                          !account.is_active ||
                          index >= activeAccounts.length - 1 ||
                          isPending
                        }
                        size="icon"
                        type="submit"
                        variant="outline"
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                        <span className="sr-only">아래로 이동</span>
                      </Button>
                    </form>
                    <Button
                      onClick={() => openEdit(account)}
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      수정
                    </Button>
                    {account.is_active ? (
                      <form
                        action={(formData) =>
                          runSimpleAction(deactivateAccountAction, formData)
                        }
                      >
                        <input
                          name="household_id"
                          type="hidden"
                          value={household.id}
                        />
                        <input name="account_id" type="hidden" value={account.id} />
                        <Button
                          disabled={isPending}
                          size="icon"
                          type="submit"
                          variant="outline"
                        >
                          <Archive className="size-4" aria-hidden="true" />
                          <span className="sr-only">숨기기</span>
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>계좌 목록</CardTitle>
          <CardDescription>
            {isAdmin
              ? "위아래 버튼으로 보이는 순서를 바꿀 수 있어요."
              : "관리자 계정으로 로그인하면 계좌를 추가하거나 순서를 바꿀 수 있어요."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계좌</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>소유</TableHead>
                <TableHead className="text-right">등록 잔액</TableHead>
                <TableHead>기본 출금</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account, index) => (
                <TableRow
                  className={!account.is_active ? "opacity-55" : undefined}
                  key={account.id}
                >
                  <TableCell>
                    <div className="flex min-w-48 items-center gap-3">
                      <AccountIcon account={account} className="size-8" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{account.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {account.institution_name ?? "기관 없음"}
                          {account.masked_identifier
                            ? ` · ${account.masked_identifier}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{accountTypeLabels[account.type]}</TableCell>
                  <TableCell>{ownerTypeLabels[account.owner_type]}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAccountBalance(account.opening_balance)}
                  </TableCell>
                  <TableCell>
                    {account.type === "card"
                      ? getWithdrawalName(
                          accounts,
                          account.default_withdrawal_account_id,
                        )
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.is_active ? "default" : "outline"}>
                      {account.is_active ? "사용 중" : "숨김"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <div className="flex justify-end gap-1">
                        <form
                          action={(formData) =>
                            runSimpleAction(moveAccountAction, formData)
                          }
                        >
                          <input
                            name="household_id"
                            type="hidden"
                            value={household.id}
                          />
                          <input
                            name="account_id"
                            type="hidden"
                            value={account.id}
                          />
                          <input name="direction" type="hidden" value="up" />
                          <Button
                            disabled={!account.is_active || index === 0 || isPending}
                            size="icon"
                            type="submit"
                            variant="ghost"
                          >
                            <ArrowUp className="size-4" aria-hidden="true" />
                            <span className="sr-only">위로 이동</span>
                          </Button>
                        </form>
                        <form
                          action={(formData) =>
                            runSimpleAction(moveAccountAction, formData)
                          }
                        >
                          <input
                            name="household_id"
                            type="hidden"
                            value={household.id}
                          />
                          <input
                            name="account_id"
                            type="hidden"
                            value={account.id}
                          />
                          <input name="direction" type="hidden" value="down" />
                          <Button
                            disabled={
                              !account.is_active ||
                              index >= activeAccounts.length - 1 ||
                              isPending
                            }
                            size="icon"
                            type="submit"
                            variant="ghost"
                          >
                            <ArrowDown className="size-4" aria-hidden="true" />
                            <span className="sr-only">아래로 이동</span>
                          </Button>
                        </form>
                        <Button
                          onClick={() => openEdit(account)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only">수정</span>
                        </Button>
                        {account.is_active ? (
                          <form
                            action={(formData) =>
                              runSimpleAction(deactivateAccountAction, formData)
                            }
                          >
                            <input
                              name="household_id"
                              type="hidden"
                              value={household.id}
                            />
                            <input
                              name="account_id"
                              type="hidden"
                              value={account.id}
                            />
                            <Button
                              disabled={isPending}
                              size="icon"
                              type="submit"
                              variant="ghost"
                            >
                              <Archive className="size-4" aria-hidden="true" />
                              <span className="sr-only">숨기기</span>
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="block text-right text-sm text-muted-foreground">
                        볼 수만 있어요
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    추가한 계좌가 없어요.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
