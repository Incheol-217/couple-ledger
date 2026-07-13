import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InvestClient } from "./invest-client";
import type { InvestPageData, InvestmentAssetRow } from "./types";

const emptyData: InvestPageData = {
  assets: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
  monthIncome: 0,
  monthSavedToSavings: 0,
};

function monthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();

  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

function toNumber(value: number | string | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

async function getInvestPageData(): Promise<InvestPageData> {
  if (!hasSupabaseAuthEnv()) {
    return emptyData;
  }

  const context = await getCurrentUserContext();

  if (!context.isSignedIn) {
    return { ...emptyData, isConfigured: true, isSignedIn: false };
  }

  if (!context.householdId) {
    return { ...emptyData, isConfigured: true, isSignedIn: true };
  }

  const household = {
    id: context.householdId,
    name: context.householdName ?? "공동 가계부",
  };
  const supabase = await createClient();
  const { start, end } = monthRange();

  const [assetsResult, savingsAccountsResult, monthTxResult] =
    await Promise.all([
      supabase
        .from("investment_assets")
        .select(
          "id, household_id, account_id, name, asset_class, owner_label, principal, current_value, valued_at, memo, created_at",
        )
        .eq("household_id", household.id)
        .order("asset_class", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("accounts")
        .select("id")
        .eq("household_id", household.id)
        .eq("type", "savings"),
      supabase
        .from("transactions")
        .select("type, amount, transfer_account_id")
        .eq("household_id", household.id)
        .in("type", ["income", "transfer"])
        .gte("transaction_date", start)
        .lte("transaction_date", end),
    ]);

  const savingsAccountIds = new Set(
    ((savingsAccountsResult.data ?? []) as { id: string }[]).map(
      (account) => account.id,
    ),
  );

  let monthIncome = 0;
  let monthSavedToSavings = 0;

  for (const row of (monthTxResult.data ?? []) as Array<{
    type: "income" | "transfer";
    amount: number | string;
    transfer_account_id: string | null;
  }>) {
    if (row.type === "income") {
      monthIncome += toNumber(row.amount);
    } else if (
      row.transfer_account_id &&
      savingsAccountIds.has(row.transfer_account_id)
    ) {
      // 저축 계좌로 보낸 이체를 이번 달 저축액으로 봐요.
      monthSavedToSavings += toNumber(row.amount);
    }
  }

  return {
    assets: (assetsResult.data ?? []) as InvestmentAssetRow[],
    errorMessage:
      assetsResult.error?.message ??
      savingsAccountsResult.error?.message ??
      monthTxResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    monthIncome,
    monthSavedToSavings,
  };
}

export default async function InvestPage() {
  const data = await getInvestPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="자산"
        title="저축·투자 자산"
        description="예적금, 주식, 연금까지 우리 부부 자산을 한 화면에서 관리해요."
      />

      <InvestClient {...data} />
    </div>
  );
}
