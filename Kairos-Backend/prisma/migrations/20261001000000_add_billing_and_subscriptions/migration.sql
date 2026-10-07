CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "includedCredits" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key"
ON "SubscriptionPlan"("code");

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key"
ON "Subscription"("stripeSubscriptionId");

CREATE INDEX "Subscription_userId_idx"
ON "Subscription"("userId");

CREATE INDEX "Subscription_planId_idx"
ON "Subscription"("planId");

CREATE INDEX "Subscription_status_idx"
ON "Subscription"("status");

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_planId_fkey"
FOREIGN KEY ("planId")
REFERENCES "SubscriptionPlan"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "creditAmountUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerPaymentId" TEXT,
    "providerCheckoutId" TEXT,
    "idempotencyKey" TEXT NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_providerPaymentId_key"
ON "Payment"("providerPaymentId");

CREATE UNIQUE INDEX "Payment_providerCheckoutId_key"
ON "Payment"("providerCheckoutId");

CREATE UNIQUE INDEX "Payment_idempotencyKey_key"
ON "Payment"("idempotencyKey");

CREATE INDEX "Payment_userId_createdAt_idx"
ON "Payment"("userId");

CREATE INDEX "Payment_status_createdAt_idx"
ON "Payment"("status");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;