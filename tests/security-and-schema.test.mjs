import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function readMigrations() {
  const migrationsDir = join(rootDir, "supabase", "migrations");

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .join("\n\n");
}

function selectFieldsAfterFrom(source, tableName) {
  const fromIndex = source.indexOf(`.from("${tableName}")`);
  assert.notEqual(fromIndex, -1, `${tableName} query should exist`);

  const afterFrom = source.slice(fromIndex);
  const selectMatch = afterFrom.match(/\.select\(\s*(["'`])([\s\S]*?)\1\s*\)/);
  assert.ok(selectMatch, `${tableName} query should have a select`);

  return selectMatch[2];
}

describe("Supabase schema and RLS", () => {
  const migrations = readMigrations();
  const householdTables = [
    "households",
    "household_members",
    "accounts",
    "categories",
    "transactions",
    "budgets",
    "recurring_items",
    "ai_advice_logs",
    "import_jobs",
    "notification_events",
    "notification_reads",
  ];

  it("enables and forces RLS on household-owned tables", () => {
    for (const table of householdTables) {
      assert.match(
        migrations,
        new RegExp(`alter table public\\.${table} enable row level security;`),
      );
      assert.match(
        migrations,
        new RegExp(`alter table public\\.${table} force row level security;`),
      );
    }
  });

  it("keeps household references and transaction user references in one household", () => {
    assert.match(
      migrations,
      /perform public\.assert_account_belongs_to_household\(\s*new\.account_id,\s*new\.household_id,\s*'transactions\.account_id'\s*\);/,
    );
    assert.match(
      migrations,
      /perform public\.assert_category_belongs_to_household\(\s*new\.category_id,\s*new\.household_id,\s*'transactions\.category_id'\s*\);/,
    );
    assert.match(
      migrations,
      /perform public\.assert_recurring_item_belongs_to_household\(\s*new\.recurring_item_id,\s*new\.household_id,\s*'transactions\.recurring_item_id'\s*\);/,
    );
    assert.match(
      migrations,
      /perform public\.assert_user_belongs_to_household\(\s*new\.user_id,\s*new\.household_id,\s*'transactions\.user_id'\s*\);/,
    );
  });

  it("prevents duplicate recurring transactions for the same due date", () => {
    assert.match(
      migrations,
      /create unique index if not exists transactions_recurring_unique_due_idx\s+on public\.transactions\(recurring_item_id, transaction_date\)\s+where recurring_item_id is not null;/,
    );
  });

  it("stores account opening balances outside income transactions", () => {
    assert.match(migrations, /opening_balance numeric\(14, 2\) not null default 0/);
    assert.match(
      migrations,
      /opening_balance_as_of date not null default current_date/,
    );
    assert.match(migrations, /accounts_opening_balance_non_negative/);
  });

  it("keeps notification events household-scoped and read markers user-scoped", () => {
    assert.match(migrations, /create table public\.notification_events/);
    assert.match(migrations, /create table public\.notification_reads/);
    assert.match(migrations, /public\.is_household_member\(household_id\)/);
    assert.match(migrations, /actor_user_id = auth\.uid\(\)/);
    assert.match(migrations, /user_id = auth\.uid\(\)/);
    assert.match(migrations, /public\.is_household_member\(event\.household_id\)/);
  });
});

describe("AI spending advice privacy", () => {
  const aiRoute = read("src/app/api/ai/spending-advice/route.ts");

  it("sends only summarized transaction fields to the model", () => {
    const transactionFields = selectFieldsAfterFrom(aiRoute, "transactions");
    assert.doesNotMatch(
      transactionFields,
      /merchant|memo|external_id|metadata|occurred_at/i,
    );
  });

  it("does not select account or recurring item sensitive fields for AI input", () => {
    const accountFields = selectFieldsAfterFrom(aiRoute, "accounts");
    const recurringFields = selectFieldsAfterFrom(aiRoute, "recurring_items");

    assert.doesNotMatch(
      accountFields,
      /masked_identifier|institution_name|default_withdrawal_account_id/i,
    );
    assert.doesNotMatch(
      recurringFields,
      /merchant|memo|payer_user_id|created_by/i,
    );
  });

  it("keeps advice out of investment, loan, tax, and legal guidance", () => {
    assert.match(aiRoute, /투자, 대출, 세금, 법률 조언은 하지 않습니다/);
  });
});

describe("iOS Shortcuts webhook security", () => {
  const shortcutRoute = read("src/app/api/shortcuts/transactions/route.ts");

  it("requires a shared secret and compares it safely", () => {
    assert.match(shortcutRoute, /SHORTCUTS_WEBHOOK_SECRET/);
    assert.match(shortcutRoute, /timingSafeEqual/);
    assert.match(shortcutRoute, /secureCompare\(providedSecret, expectedSecret\)/);
  });

  it("validates household membership before inserting a transaction", () => {
    assert.match(shortcutRoute, /\.from\("household_members"\)/);
    assert.match(shortcutRoute, /\.eq\("household_id", householdId\)/);
    assert.match(shortcutRoute, /\.eq\("user_id", userId\)/);
  });

  it("looks up accounts and categories inside the requested household", () => {
    assert.match(shortcutRoute, /\.from\("accounts"\)/);
    assert.match(shortcutRoute, /\.eq\("household_id", householdId\)/);
    assert.match(shortcutRoute, /\.eq\("name", accountName\)/);
    assert.match(shortcutRoute, /\.eq\("is_active", true\)/);
    assert.match(shortcutRoute, /\.from\("categories"\)/);
    assert.match(shortcutRoute, /household_id: householdId/);
  });

  it("stores shortcut-origin transactions explicitly", () => {
    assert.match(shortcutRoute, /source:\s*"shortcut"/);
  });
});

describe("Login and role access", () => {
  const setupRoute = read("src/app/api/setup/login-accounts/route.ts");
  const quickAction = read("src/app/m/new/actions.ts");
  const settingsPage = read("src/app/settings/page.tsx");
  const appNav = read("src/components/app-nav.tsx");
  const homePage = read("src/app/page.tsx");
  const loginForm = read("src/app/login/login-form.tsx");
  const accountActions = read("src/app/accounts/actions.ts");
  const accountsClient = read("src/app/accounts/accounts-client.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const notificationBell = read(
    "src/components/notifications/notification-bell.tsx",
  );
  const notificationFeed = read("src/lib/notifications/feed.ts");
  const notificationEvents = read("src/lib/notifications/events.ts");
  const recurringActions = read("src/app/recurring/actions.ts");
  const shortcutRoute = read("src/app/api/shortcuts/transactions/route.ts");

  it("protects initial account setup with a setup secret", () => {
    assert.match(setupRoute, /SETUP_SECRET/);
    assert.match(setupRoute, /timingSafeEqual/);
    assert.match(setupRoute, /auth\.admin\.createUser/);
    assert.match(setupRoute, /auth\.admin\.updateUserById/);
  });

  it("creates husband, wife, and admin household members", () => {
    assert.match(setupRoute, /memberLabel:\s*"husband"/);
    assert.match(setupRoute, /memberLabel:\s*"wife"/);
    assert.match(setupRoute, /role:\s*"owner"/);
    assert.match(setupRoute, /role:\s*"member"/);
  });

  it("stores manual transactions under the signed-in user", () => {
    assert.match(quickAction, /user_id:\s*user\.id/);
    assert.match(quickAction, /source:\s*"manual"/);
  });

  it("keeps settings behind admin access", () => {
    assert.match(settingsPage, /context\.isAdmin/);
    assert.match(settingsPage, /관리자만 접근할 수 있습니다/);
    assert.match(appNav, /canAccessSettings/);
  });

  it("keeps account changes behind admin access", () => {
    assert.match(accountActions, /assertCurrentAdminMember/);
    assert.match(accountActions, /\.eq\("role", "owner"\)/);
    assert.match(accountActions, /관리자 계정만 계좌를 변경할 수 있습니다/);
    assert.match(accountActions, /opening_balance/);
    assert.match(accountsClient, /관리자 계정만 계좌를 추가할 수 있습니다/);
    assert.match(accountsClient, /등록 잔액/);
    assert.match(accountsClient, /조회 전용/);
  });

  it("sends first visits to login and signed-in visits to dashboard", () => {
    assert.match(homePage, /redirect\("\/login"\)/);
    assert.match(homePage, /redirect\("\/dashboard"\)/);
  });

  it("supports auto login without storing the password in app storage", () => {
    assert.match(loginForm, /자동 로그인/);
    assert.match(loginForm, /couple-ledger:auto-login/);
    assert.match(loginForm, /couple-ledger:remembered-email/);
    assert.match(loginForm, /localStorage\.setItem\(rememberedEmailKey, email\)/);
    assert.match(loginForm, /autoComplete="current-password"/);
    assert.doesNotMatch(loginForm, /localStorage\.setItem\([^)]*password/i);
  });

  it("shows household activity notifications without echoing the actor's own events", () => {
    assert.match(appShell, /<NotificationBell/);
    assert.match(appShell, /getNotificationFeed/);
    assert.match(notificationBell, /unreadCount/);
    assert.match(notificationBell, /markNotificationsReadAction/);
    assert.match(notificationFeed, /\.neq\("actor_user_id", user\.id\)/);
  });

  it("records notifications for partner transactions and admin setting changes", () => {
    assert.match(notificationEvents, /transaction_created/);
    assert.match(quickAction, /createNotificationEvent/);
    assert.match(quickAction, /eventType:\s*"transaction_created"/);
    assert.match(shortcutRoute, /eventType:\s*"transaction_created"/);
    assert.match(accountActions, /eventType:\s*"account_created"/);
    assert.match(accountActions, /eventType:\s*"account_updated"/);
    assert.match(accountActions, /eventType:\s*"account_deactivated"/);
    assert.match(accountActions, /eventType:\s*"account_reordered"/);
    assert.match(recurringActions, /eventType:\s*"recurring_created"/);
    assert.match(recurringActions, /eventType:\s*"recurring_updated"/);
    assert.match(recurringActions, /eventType:\s*"recurring_status_changed"/);
  });
});

describe("UX guardrails", () => {
  const quickEntry = read("src/app/m/new/quick-transaction-client.tsx");
  const dashboard = read("src/app/dashboard/dashboard-client.tsx");
  const dashboardPage = read("src/app/dashboard/page.tsx");
  const recurring = read("src/app/recurring/recurring-client.tsx");
  const moneyFormatter = read("src/lib/formatters/money.ts");
  const accountsClient = read("src/app/accounts/accounts-client.tsx");
  const reportPage = read("src/app/reports/page.tsx");
  const reports = read("src/app/reports/reports-client.tsx");
  const appNav = read("src/components/app-nav.tsx");
  const settings = read("src/app/settings/settings-client.tsx");

  it("keeps mobile amount entry keypad-friendly and PWA-aware", () => {
    assert.match(quickEntry, /inputMode="numeric"/);
    assert.match(quickEntry, /enterKeyHint="next"/);
    assert.match(quickEntry, /env\(safe-area-inset-bottom\)/);
  });

  it("formats amount inputs with thousands separators while keeping numeric submission safe", () => {
    assert.match(moneyFormatter, /replace\(\/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)\/g, ","\)/);
    assert.match(quickEntry, /setAmount\(formatAmountInput\(event\.target\.value\)\)/);
    assert.match(recurring, /onInput=\{formatAmountField\}/);
    assert.match(recurring, /placeholder="12,900"/);
    assert.match(accountsClient, /onInput=\{formatAmountField\}/);
    assert.match(accountsClient, /placeholder="1,000,000"/);
  });

  it("keeps the dashboard responsive and chart-backed", () => {
    assert.match(dashboard, /ResponsiveContainer/);
    assert.match(dashboard, /md:grid-cols/);
    assert.match(dashboard, /xl:grid-cols/);
    assert.match(dashboard, /<Table/);
    assert.match(dashboard, /<Tabs/);
    assert.match(dashboard, /AI 소비 조언/);
    assert.match(dashboard, /makeFriendlyAdviceLine/);
    assert.match(dashboard, /MainAccountBalanceCard/);
    assert.match(dashboard, /생활비통장/);
    assert.match(dashboardPage, /Number\(account\.opening_balance\) \|\| 0/);
    assert.match(dashboardPage, /buildAccountBalances\(\s*accounts,/);
  });

  it("provides printable household reports", () => {
    assert.match(appNav, /href:\s*"\/reports"/);
    assert.match(reportPage, /\.from\("transactions"\)/);
    assert.match(reportPage, /\.eq\("household_id", household\.id\)/);
    assert.match(reportPage, /user_id/);
    assert.match(reports, /window\.print\(\)/);
    assert.match(reports, /인쇄 \/ PDF 저장/);
    assert.match(reports, /AI 소비 조언/);
  });

  it("uses compact account summary cards on mobile", () => {
    assert.match(dashboard, /md:hidden/);
    assert.match(dashboard, /hidden md:block/);
    assert.match(dashboard, /<AccountSummaryCards accountSummaries=\{accountSummaries\} compact/);
    assert.match(dashboard, /<AccountSummaryTable accountSummaries=\{accountSummaries\}/);
  });

  it("keeps settings sections reachable through real tabs", () => {
    assert.match(settings, /<Tabs/);
    assert.match(settings, /<TabsList/);
    assert.match(settings, /<TabsTrigger/);
    assert.match(settings, /<TabsContent/);
    assert.match(settings, /value="shortcuts"/);
    assert.match(settings, /value="secrets"/);
  });
});
