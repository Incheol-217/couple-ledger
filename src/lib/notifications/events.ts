export type NotificationEventType =
  | "transaction_created"
  | "transaction_reviewed"
  | "account_created"
  | "account_updated"
  | "account_deactivated"
  | "account_reordered"
  | "recurring_created"
  | "recurring_updated"
  | "recurring_status_changed";

type NotificationInsertClient = {
  from: (table: string) => {
    insert: (
      values: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export function formatWonForNotification(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export async function createNotificationEvent(
  supabase: NotificationInsertClient,
  payload: {
    actorUserId: string | null;
    body: string;
    eventType: NotificationEventType;
    householdId: string;
    metadata?: Record<string, unknown>;
    title: string;
  },
) {
  const { error } = await supabase.from("notification_events").insert({
    household_id: payload.householdId,
    actor_user_id: payload.actorUserId,
    event_type: payload.eventType,
    title: payload.title,
    body: payload.body,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    console.error("Failed to create notification event:", error.message);
  }
}
