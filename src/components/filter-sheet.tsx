"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterSheet({
  children,
  description,
  summary,
  title = "필터 설정",
}: {
  children: React.ReactNode;
  description?: string;
  summary: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label="필터 설정 열기"
        className="size-10 shrink-0"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="secondary"
      >
        <Filter className="size-4" aria-hidden="true" />
      </Button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-secondary/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <button
            aria-label="필터 설정 닫기"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            type="button"
          />
          <section
            className={cn(
              "relative w-full rounded-t-lg border bg-card shadow-[0_-20px_60px_rgba(18,18,18,0.24)]",
              "sm:max-w-xl sm:rounded-lg sm:shadow-[0_24px_80px_rgba(18,18,18,0.22)]",
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{summary}</p>
                <h2 className="mt-1 text-lg font-semibold">{title}</h2>
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              <Button
                aria-label="필터 설정 닫기"
                onClick={() => setOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </header>
            <div className="max-h-[min(72svh,640px)] overflow-y-auto p-5">
              {children}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
