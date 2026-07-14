import type { AccountRow } from "@/app/accounts/types";

// 잔액 계산에 필요한 거래 최소 필드예요. (수입/지출/이체 공통)
export type BalanceTransactionRow = {
  account_id: string;
  amount: number | string;
  transaction_date: string;
  transfer_account_id: string | null;
  type: "expense" | "income" | "transfer";
};

export type AccountBalance = {
  account_id: string;
  balance: number;
};

// 처음 잔액에서 시작해 오늘까지의 거래를 반영한 계좌별 현재 잔액을 계산해요.
// 이체는 나가는 계좌에서 빼고 들어오는 계좌에 더해요.
export function buildAccountBalances(
  accounts: AccountRow[],
  balanceTransactions: BalanceTransactionRow[],
  today: string,
): AccountBalance[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const balances = new Map<string, number>(
    accounts.map((account) => [
      account.id,
      account.opening_balance_as_of <= today
        ? Number(account.opening_balance) || 0
        : 0,
    ]),
  );

  // 체크카드는 연결된 통장에서 돈이 빠지는 결제수단이라, 잔액 효과를
  // 연결 계좌로 돌려요. (연말정산 등 결제수단 구분은 원래 계좌 기준 유지)
  function balanceAccountId(accountId: string) {
    const account = accountsById.get(accountId);

    if (
      account?.type === "check_card" &&
      account.default_withdrawal_account_id &&
      accountsById.has(account.default_withdrawal_account_id)
    ) {
      return account.default_withdrawal_account_id;
    }

    return accountId;
  }

  function appliesToAccount(accountId: string, transactionDate: string) {
    const account = accountsById.get(accountId);
    return Boolean(account && transactionDate >= account.opening_balance_as_of);
  }

  balanceTransactions.forEach((transaction) => {
    const amount = Number(transaction.amount);

    if (!Number.isFinite(amount)) {
      return;
    }

    const sourceId = balanceAccountId(transaction.account_id);

    if (transaction.type === "income") {
      if (!appliesToAccount(sourceId, transaction.transaction_date)) {
        return;
      }

      balances.set(sourceId, (balances.get(sourceId) ?? 0) + amount);
      return;
    }

    if (transaction.type === "expense") {
      if (!appliesToAccount(sourceId, transaction.transaction_date)) {
        return;
      }

      balances.set(sourceId, (balances.get(sourceId) ?? 0) - amount);
      return;
    }

    if (appliesToAccount(sourceId, transaction.transaction_date)) {
      balances.set(sourceId, (balances.get(sourceId) ?? 0) - amount);
    }

    const targetId = transaction.transfer_account_id
      ? balanceAccountId(transaction.transfer_account_id)
      : null;

    if (targetId && appliesToAccount(targetId, transaction.transaction_date)) {
      balances.set(targetId, (balances.get(targetId) ?? 0) + amount);
    }
  });

  return Array.from(balances.entries()).map(([accountId, balance]) => ({
    account_id: accountId,
    balance,
  }));
}
