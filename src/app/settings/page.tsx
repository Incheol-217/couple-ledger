import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();

  if (!context.isConfigured) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Settings"
          title="설정"
          description="공동 가계부의 기본값을 관리합니다."
        />
        <Card>
          <CardHeader>
            <CardTitle>Supabase 설정 필요</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            환경변수를 먼저 설정하면 로그인과 관리자 권한을 사용할 수 있습니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!context.isSignedIn) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Settings"
          title="설정"
          description="공동 가계부의 기본값을 관리합니다."
        />
        <Card>
          <CardHeader>
            <CardTitle>로그인이 필요합니다</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>설정값은 관리자 계정으로 로그인한 뒤 볼 수 있습니다.</p>
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
          eyebrow="Settings"
          title="설정"
          description="공동 가계부의 기본값을 관리합니다."
        />
        <Card>
          <CardHeader>
            <CardTitle>관리자만 접근할 수 있습니다</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>
              남편/아내 계정은 거래 입력과 조회에 집중하고, 설정값은 관리자
              계정에서 관리합니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">대시보드로 이동</Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline">
                  로그아웃 후 관리자 로그인
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="설정"
        description="공동 가계부의 기본값을 관리합니다."
      />

      <SettingsClient />
    </div>
  );
}
