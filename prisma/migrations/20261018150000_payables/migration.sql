-- CreateEnum
CREATE TYPE "PayableCategory" AS ENUM ('MERCHANDISE', 'RENT', 'UTILITIES', 'PAYROLL', 'TAXES', 'SERVICES', 'LOANS', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "PayableSource" AS ENUM ('MANUAL', 'SERIES', 'INSTALLMENT', 'UTILITY', 'NFE');

-- AlterTable
ALTER TABLE "cash_session_entries" ADD COLUMN     "payableId" TEXT;

-- CreateTable
CREATE TABLE "payable_series" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PayableCategory" NOT NULL,
    "supplierId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "startMonth" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payable_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PayableCategory" NOT NULL,
    "supplierId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "competenceMonth" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "source" "PayableSource" NOT NULL DEFAULT 'MANUAL',
    "seriesId" TEXT,
    "installmentGroup" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "utilityBillId" TEXT,
    "nfeKey" TEXT,
    "nfeDupNumber" TEXT,
    "paidAt" DATE,
    "paidMethod" TEXT,
    "paidFrom" TEXT,
    "cashEntryId" TEXT,
    "paidById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payable_series_restaurantId_active_idx" ON "payable_series"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "payables_utilityBillId_key" ON "payables"("utilityBillId");

-- CreateIndex
CREATE UNIQUE INDEX "payables_cashEntryId_key" ON "payables"("cashEntryId");

-- CreateIndex
CREATE INDEX "payables_restaurantId_status_dueDate_idx" ON "payables"("restaurantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "payables_restaurantId_competenceMonth_idx" ON "payables"("restaurantId", "competenceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "payables_seriesId_competenceMonth_key" ON "payables"("seriesId", "competenceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "payables_restaurantId_nfeKey_nfeDupNumber_key" ON "payables"("restaurantId", "nfeKey", "nfeDupNumber");

-- CreateIndex
CREATE INDEX "cash_session_entries_payableId_idx" ON "cash_session_entries"("payableId");

-- AddForeignKey
ALTER TABLE "payable_series" ADD CONSTRAINT "payable_series_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "payable_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_utilityBillId_fkey" FOREIGN KEY ("utilityBillId") REFERENCES "utility_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

