import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  transactionTypeLabels,
  transactionTypes,
  type TransactionType,
} from "@/app/m/new/types";
import { maybeCreateBudgetAlerts } from "@/lib/budgets/alerts";
import { logTransactionToNotion } from "@/lib/notion/transaction-log";
import {
  createNotificationEvent,
  formatWonForNotification,
} from "@/lib/notifications/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewDraftForTransaction } from "@/lib/transactions/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShortcutTransactionPayload = {
  household_id?: unknown;
  user_id?: unknown;
  shortcut_secret?: unknown;
  amount?: unknown;
  type?: unknown;
  category?: unknown;
  account?: unknown;
  transfer_account?: unknown;
  merchant?: unknown;
  memo?: unknown;
  spent_at?: unknown;
  idempotency_key?: unknown;
};

type AccountMatch = {
  id: string;
  name: string;
};

type CategoryMatch = {
  id: string;
};

type ApiError = {
  message: string;
  status: number;
};

function jsonError(error: ApiError) {
  return NextResponse.json(
    {
      ok: false,
      message: error.message,
    },
    { status: error.status },
  );
}

function apiError(message: string, status = 400): ApiError {
  return { message, status };
}

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    "status" in error &&
    typeof (error as ApiError).message === "string" &&
    typeof (error as ApiError).status === "number"
  );
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function readPayload(request: NextRequest) {
  try {
    return (await request.json()) as ShortcutTransactionPayload;
  } catch {
    throw apiError("요청 본문은 JSON으로 보내주세요.");
  }
}

function readText(payload: ShortcutTransactionPayload, key: keyof ShortcutTransactionPayload) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(
  payload: ShortcutTransactionPayload,
  key: keyof ShortcutTransactionPayload,
) {
  const value = readText(payload, key);
  return value.length > 0 ? value : null;
}

function readAmount(payload: ShortcutTransactionPayload) {
  const rawAmount = payload.amount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string"
        ? Number(rawAmount.replaceAll(",", ""))
        : Number.NaN;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError("amount에는 0보다 큰 숫자를 넣어주세요.");
  }

  return amount;
}

function readIdempotencyKey(
  payload: ShortcutTransactionPayload,
  request: NextRequest,
) {
  const value =
    readOptionalText(payload, "idempotency_key") ??
    request.headers.get("x-idempotency-key")?.trim() ??
    null;

  if (value && value.length > 200) {
    throw apiError("idempotency_key는 200자 이하로 보내주세요.");
  }

  return value;
}

function readTransactionType(payload: ShortcutTransactionPayload) {
  const value = readText(payload, "type");

  if (!transactionTypes.includes(value as TransactionType)) {
    throw apiError("type은 expense, income, transfer 중 하나로 보내주세요.");
  }

  return value as TransactionType;
}

function readSpentAt(payload: ShortcutTransactionPayload) {
  const spentAt = readText(payload, "spent_at");

  if (!spentAt) {
    const now = new Date();
    return {
      occurredAt: now.toISOString(),
      transactionDate: now.toISOString().slice(0, 10),
    };
  }

  const parsed = new Date(spentAt);

  if (Number.isNaN(parsed.getTime())) {
    throw apiError("spent_at은 ISO 날짜와 시간으로 보내주세요.");
  }

  const dateOnly = spentAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

  if (!dateOnly) {
    throw apiError("spent_at은 YYYY-MM-DD로 시작해야 해요.");
  }

  return {
    occurredAt: parsed.toISOString(),
    transactionDate: dateOnly,
  };
}

function assertShortcutSecret(payload: ShortcutTransactionPayload, request: NextRequest) {
  const expectedSecret = process.env.SHORTCUTS_WEBHOOK_SECRET;

  if (!expectedSecret) {
    throw apiError("SHORTCUTS_WEBHOOK_SECRET 환경변수를 넣어주세요.", 500);
  }

  const providedSecret =
    readText(payload, "shortcut_secret") ||
    request.headers.get("x-shortcut-secret")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!providedSecret || !secureCompare(providedSecret, expectedSecret)) {
    throw apiError("shortcut_secret을 다시 확인해 주세요.", 401);
  }
}

async function assertHouseholdMember(
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw apiError(error.message, 500);
  }

  if (!data) {
    throw apiError("household_id와 user_id가 맞는 멤버를 찾을 수 없어요.", 403);
  }
}

async function findAccountByName(
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  accountName: string,
  label: string,
) {
  if (!accountName) {
    throw apiError(`${label} 이름을 입력해 주세요.`);
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("name", accountName)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) {
    throw apiError(error.message, 500);
  }

  const accounts = (data ?? []) as AccountMatch[];

  if (accounts.length === 0) {
    throw apiError(`${label} '${accountName}'을 찾을 수 없어요.`);
  }

  if (accounts.length > 1) {
    throw apiError(
      `${label} '${accountName}'이 여러 개예요. 단축어에서 정확한 계좌명을 보내주세요.`,
      409,
    );
  }

  return accounts[0].id;
}

