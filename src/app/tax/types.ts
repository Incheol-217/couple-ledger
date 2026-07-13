export type MemberLabel = "husband" | "wife";

export type TaxProfileRow = {
  id: string;
  household_id: string;
  member_label: MemberLabel;
  annual_salary: number | string;
};

// 결제수단별 올해 지출 합계. bank/기타는 공제 대상이 아니라 참고용으로만 보여줘요.
export type SpendingByMethod = {
  credit: number; // 신용카드(card 계좌, 15%)
  check: number; // 체크카드(check_card 계좌, 30%)
  cash: number; // 현금(cash 계좌, 30%) — 현금영수증 가정
  excluded: number; // 계좌이체 등 공제 제외
};

export type MemberSpending = {
  label: MemberLabel;
  displayName: string;
  own: SpendingByMethod; // 본인 명의 계좌 지출
  sharedShare: SpendingByMethod; // 공용 계좌 지출의 절반
  income: number; // 올해 기록된 수입 (본인 명의 + 공용 절반)
};

export type TaxHousehold = {
  id: string;
  name: string;
};

export type TaxPageData = {
  errorMessage?: string;
  household: TaxHousehold | null;
  isConfigured: boolean;
  isSignedIn: boolean;
  members: MemberSpending[];
  profiles: TaxProfileRow[];
  year: number;
};

export const memberLabels: Record<MemberLabel, string> = {
  husband: "남편",
  wife: "아내",
};
