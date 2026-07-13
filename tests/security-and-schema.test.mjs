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
  const permissionHardening = read(
    "supabase/migrations/20260710120000_harden_household_permissions.sql",
  );
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

  it("keeps administrator operations protected at the database boundary", () => {
    assert.match(permissionHardening, /public\.is_household_owner\(id\)/);
    assert.match(permissionHardening, /Owners can create accounts/);
    assert.match(permissionHardening, /Owners can update accounts/);
    assert.match(permissionHardening, /Owners can delete accounts/);
    assert.match(permissionHardening, /Owners can update household members/);
    assert.match(permissionHardening, /prevent_last_household_owner_removal/);
  });

  it("keeps transaction attribution immutable and transfers complete", () => {
    assert.match(permissionHardening, /prevent_transaction_attribution_change/);
    assert.match(
      permissionHardening,
      /new\.user_id is distinct from old\.user_id/,
    );
    assert.match(permissionHardening, /new\.source is distinct from old\.source/);
    assert.match(permissionHardening, /transactions_transfer_accounts_check/);
    assert.match(permissionHardening, /transfer_account_id is not null/);
    assert.match(permissionHardening, /transfer_account_id <> account_id/);
  });

  it("keeps transaction review fields inside the household boundary", () => {
    assert.match(migrations, /review_status text not null default 'none'/);
    assert.match(migrations, /transactions_review_status_check/);
    assert.match(migrations, /transactions_household_review_idx/);
    assert.match(migrations, /normalize_transaction_review_fields/);
    assert.match(migrations, /transactions\.review_requested_by/);
    assert.match(migrations, /transactions\.reviewed_by/);
    assert.match(migrations, /public\.assert_user_belongs_to_household\(/);
  });
});

