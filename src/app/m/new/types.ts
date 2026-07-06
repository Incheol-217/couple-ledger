import type { AccountRow } from "@/app/accounts/types";

export const transactionTypes = ["expense", "income", "transfer"] as const;

export type TransactionType = (typeof transactionTypes)[number];

export type CategoryRow = {
  id: string;
  household_id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
};

export type QuickEntryHousehold = {
  id: string;
  name: string;
};

export type QuickEntryData = {
  accounts: AccountRow[];
  categories: CategoryRow[];
  household: QuickEntryHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  recentAccountIds: string[];
  recentCategoryIds: string[];
  errorMessage?: string;
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
};
