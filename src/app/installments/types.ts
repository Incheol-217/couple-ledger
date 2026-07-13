import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

export type InstallmentStatus = "active" | "paused" | "canceled";

export type InstallmentRow = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  name: string;
  merchant: string | null;
  amount: number | string;
  billing_day: number | null;
  next_due_date: string;
  starts_on: string | null;
  status: InstallmentStatus;
  total_installments: number | null;
  memo: string | null;
  created_at: string;
};

export type InstallmentHousehold = {
  id: string;
  name: string;
};

export type InstallmentPageData = {
  accounts: AccountRow[];
  categories: CategoryRow[];
  errorMessage?: string;
  household: InstallmentHousehold | null;
  installments: InstallmentRow[];
  isConfigured: boolean;
  isSignedIn: boolean;
};

export const installmentStatusLabels: Record<InstallmentStatus, string> = {
  active: "진행 중",
  paused: "잠시 멈춤",
  canceled: "끝남",
};
