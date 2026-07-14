import { PageHeader } from "@/components/page-header";
import {
  buildAccountBalances,
  type AccountBalance,
  type BalanceTradeRow,
  type BalanceTransactionRow,
} from "@/lib/accounts/balances";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AccountsClient } from "./accounts-client";
import type { AccountRow } from "./types";

const TIME_ZONE = "Asia/Seoul";

// 대시보드와 동일하게 서울 기준 오늘 날짜(YYYY-MM-DD)를 구해요.
function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function getAccountsPageData() {
  if (!hasSupabaseAuthEnv()) {
    return {
      accounts: [] as AccountRow[],
      accountBalances: [] as AccountBalance[],
      errorMessage: undefined,
      household: null,
      isConfigured: false,
      isAdmin: false,
      isSignedIn: false,
    };
  }

  // 레이아웃에서 이미 계산한 사용자/가계부 컨텍스트를 재사용해요.
  const context = await getCurrentUserContext();

  if (!context.isSignedIn) {
    return {
      accounts: [] as AccountRow[],
      accountBalances: [] as AccountBalance[],
      errorMessage: undefined,
      household: null,
      isConfigured: true,
      isAdmin: false,
      isSignedIn: false,
    };
  }

  const supabase = await createClient();
  const household = context.householdId
    ? { id: context.householdId, name: context.householdName ?? "공동 가계부" }
    : null;

  if (!household) {
    return {
      accounts: [] as AccountRow[],
      accountBalances: [] as AccountBalance[],
      errorMessage: undefined,
      household: null,
      isConfigured: true,
      isAdmin: false,
      isSignedIn: true,
    };
  }

  const today = seoulToday();

  const [
    { data: accounts, error: accountsError },
    { data: balanceTransactions, error: transactionsError },
    { data: investmentTrades },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, vault_enabled, vault_name, vault_amount, display_order, is_active, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .order("is_active", { ascending: false })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select("account_id, transfer_account_id, type, amount, transaction_date")
      .eq("household_id", household.id)
      .lte("transaction_date", today),
    supabase
      .from("investment_trades")
      .select("account_id, side, cash_amount, traded_at")
      .eq("household_id", household.id)
      .not("account_id", "is", null)
      .lte("traded_at", today),
  ]);

  const accountRows = (accounts ?? []) as AccountRow[];
  const accountBalances = buildAccountBalances(
    accountRows,
    (balanceTransactions ?? []) as unknown as BalanceTransactionRow[],
    today,
    (investmentTrades ?? []) as unknown as BalanceTradeRow[],
  );

  return {
    accounts: accountRows,
    accountBalances,
    errorMessage: accountsError?.message ?? transactionsError?.message,
    household,
    isAdmin: context.isAdmin,
    isConfigured: true,
    isSignedIn: true,
  };
}

export default async function AccountsPage() {
  const data = await getAccountsPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="계좌"
        title="계좌"
        description="계좌와 카드를 추가하고, 처음 잔액과 순서를 정해요."
      />

      <AccountsClient {...data} />
    </div>
  );
}
