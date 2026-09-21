-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'GOOGLE');

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "authMethod" "AuthMethod" NOT NULL DEFAULT 'PASSWORD';
