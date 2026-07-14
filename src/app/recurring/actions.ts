"use server";

import { revalidatePath } from "next/cache";
import { createNotificationEvent } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";
import {
  billingCycles,
  recurringKinds,
  recurringKindLabels,
  recurringStatuses,
  recurringStatusLabels,
  type BillingCycle,
  type RecurringKind,
  type RecurringStatus,
} from "./types";

export type RecurringActionResult = {
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

function readKind(formData: FormData): RecurringKind {
  const value = readText(formData, "kind");

  if (!recurringKinds.includes(value as RecurringKind)) {
    throw new Error("반복 결제 종류를 다시 골라주세요.");
  }

  return value as RecurringKind;
}

function readBillingCycle(formData: FormData): BillingCycle {
  const value = readText(formData, "billing_cycle");

  if (!billingCycles.includes(value as BillingCycle)) {
    throw new Error("결제 주기를 다시 골라주세요.");
  }

  return value as BillingCycle;
}

function readStatus(formData: FormData): RecurringStatus {
  const value = readText(formData, "status") || "active";

  if (!recurringStatuses.includes(value as RecurringStatus)) {
    throw new Error("상태를 다시 골라주세요.");
  }

  return value as RecurringStatus;
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
    throw new Error("이 가계부의 반복 결제만 바꿀 수 있어요.");
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

async function assertPayer(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  payerUserId: string | null,
) {
  if (!payerUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("user_id", payerUserId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("결제 담당자를 찾을 수 없어요.");
  }

  return data.user_id as string;
}

function toPayload(formData: FormData) {
  const name = readText(formData, "name");
  const amount = readNumber(formData, "amount", 0);
  const nextDueDate = readText(formData, "next_due_date");
  const endsOn = readNullableText(formData, "ends_on");
  const billingDay = readNumber(formData, "billing_day", 0);
  const reminderDaysBefore = readNumber(formData, "reminder_days_before", 3);

  if (!name) {
    throw new Error("반복 결제 이름을 입력해 주세요.");
  }

  if (amount <= 0) {
    throw new Error("금액을 1원 이상 입력해 주세요.");
  }

  if (!nextDueDate) {
    throw new Error("다음 결제일을 선택해 주세요.");
  }

  if (endsOn && endsOn < nextDueDate) {
    throw new Error("종료일은 다음 결제일 이후로 정해 주세요.");
  }

  return {
    accountId: readText(formData, "account_id"),
    amount,
    autoCreateTransaction: readText(formData, "auto_create_transaction") === "on",
    billingCycle: readBillingCycle(formData),
    billingDay: billingDay > 0 ? billingDay : null,
    categoryId: readNullableText(formData, "category_id"),
    endsOn,
    kind: readKind(formData),
    merchant: readNullableText(formData, "merchant"),
    memo: readNullableText(formData, "memo"),
    name,
    nextDueDate,
    payerUserId: readNullableText(formData, "payer_user_id"),
    reminderDaysBefore: Math.max(0, reminderDaysBefore),
    status: readStatus(formData),
  };
}

export async function createRecurringItemAction(
  formData: FormData,
): Promise<RecurringActionResult> {
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
    const payerUserId = await assertPayer(
      supabase,
      householdId,
      payload.payerUserId,
    );

    const { error } = await supabase.from("recurring_items").insert({
      household_id: householdId,
      account_id: accountId,
      category_id: categoryId,
      payer_user_id: payerUserId,
      kind: payload.kind,
      name: payload.name,
      merchant: payload.merchant,
      amount: payload.amount,
      currency_code: "KRW",
      billing_cycle: payload.billingCycle,
      billing_day: payload.billingDay,
      next_due_date: payload.nextDueDate,
      ends_on: payload.endsOn,
      status: payload.status,
      auto_create_transaction: payload.autoCreateTransaction,
      reminder_days_before: payload.reminderDaysBefore,
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `'${payload.name}' ${recurringKindLabels[payload.kind]} 항목이 추가됐어요.`,
      eventType: "recurring_created",
      householdId,
      metadata: {
        account_id: accountId,
        amount: payload.amount,
        auto_create_transaction: payload.autoCreateTransaction,
        billing_cycle: payload.billingCycle,
        category_id: categoryId,
        kind: payload.kind,
      },
      title: "반복 결제를 추가했어요",
    });

    revalidatePath("/recurring");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "반복 결제를 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "반복 결제를 추가하지 못했어요.",
    };
  }
}

export async function updateRecurringItemAction(
  formData: FormData,
): Promise<RecurringActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const itemId = readText(formData, "recurring_item_id");

    if (!itemId) {
      throw new Error("고칠 반복 결제를 찾을 수 없어요.");
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
    const payerUserId = await assertPayer(
      supabase,
      householdId,
      payload.payerUserId,
    );

    const { error } = await supabase
      .from("recurring_items")
      .update({
        account_id: accountId,
        category_id: categoryId,
        payer_user_id: payerUserId,
        kind: payload.kind,
        name: payload.name,
        merchant: payload.merchant,
        amount: payload.amount,
        billing_cycle: payload.billingCycle,
        billing_day: payload.billingDay,
        next_due_date: payload.nextDueDate,
        ends_on: payload.endsOn,
        status: payload.status,
        auto_create_transaction: payload.autoCreateTransaction,
        reminder_days_before: payload.reminderDaysBefore,
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `'${payload.name}' ${recurringKindLabels[payload.kind]} 항목이 수정됐어요.`,
      eventType: "recurring_updated",
      householdId,
      metadata: {
        account_id: accountId,
        amount: payload.amount,
        auto_create_transaction: payload.autoCreateTransaction,
        billing_cycle: payload.billingCycle,
        category_id: categoryId,
        kind: payload.kind,
        recurring_item_id: itemId,
      },
      title: "반복 결제를 고쳤어요",
    });

    revalidatePath("/recurring");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "반복 결제를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "반복 결제를 저장하지 못했어요.",
    };
  }
}

export async function updateRecurringStatusAction(
  formData: FormData,
): Promise<RecurringActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const itemId = readText(formData, "recurring_item_id");
    const status = readStatus(formData);

    if (!itemId) {
      throw new Error("상태를 바꿀 반복 결제를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentMember(householdId);
    const { data: item, error: itemError } = await supabase
      .from("recurring_items")
      .select("name, kind")
      .eq("household_id", householdId)
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) {
      throw new Error(itemError.message);
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
      body: `'${item?.name ?? "반복 결제"}' 상태가 ${recurringStatusLabels[status]}로 바뀌었어요.`,
      eventType: "recurring_status_changed",
      householdId,
      metadata: {
        kind: item?.kind ?? null,
        recurring_item_id: itemId,
        status,
      },
      title: "반복 결제 상태가 바뀌었어요",
    });

    revalidatePath("/recurring");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        status === "paused"
          ? "반복 결제를 잠시 멈췄어요."
          : status === "canceled"
            ? "반복 결제를 끝냈어요."
            : "반복 결제를 다시 켰어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "상태를 바꾸지 못했어요.",
    };
  }
}
