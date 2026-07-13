"use server";

import { revalidatePath } from "next/cache";
import { maybeCreateBudgetAlerts } from "@/lib/budgets/alerts";
import {
  createNotificationEvent,
  formatWonForNotification,
} from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";
import {
  transactionTypeLabels,
  transactionTypes,
  type TransactionType,
} from "./types";
import { reviewDraftForTransaction } from "@/lib/transactions/review";

export type QuickTransactionActionResult = {
  ok: boolean;
  message: string;
};

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNullableText(formData: FormData, key: string) {
  const value = readText(formData, key);
  return value.length > 0 ? value : null;
}

function readTransactionType(formData: FormData): TransactionType {
  const value = readText(formData, "type");

  if (!transactionTypes.includes(value as TransactionType)) {
    throw new Error("거래 구분을 다시 골라주세요.");
  }

  return value as TransactionType;
}

function readTransactionSource(formData: FormData) {
  return readText(formData, "source") === "ocr" ? "ocr" : "manual";
}

function readAmount(formData: FormData) {
  const rawAmount = readText(formData, "amount").replaceAll(",", "");
  const amount = Number(rawAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 1원 이상 입력해 주세요.");
  }

  return amount;
}

function readOccurredAt(formData: FormData, date: string, time: string) {
  const occurredAt = readNullableText(formData, "occurred_at");

  if (occurredAt) {
    const parsed = new Date(occurredAt);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function createSupabaseForAction() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase 환경변수를 넣어주세요.");
  }

  return createClient();
}

async function assertCurrentMember(householdId: string) {
  if (!householdId) {
    throw new Error("공동 가계부를 찾을 수 없어요.");
  }

  const supabase = await createSupabaseForAction();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("로그인해 주세요.");
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("이 가계부에는 거래를 저장할 수 없어요.");
  }

  return { supabase, user };
}

async function assertAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  accountId: string,
  label: string,
) {
  if (!accountId) {
    throw new Error(`${label}을 선택해 주세요.`);
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, is_active")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error(`${label}을 찾을 수 없어요.`);
  }

  return data.id as string;
}

async function assertCategory(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  categoryId: string | null,
  type: TransactionType,
) {
  if (!categoryId) {
    return null;
  }

  const { data, error } = await supabase
    .from("categories")
    .select("id, type, is_active")
    .eq("household_id", householdId)
    .eq("id", categoryId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error("카테고리를 찾을 수 없어요.");
  }

  if (data.type !== type) {
    throw new Error("거래 구분에 맞는 카테고리를 골라주세요.");
  }

  return data.id as string;
}

export async function createQuickTransactionAction(
  formData: FormData,
): Promise<QuickTransactionActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const type = readTransactionType(formData);
    const source = readTransactionSource(formData);
    const amount = readAmount(formData);
    const accountId = readText(formData, "account_id");
    const transferAccountId = readNullableText(formData, "transfer_account_id");
    const categoryId = readNullableText(formData, "category_id");
    const transactionDate = readText(formData, "transaction_date");
    const transactionTime = readText(formData, "transaction_time");

    if (!transactionDate) {
      throw new Error("날짜를 선택해 주세요.");
    }

    const { supabase, user } = await assertCurrentMember(householdId);
    const confirmedAccountId = await assertAccount(
      supabase,
      householdId,
      accountId,
      type === "transfer" ? "출금 계좌" : "계좌",
    );

    const confirmedTransferAccountId =
      type === "transfer" && transferAccountId
        ? await assertAccount(
            supabase,
            householdId,
            transferAccountId,
            "입금 계좌",
          )
        : null;

    if (type === "transfer" && !confirmedTransferAccountId) {
      throw new Error("입금 계좌를 선택해 주세요.");
    }

    if (type === "transfer" && confirmedTransferAccountId === confirmedAccountId) {
      throw new Error("나가는 계좌와 들어오는 계좌를 다르게 골라주세요.");
    }

    const confirmedCategoryId = await assertCategory(
      supabase,
      householdId,
      categoryId,
      type,
    );
    const reviewDraft = reviewDraftForTransaction({
      amount,
      categoryId: confirmedCategoryId,
      source,
      type,
    });

    const { error } = await supabase.from("transactions").insert({
      household_id: householdId,
      user_id: user.id,
      account_id: confirmedAccountId,
      transfer_account_id: confirmedTransferAccountId,
      category_id: confirmedCategoryId,
      type,
      source,
      amount,
      currency_code: "KRW",
      transaction_date: transactionDate,
      occurred_at: readOccurredAt(formData, transactionDate, transactionTime),
      merchant: readNullableText(formData, "merchant"),
      memo: readNullableText(formData, "memo"),
      review_reason: reviewDraft.review_reason,
      review_requested_by:
        reviewDraft.review_status === "needs_review" ? user.id : null,
      review_status: reviewDraft.review_status,
    });

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `${transactionTypeLabels[type]} ${formatWonForNotification(amount)}이 ${
        source === "ocr" ? "영수증으로 " : ""
      }기록됐어요.`,
      eventType: "transaction_created",
      householdId,
      metadata: {
        account_id: confirmedAccountId,
        amount,
        category_id: confirmedCategoryId,
        review_status: reviewDraft.review_status,
        source,
        transfer_account_id: confirmedTransferAccountId,
        type,
      },
      title: "새 거래를 기록했어요",
    });

    if (type === "expense") {
      await maybeCreateBudgetAlerts(supabase, {
        householdId,
        accountId: confirmedAccountId,
        categoryId: confirmedCategoryId,
        transactionDate,
      });
    }

    revalidatePath("/m/new");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");

    return { ok: true, message: "거래를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "거래를 저장하지 못했어요.",
    };
  }
}
