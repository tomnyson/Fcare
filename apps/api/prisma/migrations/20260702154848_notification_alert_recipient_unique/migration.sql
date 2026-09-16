/*
  Warnings:

  - A unique constraint covering the columns `[alertId,recipientId]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "notifications_alertId_recipientId_key" ON "notifications"("alertId", "recipientId");
