import { getInstallmentPageData } from "@/app/installments/data";
import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext, hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RecurringTabs } from "./recurring-tabs";
import type {
  PayerMember,
  RecurringItemRow,
  RecurringPageData,
} from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

type MemberRow = {
  user_id: string;
  member_label: "shared" | "husband" | "wife" | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function memberLabel(member: MemberRow, profile?: ProfileRow) {
  if (profile?.display_name) {
    return profile.display_name;
  }

  if (member.member_label === "husband") {
    return "남편";
  }

  if (member.member_label === "wife") {
    return "아내";
  }

  return `멤버 ${member.user_id.slice(0, 8)}`;
}

async function getRecurringPageData(): Promise<RecurringPageData> {
  if (!hasSupabaseAuthEnv()) {
    return {
      accounts: [],
      categories: [],
      household: null,
      isConfigured: false,
      isSignedIn: false,
      members: [],
      recurringItems: [],
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
      members: [],
      recurringItems: [],
    };
  }

  if (!context.householdId) {
    return {
      accounts: [],
      categories: [],
      household: null,
      isConfigured: true,
      isSignedIn: true,
      members: [],
      recurringItems: [],
    };
  }

  const household = {
    id: context.householdId,
    name: context.householdName ?? "공동 가계부",
  };
  const supabase = await createClient();

  const [accountsResult, categoriesResult, membersResult, recurringResult] =
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
        .from("household_members")
        .select("user_id, member_label")
        .eq("household_id", household.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("recurring_items")
        .select(
          "id, household_id, account_id, category_id, payer_user_id, kind, name, merchant, amount, currency_code, billing_cycle, billing_interval, custom_interval_days, billing_day, day_of_week, next_due_date, starts_on, ends_on, status, auto_create_transaction, reminder_days_before, memo, created_at, updated_at",
        )
        .eq("household_id", household.id)
        .in("kind", ["subscription", "fixed_expense"])
        .order("status", { ascending: true })
        .order("next_due_date", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const userIds = memberRows.map((member) => member.user_id);
  const profilesResult =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [], error: null };
  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const members: PayerMember[] = memberRows.map((member) => ({
    user_id: member.user_id,
    label: memberLabel(member, profiles.get(member.user_id)),
  }));

  return {
    accounts: (accountsResult.data ?? []) as AccountRow[],
    categories: (categoriesResult.data ?? []) as CategoryRow[],
    errorMessage:
      accountsResult.error?.message ??
      categoriesResult.error?.message ??
      membersResult.error?.message ??
      profilesResult.error?.message ??
      recurringResult.error?.message,
    household,
    isConfigured: true,
    isSignedIn: true,
    members,
    recurringItems: (recurringResult.data ?? []) as RecurringItemRow[],
  };
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initialView =
    params.view === "installments" ? "installments" : "recurring";

  const [recurring, installments] = await Promise.all([
    getRecurringPageData(),
    getInstallmentPageData(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="정기지출"
        title="정기지출"
        description="구독·고정비와 할부를 결제일 기준으로 한곳에서 관리해요."
      />

      <RecurringTabs
        initialView={initialView}
        installments={installments}
        recurring={recurring}
      />
    </div>
  );
}
