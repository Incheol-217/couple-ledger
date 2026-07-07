"use server";

import { revalidatePath } from "next/cache";
import { hasSupabaseAuthEnv } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function parseEventIds(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function markNotificationsReadAction(formData: FormData) {
  if (!hasSupabaseAuthEnv()) {
    return;
  }

  const eventIds = [...new Set(parseEventIds(formData.get("event_ids")))].slice(
    0,
    50,
  );

  if (eventIds.length === 0) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase.from("notification_reads").upsert(
    eventIds.map((eventId) => ({
      event_id: eventId,
      user_id: user.id,
    })),
    { onConflict: "event_id,user_id" },
  );

  if (error) {
    console.error("Failed to mark notifications as read:", error.message);
  }

  revalidatePath("/", "layout");
}
