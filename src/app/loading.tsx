// 페이지 데이터를 불러오는 동안 즉시 보여줄 공용 스켈레톤이에요.
// 서버 조회가 끝나기 전에도 화면이 반응해 앱이 빠르게 느껴져요.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-24 animate-pulse rounded-xl border bg-card"
            key={index}
          />
        ))}
      </div>

      <div className="h-20 animate-pulse rounded-xl border bg-card" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl border bg-card" />
        <div className="h-56 animate-pulse rounded-xl border bg-card" />
      </div>
    </div>
  );
}
