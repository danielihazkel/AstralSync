-- CreateTable
CREATE TABLE `journal_entry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `entry_date` DATE NOT NULL,
    `body_md` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `journal_entry_profile_id_entry_date_idx`(`profile_id`, `entry_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journal_entry` ADD CONSTRAINT `journal_entry_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
