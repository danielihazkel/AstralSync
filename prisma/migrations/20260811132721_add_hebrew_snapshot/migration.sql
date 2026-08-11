-- CreateTable
CREATE TABLE `hebrew_snapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `hebrew_date` VARCHAR(40) NOT NULL,
    `month_key` VARCHAR(12) NOT NULL,
    `day_planet` VARCHAR(12) NOT NULL,
    `hour_planet` VARCHAR(12) NULL,
    `date_gematria_int` INTEGER NOT NULL,
    `mazal_json` JSON NOT NULL,
    `gematria_json` JSON NOT NULL,
    `engine` VARCHAR(32) NOT NULL,
    `engine_version` VARCHAR(16) NOT NULL,
    `content_version` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `hebrew_snapshot_profile_id_version_key`(`profile_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hebrew_snapshot` ADD CONSTRAINT `hebrew_snapshot_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
