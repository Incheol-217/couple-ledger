import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  memberLabels,
  type MemberLabel,
  type MemberSpending,
  type SpendingByMethod,
  type TaxPageData,
  type TaxProfileRow,
} from "./types";

type AccountLite = {
  id: string;
  type: "bank" | "card" | "check_card" | "cash" | "savings" | "virtual";
  owner_type: "shared" | "husband" | "wife";
};

type TransactionLite = {
  account_id: string;
  amount: number | string;
  type: "income" | "expense";
};

type MemberRow = {
  member_label: MemberLabel | null;
  user_id: string;
};

type ProfileNameRow = {
  id: string;
  display_name: string | null;
};

const emptyData: TaxPageData = {
  household: null,
  isConfigured: false,
  isSignedIn: false,
  members: [],
  profiles: [],
  year: new Date().getFullYear(),
};

function emptySpending(): SpendingByMethod {
  return { credit: 0, check: 0, cash: 0, excluded: 0 };
}

function toNumber(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

// 결제수단 매핑: card→신용카드 15%, check_card→체크카드 30%, cash→현금영수증 30%,
// 나머지→공제 제외(계좌이체 등)
function bucketFor(accountType: AccountLite["type"]): keyof SpendingByMethod {
  if (accountType === "card") {
    return "credit";
  }

  if (accountType === "check_card") {
    return "check";
  }

  if (accountType === "cash") {
    return "cash";
  }

  return "excluded";
}

export async function getTaxPageData(): Promise<TaxPageData> {
  if (!hasSupabaseAuthEnv()) {
    return emptyData;
  }

  const context = await getCurrentUserContext();

  if (!context.isSignedIn) {
    return { ...emptyData, isConfigured: true, isSignedIn: false };
  }

  if (!context.householdId) {
    return { ...emptyData, isConfigured: true, isSignedIn: true };
  }

  const household = {
    id: context.householdId,
    name: context.householdName ?? "공동 가계부",
  };
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [accountsResult, expensesResult, profilesResult, membersResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, type, owner_type")
        .eq("household_id", household.id),
      supabase
        .from("transactions")
        .select("account_id, amount, type")
        .eq("household_id", household.id)
        .in("type", ["expense", "income"])
        .gte("transaction_date", yearStart)
        .lte("transaction_date", yearEnd),
      supabase
        .from("tax_profiles")
        .select("id, household_id, member_label, annual_salary")
        .eq("household_id", household.id),
      supabase
        .from("household_members")
        .select("member_label, user_id")
        .eq("household_id", household.id),
    ]);

  const accounts = (accountsResult.data ?? []) as AccountLite[];
  const rows = (expensesResult.data ?? []) as TransactionLite[];
  const memberRows = (membersResult.data ?? []) as MemberRow[];

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  // 명의별(남편/아내/공용) × 결제수단별 지출 합계 + 명의별 수입 합계
  const totals: Record<"husband" | "wife" | "shared", SpendingByMethod> = {
    husband: emptySpending(),
    wife: emptySpending(),
    shared: emptySpending(),
  };
  const incomeTotals: Record<"husband" | "wife" | "shared", number> = {
    husband: 0,
    wife: 0,
    shared: 0,
  };

  for (const row of rows) {
    const account = accountById.get(row.account_id);

    if (!account) {
      continue;
    }

    if (row.type === "income") {
      incomeTotals[account.owner_type] += toNumber(row.amount);
    } else {
      totals[account.owner_type][bucketFor(account.type)] += toNumber(
        row.amount,
      );
    }
  }

  // 멤버 표시 이름
  const labeledMembers = memberRows.filter(
    (member): member is MemberRow & { member_label: MemberLabel } =>
      member.member_label === "husband" || member.member_label === "wife",
  );
  const userIds = labeledMembers.map((member) => member.user_id);
  const namesResult =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds)
      : { data: [], error: null };
  const nameById = new Map(
    ((namesResult.data ?? []) as ProfileNameRow[]).map((profile) => [
      profile.id,
      profile.display_name,
    ]),
  );

  const members: MemberSpending[] = (["husband", "wife"] as const).map(
    (label) => {
      const row = labeledMembers.find((member) => member.member_label === label);
      const sharedShare = emptySpending();

      // 공용 계좌 지출·수입은 절반씩 나눠서 잡아요.
      sharedShare.credit = totals.shared.credit / 2;
      sharedShare.check = totals.shared.check / 2;
      sharedShare.cash = totals.shared.cash / 2;
      sharedShare.excluded = totals.shared.excluded / 2;

      return {
        label,
        displayName:
          (row ? nameById.get(row.user_id) : null) ?? memberLabels[label],
        own: totals[label],
        sharedShare,
        income: incomeTotals[label] + incomeTotals.shared / 2,
      };
    },
  );

  return {
    errorMessage:
      accountsResult.error?.message ??
      expensesResult.error?.message ??
      profilesResult.error?.message ??
      membersResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    members,
    profiles: (profilesResult.data ?? []) as TaxProfileRow[],
    year,
  };
}
