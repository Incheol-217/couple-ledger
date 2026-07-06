import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const settings = [
  "부부 멤버",
  "카테고리",
  "계좌 기본값",
  "iOS Shortcuts webhook",
  "AI 조언 설정",
];

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="설정"
        description="공동 가계부의 기본값을 관리합니다."
      />

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {settings.map((item) => (
          <div
            className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0"
            key={item}
          >
            <span className="font-medium">{item}</span>
            <Button type="button" variant="outline">
              열기
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
