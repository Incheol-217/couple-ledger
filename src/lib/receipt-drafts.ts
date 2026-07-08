export const receiptDraftStorageKey = "couple-ledger:receipt-draft";

export type ReceiptDraft = {
  account_id: string | null;
  account_name: string | null;
  amount: number | null;
  category_id: string | null;
  category_name: string | null;
  confidence: number | null;
  memo: string | null;
  merchant: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  warnings: string[];
};

export type ReceiptParseResponse = {
  ok: boolean;
  message?: string;
  receipt?: ReceiptDraft;
};
