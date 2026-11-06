-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerMinute" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'HBAR',
    "payTo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "hmacSecret" TEXT NOT NULL,
    "pubKeyFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "relay" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" INTEGER,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hederaAccountId" TEXT NOT NULL,
    "dailyCap" TEXT NOT NULL,
    "spentToday" TEXT NOT NULL DEFAULT '0',
    "spentDay" TEXT NOT NULL DEFAULT '',
    "asset" TEXT NOT NULL DEFAULT 'HBAR',
    "allowedDeviceIds" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "paymentPayloadHash" TEXT NOT NULL,
    "payer" TEXT,
    "nonce" TEXT,
    "notBefore" INTEGER,
    "expiresAt" INTEGER,
    "hederaTxId" TEXT,
    "zgRequestId" TEXT,
    "zgRootHash" TEXT,
    "hcsSeq" INTEGER,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "at" INTEGER NOT NULL,
    "detail" TEXT,
    "hcsSeq" INTEGER,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepUp" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "worldSub" TEXT,
    "authTime" INTEGER,
    "createdAt" INTEGER NOT NULL,
    "expiresAt" INTEGER NOT NULL,

    CONSTRAINT "StepUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsedNonce" (
    "nonce" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "UsedNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_hederaAccountId_key" ON "Agent"("hederaAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_paymentPayloadHash_key" ON "Session"("paymentPayloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_nonce_key" ON "Session"("nonce");

-- CreateIndex
CREATE INDEX "Session_deviceId_createdAt_idx" ON "Session"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "Session_agentId_createdAt_idx" ON "Session"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_id_idx" ON "SessionEvent"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StepUp_state_key" ON "StepUp"("state");

-- CreateIndex
CREATE INDEX "Notification_sessionId_idx" ON "Notification"("sessionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUp" ADD CONSTRAINT "StepUp_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

