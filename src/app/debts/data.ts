import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  DebtAccountOption,
  DebtsPageData,
  LiabilityRow,
} from "./types";

const emptyData: DebtsPageData = {
  accounts: [],
  liabilities: [],
  household: null,
  isConfigured: false,
  isSignedIn: false,
};

export async function getDebtsPageData(): Promise<DebtsPageData> {
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

  const [liabilitiesResult, accountsResult] = await Promise.all([
    supabase
      .from("liabilities")
      .select(
        "id, household_id, account_id, name, liability_type, owner_label, principal, current_balance, interest_rate, interest_day, started_on, ends_on, memo, created_at",
      )
      .eq("household_id", household.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("accounts")
      .select("id, name, type")
      .eq("household_id", household.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return {
    accounts: (accountsResult.data ?? []) as DebtAccountOption[],
    liabilities: (liabilitiesResult.data ?? []) as LiabilityRow[],
    errorMessage:
      liabilitiesResult.error?.message ?? accountsResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
  };
}
