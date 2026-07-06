import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const columns = ["날짜", "계좌", "카테고리", "금액", "입력"];

export default function TransactionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Transactions"
        title="거래 내역"
        description="수동 입력, 단축어, recurring 거래를 한곳에서 확인합니다."
        action={<Button type="button">거래 추가</Button>}
      />

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="grid grid-cols-5 border-b bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        <div className="flex min-h-64 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
          아직 거래가 없습니다.
        </div>
      </section>
    </div>
  );
}
