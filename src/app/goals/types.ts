import type { AccountRow } from "@/app/accounts/types";

export type SavingsGoalRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string | null;
  is_achieved: boolean;
  color: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalHousehold = {
  id: string;
  name: string;
};

export type GoalPageData = {
  accounts: AccountRow[];
  errorMessage?: string;
  goals: SavingsGoalRow[];
  household: GoalHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
};
