-- CreateTable
CREATE TABLE `synastry_reading` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_a_id` INTEGER NOT NULL,
    `profile_b_id` INTEGER NOT NULL,
    `a_version` INTEGER NOT NULL,
    `b_version` INTEGER NOT NULL,
    `body_md` TEXT NOT NULL,
    `model_name` VARCHAR(64) NULL,
    `content_version` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `synastry_reading_profile_a_id_profile_b_id_key`(`profile_a_id`, `profile_b_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `synastry_reading` ADD CONSTRAINT `synastry_reading_profile_a_id_fkey` FOREIGN KEY (`profile_a_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `synastry_reading` ADD CONSTRAINT `synastry_reading_profile_b_id_fkey` FOREIGN KEY (`profile_b_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
