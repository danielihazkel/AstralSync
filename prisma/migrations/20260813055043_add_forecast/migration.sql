-- CreateTable
CREATE TABLE `forecast` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `mode` ENUM('western', 'hebrew') NOT NULL,
    `kind` ENUM('day', 'week', 'month') NOT NULL,
    `period_start` DATE NOT NULL,
    `natal_version` INTEGER NOT NULL,
    `body_md` TEXT NOT NULL,
    `model_name` VARCHAR(64) NULL,
    `content_version` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `forecast_profile_id_mode_kind_period_start_key`(`profile_id`, `mode`, `kind`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `forecast` ADD CONSTRAINT `forecast_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
