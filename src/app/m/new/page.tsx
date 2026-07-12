import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { QuickTransactionClient } from "./quick-transaction-client";
import type { CategoryRow, QuickEntryData } from "./types";
import type { AccountRow } from "@/app/accounts/types";

function uniqueIds(ids: Array<string | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  ids.forEach((id) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  });

  return result;
}

async function getQuickEntryData(): Promise<QuickEntryData> {
  if (!hasSupabaseAuthEnv()) {
    return {
      accounts: [],
      categories: [],
      household: null,
      isConfigured: false,
      isSignedIn: false,
      recentAccountIds: [],
      recentCategoryIds: [],
    };
  }

  // 레이아웃에서 이미 계산한 사용자/가계부 컨텍스트를 재사용해요.
  const context = await getCurrentUserContext();

  if (!context.isSignedIn) {
    return {
      accounts: [],
      categories: [],
      household: null,
      isConfigured: true,
      isSignedIn: false,
      recentAccountIds: [],
      recentCategoryIds: [],
    };
  }

  const supabase = await createClient();
  const household = context.householdId
    ? { id: context.householdId, name: context.householdName ?? "공동 가계부" }
    : null;

  if (!household) {
    return {
      accounts: [],
      categories: [],
      household: null,
      isConfigured: true,
      isSignedIn: true,
      recentAccountIds: [],
      recentCategoryIds: [],
    };
  }

  const [accountsResult, categoriesResult, recentResult] = await Promise.all([
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
      .from("categories")
      .select(
        "id, household_id, name, type, icon, color, display_order, is_active",
      )
      .eq("household_id", household.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select("account_id, category_id")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    accounts: (accountsResult.data ?? []) as AccountRow[],
    categories: (categoriesResult.data ?? []) as CategoryRow[],
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      recentResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    recentAccountIds: uniqueIds(
      (recentResult.data ?? []).map((row) => row.account_id as string | null),
    ),
    recentCategoryIds: uniqueIds(
      (recentResult.data ?? []).map((row) => row.category_id as string | null),
    ),
  };
}

export default async function MobileNewExpensePage() {
  const data = await getQuickEntryData();

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-md flex-col gap-5 px-4 py-5 pb-28">
      <div>
        <p className="text-sm font-medium text-primary">빠른 기록</p>
        <h1 className="mt-2 text-2xl font-semibold">빠른 입력</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          직접 쓰거나 영수증을 찍어 필요한 값을 먼저 채워요.
        </p>
      </div>

      <QuickTransactionClient {...data} />
    </div>
  );
}
