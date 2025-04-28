/*
  Warnings:

  - A unique constraint covering the columns `[nom]` on the table `Genre` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Genre_nom_key` ON `Genre`(`nom`);
