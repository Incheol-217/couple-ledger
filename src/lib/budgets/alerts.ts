import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationEvent } from "@/lib/notifications/events";

// 지출이 저장된 뒤 관련 예산이 80% 또는 100%를 넘었으면 household 알림을
// 만들어요. actor 없이(시스템 이벤트) 저장해서 지출한 본인도 알림을 받아요.

type BudgetForAlert = {
  id: string;
  account_id: string | null;
  category_id: string | null;
  period: "monthly" | "yearly" | "custom";
  period_start: string;
  period_end: string | null;
  amount: number | string;
};

export type BudgetAlertInput = {
  householdId: string;
  accountId: string | null;
  categoryId: string | null;
  transactionDate: string;
};

const THRESHOLDS = [100, 80] as const;

function toNumber(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// 거래 날짜를 기준으로 예산의 현재 적용 구간을 계산해요.
function windowFor(budget: BudgetForAlert, transactionDate: string) {
  const [year, month] = transactionDate.split("-").map(Number);
  let start: string;
  let end: string;

  if (budget.period === "yearly") {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
  } else if (budget.period === "custom") {
    start = budget.period_start;
    end = budget.period_end ?? transactionDate;
  } else {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    start = `${year}-${pad(month)}-01`;
    end = `${year}-${pad(month)}-${pad(lastDay)}`;
  }

  if (budget.period_start > start) {
    start = budget.period_start;
  }

  if (budget.period_end && budget.period_end < end) {
    end = budget.period_end;
  }

  return { end, start };
}

function budgetMatchesTransaction(
  budget: BudgetForAlert,
  input: BudgetAlertInput,
) {
  if (budget.category_id) {
    return budget.category_id === input.categoryId;
  }

  if (budget.account_id) {
    return budget.account_id === input.accountId;
  }

  return true; // 전체 지출 예산
}

async function spentInWindow(
  supabase: SupabaseClient,
  budget: BudgetForAlert,
  input: BudgetAlertInput,
  window: { start: string; end: string },
) {
  let query = supabase
    .from("transactions")
    .select("amount")
    .eq("household_id", input.householdId)
    .eq("type", "expense")
    .gte("transaction_date", window.start)
    .lte("transaction_date", window.end);

  if (budget.category_id) {
    query = query.eq("category_id", budget.category_id);
  } else if (budget.account_id) {
    query = query.eq("account_id", budget.account_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as { amount: number | string }[]).reduce(
    (sum, row) => sum + toNumber(row.amount),
    0,
  );
}

async function alertAlreadySent(
  supabase: SupabaseClient,
  householdId: string,
  budgetId: string,
  threshold: number,
  windowStart: string,
) {
  const { data } = await supabase
    .from("notification_events")
    .select("id")
    .eq("household_id", householdId)
    .eq("event_type", "budget_alert")
    .contains("metadata", {
      budget_id: budgetId,
      threshold,
      window_start: windowStart,
    })
    .limit(1);

  return Boolean(data?.length);
}

async function budgetScopeName(
  supabase: SupabaseClient,
  budget: BudgetForAlert,
) {
  if (budget.category_id) {
    const { data } = await supabase
      .from("categories")
      .select("name")
      .eq("id", budget.category_id)
      .maybeSingle();
    return data?.name ? `'${data.name}'` : "카테고리";
  }

  if (budget.account_id) {
    const { data } = await supabase
      .from("accounts")
      .select("name")
      .eq("id", budget.account_id)
      .maybeSingle();
    return data?.name ? `'${data.name}' 계좌` : "계좌";
  }

  return "전체 지출";
}

export async function maybeCreateBudgetAlerts(
  supabase: SupabaseClient,
  input: BudgetAlertInput,
) {
  try {
    const { data, error } = await supabase
      .from("budgets")
      .select("id, account_id, category_id, period, period_start, period_end, amount")
      .eq("household_id", input.householdId)
      .eq("is_active", true)
      .lte("period_start", input.transactionDate);

    if (error || !data?.length) {
      return;
    }

    const budgets = (data as BudgetForAlert[]).filter((budget) =>
      budgetMatchesTransaction(budget, input),
    );

    for (const budget of budgets) {
      const amount = toNumber(budget.amount);

      if (amount <= 0) {
        continue;
      }

      const window = windowFor(budget, input.transactionDate);

      if (
        input.transactionDate < window.start ||
        input.transactionDate > window.end
      ) {
        continue;
      }

      const spent = await spentInWindow(supabase, budget, input, window);
      const percent = (spent / amount) * 100;
      const threshold = THRESHOLDS.find((value) => percent >= value);

      if (!threshold) {
        continue;
      }

      if (
        await alertAlreadySent(
          supabase,
          input.householdId,
          budget.id,
          threshold,
          window.start,
        )
      ) {
        continue;
      }

      const scopeName = await budgetScopeName(supabase, budget);
      const spentLabel = `${Math.round(spent).toLocaleString("ko-KR")}원`;
      const amountLabel = `${Math.round(amount).toLocaleString("ko-KR")}원`;

      await createNotificationEvent(supabase, {
        actorUserId: null,
        body:
          threshold >= 100
            ? `${scopeName} 예산 ${amountLabel}을 다 썼어요. 지금까지 ${spentLabel}을 썼어요.`
            : `${scopeName} 예산 ${amountLabel}의 ${Math.round(percent)}%를 썼어요.`,
        eventType: "budget_alert",
        householdId: input.householdId,
        metadata: {
          budget_id: budget.id,
          threshold,
          window_start: window.start,
          spent: Math.round(spent),
          amount: Math.round(amount),
        },
        title:
          threshold >= 100 ? "예산을 다 썼어요" : "예산이 얼마 안 남았어요",
      });
    }
  } catch (error) {
    // 알림은 부가 기능이라 거래 저장 자체를 막지 않아요.
    console.error(
      "Failed to create budget alert:",
      error instanceof Error ? error.message : error,
    );
  }
}
