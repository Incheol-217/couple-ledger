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

describe("UX guardrails", () => {
  const quickEntry = read("src/app/m/new/quick-transaction-client.tsx");
  const dashboard = read("src/app/dashboard/dashboard-client.tsx");

  it("keeps mobile amount entry keypad-friendly and PWA-aware", () => {
    assert.match(quickEntry, /inputMode="numeric"/);
    assert.match(quickEntry, /enterKeyHint="next"/);
    assert.match(quickEntry, /env\(safe-area-inset-bottom\)/);
  });

  it("keeps the dashboard responsive and chart-backed", () => {
    assert.match(dashboard, /ResponsiveContainer/);
    assert.match(dashboard, /md:grid-cols/);
    assert.match(dashboard, /xl:grid-cols/);
    assert.match(dashboard, /<Table/);
    assert.match(dashboard, /<Tabs/);
  });
});
