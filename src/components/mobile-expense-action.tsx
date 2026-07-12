"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Camera, Keyboard, Loader2, Plus } from "lucide-react";
import {
  receiptDraftStorageKey,
  type ReceiptParseResponse,
} from "@/lib/receipt-drafts";
import { cn } from "@/lib/utils";

export function MobileExpenseAction({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isParsingReceipt, setIsParsingReceipt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isSignedIn || pathname.startsWith("/m/new") || pathname.startsWith("/login")) {
    return null;
  }

  function openReceiptCamera() {
    setErrorMessage(null);
    setIsOpen(false);
    cameraInputRef.current?.click();
  }

  async function handleReceiptImage(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setIsParsingReceipt(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/receipt", {
        body: formData,
        method: "POST",
      });
      const data = (await response.json()) as ReceiptParseResponse;

      if (!response.ok || !data.ok || !data.receipt) {
        throw new Error(data.message ?? "영수증을 읽지 못했어요.");
      }

      window.sessionStorage.setItem(
        receiptDraftStorageKey,
        JSON.stringify(data.receipt),
      );
      router.push("/m/new?mode=receipt");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "영수증을 읽지 못했어요.",
      );
      setIsOpen(true);
    } finally {
      setIsParsingReceipt(false);
      input.value = "";
    }
  }

  return (
    <div className="relative md:hidden">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm",
          "transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2",
        )}
        disabled={isParsingReceipt}
        onClick={() => {
          setIsOpen((current) => !current);
          setErrorMessage(null);
        }}
        type="button"
      >
        {isParsingReceipt ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        쓰기
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 top-12 z-50 w-56 rounded-lg border bg-card p-2 text-card-foreground shadow-[0_18px_36px_rgba(18,18,18,0.18)]"
          role="menu"
        >
          <Link
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium hover:bg-muted"
            href="/m/new"
            onClick={() => setIsOpen(false)}
            role="menuitem"
          >
            <span className="grid size-8 place-items-center rounded-md bg-secondary text-primary">
              <Keyboard className="size-4" aria-hidden="true" />
            </span>
            <span>
              직접 쓰기
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                입력 화면으로 가요
              </span>
            </span>
          </Link>
          <button
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium hover:bg-muted"
            onClick={openReceiptCamera}
            role="menuitem"
            type="button"
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Camera className="size-4" aria-hidden="true" />
            </span>
            <span>
              영수증 찍기
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                카메라가 열려요
              </span>
            </span>
          </button>
          {errorMessage ? (
            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-xs leading-5 text-destructive">
                {errorMessage}
              </p>
              <Link
                className="mt-2 inline-flex h-8 items-center rounded-md bg-card px-3 text-xs font-semibold text-foreground shadow-sm"
                href="/m/new"
                onClick={() => setIsOpen(false)}
              >
                직접 쓰기
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={isParsingReceipt}
        onChange={handleReceiptImage}
        ref={cameraInputRef}
        type="file"
      />
    </div>
  );
}
