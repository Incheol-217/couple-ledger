"use server";

import { revalidatePath } from "next/cache";
import {
  createNotificationEvent,
  formatWonForNotification,
} from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";

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

export async function markTransactionReviewedAction(
  formData: FormData,
): Promise<void> {
  try {
    if (!hasSupabaseEnv()) {
      throw new Error("Supabase 환경변수를 확인해 주세요.");
    }

    const householdId = readText(formData, "household_id");
    const transactionId = readText(formData, "transaction_id");

    if (!householdId || !transactionId) {
      throw new Error("확인할 거래를 찾을 수 없어요.");
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("로그인해 주세요.");
    }

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error("이 가계부의 거래만 확인할 수 있어요.");
    }

    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .select("id, amount, type, account_id, category_id")
      .eq("household_id", householdId)
      .eq("id", transactionId)
      .eq("review_status", "needs_review")
      .maybeSingle();

    if (transactionError || !transaction) {
      throw new Error("확인이 필요한 거래를 찾을 수 없어요.");
    }

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        review_status: "reviewed",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("household_id", householdId)
      .eq("id", transactionId)
      .eq("review_status", "needs_review");

    if (updateError) {
      throw new Error(updateError.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `${formatWonForNotification(Number(transaction.amount) || 0)} 거래 확인이 끝났어요.`,
      eventType: "transaction_reviewed",
      householdId,
      metadata: {
        account_id: transaction.account_id,
        amount: Number(transaction.amount) || 0,
        category_id: transaction.category_id,
        transaction_id: transaction.id,
        type: transaction.type,
      },
      title: "거래를 확인했어요",
    });

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");

    return;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "거래를 확인하지 못했어요.",
    );
  }
}

export type TransactionManageResult = {
  ok: boolean;
  message: string;
};

async function assertCurrentAdmin(householdId: string) {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase 환경변수를 확인해 주세요.");
  }

  if (!householdId) {
    throw new Error("공동 가계부를 찾을 수 없어요.");
  }

  const supabase = await createClient();
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
    .eq("role", "owner")
    .maybeSingle();

  if (error || !data) {
    throw new Error("관리자 계정으로 거래를 바꿀 수 있어요.");
  }

  return { supabase, user };
}

function revalidateTransactionPages() {
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/", "layout");
}

export async function updateTransactionAction(
  formData: FormData,
): Promise<TransactionManageResult> {
  try {
    const householdId = readText(formData, "household_id");
    const transactionId = readText(formData, "transaction_id");

    if (!transactionId) {
      throw new Error("수정할 거래를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentAdmin(householdId);

    const rawAmount = readText(formData, "amount");
    const amount = Number(rawAmount.replaceAll(",", ""));
    const transactionDate = readText(formData, "transaction_date");
    const accountId = readText(formData, "account_id");
    const categoryId = readText(formData, "category_id") || null;
    const merchant = readText(formData, "merchant") || null;
    const memo = readText(formData, "memo") || null;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("금액은 1원 이상 숫자로 입력해 주세요.");
    }

    if (!transactionDate) {
      throw new Error("거래 날짜를 선택해 주세요.");
    }

    // 대상 거래의 구분(type)에 맞는 카테고리인지 확인해요.
    const { data: existing, error: existingError } = await supabase
      .from("transactions")
      .select("id, type")
      .eq("household_id", householdId)
      .eq("id", transactionId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new Error(existingError?.message ?? "거래를 찾을 수 없어요.");
    }

    if (categoryId) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id, type")
        .eq("household_id", householdId)
        .eq("id", categoryId)
        .maybeSingle();

      if (categoryError || !category || category.type !== existing.type) {
        throw new Error("거래 구분에 맞는 카테고리를 골라주세요.");
      }
    }

    if (accountId) {
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id")
        .eq("household_id", householdId)
        .eq("id", accountId)
        .maybeSingle();

      if (accountError || !account) {
        throw new Error("계좌를 찾을 수 없어요.");
      }
    }

    const updatePayload: Record<string, unknown> = {
      amount: Math.round(amount),
      transaction_date: transactionDate,
      merchant,
      memo,
      category_id: categoryId,
    };

    if (accountId) {
      updatePayload.account_id = accountId;
    }

    const { error } = await supabase
      .from("transactions")
      .update(updatePayload)
      .eq("household_id", householdId)
      .eq("id", transactionId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTransactionPages();
    return { ok: true, message: "거래를 수정했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "거래를 수정하지 못했어요.",
    };
  }
}

export async function deleteTransactionAction(
  formData: FormData,
): Promise<TransactionManageResult> {
  try {
    const householdId = readText(formData, "household_id");
    const transactionId = readText(formData, "transaction_id");

    if (!transactionId) {
      throw new Error("지울 거래를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentAdmin(householdId);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("household_id", householdId)
      .eq("id", transactionId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTransactionPages();
    return { ok: true, message: "거래를 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "거래를 지우지 못했어요.",
    };
  }
}
