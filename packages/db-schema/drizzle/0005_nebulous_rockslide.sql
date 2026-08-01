CREATE TABLE `deployment_manifest` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`image_digest` text NOT NULL,
	`command_json` text NOT NULL,
	`entrypoint_json` text NOT NULL,
	`environment_keys_json` text NOT NULL,
	`secrets_json` text NOT NULL,
	`volumes_json` text NOT NULL,
	`internal_port` integer NOT NULL,
	`protocol` text NOT NULL,
	`nano_cpus` integer NOT NULL,
	`memory_bytes` integer NOT NULL,
	`pids_limit` integer NOT NULL,
	`restart_policy` text NOT NULL,
	`network` text NOT NULL,
	`healthcheck_path` text NOT NULL,
	`healthcheck_interval_seconds` integer NOT NULL,
	`healthcheck_timeout_seconds` integer NOT NULL,
	`healthcheck_retries` integer NOT NULL,
	`healthcheck_start_period_seconds` integer NOT NULL,
	`route_hostname` text NOT NULL,
	`route_path` text NOT NULL,
	`route_strip_prefix` integer NOT NULL,
	`rollout_observation_seconds` integer NOT NULL,
	`rollout_rollback_retention_seconds` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_manifest_name_version_unique` ON `deployment_manifest` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_image_digest_idx` ON `deployment_manifest` (`image_digest`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_created_at_idx` ON `deployment_manifest` (`created_at`);