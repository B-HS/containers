ALTER TABLE `operation_job` ADD `resource_key` text;--> statement-breakpoint
CREATE INDEX `operation_job_kind_resource_key_idx` ON `operation_job` (`kind`,`resource_key`);