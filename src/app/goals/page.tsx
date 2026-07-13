import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { GoalsClient } from "./goals-client";
import type { GoalPageData, SavingsGoalRow } from "./types";
import type { AccountRow } from "@/app/accounts/types";

const emptyData: GoalPageData = {
  accounts: [],
  goals: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
};

async function getGoalsPageData(): Promise<GoalPageData> {
  if (!hasSupabaseAuthEnv()) {
    return emptyData;
  }

  // 레이아웃에서 이미 계산한 사용자/가계부 컨텍스트를 재사용해요.
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

  const [accountsResult, goalsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, vault_enabled, vault_name, vault_amount, display_order, is_active, created_at, updated_at",
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
