-- AlterTable
ALTER TABLE "booths" ADD COLUMN IF NOT EXISTS "os_version" TEXT;
ALTER TABLE "booths" ADD COLUMN IF NOT EXISTS "electron_version" TEXT;
ALTER TABLE "booths" ADD COLUMN IF NOT EXISTS "release_channel" TEXT DEFAULT 'stable';
ALTER TABLE "booths" ALTER COLUMN "status" SET DEFAULT 'NORMAL';
