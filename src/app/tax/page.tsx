import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TaxClient } from "./tax-client";
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

type ExpenseLite = {
  account_id: string;
  amount: number | string;
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
  return { credit: 0, checkCash: 0, excluded: 0 };
}

function toNumber(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

// 결제수단 매핑: card→신용카드 15%, check_card·cash→체크카드/현금영수증 30%,
// 나머지→공제 제외(계좌이체 등)
function bucketFor(accountType: AccountLite["type"]): keyof SpendingByMethod {
  if (accountType === "card") {
    return "credit";
  }

  if (accountType === "check_card" || accountType === "cash") {
    return "checkCash";
  }

  return "excluded";
}

async function getTaxPageData(): Promise<TaxPageData> {
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
        .select("account_id, amount")
        .eq("household_id", household.id)
        .eq("type", "expense")
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
  const expenses = (expensesResult.data ?? []) as ExpenseLite[];
  const memberRows = (membersResult.data ?? []) as MemberRow[];

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  // 명의별(남편/아내/공용) × 결제수단별 합계
  const totals: Record<"husband" | "wife" | "shared", SpendingByMethod> = {
    husband: emptySpending(),
    wife: emptySpending(),
    shared: emptySpending(),
  };

  for (const expense of expenses) {
    const account = accountById.get(expense.account_id);

    if (!account) {
      continue;
    }

    totals[account.owner_type][bucketFor(account.type)] += toNumber(
      expense.amount,
    );
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

      // 공용 계좌 지출은 절반씩 나눠서 잡아요.
      sharedShare.credit = totals.shared.credit / 2;
      sharedShare.checkCash = totals.shared.checkCash / 2;
      sharedShare.excluded = totals.shared.excluded / 2;

      return {
        label,
        displayName:
          (row ? nameById.get(row.user_id) : null) ?? memberLabels[label],
        own: totals[label],
        sharedShare,
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

export default async function TaxPage() {
  const data = await getTaxPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="연말정산"
        title="예상 환급 계산기"
        description="올해 카드·현금 지출로 연말정산에서 얼마나 아낄 수 있을지 가늠해요."
      />

      <TaxClient {...data} />
    </div>
  );
}