describe("AI spending advice privacy", () => {
  const aiRoute = read("src/app/api/ai/spending-advice/route.ts");
  const receiptRoute = read("src/app/api/ai/receipt/route.ts");

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
    assert.match(aiRoute, /투자, 대출, 세금, 법률 조언은 하지 않아요/);
  });

  it("extracts receipt drafts without sending unnecessary sensitive fields back", () => {
    assert.match(receiptRoute, /input_image/);
    assert.match(receiptRoute, /OPENAI_API_KEY/);
    assert.match(receiptRoute, /카드번호, 승인번호, 사업자번호/);
    assert.match(receiptRoute, /원문 OCR 전체를 넣지 않아요/);
    assert.match(receiptRoute, /friendlyOpenAIError/);
    assert.match(receiptRoute, /OpenAI 사용 한도가 부족해/);
    assert.match(receiptRoute, /\.eq\("type", "expense"\)/);
    assert.doesNotMatch(receiptRoute, /masked_identifier|raw_text|ocr_text/i);
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
    assert.match(shortcutRoute, /review_status: reviewDraft\.review_status/);
  });

  it("deduplicates webhook retries when an idempotency key is provided", () => {
    assert.match(shortcutRoute, /idempotency_key/);
    assert.match(shortcutRoute, /x-idempotency-key/);
    assert.match(shortcutRoute, /findExistingShortcutTransaction/);
    assert.match(shortcutRoute, /duplicate:\s*true/);
    assert.match(
      readMigrations(),
      /transactions_source_external_unique_idx/,
    );
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
  const transactionActions = read("src/app/transactions/actions.ts");
  const reviewHelper = read("src/lib/transactions/review.ts");

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
    assert.match(quickAction, /readTransactionSource\(formData\)/);
    assert.match(quickAction, /\n\s*source,\n/);
    assert.match(quickAction, /review_status: reviewDraft\.review_status/);
  });

  it("marks risky transactions for household review and lets members complete review", () => {
    assert.match(quickAction, /reviewDraftForTransaction/);
    assert.match(shortcutRoute, /reviewDraftForTransaction/);
    assert.match(reviewHelper, /REVIEW_AMOUNT_THRESHOLD = 100_000/);
    assert.match(reviewHelper, /review_status: "needs_review"/);
    assert.match(transactionActions, /markTransactionReviewedAction/);
    assert.match(transactionActions, /\.eq\("review_status", "needs_review"\)/);
    assert.match(transactionActions, /review_status:\s*"reviewed"/);
    assert.match(transactionActions, /eventType:\s*"transaction_reviewed"/);
  });

  it("keeps settings behind admin access", () => {
    assert.match(settingsPage, /context\.isAdmin/);
    assert.match(settingsPage, /관리자 계정으로 볼 수 있어요/);
    assert.match(appNav, /canAccessSettings/);
  });

  it("keeps account changes behind admin access", () => {
    assert.match(accountActions, /assertCurrentAdminMember/);
    assert.match(accountActions, /\.eq\("role", "owner"\)/);
    assert.match(accountActions, /관리자 계정으로 계좌를 바꿀 수 있어요/);
    assert.match(accountActions, /opening_balance/);
    assert.match(accountsClient, /관리자 계정으로 추가할 수 있어요/);
    assert.match(accountsClient, /처음 잔액/);
    assert.match(accountsClient, /보기만 가능해요/);
  });

  it("requires a destination account for transfers on the server", () => {
    assert.match(quickAction, /type === "transfer" && !confirmedTransferAccountId/);
    assert.match(quickAction, /입금 계좌를 선택해 주세요/);
  });

  it("sends first visits to login and signed-in visits to dashboard", () => {
    assert.match(homePage, /redirect\("\/login"\)/);
    assert.match(homePage, /redirect\("\/dashboard"\)/);
    assert.match(appShell, /context\.isSignedIn \? \(/);
    assert.match(appShell, /<AppNav canAccessSettings=\{canAccessSettings\} compact \/>/);
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
    assert.match(
      notificationFeed,
      /actor_user_id\.is\.null,actor_user_id\.neq\.\$\{userId\}/,
    );
  });

  it("records notifications for partner transactions and admin setting changes", () => {
    assert.match(notificationEvents, /transaction_created/);
    assert.match(notificationEvents, /transaction_reviewed/);
    assert.match(quickAction, /createNotificationEvent/);
    assert.match(quickAction, /eventType:\s*"transaction_created"/);
    assert.match(shortcutRoute, /eventType:\s*"transaction_created"/);
    assert.match(transactionActions, /eventType:\s*"transaction_reviewed"/);
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
  const appShell = read("src/components/app-shell.tsx");
  const mobileExpenseAction = read("src/components/mobile-expense-action.tsx");
  const receiptDrafts = read("src/lib/receipt-drafts.ts");
  const transactionsPage = read("src/app/transactions/page.tsx");
  const jobRoute = read(
    "src/app/api/jobs/create-recurring-transactions/route.ts",
  );
  const recurringJob = read("src/lib/jobs/create-recurring-transactions.ts");
  const packageJson = JSON.parse(read("package.json"));
  const nextConfig = read("next.config.ts");

  it("keeps mobile amount entry keypad-friendly and PWA-aware", () => {
    assert.match(quickEntry, /inputMode="numeric"/);
    assert.match(quickEntry, /enterKeyHint="next"/);
    assert.match(quickEntry, /env\(safe-area-inset-bottom\)/);
  });

  it("lets mobile users start an expense quickly from anywhere", () => {
    assert.match(appShell, /<MobileExpenseAction isSignedIn=\{context\.isSignedIn\}/);
    assert.match(mobileExpenseAction, /href="\/m\/new"/);
    assert.match(mobileExpenseAction, /직접 쓰기/);
    assert.match(mobileExpenseAction, /영수증 찍기/);
    assert.match(mobileExpenseAction, /쓰기/);
    assert.match(mobileExpenseAction, /md:hidden/);
    assert.match(mobileExpenseAction, /pathname\.startsWith\("\/m\/new"\)/);
    assert.match(mobileExpenseAction, /cameraInputRef\.current\?\.click\(\)/);
    assert.match(mobileExpenseAction, /sessionStorage\.setItem\(\s*receiptDraftStorageKey/);
    assert.match(mobileExpenseAction, /router\.push\("\/m\/new\?mode=receipt"\)/);
    assert.match(mobileExpenseAction, /직접 쓰기/);
    assert.doesNotMatch(mobileExpenseAction, /bottom-\[/);
  });

  it("supports receipt camera drafting before manual review", () => {
    assert.match(receiptDrafts, /receiptDraftStorageKey/);
    assert.match(quickEntry, /영수증 찍기/);
    assert.match(quickEntry, /accept="image\/\*"/);
    assert.match(quickEntry, /capture="environment"/);
    assert.match(quickEntry, /fetch\("\/api\/ai\/receipt"/);
    assert.match(quickEntry, /sessionStorage\.getItem\(receiptDraftStorageKey\)/);
    assert.match(quickEntry, /직접 쓰기/);
    assert.match(quickEntry, /receiptApplied/);
    assert.match(quickEntry, /source"\s*,\s*entryMode === "receipt" && receiptApplied \? "ocr" : "manual"/);
  });

  it("formats amount inputs with thousands separators while keeping numeric submission safe", () => {
    assert.match(moneyFormatter, /replace\(\/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)\/g, ","\)/);
    assert.match(quickEntry, /setAmount\(formatAmountInput\(event\.target\.value\)\)/);
    assert.match(recurring, /onInput=\{formatAmountField\}/);
    assert.match(recurring, /placeholder="12,900"/);
    assert.match(accountsClient, /onInput=\{formatAmountField\}/);
    assert.match(accountsClient, /placeholder="1,000,000"/);
  });

  it("keeps wallet account actions visible on desktop", () => {
    assert.match(accountsClient, /sm:h-\[27rem\]/);
    assert.match(accountsClient, /WALLET_DECK/);
    assert.match(accountsClient, /walletDeckHeight/);
    assert.match(accountsClient, /relative z-20 mt-4 flex shrink-0/);
    assert.doesNotMatch(accountsClient, /rounded-t-\[1\.15rem\]/);
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
    assert.match(dashboard, /UpcomingMoneyCalendar/);
    assert.match(dashboard, /monthCalendarDays/);
    assert.match(dashboard, /CalendarDays/);
    assert.match(dashboard, /확인 필요한 거래/);
    assert.match(dashboardPage, /Number\(account\.opening_balance\) \|\| 0/);
    assert.match(dashboardPage, /buildAccountBalances\(\s*accounts,/);
    assert.match(dashboardPage, /account\.opening_balance_as_of <= today/);
    assert.match(dashboardPage, /existingRecurringTransactionsResult/);
  });

  it("shows real household transactions on mobile and desktop", () => {
    assert.match(transactionsPage, /\.from\("transactions"\)/);
    assert.match(transactionsPage, /\.eq\("household_id", context\.householdId\)/);
    assert.match(transactionsPage, /md:hidden/);
    assert.match(transactionsPage, /hidden overflow-hidden.*md:block/);
    assert.match(transactionsPage, /memberNames/);
    assert.match(transactionsPage, /review_status/);
    assert.match(transactionsPage, /확인 필요한 거래/);
    assert.match(transactionsPage, /markTransactionReviewedAction/);
  });

  it("hardens recurring job execution and package installs", () => {
    assert.match(jobRoute, /timingSafeEqual/);
    assert.match(recurringJob, /\.eq\("next_due_date", item\.next_due_date\)/);
    assert.match(recurringJob, /if \(!updatedItem\)/);

    for (const version of [
      ...Object.values(packageJson.dependencies),
      ...Object.values(packageJson.devDependencies),
    ]) {
      assert.notEqual(version, "latest");
    }

    assert.match(nextConfig, /poweredByHeader:\s*false/);
    assert.match(nextConfig, /X-Content-Type-Options/);
    assert.match(nextConfig, /Permissions-Policy/);
  });

  it("provides printable household reports", () => {
    assert.match(appNav, /href:\s*"\/reports"/);
    assert.match(reportPage, /\.from\("transactions"\)/);
    assert.match(reportPage, /\.eq\("household_id", household\.id\)/);
    assert.match(reportPage, /user_id/);
    assert.match(reports, /window\.print\(\)/);
    assert.match(reports, /인쇄 또는 PDF 저장/);
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
    assert.match(settings, /text-foreground\/80/);
    assert.match(settings, /group-aria-selected:text-primary-foreground/);
  });
});
