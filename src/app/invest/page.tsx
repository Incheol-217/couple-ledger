import { Landmark, TrendingUp } from "lucide-react";
import { DebtsClient } from "@/app/debts/debts-client";
import { getDebtsPageData } from "@/app/debts/data";
import { PageHeader } from "@/components/page-header";
import { TabHub } from "@/components/tab-hub";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InvestClient } from "./invest-client";
import type {
  AssetAccountOption,
  InvestPageData,
  InvestmentAssetRow,
} from "./types";

const emptyData: InvestPageData = {
  accounts: [],
  assets: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
  totalDebt: 0,
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

  const [
    assetsResult,
    accountsResult,
    savingsAccountsResult,
    monthTxResult,
    liabilitiesResult,
  ] = await Promise.all([
      supabase
        .from("investment_assets")
        .select(
          "id, household_id, account_id, name, asset_class, owner_label, principal, current_value, ticker, quantity, valued_at, memo, created_at",
        )
        .eq("household_id", household.id)
        .order("asset_class", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("accounts")
        .select("id, name, type")
        .eq("household_id", household.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
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
      supabase
        .from("liabilities")
        .select("current_balance")
        .eq("household_id", household.id),
    ]);

  // 부채 테이블(마이그레이션)이 아직 없어도 자산 화면은 정상 동작하도록,
  // 조회 실패는 순자산 0으로 처리하고 화면에 에러를 띄우지 않아요.
  const totalDebt = (
    (liabilitiesResult.data ?? []) as { current_balance: number | string }[]
  ).reduce((sum, row) => sum + toNumber(row.current_balance), 0);

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
    accounts: (accountsResult.data ?? []) as AssetAccountOption[],
    assets: (assetsResult.data ?? []) as InvestmentAssetRow[],
    errorMessage:
      assetsResult.error?.message ??
      accountsResult.error?.message ??
      savingsAccountsResult.error?.message ??
      monthTxResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    totalDebt,
    monthIncome,
    monthSavedToSavings,
  };
}

export default async function InvestPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initialView = params.view === "debts" ? "debts" : "assets";

  const [invest, debts] = await Promise.all([
    getInvestPageData(),
    getDebtsPageData(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="자산·부채"
        title="자산과 부채"
        description="예적금·주식·연금 자산과 대출·부채를 한곳에서 보고 순자산을 확인해요."
      />

      <TabHub
        initialValue={initialView}
        tabs={[
          {
            value: "assets",
            icon: <TrendingUp className="size-4" aria-hidden="true" />,
            label: "자산",
            content: <InvestClient {...invest} />,
          },
          {
            value: "debts",
            icon: <Landmark className="size-4" aria-hidden="true" />,
            label: "부채",
            content: <DebtsClient {...debts} />,
          },
        ]}
      />
    </div>
  );
}
