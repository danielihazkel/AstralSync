-- AlterTable
ALTER TABLE `reading` ADD COLUMN `content_version` VARCHAR(16) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `reading_astro_snapshot_id_generator_key` ON `reading`(`astro_snapshot_id`, `generator`);
