-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'APPLE';

-- DropForeignKey
ALTER TABLE "OAuthApp" DROP CONSTRAINT "OAuthApp_organizationId_fkey";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe';

-- AlterTable
ALTER TABLE "OAuthApp" ADD COLUMN     "dynamic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "redirectUris" TEXT,
ADD COLUMN     "tokenEndpointAuthMethod" TEXT,
ALTER COLUMN "organizationId" DROP NOT NULL,
ALTER COLUMN "clientSecret" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OAuthAuthorization" ADD COLUMN     "codeChallenge" TEXT,
ADD COLUMN     "codeChallengeMethod" TEXT,
ADD COLUMN     "redirectUri" TEXT;

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "OAuthApp_dynamic_idx" ON "OAuthApp"("dynamic");

-- AddForeignKey
ALTER TABLE "OAuthApp" ADD CONSTRAINT "OAuthApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

