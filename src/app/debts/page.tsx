import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DebtsClient } from "./debts-client";
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

async function getDebtsPageData(): Promise<DebtsPageData> {
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

export default async function DebtsPage() {
  const data = await getDebtsPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="부채"
        title="대출·부채"
        description="전세대출, 신용대출 등 갚아야 할 빚과 남은 원금을 관리해요."
      />

      <DebtsClient {...data} />
    </div>
  );
}
