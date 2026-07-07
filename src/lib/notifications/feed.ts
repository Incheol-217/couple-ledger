import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthEnv } from "@/lib/auth/session";

export type NotificationFeedItem = {
  actorName: string;
  body: string;
  createdAt: string;
  eventType: string;
  id: string;
  title: string;
  unread: boolean;
};

export type NotificationFeed = {
  items: NotificationFeedItem[];
  unreadCount: number;
};

type MembershipRow = {
  household_id: string;
  member_label: "husband" | "wife" | null;
  role: "owner" | "member";
};

type NotificationEventRow = {
  actor_user_id: string | null;
  body: string;
  created_at: string;
  event_type: string;
  id: string;
  title: string;
};

type NotificationReadRow = {
  event_id: string;
};

type ProfileRow = {
  display_name: string | null;
  id: string;
};

function fallbackMemberName(row: MembershipRow | undefined) {
  if (!row) {
    return "상대방";
  }

  if (row.role === "owner") {
    return "관리자";
  }

  if (row.member_label === "husband") {
    return "남편";
  }

  if (row.member_label === "wife") {
    return "아내";
  }

  return "멤버";
}

export async function getNotificationFeed(): Promise<NotificationFeed> {
  if (!hasSupabaseAuthEnv()) {
    return { items: [], unreadCount: 0 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { items: [], unreadCount: 0 };
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, member_label, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const currentMembership = membership as MembershipRow | null;

  if (!currentMembership?.household_id) {
    return { items: [], unreadCount: 0 };
  }

  const { data: eventData, error: eventError } = await supabase
    .from("notification_events")
    .select("id, event_type, title, body, actor_user_id, created_at")
    .eq("household_id", currentMembership.household_id)
    .neq("actor_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventError || !eventData?.length) {
    return { items: [], unreadCount: 0 };
  }

  const events = eventData as NotificationEventRow[];
  const eventIds = events.map((event) => event.id);
  const actorIds = [
    ...new Set(
      events
        .map((event) => event.actor_user_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];

  const [readResult, profileResult, memberResult] = await Promise.all([
    supabase
      .from("notification_reads")
      .select("event_id")
      .eq("user_id", user.id)
      .in("event_id", eventIds),
    actorIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", actorIds)
      : Promise.resolve({ data: [] }),
    actorIds.length > 0
      ? supabase
          .from("household_members")
          .select("user_id, household_id, member_label, role")
          .eq("household_id", currentMembership.household_id)
          .in("user_id", actorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const readIds = new Set(
    ((readResult.data ?? []) as NotificationReadRow[]).map((row) => row.event_id),
  );
  const profileById = new Map(
    ((profileResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile.display_name,
    ]),
  );
  const memberById = new Map(
    ((memberResult.data ?? []) as (MembershipRow & { user_id: string })[]).map(
      (member) => [member.user_id, member],
    ),
  );

  const items = events.map((event) => {
    const actorName =
      (event.actor_user_id ? profileById.get(event.actor_user_id) : null) ??
      (event.actor_user_id
        ? fallbackMemberName(memberById.get(event.actor_user_id))
        : "시스템");
    const unread = !readIds.has(event.id);

    return {
      actorName,
      body: event.body,
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      title: event.title,
      unread,
    };
  });

  return {
    items,
    unreadCount: items.filter((item) => item.unread).length,
  };
}
