import { getGoalsPageData } from "@/app/goals/data";
import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlanTabs } from "./plan-tabs";
import type { BudgetExpenseRow, BudgetPageData, BudgetRow } from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

const emptyData: BudgetPageData = {
  accounts: [],
  budgets: [],
  categories: [],
  expenses: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
};

function startOfYearString() {
  return `${new Date().getFullYear()}-01-01`;
}

async function getBudgetsPageData(): Promise<BudgetPageData> {
  if (!hasSupabaseAuthEnv()) {
    return emptyData;
  }

  // 레이아웃에서 이미 계산한 사용자/가계부 컨텍스트를 재사용해요.
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

  const [accountsResult, categoriesResult, budgetsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, vault_enabled, vault_name, vault_amount, display_order, is_active, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select(
        "id, household_id, name, type, icon, color, display_order, is_active",
      )
      .eq("household_id", household.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("budgets")
      .select(
        "id, household_id, account_id, category_id, period, period_start, period_end, amount, currency_code, is_active, memo, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  const budgets = (budgetsResult.data ?? []) as BudgetRow[];

  // 이번 해 시작일과 모든 예산의 시작일 중 가장 이른 날짜부터 지출을 불러와요.
  const sinceDate = budgets.reduce(
    (earliest, budget) =>
      budget.period_start < earliest ? budget.period_start : earliest,
    startOfYearString(),
  );

  const expensesResult = await supabase
    .from("transactions")
    .select("id, account_id, category_id, amount, transaction_date")
    .eq("household_id", household.id)
    .eq("type", "expense")
    .gte("transaction_date", sinceDate);

  return {
    accounts: (accountsResult.data ?? []) as AccountRow[],
    budgets,
    categories: (categoriesResult.data ?? []) as CategoryRow[],
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      budgetsResult.error?.message ??
      expensesResult.error?.message,
    expenses: (expensesResult.data ?? []) as BudgetExpenseRow[],
    household,
    isConfigured: true,
    isSignedIn: true,
  };
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initialView = params.view === "goals" ? "goals" : "budgets";

  const [budgets, goals] = await Promise.all([
    getBudgetsPageData(),
    getGoalsPageData(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="예산·목표"
        title="예산과 저축 목표"
        description="이번 기간 지출 예산과 함께 모을 저축 목표를 한곳에서 관리해요."
      />

      <PlanTabs budgets={budgets} goals={goals} initialView={initialView} />
    </div>
  );
}
