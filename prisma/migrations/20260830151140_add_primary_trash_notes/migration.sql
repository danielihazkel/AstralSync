-- AlterTable
ALTER TABLE `astro_snapshot` ADD COLUMN `note` VARCHAR(400) NULL;

-- AlterTable
ALTER TABLE `journal_entry` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `profile` ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `is_primary` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `reading_archive` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `astro_snapshot_id` INTEGER NOT NULL,
    `numero_snapshot_id` INTEGER NULL,
    `body_md` TEXT NOT NULL,
    `generator` ENUM('template', 'llm', 'hebrew_llm') NOT NULL,
    `model_name` VARCHAR(64) NULL,
    `content_version` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `discarded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reading_archive_astro_snapshot_id_idx`(`astro_snapshot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reading_archive` ADD CONSTRAINT `reading_archive_astro_snapshot_id_fkey` FOREIGN KEY (`astro_snapshot_id`) REFERENCES `astro_snapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
