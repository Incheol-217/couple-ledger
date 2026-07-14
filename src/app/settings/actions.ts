"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CategoryActionResult = {
  ok: boolean;
  message: string;
};

const CATEGORY_TYPES = ["expense", "income"] as const;
type ManageableCategoryType = (typeof CATEGORY_TYPES)[number];

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readType(formData: FormData): ManageableCategoryType {
  const value = readText(formData, "type") || "expense";

  if (!CATEGORY_TYPES.includes(value as ManageableCategoryType)) {
    throw new Error("카테고리 종류를 다시 골라주세요.");
  }

  return value as ManageableCategoryType;
}

async function createSupabaseForAction() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase 환경변수를 확인해 주세요.");
  }

  return createClient();
}

// 카테고리는 관리자(owner) 계정만 바꿀 수 있어요.
async function assertCurrentAdminMember(householdId: string) {
  if (!householdId) {
    throw new Error("공동 가계부를 찾을 수 없어요.");
  }

  const supabase = await createSupabaseForAction();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("로그인해 주세요.");
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("id, role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (error || !data) {
    throw new Error("관리자 계정으로 카테고리를 바꿀 수 있어요.");
  }

  return { supabase, user };
}

function isUniqueViolation(message: string | undefined) {
  return Boolean(
    message &&
      (message.includes("categories_unique_name_per_type") ||
        message.includes("duplicate key")),
  );
}

export async function createCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const { supabase } = await assertCurrentAdminMember(householdId);
    const name = readText(formData, "name");
    const type = readType(formData);

    if (!name) {
      throw new Error("카테고리 이름을 입력해 주세요.");
    }

    // 새 카테고리는 목록 맨 뒤로 보내요.
    const { data: lastOrder } = await supabase
      .from("categories")
      .select("display_order")
      .eq("household_id", householdId)
      .eq("type", type)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("categories").insert({
      household_id: householdId,
      name,
      type,
      display_order: (lastOrder?.display_order ?? 0) + 1,
    });

    if (error) {
      if (isUniqueViolation(error.message)) {
        throw new Error("같은 종류에 같은 이름의 카테고리가 이미 있어요.");
      }
      throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/m/new");
    revalidatePath("/", "layout");
    return { ok: true, message: `'${name}' 카테고리를 추가했어요.` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "카테고리를 추가하지 못했어요.",
    };
  }
}

export async function renameCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const categoryId = readText(formData, "category_id");
    const name = readText(formData, "name");
    const { supabase } = await assertCurrentAdminMember(householdId);

    if (!categoryId) {
      throw new Error("고칠 카테고리를 찾을 수 없어요.");
    }

    if (!name) {
      throw new Error("카테고리 이름을 입력해 주세요.");
    }

    const { data, error } = await supabase
      .from("categories")
      .update({ name })
      .eq("household_id", householdId)
      .eq("id", categoryId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error.message)) {
        throw new Error("같은 종류에 같은 이름의 카테고리가 이미 있어요.");
      }
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("고칠 카테고리를 찾을 수 없어요.");
    }

    revalidatePath("/settings");
    revalidatePath("/m/new");
    revalidatePath("/", "layout");
    return { ok: true, message: "카테고리 이름을 바꿨어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "이름을 바꾸지 못했어요.",
    };
  }
}

export async function toggleCategoryActiveAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const categoryId = readText(formData, "category_id");
    const isActive = readText(formData, "is_active") === "true";
    const { supabase } = await assertCurrentAdminMember(householdId);

    if (!categoryId) {
      throw new Error("바꿀 카테고리를 찾을 수 없어요.");
    }

    const { data, error } = await supabase
      .from("categories")
      .update({ is_active: isActive })
      .eq("household_id", householdId)
      .eq("id", categoryId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("바꿀 카테고리를 찾을 수 없어요.");
    }

    revalidatePath("/settings");
    revalidatePath("/m/new");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: isActive ? "카테고리를 다시 켰어요." : "카테고리를 숨겼어요.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "카테고리를 바꾸지 못했어요.",
    };
  }
}

export async function deleteCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  try {
    const householdId = readText(formData, "household_id");
    const categoryId = readText(formData, "category_id");
    const { supabase } = await assertCurrentAdminMember(householdId);

    if (!categoryId) {
      throw new Error("지울 카테고리를 찾을 수 없어요.");
    }

    // 카테고리를 지워도 이미 쓴 거래는 남아요(거래의 카테고리만 비워져요).
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("household_id", householdId)
      .eq("id", categoryId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/settings");
    revalidatePath("/m/new");
    revalidatePath("/", "layout");
    return { ok: true, message: "카테고리를 지웠어요." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "카테고리를 지우지 못했어요.",
    };
  }
}
