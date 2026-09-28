CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDevice_userId_deviceIdHash_key"
ON "UserDevice"("userId", "deviceIdHash");

CREATE INDEX "UserDevice_userId_idx"
ON "UserDevice"("userId");

CREATE INDEX "UserDevice_deviceIdHash_idx"
ON "UserDevice"("deviceIdHash");

ALTER TABLE "UserDevice"
ADD CONSTRAINT "UserDevice_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;