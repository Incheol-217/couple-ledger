"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  LayoutDashboard,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/transactions", label: "내역", icon: ReceiptText },
  { href: "/accounts", label: "계좌", icon: WalletCards },
  { href: "/recurring", label: "고정비", icon: CalendarClock },
  { href: "/settings", label: "설정", icon: Settings },
];

export function AppNav({
  canAccessSettings = false,
  compact = false,
}: {
  canAccessSettings?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter(
    (item) => item.href !== "/settings" || canAccessSettings,
  );

  return (
    <nav
      className={cn(
        "flex items-center",
        compact
          ? "h-16 justify-around px-2"
          : "gap-1 rounded-md border bg-card p-1 shadow-sm",
      )}
    >
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition",
              compact
                ? "h-12 min-w-14 flex-col px-2 text-xs"
                : "h-9 px-3",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
