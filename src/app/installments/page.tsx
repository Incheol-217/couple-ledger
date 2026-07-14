import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InstallmentsClient } from "./installments-client";
import type { InstallmentPageData, InstallmentRow } from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

const emptyData: InstallmentPageData = {
  accounts: [],
  categories: [],
  household: null,
  installments: [],
  isConfigured: false,
  isSignedIn: false,
};

async function getInstallmentPageData(): Promise<InstallmentPageData> {
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

  const [accountsResult, categoriesResult, installmentsResult] =
    await Promise.all([
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
        .from("categories")
        .select(
          "id, household_id, name, type, icon, color, display_order, is_active",
        )
        .eq("household_id", household.id)
        .eq("type", "expense")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("recurring_items")
        .select(
          "id, household_id, account_id, category_id, name, merchant, amount, billing_day, next_due_date, starts_on, status, total_installments, auto_create_transaction, memo, created_at",
        )
        .eq("household_id", household.id)
        .eq("kind", "installment")
        .order("status", { ascending: true })
        .order("next_due_date", { ascending: true }),
    ]);

  const installments = (installmentsResult.data ?? []) as InstallmentRow[];

  return {
    accounts: (accountsResult.data ?? []) as AccountRow[],
    categories: (categoriesResult.data ?? []) as CategoryRow[],
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      installmentsResult.error?.message,
    household,
    installments,
    isConfigured: true,
    isSignedIn: true,
  };
}

export default async function InstallmentsPage() {
  const data = await getInstallmentPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="할부"
        title="할부금 관리"
        description="몇 회 남았는지, 매달 얼마 나가는지 한눈에 봐요. 결제일마다 거래가 자동으로 기록돼요."
      />

      <InstallmentsClient {...data} />
    </div>
  );
}
