-- Fiscal data per product (NCM, CEST, CFOP, origin, CSOSN) and restaurant-wide defaults, set by
-- the accountant. Every NFC-e item used to go out as NCM 21069090 / CFOP 5102 / CSOSN 102,
-- whatever the product. All nullable: nothing is guessed, missing data blocks the note instead.
ALTER TABLE "recipes" ADD COLUMN "fiscalNcm" TEXT,
ADD COLUMN "fiscalCest" TEXT,
ADD COLUMN "fiscalCfop" TEXT,
ADD COLUMN "fiscalOrigin" TEXT,
ADD COLUMN "fiscalCsosn" TEXT;

ALTER TABLE "nfe_configs" ADD COLUMN "defaultNcm" TEXT,
ADD COLUMN "defaultCfop" TEXT,
ADD COLUMN "defaultOrigin" TEXT,
ADD COLUMN "defaultCsosn" TEXT,
ADD COLUMN "pisCofinsCst" TEXT;
