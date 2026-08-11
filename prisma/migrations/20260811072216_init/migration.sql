-- CreateTable
CREATE TABLE `geo_city` (
    `geoname_id` INTEGER NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `ascii_name` VARCHAR(200) NOT NULL,
    `country_code` VARCHAR(2) NOT NULL,
    `admin1` VARCHAR(20) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `population` INTEGER NOT NULL,

    INDEX `geo_city_ascii_name_idx`(`ascii_name`),
    INDEX `geo_city_name_idx`(`name`),
    PRIMARY KEY (`geoname_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `display_name` VARCHAR(100) NOT NULL,
    `full_birth_name` VARCHAR(200) NULL,
    `name_script` ENUM('latin', 'hebrew', 'other') NOT NULL DEFAULT 'latin',
    `birth_date` DATE NOT NULL,
    `birth_time` VARCHAR(5) NULL,
    `time_certainty` ENUM('exact', 'approx', 'unknown') NOT NULL DEFAULT 'exact',
    `birth_city_geoname_id` INTEGER NULL,
    `birth_lat` DOUBLE NOT NULL,
    `birth_lng` DOUBLE NOT NULL,
    `tz_iana` VARCHAR(64) NOT NULL,
    `utc_offset_minutes` INTEGER NOT NULL,
    `offset_overridden` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `astro_snapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `house_system` ENUM('placidus', 'whole_sign', 'equal') NOT NULL,
    `is_solar_chart` BOOLEAN NOT NULL,
    `sun_sign` VARCHAR(12) NOT NULL,
    `moon_sign` VARCHAR(12) NOT NULL,
    `ascendant` VARCHAR(12) NULL,
    `placements_json` JSON NOT NULL,
    `aspects_json` JSON NOT NULL,
    `engine` VARCHAR(32) NOT NULL,
    `engine_version` VARCHAR(16) NOT NULL,
    `content_version` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `astro_snapshot_profile_id_version_key`(`profile_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `numero_snapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `system` ENUM('pythagorean', 'gematria') NOT NULL,
    `life_path_int` INTEGER NOT NULL,
    `destiny_int` INTEGER NULL,
    `soul_urge_int` INTEGER NULL,
    `is_master_lp` BOOLEAN NOT NULL,
    `derivation_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `numero_snapshot_profile_id_version_key`(`profile_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reading` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `astro_snapshot_id` INTEGER NOT NULL,
    `numero_snapshot_id` INTEGER NULL,
    `body_md` TEXT NOT NULL,
    `generator` ENUM('template', 'llm') NOT NULL,
    `model_name` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `profile` ADD CONSTRAINT `profile_birth_city_geoname_id_fkey` FOREIGN KEY (`birth_city_geoname_id`) REFERENCES `geo_city`(`geoname_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `astro_snapshot` ADD CONSTRAINT `astro_snapshot_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `numero_snapshot` ADD CONSTRAINT `numero_snapshot_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reading` ADD CONSTRAINT `reading_astro_snapshot_id_fkey` FOREIGN KEY (`astro_snapshot_id`) REFERENCES `astro_snapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reading` ADD CONSTRAINT `reading_numero_snapshot_id_fkey` FOREIGN KEY (`numero_snapshot_id`) REFERENCES `numero_snapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
