"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Banknote,
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
        <CardTitle>{mode === "create" ? "계좌 추가" : "계좌 수정"}</CardTitle>
        <CardDescription>
          은행 연동 없이 수동으로 계좌와 결제수단을 관리합니다.
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
              <Label htmlFor="account-type">계좌 타입</Label>
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
              <Label htmlFor="institution-name">기관명</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.institution_name ?? ""}
                id="institution-name"
                name="institution_name"
                placeholder="신한은행, 현대카드"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="masked-identifier">끝자리 또는 별칭</Label>
              <Input
                autoComplete="off"
                defaultValue={selectedAccount?.masked_identifier ?? ""}
                id="masked-identifier"
                name="masked_identifier"
                placeholder="1234"
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
                기본 출금 계좌
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
              취소
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending
                ? "저장 중"
                : mode === "create"
                  ? "계좌 추가"
                  : "수정 저장"}
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
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeAccounts = accounts.filter((account) => account.is_active);
  const inactiveAccounts = accounts.filter((account) => !account.is_active);

  function openCreate() {
    if (!isAdmin) {
      setResult({
        ok: false,
        message: "관리자 계정만 계좌를 추가할 수 있습니다.",
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
        message: "관리자 계정만 계좌를 변경할 수 있습니다.",
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
        message: "관리자 계정만 계좌를 변경할 수 있습니다.",
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
          <CardTitle>Supabase 설정 필요</CardTitle>
          <CardDescription>
            `.env.local`에 Supabase URL과 anon key를 채우면 계좌 관리가
            활성화됩니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>로그인이 필요합니다</CardTitle>
          <CardDescription>
            계좌 데이터는 household 멤버에게만 보이도록 RLS가 적용되어 있습니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!household) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>공동 가계부가 없습니다</CardTitle>
          <CardDescription>
            household가 만들어지고 멤버로 연결되면 계좌를 추가할 수 있습니다.
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
            활성 계좌 {activeAccounts.length}개 · 비활성 계좌{" "}
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
            조회 전용
          </Badge>
        )}
      </div>

      {!isAdmin ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            계좌 추가와 변경은 관리자 계정에서만 가능합니다. 남편/아내
            계정에서는 현재 등록된 계좌를 조회할 수 있습니다.
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {activeAccounts.length > 0 ? (
          activeAccounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <AccountIcon account={account} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{account.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {accountTypeLabels[account.type]} ·{" "}
                        {ownerTypeLabels[account.owner_type]}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">활성</Badge>
                </div>

                <div className="mt-5 grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">기관</span>
                    <span className="truncate">
                      {account.institution_name ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">기본 출금</span>
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
                  <div className="mt-5 flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => openEdit(account)}
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
                      <input name="account_id" type="hidden" value={account.id} />
                      <Button
                        disabled={isPending}
                        type="submit"
                        variant="outline"
                      >
                        <Archive className="size-4" aria-hidden="true" />
                        <span className="sr-only">비활성화</span>
                      </Button>
                    </form>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
              <Banknote className="size-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">아직 계좌가 없습니다</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  생활비 통장, 공용 카드, 현금을 먼저 추가해 보세요.
                </p>
              </div>
              {isAdmin ? (
                <Button onClick={openCreate} type="button">
                  <Plus className="size-4" aria-hidden="true" />
                  계좌 추가
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>계좌 관리 테이블</CardTitle>
          <CardDescription>
            {isAdmin
              ? "활성 계좌는 위아래 버튼으로 대시보드 표시 순서를 바꿀 수 있습니다."
              : "관리자 계정으로 로그인하면 계좌 추가와 표시 순서를 변경할 수 있습니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계좌</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>소유</TableHead>
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
                      {account.is_active ? "활성" : "비활성"}
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
                              <span className="sr-only">비활성화</span>
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="block text-right text-sm text-muted-foreground">
                        조회 전용
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    표시할 계좌가 없습니다.
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
