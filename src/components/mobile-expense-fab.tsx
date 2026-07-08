"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileExpenseFab({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!isSignedIn || pathname.startsWith("/m/new") || pathname.startsWith("/login")) {
    return null;
  }

  return (
    <div className="print-hidden fixed inset-x-0 bottom-[5.75rem] z-50 flex justify-center px-4 md:hidden supports-[bottom:max(0px)]:bottom-[max(5.75rem,calc(4.75rem+env(safe-area-inset-bottom)))]">
      <Link
        className={cn(
          "inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_18px_36px_rgba(132,230,35,0.36)]",
          "transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2",
        )}
        href="/m/new"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary-foreground/18">
          <Plus className="size-4" aria-hidden="true" />
        </span>
        지출 쓰기
      </Link>
    </div>
  );
}
