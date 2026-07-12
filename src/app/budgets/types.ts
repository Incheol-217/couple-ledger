import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

export const budgetPeriods = ["monthly", "yearly", "custom"] as const;
export const budgetScopes = ["overall", "category", "account"] as const;

export type BudgetPeriod = (typeof budgetPeriods)[number];
export type BudgetScope = (typeof budgetScopes)[number];

export type BudgetRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  category_id: string | null;
  period: BudgetPeriod;
  period_start: string;
  period_end: string | null;
  amount: number | string;
  currency_code: string;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

// 예산 사용률 계산에 필요한 최소 지출 정보만 담아요.
export type BudgetExpenseRow = {
  id: string;
  account_id: string;
  category_id: string | null;
  amount: number | string;
  transaction_date: string;
};

export type BudgetHousehold = {
  id: string;
  name: string;
};

export type BudgetPageData = {
  accounts: AccountRow[];
  budgets: BudgetRow[];
  categories: CategoryRow[];
  errorMessage?: string;
  expenses: BudgetExpenseRow[];
  household: BudgetHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
};

export const budgetPeriodLabels: Record<BudgetPeriod, string> = {
  monthly: "매월",
  yearly: "매년",
  custom: "직접 설정",
};

export const budgetScopeLabels: Record<BudgetScope, string> = {
  overall: "전체 지출",
  category: "카테고리별",
  account: "계좌별",
};

export function scopeOf(budget: {
  account_id: string | null;
  category_id: string | null;
}): BudgetScope {
  if (budget.category_id) {
    return "category";
  }

  if (budget.account_id) {
    return "account";
  }

  return "overall";
}
