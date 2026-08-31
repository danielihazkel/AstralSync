-- AlterTable
ALTER TABLE `reading` MODIFY `generator` ENUM('template', 'llm', 'hebrew_llm', 'life_story') NOT NULL;

-- AlterTable
ALTER TABLE `reading_archive` MODIFY `generator` ENUM('template', 'llm', 'hebrew_llm', 'life_story') NOT NULL;

-- CreateTable
CREATE TABLE `life_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `event_date` DATE NOT NULL,
    `date_precision` ENUM('day', 'month', 'year') NOT NULL DEFAULT 'day',
    `category` ENUM('marriage', 'child', 'career', 'relocation', 'loss', 'health', 'education', 'other') NOT NULL,
    `notes_md` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `life_event_profile_id_event_date_idx`(`profile_id`, `event_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `life_event` ADD CONSTRAINT `life_event_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
