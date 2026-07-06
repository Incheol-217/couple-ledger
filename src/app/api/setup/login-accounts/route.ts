import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type SetupAccount = {
  displayName: string;
  email: string;
  memberLabel: "husband" | "wife" | null;
  password: string;
  role: "owner" | "member";
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function secureCompare(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

async function readSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-setup-secret")?.trim();

  if (bearerToken || headerSecret) {
    return bearerToken || headerSecret || "";
  }

  const payload = (await request.json().catch(() => null)) as {
    setup_secret?: unknown;
  } | null;

  return typeof payload?.setup_secret === "string"
    ? payload.setup_secret.trim()
    : "";
}

function setupAccounts(): SetupAccount[] {
  return [
    {
      displayName: process.env.HUSBAND_NAME?.trim() || "남편",
      email: readEnv("HUSBAND_EMAIL"),
      memberLabel: "husband",
      password: readEnv("HUSBAND_PASSWORD"),
      role: "member",
    },
    {
      displayName: process.env.WIFE_NAME?.trim() || "아내",
      email: readEnv("WIFE_EMAIL"),
      memberLabel: "wife",
      password: readEnv("WIFE_PASSWORD"),
      role: "member",
    },
    {
      displayName: process.env.ADMIN_NAME?.trim() || "관리자",
      email: readEnv("ADMIN_EMAIL"),
      memberLabel: null,
      password: readEnv("ADMIN_PASSWORD"),
      role: "owner",
    },
  ];
}

async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message);
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    );

    if (user) {
      return user;
    }

    if (data.users.length < 1000) {
      return null;
    }

    page += 1;
  }

  return null;
}

async function ensureUser(account: SetupAccount) {
  const admin = createAdminClient();
  const existingUser = await findUserByEmail(account.email);

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    password: account.password,
    user_metadata: {
      display_name: account.displayName,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `${account.email} 계정을 만들 수 없습니다.`);
  }

  return data.user;
}

async function ensureHousehold(adminUser: User) {
  const admin = createAdminClient();
  const householdName = process.env.HOUSEHOLD_NAME?.trim() || "우리집 공동 가계부";
  const { data: existingHousehold, error: findError } = await admin
    .from("households")
    .select("id, name")
    .eq("name", householdName)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (existingHousehold) {
    return existingHousehold as { id: string; name: string };
  }

  const { data, error } = await admin
    .from("households")
    .insert({
      created_by: adminUser.id,
      name: householdName,
    })
    .select("id, name")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "household를 만들 수 없습니다.");
  }

  return data as { id: string; name: string };
}

async function ensureProfile(user: User, displayName: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").upsert({
    display_name: displayName,
    id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureMember(householdId: string, user: User, account: SetupAccount) {
  const admin = createAdminClient();
  const { error } = await admin.from("household_members").upsert(
    {
      household_id: householdId,
      member_label: account.memberLabel,
      role: account.role,
      user_id: user.id,
    },
    {
      onConflict: "household_id,user_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = readEnv("SETUP_SECRET");
    const providedSecret = await readSecret(request);

    if (!providedSecret || !secureCompare(providedSecret, expectedSecret)) {
      return NextResponse.json(
        {
          ok: false,
          message: "SETUP_SECRET이 맞지 않습니다.",
        },
        { status: 401 },
      );
    }

    const accounts = setupAccounts();
    const emails = accounts.map((account) => account.email.toLowerCase());

    if (new Set(emails).size !== emails.length) {
      throw new Error("남편, 아내, 관리자 이메일은 서로 달라야 합니다.");
    }

    const adminAccount = accounts.find((account) => account.role === "owner");

    if (!adminAccount) {
      throw new Error("관리자 계정 설정이 필요합니다.");
    }

    const createdUsers = new Map<string, User>();

    for (const account of accounts) {
      const user = await ensureUser(account);
      await ensureProfile(user, account.displayName);
      createdUsers.set(account.email, user);
    }

    const adminUser = createdUsers.get(adminAccount.email);

    if (!adminUser) {
      throw new Error("관리자 계정을 찾을 수 없습니다.");
    }

    const household = await ensureHousehold(adminUser);

    for (const account of accounts) {
      const user = createdUsers.get(account.email);

      if (user) {
        await ensureMember(household.id, user, account);
      }
    }

    return NextResponse.json({
      ok: true,
      household,
      users: accounts.map((account) => {
        const user = createdUsers.get(account.email);

        return {
          display_name: account.displayName,
          email: account.email,
          member_label: account.memberLabel,
          role: account.role,
          user_id: user?.id,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "로그인 계정 생성에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
