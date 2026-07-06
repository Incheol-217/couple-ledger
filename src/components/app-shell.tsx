import Link from "next/link";
import { Plus } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-2 font-semibold" href="/">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
              B
            </span>
            <span>공동 가계부</span>
          </Link>
          <div className="hidden md:block">
            <AppNav />
          </div>
          <Button asChild className="hidden md:inline-flex">
            <Link href="/m/new">
              <Plus className="size-4" aria-hidden="true" />
              지출 입력
            </Link>
          </Button>
        </div>
      </header>

      <main className="pb-20 md:pb-0">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden">
        <AppNav compact />
      </div>
    </div>
  );
}
