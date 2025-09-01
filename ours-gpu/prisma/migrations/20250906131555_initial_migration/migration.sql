-- CreateTable
CREATE TABLE "public"."Worker" (
    "id" UUID NOT NULL,
    "orgId" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "running" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);
