-- New fiscal configs issue the NFC-e automatically when a sale closes (owner decision 2026-09-24,
-- market practice). Existing configs keep the value their restaurant chose.
ALTER TABLE "nfe_configs" ALTER COLUMN "autoIssueOnSale" SET DEFAULT true;
