-- AlterTable
ALTER TABLE `journal_entry` ADD COLUMN `mood` ENUM('very_low', 'low', 'neutral', 'high', 'very_high') NULL,
    ADD COLUMN `tags_json` JSON NULL;
