import type { AccountRow, AccountType, OwnerType } from "@/app/accounts/types";
import type { CategoryRow, TransactionType } from "@/app/m/new/types";
import type {
  BillingCycle,
  RecurringItemRow,
  RecurringKind,
} from "@/app/recurring/types";

export const periodFilters = [
  "this_month",
  "last_month",
  "last_3_months",
  "custom",
] as const;

export const expenseTypeFilters = [
  "all",
  "variable",
  "fixed_expense",
  "subscription",
] as const;

export type PeriodFilter = (typeof periodFilters)[number];
export type ExpenseTypeFilter = (typeof expenseTypeFilters)[number];

export type AccountFilter =
  | "all"
  | `owner:${OwnerType}`
  | `type:${AccountType}`
  | `account:${string}`;

export type DashboardHousehold = {
  id: string;
  name: string;
};

export type DashboardDateRange = {
  end: string;
  label: string;
  period: PeriodFilter;
  start: string;
};

export type DashboardFilters = {
  account: AccountFilter;
  expenseType: ExpenseTypeFilter;
  period: PeriodFilter;
  start?: string;
  end?: string;
};

export type DashboardTransactionRow = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  recurring_item_id: string | null;
  type: TransactionType;
  source: string;
  amount: number | string;
  currency_code: string;
  transaction_date: string;
  occurred_at: string | null;
  merchant: string | null;
  memo: string | null;
  created_at: string;
};

export type DashboardBudgetRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number | string;
  currency_code: string;
  period_start: string;
  period_end: string | null;
  is_active: boolean;
};

export type AiAdviceLogRow = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  created_at: string;
};

export type PlannedRecurringOccurrence = {
  id: string;
  recurring_item_id: string;
  account_id: string;
  category_id: string | null;
  kind: RecurringKind;
  name: string;
  merchant: string | null;
  amount: number;
  currency_code: string;
  billing_cycle: BillingCycle;
  due_date: string;
  status: RecurringItemRow["status"];
};

export type DashboardPageData = {
  accounts: AccountRow[];
  adviceLogs: AiAdviceLogRow[];
  budgets: DashboardBudgetRow[];
  categories: CategoryRow[];
  dateRange: DashboardDateRange;
  errorMessage?: string;
  filters: DashboardFilters;
  household: DashboardHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  plannedOccurrences: PlannedRecurringOccurrence[];
  recurringItems: RecurringItemRow[];
  today: string;
  transactions: DashboardTransactionRow[];
};
