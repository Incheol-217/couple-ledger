"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, Inbox, ReceiptText, Settings } from "lucide-react";
import { markNotificationsReadAction } from "@/components/notifications/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationFeedItem } from "@/lib/notifications/feed";

function formatRelativeTime(value: string) {
  const createdAt = new Date(value).getTime();

  if (Number.isNaN(createdAt)) {
    return "";
  }

  const diffMs = Date.now() - createdAt;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "방금";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}분 전`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}시간 전`;
  }

  if (diffMs < day * 7) {
    return `${Math.floor(diffMs / day)}일 전`;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function EventIcon({ eventType }: { eventType: string }) {
  const Icon = eventType.startsWith("transaction") ? ReceiptText : Settings;

  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-secondary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationFeedItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unreadItems = useMemo(
    () => items.filter((item) => item.unread).map((item) => item.id),
    [items],
  );
  const unreadLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-label={`알림 ${unreadCount}개`}
        className="relative bg-card"
        onClick={() => setOpen((nextOpen) => !nextOpen)}
        size="icon"
        type="button"
        variant="outline"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#e94f8f] px-1.5 text-[10px] font-bold leading-5 text-white shadow-sm">
            {unreadLabel}
          </span>
        ) : null}
      </Button>

      {open ? (
        <section className="absolute right-0 top-12 z-50 w-[min(calc(100vw-2rem),24rem)] rounded-[1.75rem] border bg-card p-3 shadow-[0_24px_60px_rgba(18,18,18,0.18)]">
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <div>
              <p className="text-sm font-semibold">알림</p>
              <p className="text-xs text-muted-foreground">
                함께 볼 일을 모아뒀어요
              </p>
            </div>
            {unreadItems.length > 0 ? (
              <form action={markNotificationsReadAction}>
                <input
                  name="event_ids"
                  type="hidden"
                  value={JSON.stringify(unreadItems)}
                />
                <Button size="sm" type="submit" variant="ghost">
                  <CheckCheck className="size-4" aria-hidden="true" />
                  모두 읽기
                </Button>
              </form>
            ) : null}
          </div>

          <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="grid place-items-center gap-2 rounded-[1.5rem] border border-dashed bg-muted/35 px-4 py-10 text-center">
                <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold">알림을 기다리고 있어요</p>
                <p className="text-xs text-muted-foreground">
                  거래 기록이나 설정 변경이 생기면 여기서 보여요.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <article
                  className={cn(
                    "flex gap-3 rounded-[1.25rem] border p-3 transition",
                    item.unread
                      ? "border-primary/45 bg-primary/10"
                      : "border-border bg-background/70",
                  )}
                  key={item.id}
                >
                  <EventIcon eventType={item.eventType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      {item.unread ? (
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-[#e94f8f]" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-foreground/80">
                      {item.body}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.actorName} · {formatRelativeTime(item.createdAt)}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
