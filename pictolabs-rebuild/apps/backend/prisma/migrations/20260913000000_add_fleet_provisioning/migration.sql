-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "booth_id" TEXT NOT NULL,
    "device_secret" TEXT NOT NULL,
    "machine_guid" TEXT,
    "mac_address" TEXT,
    "hostname" TEXT,
    "os_version" TEXT,
    "app_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "booth_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_device_guid" TEXT,
    "ip_address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_booth_id_key" ON "devices"("booth_id");
CREATE UNIQUE INDEX "devices_device_secret_key" ON "devices"("device_secret");
CREATE INDEX "devices_booth_id_idx" ON "devices"("booth_id");
CREATE INDEX "devices_device_secret_idx" ON "devices"("device_secret");

-- CreateIndex
CREATE UNIQUE INDEX "activation_tokens_token_key" ON "activation_tokens"("token");
CREATE INDEX "activation_tokens_token_idx" ON "activation_tokens"("token");
CREATE INDEX "activation_tokens_booth_id_idx" ON "activation_tokens"("booth_id");
CREATE INDEX "activation_tokens_status_expires_at_idx" ON "activation_tokens"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
