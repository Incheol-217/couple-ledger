import { createClient } from "@/lib/supabase/server";

export type CurrentUserContext = {
  displayName: string | null;
  email: string | null;
  householdId: string | null;
  householdName: string | null;
  isAdmin: boolean;
  isConfigured: boolean;
  isSignedIn: boolean;
  memberLabel: "husband" | "wife" | null;
  role: "owner" | "member" | null;
  userId: string | null;
};

type MembershipRow = {
  household_id: string;
  member_label: "husband" | "wife" | null;
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

type ProfileRow = {
  display_name: string | null;
};

export function hasSupabaseAuthEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function normalizeHousehold(row: MembershipRow | null) {
  const household = Array.isArray(row?.households)
    ? row.households[0]
    : row?.households;

  return {
    householdId: household?.id ?? row?.household_id ?? null,
    householdName: household?.name ?? null,
  };
}

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  if (!hasSupabaseAuthEnv()) {
    return {
      displayName: null,
      email: null,
      householdId: null,
      householdName: null,
      isAdmin: false,
      isConfigured: false,
      isSignedIn: false,
      memberLabel: null,
      role: null,
      userId: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      displayName: null,
      email: null,
      householdId: null,
      householdName: null,
      isAdmin: false,
      isConfigured: true,
      isSignedIn: false,
      memberLabel: null,
      role: null,
      userId: null,
    };
  }

  const [membershipResult, profileResult] = await Promise.all([
    supabase
      .from("household_members")
      .select("household_id, role, member_label, households(id, name)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const membership = membershipResult.data as MembershipRow | null;
  const profile = profileResult.data as ProfileRow | null;
  const { householdId, householdName } = normalizeHousehold(membership);
  const metadataName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null;

  return {
    displayName: profile?.display_name ?? metadataName,
    email: user.email ?? null,
    householdId,
    householdName,
    isAdmin: membership?.role === "owner",
    isConfigured: true,
    isSignedIn: true,
    memberLabel: membership?.member_label ?? null,
    role: membership?.role ?? null,
    userId: user.id,
  };
}
