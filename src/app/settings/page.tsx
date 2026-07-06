import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
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