async function findOrCreateCategoryByName({
  categoryName,
  householdId,
  supabase,
  type,
  userId,
}: {
  categoryName: string;
  householdId: string;
  supabase: ReturnType<typeof createAdminClient>;
  type: TransactionType;
  userId: string;
}) {
  if (!categoryName) {
    return null;
  }

  const { data: existing, error: findError } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId)
    .eq("type", type)
    .eq("name", categoryName)
    .maybeSingle();

  if (findError) {
    throw apiError(findError.message, 500);
  }

  if (existing) {
    return (existing as CategoryMatch).id;
  }

  const { data: created, error: createError } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name: categoryName,
      type,
      created_by: userId,
    })
    .select("id")
    .single();

  if (createError?.code === "23505") {
    const { data: retry, error: retryError } = await supabase
      .from("categories")
      .select("id")
      .eq("household_id", householdId)
      .eq("type", type)
      .eq("name", categoryName)
      .maybeSingle();

    if (retryError || !retry) {
      throw apiError(
        retryError?.message ?? "카테고리를 다시 조회하지 못했어요.",
        500,
      );
    }

    return (retry as CategoryMatch).id;
  }

  if (createError) {
    throw apiError(createError.message, 500);
  }

  return (created as CategoryMatch).id;
}

async function findExistingShortcutTransaction(
  supabase: ReturnType<typeof createAdminClient>,
  householdId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_date, amount, type, source")
    .eq("household_id", householdId)
    .eq("source", "shortcut")
    .eq("external_id", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw apiError(error.message, 500);
  }

  return data;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await readPayload(request);
    assertShortcutSecret(payload, request);

    const householdId = readText(payload, "household_id");
    const userId = readText(payload, "user_id");

    if (!householdId) {
      throw apiError("household_id를 보내주세요.");
    }

    if (!userId) {
      throw apiError("user_id를 보내주세요.");
    }

    const type = readTransactionType(payload);
    const amount = readAmount(payload);
    const accountName = readText(payload, "account");
    const transferAccountName = readOptionalText(payload, "transfer_account");
    const categoryName = readText(payload, "category");
    const idempotencyKey = readIdempotencyKey(payload, request);
    const { occurredAt, transactionDate } = readSpentAt(payload);
    const supabase = createAdminClient();

    await assertHouseholdMember(supabase, householdId, userId);

    if (idempotencyKey) {
      const existingTransaction = await findExistingShortcutTransaction(
        supabase,
        householdId,
        idempotencyKey,
      );

      if (existingTransaction) {
        return NextResponse.json({
          duplicate: true,
          message: "이미 저장된 거래예요.",
          ok: true,
          transaction: existingTransaction,
        });
      }
    }

    const accountId = await findAccountByName(
      supabase,
      householdId,
      accountName,
      type === "transfer" ? "출금 계좌" : "계좌",
    );
    const transferAccountId =
      type === "transfer"
        ? await findAccountByName(
            supabase,
            householdId,
            transferAccountName ?? "",
            "입금 계좌",
          )
        : null;

    if (type === "transfer" && transferAccountId === accountId) {
      throw apiError("돈이 나가는 계좌와 들어오는 계좌를 다르게 보내주세요.");
    }

    const categoryId = await findOrCreateCategoryByName({
      categoryName,
      householdId,
      supabase,
      type,
      userId,
    });
    const reviewDraft = reviewDraftForTransaction({
      amount,
      categoryId,
      source: "shortcut",
      type,
    });

    const { data: transaction, error } = await supabase
      .from("transactions")
      .insert({
        household_id: householdId,
        user_id: userId,
        account_id: accountId,
        transfer_account_id: transferAccountId,
        category_id: categoryId,
        type,
        source: "shortcut",
        amount,
        currency_code: "KRW",
        transaction_date: transactionDate,
        occurred_at: occurredAt,
        merchant: readOptionalText(payload, "merchant"),
        memo: readOptionalText(payload, "memo"),
        external_id: idempotencyKey,
        metadata: {
          imported_from: "ios_shortcuts",
        },
        review_reason: reviewDraft.review_reason,
        review_requested_by:
          reviewDraft.review_status === "needs_review" ? userId : null,
        review_status: reviewDraft.review_status,
      })
      .select("id, transaction_date, amount, type, source")
      .single();

    if (error?.code === "23505" && idempotencyKey) {
      const existingTransaction = await findExistingShortcutTransaction(
        supabase,
        householdId,
        idempotencyKey,
      );

      if (existingTransaction) {
        return NextResponse.json({
          duplicate: true,
          message: "이미 저장된 거래예요.",
          ok: true,
          transaction: existingTransaction,
        });
      }
    }

    if (error || !transaction) {
      throw apiError(error.message, 500);
    }

    await createNotificationEvent(supabase, {
      actorUserId: userId,
      body: `${transactionTypeLabels[type]} ${formatWonForNotification(amount)}이 단축어로 기록됐어요.`,
      eventType: "transaction_created",
      householdId,
      metadata: {
        account_id: accountId,
        amount,
        category_id: categoryId,
        review_status: reviewDraft.review_status,
        source: "shortcut",
        transaction_id: transaction.id,
        transfer_account_id: transferAccountId,
        type,
      },
      title: "새 거래가 올라왔어요",
    });

    if (type === "expense") {
      await maybeCreateBudgetAlerts(supabase, {
        householdId,
        accountId,
        categoryId,
        transactionDate,
      });
    }

    if (type === "income" || type === "expense") {
      await logTransactionToNotion(supabase, {
        householdId,
        userId,
        type,
        amount,
        transactionDate,
        accountId,
        categoryId,
        merchant: readOptionalText(payload, "merchant"),
        memo: readOptionalText(payload, "memo"),
        source: "shortcut",
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/m/new");
    revalidatePath("/transactions");
    revalidatePath("/", "layout");

    return NextResponse.json({
      ok: true,
      message: "거래를 저장했어요.",
      transaction,
    });
  } catch (error) {
    return jsonError(
      isApiError(error)
        ? error
        : apiError(
            error instanceof Error
              ? error.message
              : "거래를 저장하지 못했어요.",
            500,
          ),
    );
  }
}
