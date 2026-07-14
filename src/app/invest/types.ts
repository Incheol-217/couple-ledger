export const assetClasses = [
  "deposit",
  "stock",
  "fund",
  "pension",
  "crypto",
  "other",
] as const;

export const assetOwners = ["shared", "husband", "wife"] as const;

export type AssetClass = (typeof assetClasses)[number];
export type AssetOwner = (typeof assetOwners)[number];

export type InvestmentAssetRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  name: string;
  asset_class: AssetClass;
  owner_label: AssetOwner;
  principal: number | string;
  current_value: number | string;
  ticker: string | null;
  quantity: number | string | null;
  valued_at: string;
  memo: string | null;
  created_at: string;
};

export type InvestHousehold = {
  id: string;
  name: string;
};

// 자산에 연결할 수 있는 계좌 목록(간단 버전)
export type AssetAccountOption = {
  id: string;
  name: string;
  type: string;
};

export type InvestPageData = {
  accounts: AssetAccountOption[];
  assets: InvestmentAssetRow[];
  errorMessage?: string;
  household: InvestHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  // 이번 달 저축률 계산용
  monthIncome: number;
  monthSavedToSavings: number;
};

export const assetClassLabels: Record<AssetClass, string> = {
  deposit: "예적금",
  stock: "주식·ETF",
  fund: "펀드",
  pension: "연금",
  crypto: "코인",
  other: "기타",
};

export const assetOwnerLabels: Record<AssetOwner, string> = {
  shared: "공동",
  husband: "남편",
  wife: "아내",
};
