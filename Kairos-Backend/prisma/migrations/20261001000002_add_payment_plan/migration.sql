ALTER TABLE "Payment"
ADD COLUMN "planId" TEXT;

CREATE INDEX "Payment_planId_idx"
ON "Payment"("planId");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_planId_fkey"
FOREIGN KEY ("planId")
REFERENCES "SubscriptionPlan"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;