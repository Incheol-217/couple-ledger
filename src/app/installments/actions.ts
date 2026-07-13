"use server";

import { revalidatePath } from "next/cache";
import { createNotificationEvent } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";

export type InstallmentActionResult = {
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

function readNumber(formData: FormData, key: string, fallback: number) {
  const value = readText(formData, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function createSupabaseForAction() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase 환경변수를 확인해 주세요.");
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
    throw new Error("이 가계부의 할부만 바꿀 수 있어요.");
  }

  return { supabase, user };
}

async function assertAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  accountId: string,
) {
  if (!accountId) {
    throw new Error("결제 계좌를 선택해 주세요.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, is_active")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error("결제 계좌를 찾을 수 없어요.");
  }

  return data.id as string;
}

async function assertCategory(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  categoryId: string | null,
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

  if (error || !data || !data.is_active || data.type !== "expense") {
    throw new Error("지출 카테고리를 찾을 수 없어요.");
  }

  return data.id as string;
}

function toPayload(formData: FormData) {
  const name = readText(formData, "name");
  const amount = readNumber(formData, "amount", 0);
  const totalInstallments = Math.round(
    readNumber(formData, "total_installments", 0),
  );
  const nextDueDate = readText(formData, "next_due_date");
  const billingDay = readNumber(formData, "billing_day", 0);

  if (!name) {
    throw new Error("할부 이름을 입력해 주세요.");
  }

  if (amount <= 0) {
    throw new Error("회차 금액을 1원 이상 입력해 주세요.");
  }

  if (totalInstallments < 1 || totalInstallments > 120) {
    throw new Error("할부 개월수는 1~120 사이로 입력해 주세요.");
  }

  if (!nextDueDate) {
    throw new Error("다음 결제일을 선택해 주세요.");
  }

  return {
    accountId: readText(formData, "account_id"),
    amount,
    billingDay: billingDay > 0 ? billingDay : null,
    categoryId: readNullableText(formData, "category_id"),
    memo: readNullableText(formData, "memo"),
    merchant: readNullableText(formData, "merchant"),
    name,
    nextDueDate,
    totalInstallments,
  };
}

function revalidateInstallments() {
  revalidatePath("/installments");
  revalidatePath("/recurring");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function createInstallmentAction(
  formData: FormData,
): Promise<InstallmentActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertAccount(
      supabase,
      householdId,
      payload.accountId,
    );
    const categoryId = await assertCategory(
      supabase,
      householdId,
      payload.categoryId,
    );

    const { error } = await supabase.from("recurring_items").insert({
      household_id: householdId,
      account_id: accountId,
      category_id: categoryId,
      kind: "installment",
      name: payload.name,
      merchant: payload.merchant,
      amount: payload.amount,
      currency_code: "KRW",
      billing_cycle: "monthly",
      billing_day: payload.billingDay,
      next_due_date: payload.nextDueDate,
      status: "active",
      auto_create_transaction: true,
      reminder_days_before: 3,
      total_installments: payload.totalInstallments,
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `'${payload.name}' 할부(${payload.totalInstallments}회)가 추가됐어요.`,
      eventType: "recurring_created",
      householdId,
      metadata: {
        account_id: accountId,
        amount: payload.amount,
        kind: "installment",
        total_installments: payload.totalInstallments,
      },
      title: "할부를 추가했어요",
    });

    revalidateInstallments();
    return { ok: true, message: "할부를 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "할부를 추가하지 못했어요.",
    };
  }
}

export async function updateInstallmentAction(
  formData: FormData,
): Promise<InstallmentActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const itemId = readText(formData, "installment_id");

    if (!itemId) {
      throw new Error("고칠 할부를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertAccount(
      supabase,
      householdId,
      payload.accountId,
    );
    const categoryId = await assertCategory(
      supabase,
      householdId,
      payload.categoryId,
    );

    const { error } = await supabase
      .from("recurring_items")
      .update({
        account_id: accountId,
        category_id: categoryId,
        name: payload.name,
        merchant: payload.merchant,
        amount: payload.amount,
        billing_day: payload.billingDay,
        next_due_date: payload.nextDueDate,
        total_installments: payload.totalInstallments,
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", itemId)
      .eq("kind", "installment");

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `'${payload.name}' 할부가 수정됐어요.`,
      eventType: "recurring_updated",
      householdId,
      metadata: {
        kind: "installment",
        recurring_item_id: itemId,
        total_installments: payload.totalInstallments,
      },
      title: "할부를 고쳤어요",
    });

    revalidateInstallments();
    return { ok: true, message: "할부를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "할부를 저장하지 못했어요.",
    };
  }
}

export async function updateInstallmentStatusAction(
  formData: FormData,
): Promise<InstallmentActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const itemId = readText(formData, "installment_id");
    const status = readText(formData, "status");

    if (!itemId) {
      throw new Error("상태를 바꿀 할부를 찾을 수 없어요.");
    }

    if (!["active", "paused", "canceled"].includes(status)) {
      throw new Error("상태를 다시 골라주세요.");
    }

    const { supabase, user } = await assertCurrentMember(householdId);
    const { data: item, error: itemError } = await supabase
      .from("recurring_items")
      .select("name")
      .eq("household_id", householdId)
      .eq("id", itemId)
      .eq("kind", "installment")
      .maybeSingle();

    if (itemError || !item) {
      throw new Error(itemError?.message ?? "할부를 찾을 수 없어요.");
    }

    const { error } = await supabase
      .from("recurring_items")
      .update({
        status,
        auto_create_transaction: status === "active",
      })
      .eq("household_id", householdId)
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body:
        status === "canceled"
          ? `'${item.name}' 할부를 끝냈어요.`
          : status === "paused"
            ? `'${item.name}' 할부를 잠시 멈췄어요.`
            : `'${item.name}' 할부를 다시 진행해요.`,
      eventType: "recurring_status_changed",
      householdId,
      metadata: {
        kind: "installment",
        recurring_item_id: itemId,
        status,
      },
      title: "할부 상태가 바뀌었어요",
    });

    revalidateInstallments();
    return {
      ok: true,
      message:
        status === "canceled"
          ? "할부를 끝냈어요."
          : status === "paused"
            ? "할부를 잠시 멈췄어요."
            : "할부를 다시 진행해요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "상태를 바꾸지 못했어요.",
    };
  }
}
