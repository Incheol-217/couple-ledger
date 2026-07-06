import Link from "next/link";
import { LogOut, Plus, UserRound } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUserContext } from "@/lib/auth/session";

function displayRole(context: Awaited<ReturnType<typeof getCurrentUserContext>>) {
  if (context.isAdmin) {
    return "관리자";
  }

  if (context.memberLabel === "husband") {
    return "남편";
  }

  if (context.memberLabel === "wife") {
    return "아내";
  }

  return "멤버";
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

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
            <AppNav canAccessSettings={context.isAdmin} />
          </div>
          <div className="flex items-center gap-2">
            {context.isSignedIn ? (
              <>
                <div className="hidden min-w-0 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm lg:flex">
                  <UserRound className="size-4 text-primary" aria-hidden="true" />
                  <span className="max-w-32 truncate">
                    {context.displayName ?? context.email ?? "로그인 사용자"}
                  </span>
                  <Badge variant={context.isAdmin ? "default" : "secondary"}>
                    {displayRole(context)}
                  </Badge>
                </div>
                <Button asChild className="hidden md:inline-flex">
                  <Link href="/m/new">
                    <Plus className="size-4" aria-hidden="true" />
                    지출 입력
                  </Link>
                </Button>
                <form action={signOutAction}>
                  <Button
                    className="hidden md:inline-flex"
                    size="icon"
                    type="submit"
                    variant="outline"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    <span className="sr-only">로그아웃</span>
                  </Button>
                </form>
              </>
            ) : (
              <Button asChild className="hidden md:inline-flex">
                <Link href="/login">로그인</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="pb-20 md:pb-0">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden">
        <AppNav canAccessSettings={context.isAdmin} compact />
      </div>
    </div>
  );
}
