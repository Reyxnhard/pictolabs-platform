-- AlterTable
ALTER TABLE "booths" ADD COLUMN "admin_pin_hash" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "retentionExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redelivery_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "operatorEmail" TEXT NOT NULL,
    "recipient" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responsePayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redelivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_events_sessionId_idx" ON "session_events"("sessionId");

-- CreateIndex
CREATE INDEX "session_events_eventType_idx" ON "session_events"("eventType");

-- CreateIndex
CREATE INDEX "redelivery_logs_sessionId_idx" ON "redelivery_logs"("sessionId");

-- CreateIndex
CREATE INDEX "photos_sessionId_idx" ON "photos"("sessionId");

-- CreateIndex
CREATE INDEX "sessions_boothId_idx" ON "sessions"("boothId");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_createdAt_idx" ON "sessions"("createdAt");

-- CreateIndex
CREATE INDEX "sessions_customerEmail_idx" ON "sessions"("customerEmail");

-- CreateIndex
CREATE INDEX "sessions_customerPhone_idx" ON "sessions"("customerPhone");

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redelivery_logs" ADD CONSTRAINT "redelivery_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
