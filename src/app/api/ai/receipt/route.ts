import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

type MembershipRow = {
  household_id: string;
};

type ReceiptAccountRow = {
  id: string;
  name: string;
  type: string;
  owner_type: string;
};

type ReceiptCategoryRow = {
  id: string;
  name: string;
  type: "expense" | "income" | "transfer";
};

type ParsedReceipt = {
  amount: number | null;
  merchant: string | null;
  memo: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  category_name: string | null;
  account_name: string | null;
  confidence: number | null;
  warnings: string[];
};

type OpenAIResponsesResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      output_text?: string;
    }>;
  }>;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

class ReceiptError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function normalizeName(value: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("ko-KR").replaceAll(/\s+/g, "");
}

function matchByName<T extends { name: string }>(items: T[], name: string | null) {
  const normalized = normalizeName(name);

  if (!normalized) {
    return null;
  }

  return (
    items.find((item) => normalizeName(item.name) === normalized) ??
    items.find((item) => {
      const itemName = normalizeName(item.name);
      return normalized.includes(itemName) || itemName.includes(normalized);
    }) ??
    null
  );
}

function cleanText(value: unknown, maxLength = 120) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanDate(value: unknown) {
  const text = cleanText(value, 10);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanTime(value: unknown) {
  const text = cleanText(value, 5);
  return text && /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function cleanAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

function cleanConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, confidence));
}

function normalizeParsedReceipt(value: Partial<ParsedReceipt>): ParsedReceipt {
  return {
    account_name: cleanText(value.account_name),
    amount: cleanAmount(value.amount),
    category_name: cleanText(value.category_name),
    confidence: cleanConfidence(value.confidence),
    memo: cleanText(value.memo, 80),
    merchant: cleanText(value.merchant, 80),
    transaction_date: cleanDate(value.transaction_date),
    transaction_time: cleanTime(value.transaction_time),
    warnings: Array.isArray(value.warnings)
      ? value.warnings
          .filter((warning): warning is string => typeof warning === "string")
          .map((warning) => warning.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
  };
}

function extractOutputText(data: OpenAIResponsesResponse) {
  if (data.output_text) {
    return data.output_text;
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? content.output_text ?? "")
      .join("") ?? ""
  );
}

