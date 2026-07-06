"use client";

import { useActionState, useState } from "react";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { signInAction, type LoginActionState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type LoginAccountHint = {
  email: string;
  label: string;
  role: "husband" | "wife" | "admin";
};

const initialState: LoginActionState = {
  message: "",
  ok: false,
};

const roleLabels: Record<LoginAccountHint["role"], string> = {
  admin: "관리자",
  husband: "남편",
  wife: "아내",
};

export function LoginForm({
  accountHints,
  nextPath,
}: {
  accountHints: LoginAccountHint[];
  nextPath: string;
}) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialState,
  );
  const [email, setEmail] = useState(accountHints[0]?.email ?? "");

  return (
    <div className="grid gap-5">
      {accountHints.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {accountHints.map((account) => (
            <button
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/50",
                email === account.email && "border-primary bg-primary/5",
              )}
              key={account.email}
              onClick={() => setEmail(account.email)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <UserRound className="size-4 text-primary" aria-hidden="true" />
                <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                  {roleLabels[account.role]}
                </Badge>
              </div>
              <p className="mt-3 font-medium">{account.label}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {account.email}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      <form action={formAction} className="rounded-lg border bg-card p-5 shadow-sm">
        <input name="next" type="hidden" value={nextPath} />
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              autoComplete="current-password"
              id="password"
              name="password"
              placeholder="비밀번호"
              type="password"
            />
          </div>

          {state.message ? (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                state.ok
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-destructive/20 bg-destructive/10 text-destructive",
              )}
            >
              {state.message}
            </div>
          ) : null}

          <Button className="h-11" disabled={isPending} type="submit">
            <LogIn className="size-4" aria-hidden="true" />
            {isPending ? "로그인 중" : "로그인"}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <LockKeyhole className="size-4" aria-hidden="true" />
          계정 생성이 먼저 필요합니다
        </div>
        세 계정은 Vercel 환경변수와 초기 설정 API로 생성합니다. 한 번 생성한
        뒤에는 각자 이메일과 비밀번호로 로그인하면 됩니다.
      </div>
    </div>
  );
}
