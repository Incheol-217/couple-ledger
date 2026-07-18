"use client";

import { useState, useTransition } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import {
  deleteTransactionAction,
  updateTransactionAction,
  type TransactionManageResult,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatAmountInput } from "@/lib/formatters/money";
import { cn } from "@/lib/utils";

export type ManageableTransaction = {
  id: string;
  type: "expense" | "income" | "transfer";
  amount: number;
  transaction_date: string;
  account_id: string;
  category_id: string | null;
  merchant: string | null;
  memo: string | null;
};

export type ManageOption = {
  id: string;
  name: string;
};

export type ManageCategoryOption = ManageOption & {
  type: "expense" | "income" | "transfer";
};

function formatAmountField(event: React.FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatAmountInput(event.currentTarget.value);
}

// 거래 수정 다이얼로그. open/onClose로 어디서든(버튼·스와이프) 열 수 있어요.
export function TransactionEditDialog({
  accounts,
  categories,
  householdId,
  onClose,
  open,
  transaction,
}: {
  accounts: ManageOption[];
  categories: ManageCategoryOption[];
  householdId: string;
  onClose: () => void;
  open: boolean;
  transaction: ManageableTransaction;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<TransactionManageResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const matchingCategories = categories.filter(
    (category) => category.type === transaction.type,
  );

  function close() {
    setConfirmDelete(false);
    setResult(null);
    onClose();
  }

  function submitUpdate(formData: FormData) {
    startTransition(async () => {
      const actionResult = await updateTransactionAction(formData);
      setResult(actionResult);

      if (actionResult.ok) {
        close();
      }
    });
  }

  function submitDelete() {
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("transaction_id", transaction.id);

    startTransition(async () => {
      const actionResult = await deleteTransactionAction(formData);
      setResult(actionResult);

      if (actionResult.ok) {
        close();
      }
    });
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="닫기"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
        onClick={close}
        type="button"
      />
      <div className="relative z-10 max-h-[85svh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-semibold">거래 수정</p>
          <button
            aria-label="닫기"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={close}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {result ? (
          <p
            className={cn(
              "mb-3 rounded-md border px-3 py-2 text-sm",
              result.ok
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-destructive/20 bg-destructive/10 text-destructive",
            )}
          >
            {result.message}
          </p>
        ) : null}

        <form action={submitUpdate} className="grid gap-4">
          <input name="household_id" type="hidden" value={householdId} />
          <input name="transaction_id" type="hidden" value={transaction.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-amount-${transaction.id}`}>금액</Label>
              <Input
                autoComplete="off"
                defaultValue={formatAmountInput(
                  String(Math.round(transaction.amount)),
                )}
                id={`edit-amount-${transaction.id}`}
                inputMode="numeric"
                name="amount"
                onInput={formatAmountField}
                required
                type="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-date-${transaction.id}`}>날짜</Label>
              <Input
                defaultValue={transaction.transaction_date}
                id={`edit-date-${transaction.id}`}
                name="transaction_date"
                required
                type="date"
              />
            </div>

            {transaction.type !== "transfer" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor={`edit-account-${transaction.id}`}>계좌</Label>
                  <Select
                    defaultValue={transaction.account_id}
                    id={`edit-account-${transaction.id}`}
                    name="account_id"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`edit-category-${transaction.id}`}>
                    카테고리
                  </Label>
                  <Select
                    defaultValue={transaction.category_id ?? ""}
                    id={`edit-category-${transaction.id}`}
                    name="category_id"
                  >
                    <option value="">카테고리 없음</option>
                    {matchingCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={`edit-merchant-${transaction.id}`}>사용처</Label>
              <Input
                autoComplete="off"
                defaultValue={transaction.merchant ?? ""}
                id={`edit-merchant-${transaction.id}`}
                name="merchant"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`edit-memo-${transaction.id}`}>메모</Label>
            <Textarea
              defaultValue={transaction.memo ?? ""}
              id={`edit-memo-${transaction.id}`}
              name="memo"
              rows={2}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {confirmDelete ? (
              <Button
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={isPending}
                onClick={submitDelete}
                type="button"
                variant="outline"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                정말 삭제할까요?
              </Button>
            ) : (
              <Button
                className="text-muted-foreground"
                disabled={isPending}
                onClick={() => setConfirmDelete(true)}
                type="button"
                variant="outline"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                삭제
              </Button>
            )}
            <div className="flex gap-2 sm:justify-end">
              <Button onClick={close} type="button" variant="outline">
                닫기
              </Button>
              <Button disabled={isPending} type="submit">
                <Save className="size-4" aria-hidden="true" />
                {isPending ? "저장하고 있어요" : "저장하기"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// 거래 수정 버튼(연필) + 다이얼로그. 데스크톱 표에서 써요.
export function ManageTransaction({
  accounts,
  categories,
  householdId,
  transaction,
}: {
  accounts: ManageOption[];
  categories: ManageCategoryOption[];
  householdId: string;
  transaction: ManageableTransaction;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label="거래 수정"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>

      <TransactionEditDialog
        accounts={accounts}
        categories={categories}
        householdId={householdId}
        onClose={() => setOpen(false)}
        open={open}
        transaction={transaction}
      />
    </>
  );
}
