"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Banknote,
  Building2,
  CreditCard,
  Layers,
  Landmark,
  Lock,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  createAccountAction,
  deactivateAccountAction,
  deleteAccountAction,
  moveToVaultAction,
  updateAccountVaultAction,
  moveAccountAction,
  updateAccountAction,
  type AccountActionResult,
} from "./actions";
import {
  accountTypeLabels,
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
import type { AccountBalance } from "@/lib/accounts/balances";
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
  check_card: CreditCard,
  cash: Wallet,
  savings: PiggyBank,
  virtual: Layers,
};

const suggestedColors = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"];

// 카드 결제수단(신용/체크)과 실제 돈이 담기는 계좌를 구분해요.
const cardTypes: AccountType[] = ["card", "check_card"];
const walletTypes: AccountType[] = ["bank", "cash", "savings", "virtual"];

function isCardType(type: AccountType) {
  return cardTypes.includes(type);
}

// 지갑 카드 스택 치수(px). selected=선택 카드 높이, card=나머지 카드 높이,
// peek=아래로 겹쳐 쌓일 때 각 카드가 드러나는 높이.
const WALLET_DECK = {
  mobile: { selected: 320, card: 240, peek: 46 },
  desktop: { selected: 384, card: 320, peek: 56 },
} as const;

function walletDeckHeight(
  count: number,
  dims: { selected: number; card: number; peek: number },
) {
  const others = Math.max(count - 1, 0);

  if (others === 0) {
    return dims.selected;
  }

  // 선택 카드 아래로 (others-1)개가 peek만큼, 마지막 카드는 전체가 보여요.
  return dims.selected + (others - 1) * dims.peek + dims.card;
}

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
    : "별칭 입력 전";
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
  canMoveDown,
  canMoveUp,
  currentBalance,
  householdId,
  isAdmin,
  isPending,
  onDeactivate,
  onEdit,
  onReorder,
  onSelect,
  selected,
  stackIndex,
}: {
  account: AccountRow;
  canMoveDown: boolean;
  canMoveUp: boolean;
  currentBalance: number | null;
  householdId: string;
  isAdmin: boolean;
  isPending: boolean;
  onDeactivate: (formData: FormData) => void;
  onEdit: (account: AccountRow) => void;
  onReorder: (formData: FormData) => void;
  onSelect: (accountId: string) => void;
  selected: boolean;
  stackIndex: number;
}) {
  // 현재 잔액을 우선 보여주고, 값이 없으면 처음 잔액으로 대체해요.
  const displayBalance =
    currentBalance ?? (Number(account.opening_balance) || 0);
  // 선택 카드는 맨 위, 나머지는 그 아래로 얇은 탭처럼 겹쳐 쌓아요.
  const peekIndex = Math.max(stackIndex, 0);
  const mobileTranslateY = selected
    ? 0
    : WALLET_DECK.mobile.selected + peekIndex * WALLET_DECK.mobile.peek;
  const desktopTranslateY = selected
    ? 0
    : WALLET_DECK.desktop.selected + peekIndex * WALLET_DECK.desktop.peek;
  const translateX = 0;
  const scale = 1;
  const rotate = 0;

  return (
    <article
      aria-label={`${account.name} 계좌`}
      aria-pressed={selected}
      className={cn(
        "absolute inset-x-0 top-0 cursor-pointer overflow-hidden rounded-[1.65rem] border p-4 shadow-[0_22px_50px_rgba(18,18,18,0.28)] outline-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:translate3d(var(--card-x),var(--mobile-card-y),0)_scale(var(--card-scale))_rotate(var(--card-rotate))] focus-visible:ring-4 focus-visible:ring-primary/40 sm:rounded-[2rem] sm:p-5 sm:[transform:translate3d(var(--card-x),var(--desktop-card-y),0)_scale(var(--card-scale))_rotate(var(--card-rotate))]",
        selected ? "h-[20rem] sm:h-[24rem]" : "h-60 sm:h-80",
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
        // 아래쪽(늦은 index) 카드가 위로 오게 해서 각 카드의 윗부분이 보여요.
        zIndex: selected ? 60 : 20 + peekIndex,
      } as React.CSSProperties}
      tabIndex={0}
    >
      <div
        className={cn(
          "relative z-10 flex h-full flex-col",
          // 선택 카드는 내용을 위·아래로 고르게 펼쳐 여백을 대칭으로 맞춰요.
          selected ? "justify-between" : "",
        )}
      >
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

        <div className={selected ? "mt-4" : "mt-auto"}>
          <p
            className={cn(
              "text-xs",
              selected ? "text-white/58" : "text-black/55",
            )}
          >
            {account.institution_name ?? "-"}
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
            {formatAccountBalance(displayBalance)}
          </p>
          <p
            className={cn(
              "mt-1 text-xs",
              selected ? "text-white/58" : "text-black/55",
            )}
          >
            현재 잔액
          </p>
          {account.vault_enabled ? (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                selected
                  ? "bg-white/16 text-white"
                  : "bg-black/8 text-black/70",
              )}
            >
              <Lock className="size-3" aria-hidden="true" />
              {account.vault_name ?? "금고"} ·{" "}
              {formatAccountBalance(account.vault_amount)}
            </p>
          ) : null}
        </div>

        {selected && isAdmin ? (
          <div
            className="relative z-20 flex shrink-0 flex-col gap-2 pt-4"
            onClick={(event) => event.stopPropagation()}
          >
            {canMoveUp || canMoveDown ? (
              <div className="flex gap-2">
                <form action={onReorder} className="flex-1">
                  <input name="household_id" type="hidden" value={householdId} />
                  <input name="account_id" type="hidden" value={account.id} />
                  <input name="direction" type="hidden" value="up" />
                  <Button
                    className="w-full bg-white/12 text-white hover:bg-white/20"
                    disabled={isPending || !canMoveUp}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                    위로
                  </Button>
                </form>
                <form action={onReorder} className="flex-1">
                  <input name="household_id" type="hidden" value={householdId} />
                  <input name="account_id" type="hidden" value={account.id} />
                  <input name="direction" type="hidden" value="down" />
                  <Button
                    className="w-full bg-white/12 text-white hover:bg-white/20"
                    disabled={isPending || !canMoveDown}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                    아래로
                  </Button>
                </form>
              </div>
            ) : null}
            <div className="flex gap-2">
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
          </div>
        ) : null}
      </div>
    </article>
  );
}

