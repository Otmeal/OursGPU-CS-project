-- CreateEnum
CREATE TYPE "public"."job_status" AS ENUM ('requested', 'scheduled', 'processing', 'verifying', 'done', 'failed');

-- CreateEnum
CREATE TYPE "public"."verification_method" AS ENUM ('builtin_hash', 'user_program');

-- CreateTable
CREATE TABLE "public"."job" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "public"."job_status" NOT NULL DEFAULT 'requested',
    "object_key" TEXT NOT NULL,
    "output_object_key" TEXT,
    "metadata" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "worker_id" TEXT NOT NULL,
    "wallet_id" TEXT,
    "entry_command" TEXT,
    "verification" "public"."verification_method" NOT NULL DEFAULT 'builtin_hash',
    "verifier_object_key" TEXT,
    "verifier_command" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "kill_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "executed_seconds" INTEGER,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."worker" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "org_name" TEXT,
    "wallet" TEXT,
    "concurrency" INTEGER NOT NULL,
    "running" INTEGER NOT NULL DEFAULT 0,
    "last_seen" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wallet" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_info" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "user_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_identity_hash" (
    "id" UUID NOT NULL,
    "info_hash" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "pepper_version" INTEGER NOT NULL DEFAULT 1,
    "hash_algorithm" TEXT NOT NULL DEFAULT 'sha256',

    CONSTRAINT "user_identity_hash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_worker_id_idx" ON "public"."job"("worker_id");

-- CreateIndex
CREATE INDEX "job_wallet_id_idx" ON "public"."job"("wallet_id");

-- CreateIndex
CREATE INDEX "user_info_email_idx" ON "public"."user_info"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_identity_hash_info_hash_key" ON "public"."user_identity_hash"("info_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_identity_hash_wallet_id_key" ON "public"."user_identity_hash"("wallet_id");

-- CreateIndex
CREATE INDEX "user_identity_hash_wallet_id_idx" ON "public"."user_identity_hash"("wallet_id");

-- CreateIndex
CREATE INDEX "user_identity_hash_info_hash_idx" ON "public"."user_identity_hash"("info_hash");

-- AddForeignKey
ALTER TABLE "public"."job" ADD CONSTRAINT "job_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."job" ADD CONSTRAINT "job_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_identity_hash" ADD CONSTRAINT "user_identity_hash_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
