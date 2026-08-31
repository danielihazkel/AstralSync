-- AlterTable
ALTER TABLE `profile` ADD COLUMN `last_viewed_at` DATETIME(3) NULL,
    ADD COLUMN `tags_json` JSON NULL;

-- CreateTable
CREATE TABLE `relationship` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `a_id` INTEGER NOT NULL,
    `b_id` INTEGER NOT NULL,
    `kind` ENUM('partner', 'family', 'friend', 'colleague', 'other') NOT NULL,
    `label` VARCHAR(80) NULL,
    `note` VARCHAR(400) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `relationship_a_id_b_id_key`(`a_id`, `b_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `relationship` ADD CONSTRAINT `relationship_a_id_fkey` FOREIGN KEY (`a_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `relationship` ADD CONSTRAINT `relationship_b_id_fkey` FOREIGN KEY (`b_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
