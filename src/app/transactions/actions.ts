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
