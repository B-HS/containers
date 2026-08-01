CREATE TABLE `operation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`result` text,
	`failure_code` text,
	`attempt` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`progress_step` text,
	`created_by` text,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`heartbeat_at` integer,
	`cancel_requested_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `operation_job_status_scheduled_at_idx` ON `operation_job` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `operation_job_kind_idx` ON `operation_job` (`kind`);--> statement-breakpoint
CREATE INDEX `operation_job_created_at_idx` ON `operation_job` (`created_at`);--> statement-breakpoint
CREATE TABLE `operation_job_event` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `operation_job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `operation_job_event_job_id_idx` ON `operation_job_event` (`job_id`);--> statement-breakpoint
CREATE INDEX `operation_job_event_created_at_idx` ON `operation_job_event` (`created_at`);