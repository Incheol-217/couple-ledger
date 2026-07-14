"use server";

import { revalidatePath } from "next/cache";
import { valuationInKrw } from "@/lib/invest/quotes";
import { createClient } from "@/lib/supabase/server";
import { assetClasses, assetOwners, type AssetClass, type AssetOwner } from "./types";

// 종목 시세로 평가액을 자동 계산하는 자산 종류예요.
const TICKER_CLASSES: AssetClass[] = ["stock", "pension"];

export type InvestActionResult = {
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

function readNullableQuantity(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value.replaceAll(",", ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("보유 수량은 0 이상 숫자로 입력해 주세요.");
  }

  return parsed;
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
    throw new Error("이 가계부의 자산만 바꿀 수 있어요.");
  }

  return { supabase, user };
}

function toPayload(formData: FormData) {
  const name = readText(formData, "name");
  const assetClass = readText(formData, "asset_class") as AssetClass;
  const ownerLabel = (readText(formData, "owner_label") || "shared") as AssetOwner;

  if (!name) {
    throw new Error("자산 이름을 입력해 주세요.");
  }

  if (!assetClasses.includes(assetClass)) {
    throw new Error("자산 종류를 다시 골라주세요.");
  }

  if (!assetOwners.includes(ownerLabel)) {
    throw new Error("명의를 다시 골라주세요.");
  }

  const principal = readMoney(formData, "principal");
  const currentValueRaw = readText(formData, "current_value");
  const currentValue = currentValueRaw
    ? readMoney(formData, "current_value")
    : principal;

  // 종목코드·보유수량은 주식/연금에서만 써요.
  const isTickerClass = TICKER_CLASSES.includes(assetClass);
  const ticker = isTickerClass ? readNullableText(formData, "ticker") : null;
  const quantity = isTickerClass
    ? readNullableQuantity(formData, "quantity")
    : null;

  return {
    assetClass,
    currentValue,
    memo: readNullableText(formData, "memo"),
    name,
    ownerLabel,
    principal,
    quantity,
    ticker,
  };
}

// 종목코드+보유수량이 있으면 야후 시세로 평가액을 계산해요. 실패하면
// 사용자가 넣은 평가액(fallback)을 그대로 써요.
async function resolveCurrentValue(payload: {
  ticker: string | null;
  quantity: number | null;
  currentValue: number;
}) {
  if (!payload.ticker || !payload.quantity) {
    return { currentValue: payload.currentValue, priced: false };
  }

  try {
    const valuation = await valuationInKrw(payload.ticker, payload.quantity);

    if (valuation) {
      return { currentValue: valuation.value, priced: true };
    }
  } catch {
    // 시세 조회 실패는 무시하고 수동 평가액으로 저장해요.
  }

  return { currentValue: payload.currentValue, priced: false };
}

function revalidateInvest() {
  revalidatePath("/invest");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function createAssetAction(
  formData: FormData,
): Promise<InvestActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase, user } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const resolved = await resolveCurrentValue(payload);

    const { error } = await supabase.from("investment_assets").insert({
      household_id: householdId,
      name: payload.name,
      asset_class: payload.assetClass,
      owner_label: payload.ownerLabel,
      principal: payload.principal,
      current_value: resolved.currentValue,
      ticker: payload.ticker,
      quantity: payload.quantity,
      valued_at: new Date().toISOString().slice(0, 10),
      memo: payload.memo,
      created_by: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateInvest();
    return {
      ok: true,
      message: resolved.priced
        ? "자산을 추가하고 시세로 평가액을 넣었어요."
        : "자산을 추가했어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "자산을 추가하지 못했어요.",
    };
  }
}

export async function updateAssetAction(
  formData: FormData,
): Promise<InvestActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const assetId = readText(formData, "asset_id");

    if (!assetId) {
      throw new Error("고칠 자산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const payload = toPayload(formData);
    const resolved = await resolveCurrentValue(payload);

    const { error } = await supabase
      .from("investment_assets")
      .update({
        name: payload.name,
        asset_class: payload.assetClass,
        owner_label: payload.ownerLabel,
        principal: payload.principal,
        current_value: resolved.currentValue,
        ticker: payload.ticker,
        quantity: payload.quantity,
        valued_at: new Date().toISOString().slice(0, 10),
        memo: payload.memo,
      })
      .eq("household_id", householdId)
      .eq("id", assetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateInvest();
    return {
      ok: true,
      message: resolved.priced
        ? "자산을 저장하고 시세로 평가액을 갱신했어요."
        : "자산을 저장했어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "자산을 저장하지 못했어요.",
    };
  }
}

export async function updateAssetValueAction(
  formData: FormData,
): Promise<InvestActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const assetId = readText(formData, "asset_id");
    const currentValue = readMoney(formData, "current_value");

    if (!assetId) {
      throw new Error("평가액을 바꿀 자산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("investment_assets")
      .update({
        current_value: currentValue,
        valued_at: new Date().toISOString().slice(0, 10),
      })
      .eq("household_id", householdId)
      .eq("id", assetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateInvest();
    return { ok: true, message: "평가액을 업데이트했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "평가액을 바꾸지 못했어요.",
    };
  }
}

export async function deleteAssetAction(
  formData: FormData,
): Promise<InvestActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const assetId = readText(formData, "asset_id");

    if (!assetId) {
      throw new Error("지울 자산을 찾을 수 없어요.");
    }

    const { supabase } = await assertCurrentMember(householdId);
    const { error } = await supabase
      .from("investment_assets")
      .delete()
      .eq("household_id", householdId)
      .eq("id", assetId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateInvest();
    return { ok: true, message: "자산을 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "자산을 지우지 못했어요.",
    };
  }
}

type AssetForPricing = {
  id: string;
  ticker: string | null;
  quantity: number | string | null;
};

// 종목코드가 있는 자산들의 평가액을 야후 시세로 한꺼번에 갱신해요.
export async function refreshAssetPricesAction(
  formData: FormData,
): Promise<InvestActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase } = await assertCurrentMember(householdId);

    const { data, error } = await supabase
      .from("investment_assets")
      .select("id, ticker, quantity")
      .eq("household_id", householdId)
      .not("ticker", "is", null);

    if (error) {
      throw new Error(error.message);
    }

    const assets = (data ?? []) as AssetForPricing[];
    const priceable = assets.filter(
      (asset) => asset.ticker && Number(asset.quantity) > 0,
    );

    if (priceable.length === 0) {
      return {
        ok: true,
        message: "시세를 붙일 종목이 없어요. 종목코드와 보유수량을 넣어주세요.",
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const fxCache = new Map<string, number>();
    let updated = 0;
    let failed = 0;

    for (const asset of priceable) {
      const valuation = await valuationInKrw(
        asset.ticker as string,
        Number(asset.quantity),
        fxCache,
      );

      if (!valuation) {
        failed += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("investment_assets")
        .update({ current_value: valuation.value, valued_at: today })
        .eq("household_id", householdId)
        .eq("id", asset.id);

      if (updateError) {
        failed += 1;
      } else {
        updated += 1;
      }
    }

    revalidateInvest();

    return {
      ok: true,
      message:
        failed > 0
          ? `${updated}개 종목 시세를 갱신했어요. ${failed}개는 종목코드를 확인해 주세요.`
          : `${updated}개 종목 시세를 갱신했어요.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "시세를 갱신하지 못했어요.",
    };
  }
}
