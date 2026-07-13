-- Adds a check-card account type so the tax estimator can apply the 30%
-- deduction rate to check-card spending, separately from credit cards (15%).
-- ALTER TYPE ... ADD VALUE must run outside an explicit transaction block.

alter type public.account_type add value if not exists 'check_card';
