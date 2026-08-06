CREATE TABLE `deployment_stack` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest_ids_json` text NOT NULL,
	`service_order_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_stack_name_version_unique` ON `deployment_stack` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `deployment_stack_created_at_idx` ON `deployment_stack` (`created_at`);--> statement-breakpoint
CREATE TABLE `deployment_stack_release` (
	`id` text PRIMARY KEY NOT NULL,
	`stack_id` text NOT NULL,
	`release_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`failure_code` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`stack_id`) REFERENCES `deployment_stack`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_stack_release_active_unique` ON `deployment_stack_release` (`stack_id`) WHERE "deployment_stack_release"."status" = 'releasing';--> statement-breakpoint
CREATE INDEX `deployment_stack_release_stack_id_idx` ON `deployment_stack_release` (`stack_id`);--> statement-breakpoint
CREATE INDEX `deployment_stack_release_created_at_idx` ON `deployment_stack_release` (`created_at`);