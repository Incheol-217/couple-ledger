// 연말정산 "신용카드 등 사용금액 소득공제" 추정 계산이에요.
// 최근(2024~2025 귀속) 기준 규칙을 단순화한 추정치로, 실제 결정세액과 다를 수 있어요.
// 전통시장·대중교통·문화비 추가한도, 인적공제 변동 등은 반영하지 않아요.

export type CardUsage = {
  // 신용카드 사용액 (공제율 15%)
  credit: number;
  // 체크카드·현금영수증 사용액 (공제율 30%)
  checkCash: number;
};

// 결제수단별 상세 사용액 (체크카드와 현금영수증을 따로 보여줄 때)
export type MethodUsage = {
  credit: number; // 신용카드 (15%)
  check: number; // 체크카드 (30%)
  cash: number; // 현금영수증 (30%)
};

export type MethodBreakdownRow = {
  method: keyof MethodUsage;
  used: number;
  rate: number;
  // 문턱 차감 후 이 결제수단이 만드는 공제액 (한도 적용 전)
  deduction: number;
};

export type DetailedCardDeductionResult = CardDeductionResult & {
  rows: MethodBreakdownRow[];
};

export type CardDeductionResult = {
  // 총급여의 25% 문턱
  threshold: number;
  // 문턱을 넘긴 뒤 실제 공제 대상이 된 금액(공제율 적용 전)
  overThreshold: number;
  // 공제율 적용 후, 한도 적용 전 공제액
  rawDeduction: number;
  // 총급여 구간별 공제 한도
  limit: number;
  // 한도까지 반영한 최종 공제 예상액
  deduction: number;
  // 문턱까지 남은 사용액 (문턱을 넘었으면 0)
  remainingToThreshold: number;
};

const CREDIT_RATE = 0.15;
const CHECK_CASH_RATE = 0.3;
const LOCAL_TAX_RATE = 0.1; // 지방소득세 10%

// 근로소득공제 (총급여 기준, 한도 2,000만원)
export function earnedIncomeDeduction(salary: number) {
  let deduction: number;

  if (salary <= 5_000_000) {
    deduction = salary * 0.7;
  } else if (salary <= 15_000_000) {
    deduction = 3_500_000 + (salary - 5_000_000) * 0.4;
  } else if (salary <= 45_000_000) {
    deduction = 7_500_000 + (salary - 15_000_000) * 0.15;
  } else if (salary <= 100_000_000) {
    deduction = 12_250_000 + (salary - 45_000_000) * 0.05;
  } else {
    deduction = 14_750_000 + (salary - 100_000_000) * 0.02;
  }

  return Math.min(deduction, 20_000_000);
}

// 과세표준 추정: 총급여 - 근로소득공제 - 본인 기본공제 150만원
export function estimatedTaxBase(salary: number) {
  return Math.max(0, salary - earnedIncomeDeduction(salary) - 1_500_000);
}

// 과세표준 구간별 한계세율 (2023년 이후 기본세율)
export function marginalRate(taxBase: number) {
  if (taxBase <= 14_000_000) return 0.06;
  if (taxBase <= 50_000_000) return 0.15;
  if (taxBase <= 88_000_000) return 0.24;
  if (taxBase <= 150_000_000) return 0.35;
  if (taxBase <= 300_000_000) return 0.38;
  if (taxBase <= 500_000_000) return 0.4;
  if (taxBase <= 1_000_000_000) return 0.42;
  return 0.45;
}

// 신용카드 등 사용금액 소득공제 한도 (총급여 7천만원 기준)
export function cardDeductionLimit(salary: number) {
  return salary <= 70_000_000 ? 3_000_000 : 2_500_000;
}

// 신용카드 등 소득공제 추정.
// 문턱(총급여 25%)은 공제율이 낮은 신용카드 사용분부터 차감해요(납세자에게 유리한 실제 방식).
export function cardDeduction(salary: number, usage: CardUsage): CardDeductionResult {
  const threshold = salary * 0.25;
  const totalUsed = usage.credit + usage.checkCash;
  const limit = cardDeductionLimit(salary);

  if (salary <= 0 || totalUsed <= threshold) {
    return {
      threshold,
      overThreshold: 0,
      rawDeduction: 0,
      limit,
      deduction: 0,
      remainingToThreshold: Math.max(0, threshold - totalUsed),
    };
  }

  const creditUsedForThreshold = Math.min(usage.credit, threshold);
  const remainingThreshold = threshold - creditUsedForThreshold;
  const creditOver = usage.credit - creditUsedForThreshold;
  const checkCashOver = Math.max(0, usage.checkCash - remainingThreshold);

  const rawDeduction = creditOver * CREDIT_RATE + checkCashOver * CHECK_CASH_RATE;
  const deduction = Math.min(rawDeduction, limit);

  return {
    threshold,
    overThreshold: creditOver + checkCashOver,
    rawDeduction,
    limit,
    deduction,
    remainingToThreshold: 0,
  };
}

// 결제수단별 상세 분해까지 계산하는 버전.
// 문턱(총급여 25%)은 공제율이 낮은 신용카드 → 체크카드 → 현금 순으로 차감해요.
export function cardDeductionDetailed(
  salary: number,
  usage: MethodUsage,
): DetailedCardDeductionResult {
  const base = cardDeduction(salary, {
    credit: usage.credit,
    checkCash: usage.check + usage.cash,
  });

  const order: Array<{ method: keyof MethodUsage; rate: number }> = [
    { method: "credit", rate: CREDIT_RATE },
    { method: "check", rate: CHECK_CASH_RATE },
    { method: "cash", rate: CHECK_CASH_RATE },
  ];

  let remainingThreshold = base.threshold;
  const rows: MethodBreakdownRow[] = order.map(({ method, rate }) => {
    const used = usage[method];
    const consumed = Math.min(used, remainingThreshold);
    remainingThreshold -= consumed;
    const over = used - consumed;

    return {
      method,
      used,
      rate,
      deduction: salary > 0 ? over * rate : 0,
    };
  });

  return { ...base, rows };
}

// 공제액이 실제로 줄여주는 세금(지방소득세 포함) 추정.
export function estimatedTaxSavings(salary: number, deduction: number) {
  if (salary <= 0 || deduction <= 0) {
    return 0;
  }

  const rate = marginalRate(estimatedTaxBase(salary));
  return Math.round(deduction * rate * (1 + LOCAL_TAX_RATE));
}
