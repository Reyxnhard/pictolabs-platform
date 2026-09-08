-- AlterTable: Add git_commit column to booths table
ALTER TABLE "booths" ADD COLUMN IF NOT EXISTS "git_commit" TEXT;
