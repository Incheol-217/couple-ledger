import { maybeCreateBudgetAlerts } from "@/lib/budgets/alerts";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPPORTED_BILLING_CYCLES = ["monthly", "yearly", "weekly"] as const;
const MAX_OCCURRENCES_PER_ITEM = 60;
const TIME_ZONE = "Asia/Seoul";

type SupportedBillingCycle = (typeof SUPPORTED_BILLING_CYCLES)[number];

type RecurringItemForJob = {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  payer_user_id: string | null;
  kind: "subscription" | "fixed_expense";
  name: string;
  merchant: string | null;
  amount: number | string;
  currency_code: string | null;
  billing_cycle: SupportedBillingCycle;
  billing_interval: number | null;
  billing_day: number | null;
  next_due_date: string;
  memo: string | null;
};

export type CreatedRecurringTransaction = {
  recurringItemId: string;
  transactionId: string;
  dueDate: string;
};

export type SkippedRecurringTransaction = {
  recurringItemId: string;
  dueDate: string;
  reason: "duplicate" | "safety_limit";
};

export type RecurringTransactionJobError = {
  recurringItemId?: string;
  message: string;
};

export type CreateRecurringTransactionsResult = {
  ok: boolean;
  today: string;
  scanned: number;
  created: CreatedRecurringTransaction[];
  skipped: SkippedRecurringTransaction[];
  updatedRecurringItems: Array<{
    recurringItemId: string;
    previousNextDueDate: string;
    nextDueDate: string;
  }>;
  errors: RecurringTransactionJobError[];
};

type CreateRecurringTransactionsOptions = {
  today?: string;
};

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayInTimeZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number, preferredDay?: number | null) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = preferredDay ?? date.getUTCDate();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + 1, 0),
  ).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}

function nextDueDate(item: RecurringItemForJob, dueDate: string) {
  const interval = item.billing_interval ?? 1;
  const parsedDueDate = parseDateOnly(dueDate);

  if (item.billing_cycle === "weekly") {
    return formatDateOnly(addDays(parsedDueDate, interval * 7));
  }

  if (item.billing_cycle === "yearly") {
    return formatDateOnly(
      addMonths(parsedDueDate, interval * 12, item.billing_day),
    );
  }

  return formatDateOnly(addMonths(parsedDueDate, interval, item.billing_day));
}

function occurredAtForDueDate(dueDate: string) {
  return new Date(`${dueDate}T00:00:00+09:00`).toISOString();
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

async function existingRecurringTransaction(
  supabase: ReturnType<typeof createAdminClient>,
  recurringItemId: string,
  dueDate: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("recurring_item_id", recurringItemId)
    .eq("transaction_date", dueDate)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id as string | undefined;
}

async function createTransactionForDueDate(
  supabase: ReturnType<typeof createAdminClient>,
  item: RecurringItemForJob,
  dueDate: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      household_id: item.household_id,
      account_id: item.account_id,
      category_id: item.category_id,
      recurring_item_id: item.id,
      type: "expense",
      source: "recurring",
      amount: item.amount,
      currency_code: item.currency_code ?? "KRW",
      transaction_date: dueDate,
      occurred_at: occurredAtForDueDate(dueDate),
      merchant: item.merchant,
      memo: item.memo,
      user_id: item.payer_user_id,
      metadata: {
        billing_cycle: item.billing_cycle,
        due_date: dueDate,
        generated_by: "createRecurringTransactions",
        recurring_item_kind: item.kind,
        recurring_item_name: item.name,
      },
    })
    .select("id")
    .single();

  if (isUniqueViolation(error)) {
    return { duplicated: true as const };
  }

  if (error) {
    throw new Error(error.message);
  }

  return { duplicated: false as const, id: data.id as string };
}

export async function createRecurringTransactions(
  options: CreateRecurringTransactionsOptions = {},
): Promise<CreateRecurringTransactionsResult> {
  const today = options.today ?? todayInTimeZone();

  if (!isDateOnly(today)) {
    throw new Error("today는 YYYY-MM-DD 형식으로 보내주세요.");
  }

  const supabase = createAdminClient();
  const result: CreateRecurringTransactionsResult = {
    ok: true,
    today,
    scanned: 0,
    created: [],
    skipped: [],
    updatedRecurringItems: [],
    errors: [],
  };

  const { data, error } = await supabase
    .from("recurring_items")
    .select(
      [
        "id",
        "household_id",
        "account_id",
        "category_id",
        "payer_user_id",
        "kind",
        "name",
        "merchant",
        "amount",
        "currency_code",
        "billing_cycle",
        "billing_interval",
        "billing_day",
        "next_due_date",
        "memo",
      ].join(", "),
    )
    .eq("status", "active")
    .eq("auto_create_transaction", true)
    .in("billing_cycle", SUPPORTED_BILLING_CYCLES)
    .lte("next_due_date", today)
    .order("next_due_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as unknown as RecurringItemForJob[];
  result.scanned = items.length;

  for (const item of items) {
    try {
      let dueDate = item.next_due_date;
      let occurrenceCount = 0;

      while (dueDate <= today) {
        occurrenceCount += 1;

        if (occurrenceCount > MAX_OCCURRENCES_PER_ITEM) {
          result.skipped.push({
            recurringItemId: item.id,
            dueDate,
            reason: "safety_limit",
          });
          break;
        }

        const existingId = await existingRecurringTransaction(
          supabase,
          item.id,
          dueDate,
        );

        if (existingId) {
          result.skipped.push({
            recurringItemId: item.id,
            dueDate,
            reason: "duplicate",
          });
        } else {
          const created = await createTransactionForDueDate(
            supabase,
            item,
            dueDate,
          );

          if (created.duplicated) {
            result.skipped.push({
              recurringItemId: item.id,
              dueDate,
              reason: "duplicate",
            });
          } else {
            result.created.push({
              recurringItemId: item.id,
              transactionId: created.id,
              dueDate,
            });

            await maybeCreateBudgetAlerts(supabase, {
              householdId: item.household_id,
              accountId: item.account_id,
              categoryId: item.category_id,
              transactionDate: dueDate,
            });
          }
        }

        dueDate = nextDueDate(item, dueDate);
      }

      if (dueDate !== item.next_due_date) {
        const { data: updatedItem, error: updateError } = await supabase
          .from("recurring_items")
          .update({ next_due_date: dueDate })
          .eq("id", item.id)
          .eq("next_due_date", item.next_due_date)
          .eq("status", "active")
          .eq("auto_create_transaction", true)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw new Error(updateError.message);
        }

        if (!updatedItem) {
          throw new Error(
            "반복 결제가 실행 중에 바뀌어서 다음 결제일은 그대로 두었어요.",
          );
        }

        result.updatedRecurringItems.push({
          recurringItemId: item.id,
          previousNextDueDate: item.next_due_date,
          nextDueDate: dueDate,
        });
      }
    } catch (errorForItem) {
      result.errors.push({
        recurringItemId: item.id,
        message:
          errorForItem instanceof Error
            ? errorForItem.message
            : "반복 거래를 만들지 못했어요.",
      });
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}
