import type { SupabaseClient } from "@supabase/supabase-js";

// 수입/지출이 저장될 때 Notion "수입, 지출 기록" 데이터베이스에도 한 줄을
// 남겨요. Notion 기록은 부가 기능이라 실패해도 거래 저장을 막지 않아요.
//
// 필요 환경변수:
// - NOTION_API_KEY: Notion 내부 integration 시크릿 (DB에 연결돼 있어야 함)
// - NOTION_TRANSACTIONS_DB_ID: 기록할 데이터베이스 ID

const NOTION_VERSION = "2022-06-28";

export type NotionTransactionInput = {
  householdId: string;
  userId: string | null;
  type: "income" | "expense";
  amount: number;
  transactionDate: string;
  accountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  memo: string | null;
  source: string;
};

const typeLabels: Record<NotionTransactionInput["type"], string> = {
  income: "수입",
  expense: "지출",
};

const sourceLabels: Record<string, string> = {
  manual: "앱",
  ocr: "영수증",
  shortcut: "단축어",
  recurring: "반복거래",
};

function hasNotionEnv() {
  return Boolean(
    process.env.NOTION_API_KEY && process.env.NOTION_TRANSACTIONS_DB_ID,
  );
}

function richText(value: string | null) {
  return {
    rich_text: value ? [{ text: { content: value.slice(0, 500) } }] : [],
  };
}

async function lookupName(
  supabase: SupabaseClient,
  table: "accounts" | "categories",
  id: string | null,
) {
  if (!id) {
    return null;
  }

  const { data } = await supabase
    .from(table)
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return (data?.name as string | undefined) ?? null;
}

async function lookupRecorderLabel(
  supabase: SupabaseClient,
  householdId: string,
  userId: string | null,
) {
  if (!userId) {
    return null;
  }

  const { data } = await supabase
    .from("household_members")
    .select("member_label, role")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  if (data.member_label === "husband") {
    return "남편";
  }

  if (data.member_label === "wife") {
    return "아내";
  }

  return data.role === "owner" ? "관리자" : null;
}

export async function logTransactionToNotion(
  supabase: SupabaseClient,
  input: NotionTransactionInput,
) {
  try {
    if (!hasNotionEnv()) {
      return;
    }

    const [accountName, categoryName, recorderLabel] = await Promise.all([
      lookupName(supabase, "accounts", input.accountId),
      lookupName(supabase, "categories", input.categoryId),
      lookupRecorderLabel(supabase, input.householdId, input.userId),
    ]);

    // "내역"(제목)에는 사용처만 넣어요. 사용처가 없으면 카테고리·유형으로 대체.
    const title = (
      input.merchant ?? categoryName ?? typeLabels[input.type]
    ).slice(0, 200);

    const properties: Record<string, unknown> = {
      "내역": { title: [{ text: { content: title } }] },
      "날짜": { date: { start: input.transactionDate } },
      "유형": { select: { name: typeLabels[input.type] } },
      "금액": { number: Math.round(input.amount) },
      "사용처": richText(input.merchant),
      "메모": richText(input.memo),
      "입력 경로": {
        select: { name: sourceLabels[input.source] ?? "앱" },
      },
    };

    if (categoryName) {
      properties["카테고리"] = { select: { name: categoryName.slice(0, 100) } };
    }

    if (accountName) {
      properties["계좌"] = { select: { name: accountName.slice(0, 100) } };
    }

    if (recorderLabel) {
      properties["기록자"] = { select: { name: recorderLabel } };
    }

    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_TRANSACTIONS_DB_ID },
        properties,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `Failed to log transaction to Notion (${response.status}):`,
        body.slice(0, 300),
      );
    }
  } catch (error) {
    console.error(
      "Failed to log transaction to Notion:",
      error instanceof Error ? error.message : error,
    );
  }
}
