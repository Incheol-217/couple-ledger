export const liabilityTypes = [
  "jeonse",
  "credit",
  "mortgage",
  "auto",
  "other",
] as const;

export const liabilityOwners = ["shared", "husband", "wife"] as const;

export type LiabilityType = (typeof liabilityTypes)[number];
export type LiabilityOwner = (typeof liabilityOwners)[number];

export type LiabilityRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  name: string;
  liability_type: LiabilityType;
  owner_label: LiabilityOwner;
  principal: number | string;
  current_balance: number | string;
  interest_rate: number | string | null;
  interest_day: number | null;
  started_on: string | null;
  ends_on: string | null;
  memo: string | null;
  created_at: string;
};

export type DebtAccountOption = {
  id: string;
  name: string;
  type: string;
};

export type DebtHousehold = {
  id: string;
  name: string;
};

export type DebtsPageData = {
  accounts: DebtAccountOption[];
  liabilities: LiabilityRow[];
  errorMessage?: string;
  household: DebtHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
};

export const liabilityTypeLabels: Record<LiabilityType, string> = {
  jeonse: "전세대출",
  credit: "신용대출",
  mortgage: "주택담보",
  auto: "자동차",
  other: "기타",
};

export const liabilityOwnerLabels: Record<LiabilityOwner, string> = {
  shared: "공동",
  husband: "남편",
  wife: "아내",
};
