import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { RecurringClient } from "./recurring-client";
import type {
  PayerMember,
  RecurringHousehold,
  RecurringItemRow,
  RecurringPageData,
} from "./types";
import type { AccountRow } from "@/app/accounts/types";
import type { CategoryRow } from "@/app/m/new/types";

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

type MemberRow = {
  user_id: string;
  member_label: "shared" | "husband" | "wife" | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function normalizeHousehold(row: MembershipRow | null): RecurringHousehold | null {
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
  if (!hasSupabaseEnv()) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      accounts: [],
      categories: [],
      errorMessage: membershipError.message,
      household: null,
      isConfigured: true,
      isSignedIn: true,
      members: [],
      recurringItems: [],
    };
  }

  const household = normalizeHousehold(membership as MembershipRow | null);

  if (!household) {
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

  const [accountsResult, categoriesResult, membersResult, recurringResult] =
    await Promise.all([
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
          "id, household_id, account_id, category_id, payer_user_id, kind, name, merchant, amount, currency_code, billing_cycle, billing_interval, custom_interval_days, billing_day, day_of_week, next_due_date, status, auto_create_transaction, reminder_days_before, memo, created_at, updated_at",
        )
        .eq("household_id", household.id)
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

export default async function RecurringPage() {
  const data = await getRecurringPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Recurring"
        title="구독비와 고정비"
        description="반복 결제의 다음 결제일, 결제 계좌, 자동 거래 생성 여부를 관리합니다."
      />

      <RecurringClient {...data} />
    </div>
  );
}
