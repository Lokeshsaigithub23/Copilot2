ALTER TABLE "CreditAccount"
ADD COLUMN "reservedCredits" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditReservation_idempotencyKey_key"
ON "CreditReservation"("idempotencyKey");

CREATE INDEX "CreditReservation_userId_status_idx"
ON "CreditReservation"("userId", "status");

CREATE INDEX "CreditReservation_accountId_status_idx"
ON "CreditReservation"("accountId", "status");

CREATE INDEX "CreditReservation_expiresAt_idx"
ON "CreditReservation"("expiresAt");

CREATE INDEX "CreditReservation_paymentId_idx"
ON "CreditReservation"("paymentId");

ALTER TABLE "CreditReservation"
ADD CONSTRAINT "CreditReservation_accountId_fkey"
FOREIGN KEY ("accountId")
REFERENCES "CreditAccount"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;