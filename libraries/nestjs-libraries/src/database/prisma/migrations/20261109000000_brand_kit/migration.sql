-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "logoId" TEXT,
    "exampleIds" TEXT[],
    "colours" TEXT[],
    "headingFont" TEXT,
    "bodyFont" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_customerId_key" ON "BrandKit"("customerId");

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

