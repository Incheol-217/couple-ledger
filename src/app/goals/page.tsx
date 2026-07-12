import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { GoalsClient } from "./goals-client";
import type { GoalHousehold, GoalPageData, SavingsGoalRow } from "./types";
import type { AccountRow } from "@/app/accounts/types";

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

type MembershipRow = {
  household_id: string;
  households:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

function normalizeHousehold(row: MembershipRow | null): GoalHousehold | null {
  if (!row) {
    return null;
  }

  const household = Array.isArray(row.households)
    ? row.households[0]
    : row.households;

  return {
    id: household?.id ?? row.household_id,
    name: household?.name ?? "공동 가계부",
  };
}

const emptyData: GoalPageData = {
  accounts: [],
  goals: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
};

async function getGoalsPageData(): Promise<GoalPageData> {
  if (!hasSupabaseEnv()) {
    return emptyData;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ...emptyData, isConfigured: true, isSignedIn: false };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      ...emptyData,
      errorMessage: membershipError.message,
      isConfigured: true,
      isSignedIn: true,
    };
  }

  const household = normalizeHousehold(membership as MembershipRow | null);

  if (!household) {
    return { ...emptyData, isConfigured: true, isSignedIn: true };
  }

  const [accountsResult, goalsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, display_order, is_active, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("savings_goals")
      .select(
        "id, household_id, account_id, name, target_amount, current_amount, target_date, is_achieved, color, memo, created_at, updated_at",
      )
      .eq("household_id", household.id)
      .order("is_achieved", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return {
    accounts: (accountsResult.data ?? []) as AccountRow[],
    errorMessage: accountsResult.error?.message ?? goalsResult.error?.message,
    goals: (goalsResult.data ?? []) as SavingsGoalRow[],
    household,
    isConfigured: true,
    isSignedIn: true,
  };
}

export default async function GoalsPage() {
  const data = await getGoalsPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="저축"
        title="저축 목표"
        description="함께 모을 목표를 정하고, 얼마나 모았는지 같이 확인해요."
      />

      <GoalsClient {...data} />
    </div>
  );
}
