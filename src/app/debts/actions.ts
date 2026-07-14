"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  liabilityOwners,
  liabilityTypes,
  type LiabilityOwner,
  type LiabilityType,
} from "./types";

export type DebtActionResult = {
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

function readMoney(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    return 0;
  }

  const parsed = Number(value.replaceAll(",", ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("금액은 0원 이상 숫자로 입력해 주세요.");
  }

  return Math.round(parsed);
}

function readNullableRate(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value.replaceAll(",", ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("금리는 0 이상 숫자로 입력해 주세요.");
  }

  return parsed;
}

function readNullableDay(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Math.round(Number(value));

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    throw new Error("이자 납부일은 1~31 사이로 입력해 주세요.");
  }

  return parsed;
}

async function assertCurrentMember(householdId: string) {
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
    .maybeSingle();

  if (error || !data) {
    throw new Error("이 가계부의 부채만 바꿀 수 있어요.");
  }

  return { supabase, user };
}

async function assertLiabilityAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const liabilityType = readText(formData, "liability_type") as LiabilityType;
  const ownerLabel = (readText(formData, "owner_label") ||
    "shared") as LiabilityOwner;

  if (!name) {
    throw new Error("부채 이름을 입력해 주세요.");
  }

  if (!liabilityTypes.includes(liabilityType)) {
    throw new Error("부채 종류를 다시 골라주세요.");
  }

  if (!liabilityOwners.includes(ownerLabel)) {
    throw new Error("명의를 다시 골라주세요.");
  }

  const principal = readMoney(formData, "principal");
  const balanceRaw = readText(formData, "current_balance");
  const currentBalance = balanceRaw
    ? readMoney(formData, "current_balance")
    : principal;

  return {
    accountId: readNullableText(formData, "account_id"),
    currentBalance,
    endsOn: readNullableText(formData, "ends_on"),
    interestDay: readNullableDay(formData, "interest_day"),
    interestRate: readNullableRate(formData, "interest_rate"),
    liabilityType,
    memo: readNullableText(formData, "memo"),
    name,
    ownerLabel,
    principal,
    startedOn: readNullableText(formData, "started_on"),
  };
}

function revalidateDebts() {
  revalidatePath("/debts");
  revalidatePath("/invest");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function createLiabilityAction(
  formData: FormData,
): Promise<DebtActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertLiabilityAccount(
      supabase,
      householdId,
      payload.accountId,
    );

    const { error } = await supabase.from("liabilities").insert({
      household_id: householdId,
      account_id: accountId,
      name: payload.name,
      liability_type: payload.liabilityType,
      owner_label: payload.ownerLabel,
      principal: payload.principal,
      current_balance: payload.currentBalance,
      interest_rate: payload.interestRate,
      interest_day: payload.interestDay,
      started_on: payload.startedOn,
      ends_on: payload.endsOn,
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateDebts();
    return { ok: true, message: "부채를 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "부채를 추가하지 못했어요.",
    };
  }
}

export async function updateLiabilityAction(
  formData: FormData,
): Promise<DebtActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const liabilityId = readText(formData, "liability_id");

    if (!liabilityId) {
      throw new Error("고칠 부채를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const accountId = await assertLiabilityAccount(
      supabase,
      householdId,
      payload.accountId,
    );

    const { error } = await supabase
      .from("liabilities")
      .update({
        account_id: accountId,
        name: payload.name,
        liability_type: payload.liabilityType,
        owner_label: payload.ownerLabel,
        principal: payload.principal,
        current_balance: payload.currentBalance,
        interest_rate: payload.interestRate,
        interest_day: payload.interestDay,
        started_on: payload.startedOn,
        ends_on: payload.endsOn,
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", liabilityId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateDebts();
    return { ok: true, message: "부채를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "부채를 저장하지 못했어요.",
    };
  }
}

export async function deleteLiabilityAction(
  formData: FormData,
): Promise<DebtActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const liabilityId = readText(formData, "liability_id");

    if (!liabilityId) {
      throw new Error("지울 부채를 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("liabilities")
      .delete()
      .eq("household_id", householdId)
      .eq("id", liabilityId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateDebts();
    return { ok: true, message: "부채를 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "부채를 지우지 못했어요.",
    };
  }
}

// 원금 상환을 기록해요. 남은 원금이 줄고, 연결계좌에서 상환액만큼 빠져요.
export async function recordRepaymentAction(
  formData: FormData,
): Promise<DebtActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const liabilityId = readText(formData, "liability_id");
    const amount = readMoney(formData, "amount");
    const paidOn =
      readText(formData, "paid_on") || new Date().toISOString().slice(0, 10);

    if (!liabilityId) {
      throw new Error("상환할 부채를 찾을 수 없어요.");
    }

    if (amount <= 0) {
      throw new Error("상환액을 1원 이상 입력해 주세요.");
    }

    const { supabase, user } = await assertCurrentMember(householdId);

    const { data: liability, error: liabilityError } = await supabase
      .from("liabilities")
      .select("id, account_id, current_balance")
      .eq("household_id", householdId)
      .eq("id", liabilityId)
      .maybeSingle();

    if (liabilityError || !liability) {
      throw new Error(liabilityError?.message ?? "부채를 찾을 수 없어요.");
    }

    const { error: paymentError } = await supabase
      .from("liability_payments")
      .insert({
        household_id: householdId,
        liability_id: liabilityId,
        account_id: liability.account_id,
        amount,
        paid_on: paidOn,
        created_by: user.id,
      });

    if (paymentError) {
      throw new Error(paymentError.message);
    }

    const nextBalance = Math.max(0, Number(liability.current_balance) - amount);

    const { error: updateError } = await supabase
      .from("liabilities")
      .update({ current_balance: nextBalance })
      .eq("household_id", householdId)
      .eq("id", liabilityId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidateDebts();

    const moneyText = `${amount.toLocaleString("ko-KR")}원`;

    return {
      ok: true,
      message: liability.account_id
        ? `${moneyText}을 상환 기록했어요. 연결계좌에서 빠지고 남은 원금이 줄었어요.`
        : `${moneyText}을 상환 기록했어요. (연결계좌가 없어 잔액 반영은 안 됐어요)`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "상환을 기록하지 못했어요.",
    };
  }
}
