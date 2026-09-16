ALTER TABLE "staff" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email") WHERE "email" IS NOT NULL;
