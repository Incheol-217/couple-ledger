"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { deleteTransactionAction } from "./actions";
import {
  TransactionEditDialog,
  type ManageCategoryOption,
  type ManageOption,
  type ManageableTransaction,
} from "./manage-transaction";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACTIONS_WIDTH = 148; // 수정 + 삭제 버튼 너비(px)
const OPEN_THRESHOLD = ACTIONS_WIDTH / 2;

function ToneIcon({ tone }: { tone: "expense" | "income" | "transfer" }) {
  const Icon =
    tone === "income"
      ? ArrowDownLeft
      : tone === "transfer"
        ? ArrowLeftRight
        : ArrowUpRight;
  return <Icon className="size-5" aria-hidden="true" />;
}

export type SwipeCardData = {
  transaction: ManageableTransaction;
  title: string;
  subtitle: string;
  amountText: string;
  sourceLabel: string;
  reviewStatus: "none" | "needs_review" | "reviewed";
  memberLabel: string;
};

export function TransactionSwipeCard({
  accounts,
  categories,
  householdId,
  data,
}: {
  accounts: ManageOption[];
  categories: ManageCategoryOption[];
  householdId: string;
  data: SwipeCardData;
}) {
  const { transaction, title, subtitle, amountText, sourceLabel, reviewStatus, memberLabel } =
    data;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const axis = useRef<"h" | "v" | null>(null);

  function reset() {
    setOffset(0);
    setConfirmDelete(false);
  }

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY, base: offset };
    axis.current = null;
    setDragging(true);
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!start.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;

    // 처음 움직임의 방향으로 세로 스크롤/가로 스와이프를 구분해요.
    if (axis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current === "v") return;

    const next = Math.max(-ACTIONS_WIDTH, Math.min(0, start.current.base + dx));
    setOffset(next);
  }

  function onTouchEnd() {
    setDragging(false);
    if (axis.current === "h") {
      setOffset(offset < -OPEN_THRESHOLD ? -ACTIONS_WIDTH : 0);
      if (offset >= -OPEN_THRESHOLD) setConfirmDelete(false);
    }
    start.current = null;
  }

  function runDelete() {
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("transaction_id", transaction.id);
    startTransition(async () => {
      await deleteTransactionAction(formData);
      reset();
    });
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* 뒤에 숨겨진 수정/삭제 */}
      <div className="absolute inset-y-0 right-0 flex">
        <button
          className="flex w-[74px] flex-col items-center justify-center gap-1 bg-secondary text-xs font-medium text-primary"
          onClick={() => {
            setEditOpen(true);
            reset();
          }}
          type="button"
        >
          <Pencil className="size-4" aria-hidden="true" />
          수정
        </button>
        <button
          className="flex w-[74px] flex-col items-center justify-center gap-1 bg-destructive text-xs font-medium text-white disabled:opacity-60"
          disabled={isPending}
          onClick={() => (confirmDelete ? runDelete() : setConfirmDelete(true))}
          type="button"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {confirmDelete ? "정말?" : "삭제"}
        </button>
      </div>

      {/* 위에 얹힌 카드 내용(스와이프로 이동) */}
      <div
        className={cn(
          "relative flex items-center gap-3 bg-card p-3",
          !dragging && "transition-transform duration-200",
        )}
        onClick={() => {
          if (offset !== 0) reset();
        }}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary">
          <ToneIcon tone={transaction.type} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <p
              className={cn(
                "shrink-0 text-sm font-bold tabular-nums",
                transaction.type === "expense" && "text-destructive",
                transaction.type === "income" && "text-primary",
              )}
            >
              {amountText}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{sourceLabel}</Badge>
            {reviewStatus === "needs_review" ? (
              <Badge variant="outline">확인 필요</Badge>
            ) : reviewStatus === "reviewed" ? (
              <Badge variant="outline">확인 완료</Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{memberLabel}</span>
          </div>
        </div>
      </div>

      <TransactionEditDialog
        accounts={accounts}
        categories={categories}
        householdId={householdId}
        onClose={() => setEditOpen(false)}
        open={editOpen}
        transaction={transaction}
      />
    </div>
  );
}
