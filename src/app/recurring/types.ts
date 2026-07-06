import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

export const recurringKinds = ["subscription", "fixed_expense"] as const;
export const billingCycles = ["monthly", "yearly", "weekly", "custom"] as const;
export const recurringStatuses = ["active", "paused", "canceled"] as const;

export type RecurringKind = (typeof recurringKinds)[number];
export type BillingCycle = (typeof billingCycles)[number];
export type RecurringStatus = (typeof recurringStatuses)[number];

export type RecurringItemRow = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  payer_user_id: string | null;
  kind: RecurringKind;
  name: string;
  merchant: string | null;
  amount: number | string;
  currency_code: string;
  billing_cycle: BillingCycle;
  billing_interval: number;
  custom_interval_days: number | null;
  billing_day: number | null;
  day_of_week: number | null;
  next_due_date: string;
  status: RecurringStatus;
  auto_create_transaction: boolean;
  reminder_days_before: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type PayerMember = {
  user_id: string;
  label: string;
};

export type RecurringHousehold = {
  id: string;
  name: string;
};

export type RecurringPageData = {
  accounts: AccountRow[];
  categories: CategoryRow[];
  errorMessage?: string;
  household: RecurringHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  members: PayerMember[];
  recurringItems: RecurringItemRow[];
};

export const recurringKindLabels: Record<RecurringKind, string> = {
  subscription: "구독비",
  fixed_expense: "고정비",
};

export const billingCycleLabels: Record<BillingCycle, string> = {
  monthly: "매월",
  yearly: "매년",
  weekly: "매주",
  custom: "사용자 지정",
};

export const recurringStatusLabels: Record<RecurringStatus, string> = {
  active: "활성",
  paused: "일시정지",
  canceled: "취소됨",
};
