import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import type { CategoryRow } from "@/app/m/new/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();

  if (!context.isConfigured) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="설정"
          title="설정"
          description="가계부에 필요한 기본값을 정해요."
        />
        <Card>
          <CardHeader>
            <CardTitle>Supabase 설정을 확인해 주세요</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            환경변수를 넣으면 로그인과 관리자 설정을 쓸 수 있어요.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!context.isSignedIn) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="설정"
          title="설정"
          description="가계부에 필요한 기본값을 정해요."
        />
        <Card>
          <CardHeader>
            <CardTitle>로그인해 주세요</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>관리자 계정으로 로그인하면 설정을 볼 수 있어요.</p>
            <div>
              <Button asChild>
                <Link href="/login?next=/settings">로그인</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!context.isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="설정"
          title="설정"
          description="가계부에 필요한 기본값을 정해요."
        />
        <Card>
          <CardHeader>
            <CardTitle>관리자 계정으로 볼 수 있어요</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>
              설정은 관리자 계정에서 바꿔요. 남편과 아내 계정은 거래를 쓰고 볼 수 있어요.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">대시보드로 이동</Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline">
                  관리자 계정으로 로그인
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const householdId = context.householdId ?? null;
  let categories: CategoryRow[] = [];

  if (householdId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("categories")
      .select("id, household_id, name, type, icon, color, display_order, is_active")
      .eq("household_id", householdId)
      .in("type", ["expense", "income"])
      .order("type", { ascending: true })
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    categories = (data ?? []) as CategoryRow[];
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="설정"
        title="설정"
        description="가계부에 필요한 기본값을 정해요."
      />

      <SettingsClient categories={categories} householdId={householdId} />
    </div>
  );
}
