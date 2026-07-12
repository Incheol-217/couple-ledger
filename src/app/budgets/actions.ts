"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  budgetPeriods,
  budgetScopes,
  type BudgetPeriod,
  type BudgetScope,
} from "./types";

export type BudgetActionResult = {
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

function readPeriod(formData: FormData): BudgetPeriod {
  const value = readText(formData, "period");

  if (!budgetPeriods.includes(value as BudgetPeriod)) {
    throw new Error("예산 주기를 다시 골라주세요.");
  }

  return value as BudgetPeriod;
}

function readScope(formData: FormData): BudgetScope {
  const value = readText(formData, "scope");

  if (!budgetScopes.includes(value as BudgetScope)) {
    throw new Error("예산 대상을 다시 골라주세요.");
  }

  return value as BudgetScope;
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
    throw new Error("이 가계부의 예산만 바꿀 수 있어요.");
  }

  return { supabase, user };
}

async function assertAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  accountId: string | null,
) {
  if (!accountId) {
    return null;
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, is_active")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error("예산을 걸 계좌를 찾을 수 없어요.");
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

async function toPayload(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  formData: FormData,
) {
  const scope = readScope(formData);
  const period = readPeriod(formData);
  const amount = readNumber(formData, "amount", 0);
  const periodStart = readText(formData, "period_start");
  const periodEnd = readNullableText(formData, "period_end");

  if (amount <= 0) {
    throw new Error("예산 금액을 1원 이상 입력해 주세요.");
  }

  if (!periodStart) {
    throw new Error("예산 시작일을 정해주세요.");
  }

  if (periodEnd && periodEnd < periodStart) {
    throw new Error("종료일은 시작일보다 빠를 수 없어요.");
  }

  const categoryId =
    scope === "category"
      ? await assertCategory(
          supabase,
          householdId,
          readNullableText(formData, "category_id"),
        )
      : null;

  if (scope === "category" && !categoryId) {
    throw new Error("예산을 걸 지출 카테고리를 골라주세요.");
  }

  const accountId =
    scope === "account"
      ? await assertAccount(
          supabase,
          householdId,
          readNullableText(formData, "account_id"),
        )
      : null;

  if (scope === "account" && !accountId) {
    throw new Error("예산을 걸 계좌를 골라주세요.");
  }

  return {
    accountId,
    amount,
    categoryId,
    memo: readNullableText(formData, "memo"),
    period,
    periodEnd,
    periodStart,
  };
}

export async function createBudgetAction(
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = await toPayload(supabase, householdId, formData);

    const { error } = await supabase.from("budgets").insert({
      household_id: householdId,
      account_id: payload.accountId,
      category_id: payload.categoryId,
      period: payload.period,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      amount: payload.amount,
      currency_code: "KRW",
      is_active: true,
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/", "layout");
    return { ok: true, message: "예산을 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "예산을 추가하지 못했어요.",
    };
  }
}

export async function updateBudgetAction(
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const budgetId = readText(formData, "budget_id");

    if (!budgetId) {
      throw new Error("고칠 예산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const payload = await toPayload(supabase, householdId, formData);

    const { error } = await supabase
      .from("budgets")
      .update({
        account_id: payload.accountId,
        category_id: payload.categoryId,
        period: payload.period,
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
        amount: payload.amount,
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", budgetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/", "layout");
    return { ok: true, message: "예산을 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "예산을 저장하지 못했어요.",
    };
  }
}

export async function toggleBudgetActiveAction(
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const budgetId = readText(formData, "budget_id");
    const nextActive = readText(formData, "is_active") === "true";

    if (!budgetId) {
      throw new Error("상태를 바꿀 예산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("budgets")
      .update({ is_active: nextActive })
      .eq("household_id", householdId)
      .eq("id", budgetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: nextActive ? "예산을 다시 켰어요." : "예산을 잠시 껐어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "상태를 바꾸지 못했어요.",
    };
  }
}

export async function deleteBudgetAction(
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const budgetId = readText(formData, "budget_id");

    if (!budgetId) {
      throw new Error("지울 예산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("household_id", householdId)
      .eq("id", budgetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    revalidatePath("/", "layout");
    return { ok: true, message: "예산을 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "예산을 지우지 못했어요.",
    };
  }
}
