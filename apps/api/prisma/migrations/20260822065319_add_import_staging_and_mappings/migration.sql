-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('CATALOG', 'LECTURER', 'SCHEDULE', 'GRADEBOOK');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "department_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_major_rules" (
    "id" TEXT NOT NULL,
    "classPrefix" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_major_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_aliases_alias_key" ON "department_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "class_major_rules_classPrefix_key" ON "class_major_rules"("classPrefix");

-- CreateIndex
CREATE INDEX "import_batches_kind_status_idx" ON "import_batches"("kind", "status");

-- CreateIndex
CREATE INDEX "import_rows_batchId_idx" ON "import_rows"("batchId");

-- AddForeignKey
ALTER TABLE "department_aliases" ADD CONSTRAINT "department_aliases_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_major_rules" ADD CONSTRAINT "class_major_rules_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
