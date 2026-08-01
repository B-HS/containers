CREATE TABLE `deployment_release` (
	`id` text PRIMARY KEY NOT NULL,
	`manifest_id` text NOT NULL,
	`previous_release_id` text,
	`container_id` text,
	`container_name` text NOT NULL,
	`nginx_route_id` text,
	`nginx_config_sha256` text,
	`status` text NOT NULL,
	`failure_code` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`activated_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`manifest_id`) REFERENCES `deployment_manifest`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `deployment_release_manifest_id_idx` ON `deployment_release` (`manifest_id`);--> statement-breakpoint
CREATE INDEX `deployment_release_status_idx` ON `deployment_release` (`status`);--> statement-breakpoint
CREATE INDEX `deployment_release_created_at_idx` ON `deployment_release` (`created_at`);