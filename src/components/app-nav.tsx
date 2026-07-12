"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings,
  Target,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/transactions", label: "내역", icon: ReceiptText },
  { href: "/reports", label: "보고서", icon: FileText },
  { href: "/budgets", label: "예산", icon: PiggyBank },
  { href: "/goals", label: "저축", icon: Target },
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
          ? "pointer-events-auto mx-auto h-16 max-w-[calc(100%-2rem)] justify-stretch gap-1 rounded-full border border-secondary/20 bg-secondary p-2 shadow-[0_18px_40px_rgba(18,18,18,0.24)]"
          : "gap-1 rounded-full border border-secondary/15 bg-secondary p-1 shadow-[0_12px_28px_rgba(18,18,18,0.16)]",
      )}
    >
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
              compact
                ? "h-12 min-w-0 flex-1 flex-col gap-1 rounded-full px-1 text-[11px] leading-none"
                : "h-9 px-3",
              active
                ? "bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]"
                : "text-secondary-foreground/72 hover:bg-secondary-foreground/10 hover:text-secondary-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className={compact ? "max-w-full truncate" : undefined}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
