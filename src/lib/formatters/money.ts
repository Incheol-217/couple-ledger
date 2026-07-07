export function normalizeAmountInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function formatAmountInput(value: string) {
  const digits = normalizeAmountInput(value).replace(/^0+(?=\d)/, "");

  if (!digits) {
    return "";
  }

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    currency: "KRW",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Math.round(value));
}
