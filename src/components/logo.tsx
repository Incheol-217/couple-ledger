import { cn } from "@/lib/utils";

// 함께 쓰는 하트: 하트를 가운데 이음선으로 두 반쪽으로 나눠 '둘이 하나의
// 가계부'를 나타내요. 초록 타일 + 어두운 하트(브랜드 색).
export const LOGO_HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[0.55rem] bg-primary",
        className,
      )}
    >
      <svg className="size-[64%]" viewBox="0 0 24 24">
        <path style={{ fill: "var(--secondary)" }} d={LOGO_HEART_PATH} />
        <rect
          height="18"
          rx="0.65"
          style={{ fill: "var(--primary)" }}
          width="1.3"
          x="11.35"
          y="3"
        />
      </svg>
    </span>
  );
}
