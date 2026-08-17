/*
  Warnings:

  - A unique constraint covering the columns `[quoteSnapshotId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `quoteSnapshotId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "quoteSnapshotId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "miles" INTEGER NOT NULL,
    "taxesBrlCents" INTEGER NOT NULL,
    "carrier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteSnapshotId_key" ON "Order"("quoteSnapshotId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteSnapshotId_fkey" FOREIGN KEY ("quoteSnapshotId") REFERENCES "QuoteSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
