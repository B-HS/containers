CREATE INDEX IF NOT EXISTS `audit_operation_created_at_idx` ON `audit_log` (`operation`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_target_type_created_at_idx` ON `audit_log` (`target_type`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_target_id_idx` ON `audit_log` (`target_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_result_created_at_idx` ON `audit_log` (`result`,`created_at`);
