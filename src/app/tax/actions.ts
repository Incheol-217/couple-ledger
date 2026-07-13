"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TaxActionResult = {
  ok: boolean;
  message: string;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readSalary(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    return 0;
  }

  const parsed = Number(value.replaceAll(",", ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("총급여는 0원 이상 숫자로 입력해 주세요.");
  }

  return Math.round(parsed);
}

export async function saveTaxProfilesAction(
  formData: FormData,
): Promise<TaxActionResult> {
  try {
    const householdId = readText(formData, "household_id");

    if (!householdId) {
      throw new Error("공동 가계부를 찾을 수 없어요.");
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("로그인해 주세요.");
    }

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error("이 가계부의 정보만 바꿀 수 있어요.");
    }

    const rows = (["husband", "wife"] as const).map((label) => ({
      household_id: householdId,
      member_label: label,
      annual_salary: readSalary(formData, `salary_${label}`),
      created_by: user.id,
    }));

    const { error } = await supabase
      .from("tax_profiles")
      .upsert(rows, { onConflict: "household_id,member_label" });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/tax");
    return { ok: true, message: "총급여를 저장했어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "총급여를 저장하지 못했어요.",
    };
  }
}
