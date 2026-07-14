// 할부 결제 일정 계산 헬퍼예요.
// 결제 시작일(startsOn) + 매달 지출일(billingDay) + 할부 개월수(total)만으로
// 다음 결제일·회차별 결제일·지금까지 낸 회차 수를 계산해요.
// (billingDay를 비우면 시작일의 '일'을 매달 지출일로 써요.)

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

// 해당 연/월(0-based month)의 원하는 날짜. 월 마지막 날을 넘으면 마지막 날로 맞춰요.
// month 인덱스가 11을 넘어가도 Date.UTC가 연도로 올려줘요.
function dateOnMonth(year: number, monthIndex: number, wantedDay: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(wantedDay, lastDay)));
}

function paymentDay(startsOn: string, billingDay: number | null) {
  if (billingDay && billingDay >= 1 && billingDay <= 31) {
    return billingDay;
  }

  return parseDateOnly(startsOn).day;
}

// 첫 결제일: 시작월의 매달 지출일. 그 날이 시작일보다 앞서면 다음 달로 넘겨요.
export function firstInstallmentDueDate(
  startsOn: string,
  billingDay: number | null,
) {
  const { year, month, day } = parseDateOnly(startsOn);
  const wantedDay = paymentDay(startsOn, billingDay);
  const startDate = new Date(Date.UTC(year, month - 1, day));

  let candidate = dateOnMonth(year, month - 1, wantedDay);

  if (candidate < startDate) {
    candidate = dateOnMonth(year, month, wantedDay);
  }

  return formatDateOnly(candidate);
}

// n번째(1-based) 결제일.
export function nthInstallmentDueDate(
  startsOn: string,
  billingDay: number | null,
  n: number,
) {
  const first = parseDateOnly(firstInstallmentDueDate(startsOn, billingDay));
  const wantedDay = paymentDay(startsOn, billingDay);
  return formatDateOnly(
    dateOnMonth(first.year, first.month - 1 + (n - 1), wantedDay),
  );
}

// 마지막 결제일.
export function lastInstallmentDueDate(
  startsOn: string,
  billingDay: number | null,
  total: number,
) {
  return nthInstallmentDueDate(startsOn, billingDay, Math.max(1, total));
}

// 오늘까지 지난 결제 회차 수 (0 ~ total).
export function paidInstallmentCount(
  startsOn: string | null,
  billingDay: number | null,
  total: number,
  today: string,
) {
  if (!startsOn || total <= 0) {
    return 0;
  }

  let count = 0;

  for (let n = 1; n <= total; n += 1) {
    if (nthInstallmentDueDate(startsOn, billingDay, n) <= today) {
      count += 1;
    } else {
      break;
    }
  }

  return count;
}
