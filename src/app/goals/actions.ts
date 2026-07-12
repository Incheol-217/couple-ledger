"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GoalActionResult = {
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
    throw new Error("이 가계부의 저축 목표만 바꿀 수 있어요.");
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
    throw new Error("연결할 계좌를 찾을 수 없어요.");
  }

  return data.id as string;
}

function toPayload(formData: FormData) {
  const name = readText(formData, "name");
  const targetAmount = readNumber(formData, "target_amount", 0);

  if (!name) {
    throw new Error("목표 이름을 입력해 주세요.");
  }

  if (targetAmount <= 0) {
    throw new Error("목표 금액을 1원 이상 입력해 주세요.");
  }

  return {
    accountId: readNullableText(formData, "account_id"),
    memo: readNullableText(formData, "memo"),
    name,
    targetAmount,
    targetDate: readNullableText(formData, "target_date"),
  };
}

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function createGoalAction(
  formData: FormData,
): Promise<GoalActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertAccount(
      supabase,
      householdId,
      payload.accountId,
    );
    const startingAmount = Math.max(0, readNumber(formData, "current_amount", 0));

    const { error } = await supabase.from("savings_goals").insert({
      household_id: householdId,
      account_id: accountId,
      name: payload.name,
      target_amount: payload.targetAmount,
      current_amount: startingAmount,
      target_date: payload.targetDate,
      is_achieved: startingAmount >= payload.targetAmount,
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateGoals();
    return { ok: true, message: "저축 목표를 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "저축 목표를 추가하지 못했어요.",
    };
  }
}

export async function updateGoalAction(
  formData: FormData,
): Promise<GoalActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const goalId = readText(formData, "goal_id");

    if (!goalId) {
      throw new Error("고칠 저축 목표를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertAccount(
      supabase,
      householdId,
      payload.accountId,
    );

    const { data: existing, error: readError } = await supabase
      .from("savings_goals")
      .select("current_amount")
      .eq("household_id", householdId)
      .eq("id", goalId)
      .maybeSingle();

    if (readError || !existing) {
      throw new Error(readError?.message ?? "저축 목표를 찾을 수 없어요.");
    }

    const current = Number(existing.current_amount) || 0;

    const { error } = await supabase
      .from("savings_goals")
      .update({
        account_id: accountId,
        name: payload.name,
        target_amount: payload.targetAmount,
        target_date: payload.targetDate,
        is_achieved: current >= payload.targetAmount,
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", goalId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateGoals();
    return { ok: true, message: "저축 목표를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "저축 목표를 저장하지 못했어요.",
    };
  }
}

export async function contributeGoalAction(
  formData: FormData,
): Promise<GoalActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const goalId = readText(formData, "goal_id");
    const direction = readText(formData, "direction") === "withdraw" ? -1 : 1;
    const delta = Math.abs(readNumber(formData, "amount", 0));

    if (!goalId) {
      throw new Error("적립할 저축 목표를 찾을 수 없어요.");
    }

    if (delta <= 0) {
      throw new Error("금액을 1원 이상 입력해 주세요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { data: existing, error: readError } = await supabase
      .from("savings_goals")
      .select("current_amount, target_amount")
      .eq("household_id", householdId)
      .eq("id", goalId)
      .maybeSingle();

    if (readError || !existing) {
      throw new Error(readError?.message ?? "저축 목표를 찾을 수 없어요.");
    }

    const current = Number(existing.current_amount) || 0;
    const target = Number(existing.target_amount) || 0;
    const next = Math.max(0, current + direction * delta);

    const { error } = await supabase
      .from("savings_goals")
      .update({
        current_amount: next,
        is_achieved: next >= target,
      })
      .eq("household_id", householdId)
      .eq("id", goalId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateGoals();
    return {
      ok: true,
      message:
        direction > 0
          ? "저축액을 더했어요."
          : "저축액을 뺐어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "저축액을 바꾸지 못했어요.",
    };
  }
}

export async function toggleGoalAchievedAction(
  formData: FormData,
): Promise<GoalActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const goalId = readText(formData, "goal_id");
    const nextAchieved = readText(formData, "is_achieved") === "true";

    if (!goalId) {
      throw new Error("상태를 바꿀 저축 목표를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("savings_goals")
      .update({ is_achieved: nextAchieved })
      .eq("household_id", householdId)
      .eq("id", goalId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateGoals();
    return {
      ok: true,
      message: nextAchieved ? "목표를 달성 완료로 표시했어요." : "목표를 다시 진행 중으로 바꿨어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "상태를 바꾸지 못했어요.",
    };
  }
}

export async function deleteGoalAction(
  formData: FormData,
): Promise<GoalActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const goalId = readText(formData, "goal_id");

    if (!goalId) {
      throw new Error("지울 저축 목표를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("savings_goals")
      .delete()
      .eq("household_id", householdId)
      .eq("id", goalId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateGoals();
    return { ok: true, message: "저축 목표를 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "저축 목표를 지우지 못했어요.",
    };
  }
}
