"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  Calculator,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  PiggyBank,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  primary: boolean;
};

// primary 항목은 모바일 하단바에 고정으로 노출되고, 나머지는 "더보기" 시트에 모여요.
const navItems: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, primary: true },
  { href: "/transactions", label: "내역", icon: ReceiptText, primary: true },
  { href: "/accounts", label: "계좌", icon: WalletCards, primary: true },
  { href: "/budgets", label: "예산", icon: PiggyBank, primary: true },
  { href: "/invest", label: "자산·부채", icon: TrendingUp, primary: false },
  { href: "/goals", label: "저축", icon: Target, primary: false },
  { href: "/recurring", label: "정기지출", icon: CalendarClock, primary: false },
  { href: "/reports", label: "보고서", icon: FileText, primary: false },
  { href: "/tax", label: "연말정산", icon: Calculator, primary: false },
  { href: "/settings", label: "설정", icon: Settings, primary: false },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({
  canAccessSettings = false,
  compact = false,
}: {
  canAccessSettings?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleItems = navItems.filter(
    (item) => item.href !== "/settings" || canAccessSettings,
  );

  // 데스크톱 헤더: 모든 탭을 한 줄로 노출하되, 라벨이 세로로 꺾이지 않게
  // 중간 폭에서는 아이콘만 보여주고 넓은 화면에서 라벨을 함께 보여줘요.
  if (!compact) {
    return (
      <nav className="flex items-center gap-1 rounded-full border border-secondary/15 bg-secondary p-1 shadow-[0_12px_28px_rgba(18,18,18,0.16)]">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                active
                  ? "bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]"
                  : "text-secondary-foreground/72 hover:bg-secondary-foreground/10 hover:text-secondary-foreground",
              )}
              href={item.href}
              key={item.href}
              title={item.label}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="hidden xl:inline">{item.label}</span>
              <span className="sr-only xl:hidden">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // 모바일 하단바: 주요 4개 + "더보기".
  const primaryItems = visibleItems.filter((item) => item.primary);
  const overflowItems = visibleItems.filter((item) => !item.primary);
  const overflowActive = overflowItems.some((item) =>
    isActive(pathname, item.href),
  );

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 text-[11px] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
      active
        ? "bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]"
        : "text-secondary-foreground/72 hover:bg-secondary-foreground/10 hover:text-secondary-foreground",
    );

  return (
    <>
      {moreOpen ? (
        <>
          <button
            aria-label="더보기 닫기"
            className="pointer-events-auto fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[1px]"
            onClick={() => setMoreOpen(false)}
            type="button"
          />
          <div className="pointer-events-auto fixed inset-x-4 bottom-24 z-50 rounded-2xl border bg-card p-4 shadow-[0_18px_50px_rgba(18,18,18,0.28)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">더보기</p>
              <button
                aria-label="닫기"
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                onClick={() => setMoreOpen(false)}
                type="button"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium transition",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "bg-background hover:bg-muted",
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      <nav className="pointer-events-auto mx-auto flex h-16 max-w-[calc(100%-2rem)] items-center justify-stretch gap-1 rounded-full border border-secondary/20 bg-secondary p-2 shadow-[0_18px_40px_rgba(18,18,18,0.24)]">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              className={tabClass(active)}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}

        <button
          aria-expanded={moreOpen}
          aria-label="더보기"
          className={tabClass(overflowActive || moreOpen)}
          onClick={() => setMoreOpen((open) => !open)}
          type="button"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
          <span className="max-w-full truncate">더보기</span>
        </button>
      </nav>
    </>
  );
}
