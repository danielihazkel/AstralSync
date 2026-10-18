-- The vestigial name script (latin/hebrew/other), unused since the
-- two-field name split: nothing computes from it, the UI never writes it,
-- and old export files carrying it are accepted and ignored.
ALTER TABLE `profile` DROP COLUMN `name_script`;
