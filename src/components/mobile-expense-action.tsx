"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileExpenseAction({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!isSignedIn || pathname.startsWith("/m/new") || pathname.startsWith("/login")) {
    return null;
  }

  return (
    <Link
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm md:hidden",
        "transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2",
      )}
      href="/m/new"
    >
      <Plus className="size-4" aria-hidden="true" />
      쓰기
    </Link>
  );
}
