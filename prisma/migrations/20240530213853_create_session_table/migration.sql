CREATE TYPE "RuleScope" AS ENUM ('ALL_PRODUCTS', 'PRODUCTS', 'VARIANTS', 'COLLECTIONS', 'PRODUCT_TAGS');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'ERROR');

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "validationId" TEXT,
    "blockOnFailure" BOOLEAN NOT NULL DEFAULT false,
    "storefrontEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "configurationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope" "RuleScope" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER,
    "increment" INTEGER NOT NULL DEFAULT 1,
    "startQuantity" INTEGER,
    "messageEn" TEXT,
    "messageLv" TEXT,
    "messageRu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleTarget" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "resourceId" TEXT,
    "value" TEXT,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuleTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompiledVariant" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompiledVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "operation" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_shop_idx" ON "Session"("shop");
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
CREATE INDEX "Rule_shop_enabled_idx" ON "Rule"("shop", "enabled");
CREATE INDEX "Rule_shop_scope_priority_idx" ON "Rule"("shop", "scope", "priority");
CREATE INDEX "RuleTarget_ruleId_idx" ON "RuleTarget"("ruleId");
CREATE UNIQUE INDEX "RuleTarget_ruleId_resourceId_value_key" ON "RuleTarget"("ruleId", "resourceId", "value");
CREATE INDEX "CompiledVariant_shop_ruleId_idx" ON "CompiledVariant"("shop", "ruleId");
CREATE UNIQUE INDEX "CompiledVariant_shop_variantId_key" ON "CompiledVariant"("shop", "variantId");
CREATE INDEX "SyncLog_shop_createdAt_idx" ON "SyncLog"("shop", "createdAt");

ALTER TABLE "Rule" ADD CONSTRAINT "Rule_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuleTarget" ADD CONSTRAINT "RuleTarget_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompiledVariant" ADD CONSTRAINT "CompiledVariant_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompiledVariant" ADD CONSTRAINT "CompiledVariant_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
