"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthEnv } from "@/lib/auth/session";

export type LoginActionState = {
  message: string;
  ok: boolean;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeNextPath(nextPath: string) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

export async function signInAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (!hasSupabaseAuthEnv()) {
    return {
      ok: false,
      message: "Supabase 환경변수를 넣어주세요.",
    };
  }

  const email = readText(formData, "email");
  const password = readText(formData, "password");
  const nextPath = safeNextPath(readText(formData, "next"));

  if (!email || !password) {
    return {
      ok: false,
      message: "이메일과 비밀번호를 입력해 주세요.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: "이메일이나 비밀번호를 다시 확인해 주세요.",
    };
  }

  redirect(nextPath);
}

export async function signOutAction() {
  if (hasSupabaseAuthEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
