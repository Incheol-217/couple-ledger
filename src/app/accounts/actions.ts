"use server";

import { revalidatePath } from "next/cache";
import { createNotificationEvent } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";
import {
  accountTypes,
  ownerTypes,
  type AccountType,
  type OwnerType,
} from "./types";

export type AccountActionResult = {
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
  const value = readText(formData, key).replaceAll(",", "");

  if (!value) {
    return 0;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("처음 잔액은 0원 이상으로 입력해 주세요.");
  }

  return amount;
}

function readDateOrToday(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (value) {
    throw new Error("잔액을 확인한 날을 다시 확인해 주세요.");
  }

  return new Date().toISOString().slice(0, 10);
}

function readAccountType(formData: FormData): AccountType {
  const value = readText(formData, "type");

  if (!accountTypes.includes(value as AccountType)) {
    throw new Error("계좌 종류를 다시 골라주세요.");
  }

  return value as AccountType;
}

function readOwnerType(formData: FormData): OwnerType {
  const value = readText(formData, "owner_type");

  if (!ownerTypes.includes(value as OwnerType)) {
    throw new Error("사용자를 다시 골라주세요.");
  }

  return value as OwnerType;
}

async function createSupabaseForAction() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase 환경변수를 넣어주세요.");
  }

  return createClient();
}

async function assertCurrentAdminMember(householdId: string) {
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
    .select("id, role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (error || !data) {
    throw new Error("관리자 계정으로 계좌를 바꿀 수 있어요.");
  }

  return { supabase, user };
}

async function validateWithdrawalAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseForAction>>,
  householdId: string,
  type: AccountType,
  accountId: string | null,
  defaultWithdrawalAccountId: string | null,
) {
  if (type !== "card" && type !== "check_card") {
    return null;
  }

  if (!defaultWithdrawalAccountId) {
    return null;
  }

  if (accountId && defaultWithdrawalAccountId === accountId) {
    throw new Error("연결 계좌는 이 카드와 다르게 골라주세요.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, type, is_active")
    .eq("household_id", householdId)
    .eq("id", defaultWithdrawalAccountId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("카드값이 빠지는 계좌를 찾을 수 없어요.");
  }

  if (!data.is_active || data.type === "card") {
    throw new Error("카드가 아닌 계좌를 골라주세요.");
  }

  return defaultWithdrawalAccountId;
}

function toAccountPayload(formData: FormData) {
  const name = readText(formData, "name");

  if (name.length < 1) {
    throw new Error("계좌 이름을 입력해 주세요.");
  }

  const type = readAccountType(formData);
  const ownerType = readOwnerType(formData);
  const rawWithdrawalAccountId = readNullableText(
    formData,
    "default_withdrawal_account_id",
  );

  return {
    name,
    type,
    ownerType,
    institutionName: readNullableText(formData, "institution_name"),
    maskedIdentifier: readNullableText(formData, "masked_identifier"),
    color: readNullableText(formData, "color") ?? "#16a34a",
    openingBalance: readMoney(formData, "opening_balance"),
    openingBalanceAsOf: readDateOrToday(formData, "opening_balance_as_of"),
    defaultWithdrawalAccountId:
      type === "card" || type === "check_card" ? rawWithdrawalAccountId : null,
  };
}

export async function createAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentAdminMember(householdId);
    const payload = toAccountPayload(formData);
    const defaultWithdrawalAccountId = await validateWithdrawalAccount(
      supabase,
      householdId,
      payload.type,
      null,
      payload.defaultWithdrawalAccountId,
    );

    const { data: lastAccount, error: orderError } = await supabase
      .from("accounts")
      .select("display_order")
      .eq("household_id", householdId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) {
      throw new Error(orderError.message);
    }

    const displayOrder =
      typeof lastAccount?.display_order === "number"
        ? lastAccount.display_order + 10
        : 10;

    const { error } = await supabase.from("accounts").insert({
      household_id: householdId,
      name: payload.name,
      type: payload.type,
      owner_type: payload.ownerType,
      institution_name: payload.institutionName,
      masked_identifier: payload.maskedIdentifier,
      color: payload.color,
      opening_balance: payload.openingBalance,
      opening_balance_as_of: payload.openingBalanceAsOf,
      default_withdrawal_account_id: defaultWithdrawalAccountId,
      display_order: displayOrder,
      is_active: true,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `관리자가 '${payload.name}' 계좌를 추가했어요.`,
      eventType: "account_created",
      householdId,
      metadata: {
        owner_type: payload.ownerType,
        opening_balance: payload.openingBalance,
        type: payload.type,
      },
      title: "계좌 설정이 바뀌었어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "계좌를 추가했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "계좌를 추가하지 못했어요.",
    };
  }
}

export async function updateAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const accountId = readText(formData, "account_id");

    if (!accountId) {
      throw new Error("수정할 계좌를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentAdminMember(householdId);
    const payload = toAccountPayload(formData);
    const defaultWithdrawalAccountId = await validateWithdrawalAccount(
      supabase,
      householdId,
      payload.type,
      accountId,
      payload.defaultWithdrawalAccountId,
    );

    const { error } = await supabase
      .from("accounts")
      .update({
        name: payload.name,
        type: payload.type,
        owner_type: payload.ownerType,
        institution_name: payload.institutionName,
        masked_identifier: payload.maskedIdentifier,
        color: payload.color,
        opening_balance: payload.openingBalance,
        opening_balance_as_of: payload.openingBalanceAsOf,
        default_withdrawal_account_id: defaultWithdrawalAccountId,
      })
      .eq("household_id", householdId)
      .eq("id", accountId);

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `관리자가 '${payload.name}' 계좌 설정을 수정했어요.`,
      eventType: "account_updated",
      householdId,
      metadata: {
        account_id: accountId,
        owner_type: payload.ownerType,
        opening_balance: payload.openingBalance,
        type: payload.type,
      },
      title: "계좌 설정이 바뀌었어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "계좌를 수정했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "계좌를 수정하지 못했어요.",
    };
  }
}