function friendlyOpenAIError(
  data: OpenAIResponsesResponse,
  responseStatus: number,
) {
  const rawMessage = [
    data.error?.code,
    data.error?.type,
    data.error?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");

  if (
    rawMessage.includes("quota") ||
    rawMessage.includes("billing") ||
    rawMessage.includes("insufficient_quota")
  ) {
    return "OpenAI 사용 한도가 부족해 영수증을 읽지 못했어요. OpenAI 결제와 사용량을 확인한 뒤 다시 시도해 주세요.";
  }

  if (responseStatus === 401 || rawMessage.includes("api key")) {
    return "OpenAI API key를 확인해 주세요. Vercel 환경변수 OPENAI_API_KEY가 올바른지 봐주세요.";
  }

  if (responseStatus === 429) {
    return "요청이 잠시 많아 영수증을 읽지 못했어요. 잠시 후 다시 시도해 주세요.";
  }

  return "영수증을 읽지 못했어요. 직접 쓰기로 기록해 주세요.";
}

function receiptPrompt(
  categories: ReceiptCategoryRow[],
  accounts: ReceiptAccountRow[],
) {
  return [
    "사진 속 영수증을 읽고 가계부 입력값을 JSON으로만 반환해 주세요.",
    "총 결제금액만 amount에 넣고, 할인 전 금액이나 적립 금액은 사용하지 않습니다.",
    "카테고리는 아래 카테고리 이름 중 가장 알맞은 하나를 고릅니다. 확실하지 않으면 null로 둡니다.",
    "계좌나 카드는 아래 계좌 이름 중 명확히 보일 때만 고릅니다. 확실하지 않으면 null로 둡니다.",
    "카드번호, 승인번호, 사업자번호, 주소, 전화번호, 품목 전체 목록 같은 민감하거나 불필요한 정보는 추출하지 않습니다.",
    "memo에는 필요한 경우 짧은 참고만 넣고, 원문 OCR 전체를 넣지 않습니다.",
    `카테고리 목록: ${categories.map((category) => category.name).join(", ") || "없음"}`,
    `계좌 목록: ${accounts.map((account) => account.name).join(", ") || "없음"}`,
  ].join("\n");
}

async function getReceiptContext() {
  if (!hasSupabaseEnv()) {
    throw new ReceiptError("Supabase 환경변수를 넣어주세요.", 500);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ReceiptError("로그인 후 영수증을 읽을 수 있어요.", 401);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new ReceiptError(membershipError.message, 500);
  }

  if (!membership) {
    throw new ReceiptError("공동 가계부를 먼저 연결해 주세요.", 403);
  }

  const householdId = (membership as MembershipRow).household_id;
  const [accountsResult, categoriesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, owner_type")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, type")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .eq("type", "expense")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (accountsResult.error) {
    throw new ReceiptError(accountsResult.error.message, 500);
  }

  if (categoriesResult.error) {
    throw new ReceiptError(categoriesResult.error.message, 500);
  }

  return {
    accounts: (accountsResult.data ?? []) as ReceiptAccountRow[],
    categories: (categoriesResult.data ?? []) as ReceiptCategoryRow[],
  };
}

async function parseReceiptImage(
  image: File,
  categories: ReceiptCategoryRow[],
  accounts: ReceiptAccountRow[],
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new ReceiptError("OPENAI_API_KEY 환경변수를 넣어주세요.", 500);
  }

  if (!image.type.startsWith("image/")) {
    throw new ReceiptError("영수증 사진 파일을 올려주세요.");
  }

  const imageBytes = await image.arrayBuffer();

  if (imageBytes.byteLength > MAX_RECEIPT_IMAGE_BYTES) {
    throw new ReceiptError("사진 용량은 5MB 이하로 올려주세요.");
  }

  const dataUrl = `data:${image.type};base64,${Buffer.from(imageBytes).toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text: receiptPrompt(categories, accounts),
              type: "input_text",
            },
          ],
          role: "system",
        },
        {
          content: [
            {
              image_url: dataUrl,
              type: "input_image",
            },
            {
              text: "이 영수증에서 가계부에 필요한 값만 추출해 주세요.",
              type: "input_text",
            },
          ],
          role: "user",
        },
      ],
      max_output_tokens: 600,
      model: OPENAI_MODEL,
      text: {
        format: {
          name: "receipt_transaction_draft",
          schema: {
            additionalProperties: false,
            properties: {
              account_name: {
                type: ["string", "null"],
              },
              amount: {
                type: ["number", "null"],
              },
              category_name: {
                type: ["string", "null"],
              },
              confidence: {
                type: ["number", "null"],
              },
              memo: {
                type: ["string", "null"],
              },
              merchant: {
                type: ["string", "null"],
              },
              transaction_date: {
                type: ["string", "null"],
              },
              transaction_time: {
                type: ["string", "null"],
              },
              warnings: {
                items: {
                  type: "string",
                },
                maxItems: 3,
                type: "array",
              },
            },
            required: [
              "amount",
              "merchant",
              "memo",
              "transaction_date",
              "transaction_time",
              "category_name",
              "account_name",
              "confidence",
              "warnings",
            ],
            type: "object",
          },
          strict: true,
          type: "json_schema",
        },
      },
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = (await response.json()) as OpenAIResponsesResponse;

  if (!response.ok) {
    throw new ReceiptError(
      friendlyOpenAIError(data, response.status),
      response.status,
    );
  }

  return normalizeParsedReceipt(JSON.parse(extractOutputText(data)));
}

export async function POST(request: Request) {
  try {
    const { accounts, categories } = await getReceiptContext();
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      throw new ReceiptError("영수증 사진을 선택해 주세요.");
    }

    const receipt = await parseReceiptImage(image, categories, accounts);
    const matchedCategory = matchByName(categories, receipt.category_name);
    const matchedAccount = matchByName(accounts, receipt.account_name);

    return NextResponse.json({
      ok: true,
      receipt: {
        ...receipt,
        account_id: matchedAccount?.id ?? null,
        account_name: matchedAccount?.name ?? receipt.account_name,
        category_id: matchedCategory?.id ?? null,
        category_name: matchedCategory?.name ?? receipt.category_name,
      },
    });
  } catch (error) {
    const status = error instanceof ReceiptError ? error.status : 500;

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "영수증을 읽지 못했어요.",
      },
      { status },
    );
  }
}
