export const accountTypes = ["bank", "card", "cash", "savings", "virtual"] as const;
export const ownerTypes = ["shared", "husband", "wife"] as const;

export type AccountType = (typeof accountTypes)[number];
export type OwnerType = (typeof ownerTypes)[number];

export type AccountRow = {
  id: string;
  household_id: string;
  name: string;
  type: AccountType;
  owner_type: OwnerType;
  default_withdrawal_account_id: string | null;
  institution_name: string | null;
  masked_identifier: string | null;
  color: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HouseholdOption = {
  id: string;
  name: string;
};

export const accountTypeLabels: Record<AccountType, string> = {
  bank: "은행",
  card: "카드",
  cash: "현금",
  savings: "저축",
  virtual: "가상계좌",
};

export const ownerTypeLabels: Record<OwnerType, string> = {
  shared: "공동",
  husband: "남편",
  wife: "아내",
};
