import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow, TransactionType } from "@/app/m/new/types";
import type {
  RecurringItemRow,
  RecurringKind,
} from "@/app/recurring/types";

export const reportPeriods = [
  "this_month",
  "last_month",
  "last_3_months",
  "custom",
] as const;

export type ReportPeriod = (typeof reportPeriods)[number];

export type ReportRange = {
  end: string;
  label: string;
  period: ReportPeriod;
  start: string;
};

export type ReportHousehold = {
  id: string;
  name: string;
};

export type ReportMember = {
  display_name: string | null;
  member_label: "husband" | "wife" | null;
  role: "owner" | "member";
  user_id: string;
};

export type ReportTransactionRow = {
  id: string;
  household_id: string;
  account_id: string;
  transfer_account_id: string | null;
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
  user_id: string | null;
  created_at: string;
};

export type ReportBudgetRow = {
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

export type ReportAdviceRow = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  created_at: string;
};

export type ReportRecurringOccurrence = {
  id: string;
  recurring_item_id: string;
  account_id: string;
  category_id: string | null;
  kind: RecurringKind;
  name: string;
  merchant: string | null;
  amount: number;
  currency_code: string;
  due_date: string;
};

export type ReportPageData = {
  accounts: AccountRow[];
  adviceLogs: ReportAdviceRow[];
  budgets: ReportBudgetRow[];
  categories: CategoryRow[];
  errorMessage?: string;
  household: ReportHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  members: ReportMember[];
  plannedOccurrences: ReportRecurringOccurrence[];
  range: ReportRange;
  recurringItems: RecurringItemRow[];
  today: string;
  transactions: ReportTransactionRow[];
};
