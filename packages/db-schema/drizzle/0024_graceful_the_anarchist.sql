ALTER TABLE `audit_log` ADD `sequence` integer;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `previous_hash` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `entry_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `audit_sequence_unique` ON `audit_log` (`sequence`);