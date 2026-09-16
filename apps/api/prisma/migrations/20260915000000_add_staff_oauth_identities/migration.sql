CREATE TABLE "staff_oauth_identities" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_oauth_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_oauth_identities_provider_subject_key" ON "staff_oauth_identities"("provider", "subject");
CREATE UNIQUE INDEX "staff_oauth_identities_staffId_provider_key" ON "staff_oauth_identities"("staffId", "provider");
ALTER TABLE "staff_oauth_identities" ADD CONSTRAINT "staff_oauth_identities_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
