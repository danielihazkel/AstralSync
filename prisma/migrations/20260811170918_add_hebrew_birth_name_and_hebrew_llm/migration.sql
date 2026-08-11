-- AlterTable
ALTER TABLE `profile` ADD COLUMN `hebrew_birth_name` VARCHAR(200) NULL;

-- AlterTable
ALTER TABLE `reading` MODIFY `generator` ENUM('template', 'llm', 'hebrew_llm') NOT NULL;

-- Data migration: legacy hebrew-script names move to the dedicated column.
-- The NameScript enum keeps 'hebrew' for old rows/exports, but no live row
-- uses it after this — the UI only writes 'latin' going forward.
UPDATE `profile`
SET `hebrew_birth_name` = `full_birth_name`,
    `full_birth_name`   = NULL,
    `name_script`       = 'latin'
WHERE `name_script` = 'hebrew' AND `full_birth_name` IS NOT NULL;
