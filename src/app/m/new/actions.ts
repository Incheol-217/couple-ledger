"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transactionTypes, type TransactionType } from "./types";

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
    throw new Error("거래 타입을 다시 선택해 주세요.");
  }

  return value as TransactionType;
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
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }

  return createClient();
}

async function assertCurrentMember(householdId: string) {
  if (!householdId) {
    throw new Error("household를 찾을 수 없습니다.");
  }

  const supabase = await createSupabaseForAction();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("이 household에 거래를 저장할 권한이 없습니다.");
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
    throw new Error(`${label}을 찾을 수 없습니다.`);
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
    throw new Error("카테고리를 찾을 수 없습니다.");
  }

  if (data.type !== type) {
    throw new Error("거래 타입과 카테고리 타입이 맞지 않습니다.");
  }

  return data.id as string;
}

export async function createQuickTransactionAction(
  formData: FormData,
): Promise<QuickTransactionActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const type = readTransactionType(formData);
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

    if (type === "transfer" && confirmedTransferAccountId === confirmedAccountId) {
      throw new Error("이체 출금 계좌와 입금 계좌는 달라야 합니다.");
    }

    const confirmedCategoryId = await assertCategory(
      supabase,
      householdId,
      categoryId,
      type,
    );

    const { error } = await supabase.from("transactions").insert({
      household_id: householdId,
      user_id: user.id,
      account_id: confirmedAccountId,
      transfer_account_id: confirmedTransferAccountId,
      category_id: confirmedCategoryId,
      type,
      source: "manual",
      amount,
      currency_code: "KRW",
      transaction_date: transactionDate,
      occurred_at: readOccurredAt(formData, transactionDate, transactionTime),
      merchant: readNullableText(formData, "merchant"),
      memo: readNullableText(formData, "memo"),
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/m/new");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return { ok: true, message: "거래를 저장했습니다." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "거래 저장에 실패했습니다.",
    };
  }
}
