import type { TransactionType } from "@/app/m/new/types";

export type TransactionReviewDraft = {
  review_reason: string | null;
  review_status: "none" | "needs_review";
};

const REVIEW_AMOUNT_THRESHOLD = 100_000;

export function reviewDraftForTransaction({
  amount,
  categoryId,
  source,
  type,
}: {
  amount: number;
  categoryId: string | null;
  source: string;
  type: TransactionType;
}): TransactionReviewDraft {
  if (type !== "expense") {
    return {
      review_reason: null,
      review_status: "none",
    };
  }

  if (!categoryId) {
    return {
      review_reason: "카테고리를 함께 확인해요.",
      review_status: "needs_review",
    };
  }

  if (source === "ocr") {
    return {
      review_reason: "영수증에서 채운 내용이에요.",
      review_status: "needs_review",
    };
  }

  if (amount >= REVIEW_AMOUNT_THRESHOLD) {
    return {
      review_reason: "큰 금액이라 함께 확인해요.",
      review_status: "needs_review",
    };
  }

  return {
    review_reason: null,
    review_status: "none",
  };
}