export async function deactivateAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const accountId = readText(formData, "account_id");

    if (!accountId) {
      throw new Error("숨길 계좌를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentAdminMember(householdId);
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("name")
      .eq("household_id", householdId)
      .eq("id", accountId)
      .maybeSingle();

    if (accountError) {
      throw new Error(accountError.message);
    }

    const { error } = await supabase
      .from("accounts")
      .update({
        is_active: false,
        default_withdrawal_account_id: null,
      })
      .eq("household_id", householdId)
      .eq("id", accountId);

    if (error) {
      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `관리자가 '${account?.name ?? "계좌"}' 계좌를 숨겼어요.`,
      eventType: "account_deactivated",
      householdId,
      metadata: {
        account_id: accountId,
      },
      title: "계좌 설정이 바뀌었어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "계좌를 숨겼어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "계좌를 숨기지 못했어요.",
    };
  }
}

export async function moveAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const accountId = readText(formData, "account_id");
    const direction = readText(formData, "direction");

    if (!accountId || !["up", "down"].includes(direction)) {
      throw new Error("순서를 바꿀 계좌를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentAdminMember(householdId);
    const { data: accounts, error: listError } = await supabase
      .from("accounts")
      .select("id, name, display_order, created_at")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (listError) {
      throw new Error(listError.message);
    }

    const rows = accounts ?? [];
    const currentIndex = rows.findIndex((account) => account.id === accountId);

    if (currentIndex < 0) {
      throw new Error("사용 중인 계좌만 순서를 바꿀 수 있어요.");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= rows.length) {
      return { ok: true, message: "이미 끝에 있어요." };
    }

    const nextRows = [...rows];
    const [selected] = nextRows.splice(currentIndex, 1);
    nextRows.splice(targetIndex, 0, selected);

    const updates = nextRows.map((account, index) =>
      supabase
        .from("accounts")
        .update({ display_order: (index + 1) * 10 })
        .eq("household_id", householdId)
        .eq("id", account.id),
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      throw new Error(failed.error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `관리자가 '${selected.name ?? "계좌"}' 계좌 순서를 바꿨어요.`,
      eventType: "account_reordered",
      householdId,
      metadata: {
        account_id: accountId,
        direction,
      },
      title: "계좌 설정이 바뀌었어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "계좌 순서를 바꿨어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "계좌 순서를 바꾸지 못했어요.",
    };
  }
}

export async function updateAccountVaultAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const accountId = readText(formData, "account_id");
    const vaultEnabled = readText(formData, "vault_enabled") === "true";

    if (!accountId) {
      throw new Error("금고를 설정할 계좌를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentAdminMember(householdId);

    const vaultName = readText(formData, "vault_name") || null;
    const rawAmount = readText(formData, "vault_amount");
    const vaultAmount = rawAmount
      ? Number(rawAmount.replaceAll(",", ""))
      : 0;

    if (!Number.isFinite(vaultAmount) || vaultAmount < 0) {
      throw new Error("금고 금액은 0원 이상 숫자로 입력해 주세요.");
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .update({
        vault_enabled: vaultEnabled,
        vault_name: vaultName,
        vault_amount: Math.round(vaultAmount),
      })
      .eq("household_id", householdId)
      .eq("id", accountId)
      .select("name")
      .single();

    if (error || !account) {
      throw new Error(error?.message ?? "금고를 저장하지 못했어요.");
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: vaultEnabled
        ? `'${account.name}' 계좌에 금고${vaultName ? ` '${vaultName}'` : ""}를 설정했어요.`
        : `'${account.name}' 계좌의 금고를 껐어요.`,
      eventType: "account_updated",
      householdId,
      metadata: {
        account_id: accountId,
        vault_amount: Math.round(vaultAmount),
        vault_enabled: vaultEnabled,
      },
      title: "금고 설정이 바뀌었어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: vaultEnabled ? "금고를 저장했어요." : "금고를 껐어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "금고를 저장하지 못했어요.",
    };
  }
}

export async function deleteAccountAction(
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const accountId = readText(formData, "account_id");

    if (!accountId) {
      throw new Error("지울 계좌를 찾을 수 없어요.");
    }

    const { supabase, user } = await assertCurrentAdminMember(householdId);

    const { data: account, error: findError } = await supabase
      .from("accounts")
      .select("name")
      .eq("household_id", householdId)
      .eq("id", accountId)
      .maybeSingle();

    if (findError || !account) {
      throw new Error(findError?.message ?? "계좌를 찾을 수 없어요.");
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("household_id", householdId)
      .eq("id", accountId);

    if (error) {
      // 거래·반복결제가 남아 있으면 DB가 삭제를 막아요(FK restrict).
      if (error.code === "23503") {
        throw new Error(
          "거래나 반복 결제 기록이 있는 계좌는 지울 수 없어요. 기록을 지키려면 '숨기기'를 사용해 주세요.",
        );
      }

      throw new Error(error.message);
    }

    await createNotificationEvent(supabase, {
      actorUserId: user.id,
      body: `관리자가 '${account.name}' 계좌를 삭제했어요.`,
      eventType: "account_deactivated",
      householdId,
      metadata: {
        account_id: accountId,
        deleted: true,
      },
      title: "계좌를 삭제했어요",
    });

    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { ok: true, message: "계좌를 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "계좌를 지우지 못했어요.",
    };
  }
}
