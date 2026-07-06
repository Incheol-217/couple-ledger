import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentUserContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

function getAccountHints() {
  return [
    {
      email: process.env.HUSBAND_EMAIL,
      label: process.env.HUSBAND_NAME ?? "남편",
      role: "husband" as const,
    },
    {
      email: process.env.WIFE_EMAIL,
      label: process.env.WIFE_NAME ?? "아내",
      role: "wife" as const,
    },
    {
      email: process.env.ADMIN_EMAIL,
      label: process.env.ADMIN_NAME ?? "관리자",
      role: "admin" as const,
    },
  ].filter((account): account is { email: string; label: string; role: "husband" | "wife" | "admin" } =>
    Boolean(account.email),
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const context = await getCurrentUserContext();
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (context.isSignedIn) {
    redirect(nextPath);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Login"
        title="로그인"
        description="남편, 아내, 관리자 계정으로 공동 가계부에 들어갑니다."
      />

      <LoginForm accountHints={getAccountHints()} nextPath={nextPath} />
    </div>
  );
}
