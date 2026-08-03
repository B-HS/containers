CREATE TABLE `notification_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`job_id` text,
	`source_job_id` text NOT NULL,
	`event_type` text NOT NULL,
	`failure_code` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `notification_destination`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `operation_job`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_source_unique` ON `notification_delivery` (`destination_id`,`source_job_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `notification_delivery_destination_id_idx` ON `notification_delivery` (`destination_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_created_at_idx` ON `notification_delivery` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_destination` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`authentication_tag` text NOT NULL,
	`enabled` integer NOT NULL,
	`event_types` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_destination_name_unique` ON `notification_destination` (`name`);--> statement-breakpoint
CREATE INDEX `notification_destination_updated_at_idx` ON `notification_destination` (`updated_at`);