import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { BudgetsClient } from "./budgets-client";
import type {
  BudgetExpenseRow,
  BudgetHousehold,
  BudgetPageData,
  BudgetRow,
} from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

type MembershipRow = {
  household_id: string;
  households:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

function normalizeHousehold(row: MembershipRow | null): BudgetHousehold | null {
  if (!row) {
    return null;
  }

  const household = Array.isArray(row.households)
    ? row.households[0]
    : row.households;

  return {
    id: household?.id ?? row.household_id,
    name: household?.name ?? "공동 가계부",
  };
}

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
  if (!hasSupabaseEnv()) {
    return emptyData;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ...emptyData, isConfigured: true, isSignedIn: false };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      ...emptyData,
      errorMessage: membershipError.message,
      isConfigured: true,
      isSignedIn: true,
    };
  }

  const household = normalizeHousehold(membership as MembershipRow | null);

  if (!household) {
    return { ...emptyData, isConfigured: true, isSignedIn: true };
  }

  const [accountsResult, categoriesResult, budgetsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, display_order, is_active, created_at, updated_at",
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

export default async function BudgetsPage() {
  const data = await getBudgetsPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="예산"
        title="예산 관리"
        description="카테고리와 계좌별로 예산을 정하고, 이번 기간에 얼마나 썼는지 확인해요."
      />

      <BudgetsClient {...data} />
    </div>
  );
}
