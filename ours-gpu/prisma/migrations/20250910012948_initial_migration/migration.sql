-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'PROCESSING', 'VERIFYING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."VerificationMethod" AS ENUM ('BUILTIN_HASH', 'USER_PROGRAM');

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" UUID NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'REQUESTED',
    "objectKey" TEXT NOT NULL,
    "metadata" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assignedWorkerId" TEXT,
    "entryCommand" TEXT,
    "verification" "public"."VerificationMethod" NOT NULL DEFAULT 'BUILTIN_HASH',
    "verifierObjectKey" TEXT,
    "verifierCommand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Worker" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "running" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);
