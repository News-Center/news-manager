-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoSubscribe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredEndTime" TIME(1) NOT NULL DEFAULT '2023-11-04 23:00:00 +00:00',
ADD COLUMN     "preferredStartTime" TIME(1) NOT NULL DEFAULT '2023-11-04 00:00:00 +00:00';

-- CreateTable
CREATE TABLE "Phase" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PhaseToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Phase_name_key" ON "Phase"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_PhaseToUser_AB_unique" ON "_PhaseToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_PhaseToUser_B_index" ON "_PhaseToUser"("B");

-- AddForeignKey
ALTER TABLE "_PhaseToUser" ADD CONSTRAINT "_PhaseToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PhaseToUser" ADD CONSTRAINT "_PhaseToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