function WalletDeck({
  accounts,
  allAccounts,
  balanceById,
  householdId,
  isAdmin,
  isPending,
  onCreate,
  onDeactivate,
  onEdit,
  onReorder,
  onSelect,
  selectedAccountId,
}: {
  accounts: AccountRow[];
  allAccounts: AccountRow[];
  balanceById: Map<string, number>;
  householdId: string;
  isAdmin: boolean;
  isPending: boolean;
  onCreate: () => void;
  onDeactivate: (formData: FormData) => void;
  onEdit: (account: AccountRow) => void;
  onReorder: (formData: FormData) => void;
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
  const mobileDeckHeight = walletDeckHeight(
    stackedAccounts.length,
    WALLET_DECK.mobile,
  );
  const desktopDeckHeight = walletDeckHeight(
    stackedAccounts.length,
    WALLET_DECK.desktop,
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
    <section className="isolate overflow-hidden rounded-[1.75rem] bg-[#111214] p-3 text-white shadow-[0_24px_70px_rgba(18,18,18,0.22)] sm:rounded-[2rem] sm:p-6">
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div
          className="relative min-h-[var(--mobile-deck-height)] sm:min-h-[var(--desktop-deck-height)]"
          style={
            {
              "--desktop-deck-height": `${desktopDeckHeight}px`,
              "--mobile-deck-height": `${mobileDeckHeight}px`,
            } as React.CSSProperties
          }
        >
          {stackedAccounts.map((account, index) => {
            const walletIndex = accounts.findIndex(
              (candidate) => candidate.id === account.id,
            );

            return (
            <WalletAccountCard
              account={account}
              canMoveDown={
                walletIndex >= 0 && walletIndex < accounts.length - 1
              }
              canMoveUp={walletIndex > 0}
              currentBalance={balanceById.get(account.id) ?? null}
              householdId={householdId}
              isAdmin={isAdmin}
              isPending={isPending}
              key={account.id}
              onDeactivate={onDeactivate}
              onEdit={onEdit}
              onReorder={onReorder}
              onSelect={onSelect}
              selected={account.id === selectedAccount?.id}
              stackIndex={index - 1}
            />
            );
          })}
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
              <dt className="text-white/58">사용자</dt>
              <dd className="font-medium">
                {selectedAccount
                  ? ownerTypeLabels[selectedAccount.owner_type]
                  : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/16 px-3 py-2">
              <dt className="text-white/58">현재 잔액</dt>
              <dd className="font-semibold">
                {selectedAccount
                  ? formatAccountBalance(
                      balanceById.get(selectedAccount.id) ??
                        Number(selectedAccount.opening_balance) ??
                        0,
                    )
                  : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">처음 잔액</dt>
              <dd className="font-medium">
                {selectedAccount
                  ? formatAccountBalance(selectedAccount.opening_balance)
                  : "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">잔액을 확인한 날</dt>
              <dd className="font-medium">
                {selectedAccount?.opening_balance_as_of ?? "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-white/10 px-3 py-2">
              <dt className="text-white/58">연결 계좌</dt>
              <dd className="truncate font-medium">
                {selectedAccount?.type === "card" ||
                selectedAccount?.type === "check_card"
                  ? getWithdrawalName(
                      allAccounts,
                      selectedAccount.default_withdrawal_account_id,
                    )
                  : "-"}
              </dd>
            </div>
          </dl>

          {selectedAccount ? (
            <VaultPanel
              account={selectedAccount}
              householdId={householdId}
              isAdmin={isAdmin}
              key={`vault-${selectedAccount.id}-${selectedAccount.vault_enabled}`}
            />
          ) : null}

          <div className="mt-5 rounded-[1rem] bg-primary px-3 py-2 text-sm font-semibold text-secondary">
            지금 쓰는 계좌 {accounts.length}개
          </div>
        </aside>
      </div>
    </section>
  );
}

// 관리자용 계좌 삭제 버튼. 실수 방지를 위해 두 번 눌러야 지워져요.
function DeleteAccountButton({
  accountId,
  householdId,
  onResult,
  variant = "outline",
}: {
  accountId: string;
  householdId: string;
  onResult: (result: AccountActionResult) => void;
  variant?: "outline" | "ghost";
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("account_id", accountId);

    startTransition(async () => {
      const result = await deleteAccountAction(formData);
      setConfirming(false);
      onResult(result);
    });
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        size="icon"
        type="button"
        variant={variant}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">삭제</span>
      </Button>
    );
  }

  return (
    <Button
      className="border-destructive/40 px-2 text-destructive hover:bg-destructive/10"
      disabled={isPending}
      onClick={submit}
      size="sm"
      type="button"
      variant="outline"
    >
      <Trash2 className="size-4" aria-hidden="true" />
      정말 삭제할까요?
    </Button>
  );
}

function VaultPanel({
  account,
  householdId,
  isAdmin,
}: {
  account: AccountRow;
  householdId: string;
  isAdmin: boolean;
}) {
  const [enabled, setEnabled] = useState(account.vault_enabled);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  const vaultAmount = Math.round(Number(account.vault_amount) || 0);

  function submit(formData: FormData) {
    startTransition(async () => {
      const actionResult = await updateAccountVaultAction(formData);
      setResult(actionResult);
    });
  }

  // 금고에 넣기/빼기: 총 잔액은 그대로, 금고 금액만 조정해요.
  function move(direction: "in" | "out") {
    const amount = Number(moveAmount.replaceAll(",", ""));

    if (!Number.isFinite(amount) || amount <= 0) {
      setResult({ ok: false, message: "금액을 1원 이상 입력해 주세요." });
      return;
    }

    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("account_id", account.id);
    formData.set("direction", direction);
    formData.set("amount", String(Math.round(amount)));

    startTransition(async () => {
      const actionResult = await moveToVaultAction(formData);
      setResult(actionResult);
      if (actionResult.ok) {
        setMoveAmount("");
      }
    });
  }

  function toggle() {
    if (!isAdmin || isPending) {
      return;
    }

    const next = !enabled;
    setEnabled(next);

    // 끌 때는 바로 저장하고, 켤 때는 별명·금액을 적고 저장하게 둬요.
    if (!next) {
      const formData = new FormData();
      formData.set("household_id", householdId);
      formData.set("account_id", account.id);
      formData.set("vault_enabled", "false");
      formData.set("vault_name", account.vault_name ?? "");
      formData.set("vault_amount", String(Math.round(Number(account.vault_amount) || 0)));
      submit(formData);
    } else {
      setResult(null);
    }
  }

  return (
    <div className="mt-4 rounded-[1rem] border border-white/12 bg-white/8 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-white/70">
          <Lock className="size-4" aria-hidden="true" />
          금고
        </p>
        <button
          aria-checked={enabled}
          aria-label="금고 켜고 끄기"
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-primary" : "bg-white/20",
            !isAdmin && "cursor-not-allowed opacity-60",
          )}
          disabled={!isAdmin || isPending}
          onClick={toggle}
          role="switch"
          type="button"
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {result ? (
        <p
          className={cn(
            "mt-2 rounded-md border px-2 py-1.5 text-xs",
            result.ok
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-destructive/30 bg-destructive/15 text-destructive",
          )}
        >
          {result.message}
        </p>
      ) : null}

      {enabled ? (
        <>
          <dl className="mt-3 grid gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-white/58">금고에 있는 돈</dt>
              <dd className="font-medium">{formatAccountBalance(vaultAmount)}</dd>
            </div>
          </dl>

          {isAdmin ? (
            <div className="mt-3 space-y-2 rounded-[0.85rem] bg-white/8 p-2">
              <Input
                aria-label="금고에 넣거나 뺄 금액"
                autoComplete="off"
                className="h-9 border-white/15 bg-white/10 text-white placeholder:text-white/40"
                inputMode="numeric"
                onChange={(event) =>
                  setMoveAmount(formatAmountInput(event.target.value))
                }
                placeholder="금액 (예: 100,000)"
                type="text"
                value={moveAmount}
              />
              <div className="flex gap-2">
                <Button
                  className="h-9 flex-1 bg-primary text-secondary hover:bg-primary/90"
                  disabled={isPending}
                  onClick={() => move("in")}
                  size="sm"
                  type="button"
                >
                  금고에 넣기
                </Button>
                <Button
                  className="h-9 flex-1 bg-white/12 text-white hover:bg-white/20"
                  disabled={isPending}
                  onClick={() => move("out")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  빼기
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {enabled && isAdmin ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-white/58">
            금고 별명·총액 직접 고치기
          </summary>
          <form action={submit} className="mt-2 grid gap-2">
            <input name="household_id" type="hidden" value={householdId} />
            <input name="account_id" type="hidden" value={account.id} />
            <input name="vault_enabled" type="hidden" value="true" />
            <Input
              aria-label="금고 별명"
              autoComplete="off"
              className="h-9 border-white/15 bg-white/10 text-white placeholder:text-white/40"
              defaultValue={account.vault_name ?? ""}
              key={`vault-name-${account.id}`}
              name="vault_name"
              placeholder="금고 별명 (예: 비상금)"
            />
            <Input
              aria-label="금고 금액"
              autoComplete="off"
              className="h-9 border-white/15 bg-white/10 text-white placeholder:text-white/40"
              defaultValue={
                (Number(account.vault_amount) || 0) > 0
                  ? formatAmountInput(String(Math.round(Number(account.vault_amount) || 0)))
                  : ""
              }
              inputMode="numeric"
              key={`vault-amount-${account.id}`}
              name="vault_amount"
              onInput={formatAmountField}
              placeholder="금액 (예: 500,000)"
              type="text"
            />
            <Button
              className="h-9 bg-white text-secondary hover:bg-white/90"
              disabled={isPending}
              size="sm"
              type="submit"
            >
              {isPending ? "저장하고 있어요" : "금고 저장"}
            </Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function AccountForm({
  accounts,
  householdId,
  initialKind = "account",
  mode,
  onDone,
  selectedAccount,
}: {
  accounts: AccountRow[];
  householdId: string;
  initialKind?: "account" | "card";
  mode: "create" | "edit";
  onDone: (result?: AccountActionResult) => void;
  selectedAccount: AccountRow | null;
}) {
  const initialIsCard = selectedAccount
    ? isCardType(selectedAccount.type)
    : initialKind === "card";
  const [kind, setKind] = useState<"account" | "card">(
    initialIsCard ? "card" : "account",
  );
  const [type, setType] = useState<AccountType>(
    selectedAccount?.type ?? (initialIsCard ? "card" : "bank"),
  );
  const typeOptions = kind === "card" ? cardTypes : walletTypes;

  function changeKind(nextKind: "account" | "card") {
    setKind(nextKind);
    setType(nextKind === "card" ? "card" : "bank");
  }
  const [color, setColor] = useState(selectedAccount?.color ?? suggestedColors[0]);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  // 수정/추가 버튼이 페이지 아래쪽에 있어서, 폼이 열리면 폼 위치로 스크롤해요.
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const withdrawalAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.is_active &&
          account.type !== "card" &&
          account.type !== "check_card" &&
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
    <div className="scroll-mt-20" ref={formRef}>
      <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create"
            ? kind === "card"
              ? "카드 추가하기"
              : "계좌 추가하기"
            : kind === "card"
              ? "카드 고치기"
              : "계좌 고치기"}
        </CardTitle>
        <CardDescription>
          {kind === "card"
            ? "카드를 등록하고 돈이 빠져나갈 계좌를 연결해요."
            : "지금 들어있는 돈도 함께 적어주세요."}
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

          <div className="space-y-2">
            <Label>구분</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-1">
              {(["account", "card"] as const).map((option) => (
                <button
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition",
                    kind === option
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  key={option}
                  onClick={() => changeKind(option)}
                  type="button"
                >
                  {option === "card" ? "카드" : "계좌"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-name">{kind === "card" ? "카드 이름" : "계좌 이름"}</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.name ?? ""}
                id="account-name"
                name="name"
                placeholder={kind === "card" ? "신한 체크카드" : "생활비 통장"}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-type">{kind === "card" ? "카드 종류" : "계좌 종류"}</Label>
              <Select
                id="account-type"
                name="type"
                onChange={(event) => setType(event.target.value as AccountType)}
                value={type}
              >
                {typeOptions.map((accountType) => (
                  <option key={accountType} value={accountType}>
                    {accountTypeLabels[accountType]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner-type">사용자</Label>
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

            {kind === "card" ? null : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="opening-balance">처음 잔액</Label>
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
                  <Label htmlFor="opening-balance-as-of">잔액을 확인한 날</Label>
                  <Input
                    defaultValue={
                      selectedAccount?.opening_balance_as_of ?? todayString()
                    }
                    id="opening-balance-as-of"
                    name="opening_balance_as_of"
                    type="date"
                  />
                </div>
              </>
            )}

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

          {type === "card" || type === "check_card" ? (
            <div className="space-y-2">
              <Label htmlFor="default-withdrawal-account">
                {type === "card"
                  ? "카드값이 빠져나갈 계좌"
                  : "연결된 통장 (체크카드 지출이 여기서 빠져요)"}
              </Label>
              <Select
                defaultValue={selectedAccount?.default_withdrawal_account_id ?? ""}
                id="default-withdrawal-account"
                name="default_withdrawal_account_id"
              >
                <option value="">선택 안 함</option>
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
    </div>
  );
}

export function AccountsClient({
  accounts,
  accountBalances,
  errorMessage,
  household,
  isAdmin,
  isConfigured,
  isSignedIn,
}: {
  accounts: AccountRow[];
  accountBalances: AccountBalance[];
  errorMessage?: string;
  household: HouseholdOption | null;
  isAdmin: boolean;
  isConfigured: boolean;
  isSignedIn: boolean;
}) {
  // 계좌별 현재 잔액(처음 잔액 + 거래·이체 반영)을 빠르게 찾을 수 있게 맵으로 만들어요.
  const balanceById = useMemo(
    () =>
      new Map(
        accountBalances.map((entry) => [entry.account_id, entry.balance]),
      ),
    [accountBalances],
  );
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    accounts.find((account) => account.is_active)?.id ?? null,
  );
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [createKind, setCreateKind] = useState<"account" | "card">("account");
  const activeAccounts = accounts.filter((account) => account.is_active);
  const inactiveAccounts = accounts.filter((account) => !account.is_active);
  const walletAccounts = activeAccounts.filter(
    (account) => !isCardType(account.type),
  );
  const cardAccounts = activeAccounts.filter((account) =>
    isCardType(account.type),
  );
  const resolvedSelectedWalletId =
    walletAccounts.find((account) => account.id === selectedWalletId)?.id ??
    walletAccounts[0]?.id ??
    null;

  function openCreate(kind: "account" | "card" = "account") {
    if (!isAdmin) {
      setResult({
        ok: false,
        message: "관리자 계정으로 추가할 수 있어요.",
      });
      return;
    }

    setCreateKind(kind);
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              onClick={() => openCreate("account")}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              계좌 추가
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => openCreate("card")}
              type="button"
              variant="outline"
            >
              <CreditCard className="size-4" aria-hidden="true" />
              카드 추가
            </Button>
          </div>
        ) : (
          <Badge className="w-fit" variant="secondary">
            보기만 가능해요
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
          initialKind={createKind}
          key={`${mode}-${selectedAccount?.id ?? createKind}`}
          mode={mode}
          onDone={closeForm}
          selectedAccount={selectedAccount}
        />
      ) : null}

      <WalletDeck
        accounts={walletAccounts}
        allAccounts={accounts}
        balanceById={balanceById}
        householdId={household.id}
        isAdmin={isAdmin}
        isPending={isPending}
        onCreate={() => openCreate("account")}
        onDeactivate={(formData) =>
          runSimpleAction(deactivateAccountAction, formData)
        }
        onEdit={openEdit}
        onReorder={(formData) => runSimpleAction(moveAccountAction, formData)}
        onSelect={setSelectedWalletId}
        selectedAccountId={resolvedSelectedWalletId}
      />

      {cardAccounts.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">카드</h2>
            <Badge variant="secondary">{cardAccounts.length}개</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cardAccounts.map((card) => (
              <Card className="border-l-4 border-l-primary" key={card.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{card.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {accountTypeLabels[card.type]} ·{" "}
                        {ownerTypeLabels[card.owner_type]}
                      </p>
                    </div>
                    <AccountIcon account={card} className="size-9 rounded-full" />
                  </div>
                  <p className="mt-3 flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">연결 계좌</span>
                    <span className="truncate font-medium">
                      {getWithdrawalName(
                        accounts,
                        card.default_withdrawal_account_id,
                      )}
                    </span>
                  </p>
                  {isAdmin ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => openEdit(card)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        수정
                      </Button>
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
                        <input name="account_id" type="hidden" value={card.id} />
                        <Button
                          disabled={isPending}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          <Archive className="size-4" aria-hidden="true" />
                          숨기기
                        </Button>
                      </form>
                      <DeleteAccountButton
                        accountId={card.id}
                        householdId={household.id}
                        onResult={setResult}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <Card className="md:hidden">
        <CardHeader>
          <CardTitle>계좌 보기</CardTitle>
          <CardDescription>
            등록한 계좌와 카드를 한눈에 봐요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accounts.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              계좌를 추가하면 여기에 보여요.
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
                    <span className="shrink-0 text-muted-foreground">현재 잔액</span>
                    <span className="truncate font-semibold">
                      {formatAccountBalance(
                        balanceById.get(account.id) ??
                          Number(account.opening_balance) ??
                          0,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">처음 잔액</span>
                    <span className="truncate">
                      {formatAccountBalance(account.opening_balance)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">연결 계좌</span>
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
                  <div className="mt-3 grid grid-cols-[auto_auto_1fr_auto_auto] gap-2">
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
                    <DeleteAccountButton
                      accountId={account.id}
                      householdId={household.id}
                      onResult={setResult}
                    />
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
              ? "위아래 버튼으로 보이는 순서를 바꿔요."
              : "관리자 계정으로 계좌를 추가하거나 순서를 바꿀 수 있어요."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계좌</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead className="text-right">현재 잔액</TableHead>
                <TableHead className="text-right">처음 잔액</TableHead>
                <TableHead>연결 계좌</TableHead>
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
                          {account.institution_name ?? "-"}
                          {account.masked_identifier
                            ? ` · ${account.masked_identifier}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{accountTypeLabels[account.type]}</TableCell>
                  <TableCell>{ownerTypeLabels[account.owner_type]}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatAccountBalance(
                      balanceById.get(account.id) ??
                        Number(account.opening_balance) ??
                        0,
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
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
                        <DeleteAccountButton
                          accountId={account.id}
                          householdId={household.id}
                          onResult={setResult}
                          variant="ghost"
                        />
                      </div>
                    ) : (
                      <span className="block text-right text-sm text-muted-foreground">
                        보기만 가능해요
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
                    계좌를 추가하면 여기에 보여요.
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
