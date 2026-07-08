import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { AccountsClient } from "./accounts-client";
import type { AccountRow, HouseholdOption } from "./types";

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

type MembershipRow = {
  household_id: string;
  role: "owner" | "member";
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

function normalizeHousehold(row: MembershipRow | null): HouseholdOption | null {
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

async function getAccountsPageData() {
  if (!hasSupabaseEnv()) {
    return {
      accounts: [] as AccountRow[],
      errorMessage: undefined,
      household: null,
      isConfigured: false,
      isAdmin: false,
      isSignedIn: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      accounts: [] as AccountRow[],
      errorMessage: undefined,
      household: null,
      isConfigured: true,
      isAdmin: false,
      isSignedIn: false,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, role, households(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      accounts: [] as AccountRow[],
      errorMessage: membershipError.message,
      household: null,
      isConfigured: true,
      isAdmin: false,
      isSignedIn: true,
    };
  }

  const household = normalizeHousehold(membership as MembershipRow | null);

  if (!household) {
    return {
      accounts: [] as AccountRow[],
      errorMessage: undefined,
      household: null,
      isConfigured: true,
      isAdmin: false,
      isSignedIn: true,
    };
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select(
      "id, household_id, name, type, owner_type, default_withdrawal_account_id, institution_name, masked_identifier, color, icon, opening_balance, opening_balance_as_of, display_order, is_active, created_at, updated_at",
    )
    .eq("household_id", household.id)
    .order("is_active", { ascending: false })
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  return {
    accounts: (accounts ?? []) as AccountRow[],
    errorMessage: accountsError?.message,
    household,
    isAdmin: membership?.role === "owner",
    isConfigured: true,
    isSignedIn: true,
  };
}

export default async function AccountsPage() {
  const data = await getAccountsPageData();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="계좌"
        title="계좌"
        description="계좌와 카드를 등록하고, 잔액과 표시 순서를 정리해요."
      />

      <AccountsClient {...data} />
    </div>
  );
}
