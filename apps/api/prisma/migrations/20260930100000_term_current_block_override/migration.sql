-- AlterTable: ADMIN chốt block hiện tại (1 | 2) của học kỳ; null = tự tính theo điểm giữa kỳ.
ALTER TABLE "terms" ADD COLUMN "currentBlockOverride" INTEGER;
