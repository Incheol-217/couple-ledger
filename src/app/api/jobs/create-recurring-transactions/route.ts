import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createRecurringTransactions } from "@/lib/jobs/create-recurring-transactions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.JOB_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.replace(/^Bearer\s+/i, "").trim();

  const providedSecret = bearerToken || request.headers.get("x-job-secret")?.trim();

  return Boolean(providedSecret && secureCompare(providedSecret, secret));
}

async function readJsonBody(request: NextRequest) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as { today?: unknown };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "작업을 실행할 권한이 없어요." },
      { status: 401 },
    );
  }

  let today: string | undefined;

  try {
    const body = await readJsonBody(request);
    today = typeof body.today === "string" ? body.today : undefined;
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 본문을 JSON 형식으로 보내주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await createRecurringTransactions({ today });

    if (result.created.length > 0 || result.updatedRecurringItems.length > 0) {
      revalidatePath("/dashboard");
      revalidatePath("/recurring");
      revalidatePath("/transactions");
    }

    return NextResponse.json(result, {
      status: result.ok ? 200 : 207,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "반복 거래를 만들지 못했어요.",
      },
      { status: 500 },
    );
  }
}
