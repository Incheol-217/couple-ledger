import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const summary = [
  { label: "이번 달 지출", value: "0원", tone: "text-primary" },
  { label: "오늘 입력", value: "0건", tone: "text-chart-2" },
  { label: "예정 고정비", value: "0건", tone: "text-chart-3" },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            공동 가계부 v1
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              오늘의 흐름부터 같이 봅니다
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              빠르게 기록하고, 계좌별 지출과 고정비를 한 화면에서 확인하는
              부부용 가계부입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/m/new">
                <Plus className="size-4" aria-hidden="true" />
                지출 입력
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                대시보드
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {summary.map((item) => (
            <div
              className="rounded-lg border bg-card p-4 shadow-sm"
              key={item.label}
            >
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link
          className="rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary/40"
          href="/transactions"
        >
          <p className="font-medium">거래 내역</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            수동 입력, 단축어, recurring 거래가 모이는 곳
          </p>
        </Link>
        <Link
          className="rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary/40"
          href="/accounts"
        >
          <p className="font-medium">계좌</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            생활비 통장, 카드, 현금을 구분하는 기준
          </p>
        </Link>
        <Link
          className="rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary/40"
          href="/recurring"
        >
          <p className="font-medium">구독비와 고정비</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            매달 반복되는 지출을 따로 보는 화면
          </p>
        </Link>
      </section>
    </div>
  );
}
