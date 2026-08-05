PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployment_manifest` (
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
	`runtime_json` text DEFAULT '{"capabilities":[],"profile":"hardened","writablePaths":[]}' NOT NULL,
	`network` text NOT NULL,
	`healthcheck_path` text NOT NULL,
	`healthcheck_interval_seconds` integer NOT NULL,
	`healthcheck_timeout_seconds` integer NOT NULL,
	`healthcheck_retries` integer NOT NULL,
	`healthcheck_start_period_seconds` integer NOT NULL,
	`route_hostname` text,
	`route_path` text,
	`route_strip_prefix` integer,
	`rollout_observation_seconds` integer NOT NULL,
	`rollout_rollback_retention_seconds` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_deployment_manifest`("id", "name", "version", "image_digest", "command_json", "entrypoint_json", "environment_keys_json", "secrets_json", "volumes_json", "internal_port", "protocol", "nano_cpus", "memory_bytes", "pids_limit", "restart_policy", "runtime_json", "network", "healthcheck_path", "healthcheck_interval_seconds", "healthcheck_timeout_seconds", "healthcheck_retries", "healthcheck_start_period_seconds", "route_hostname", "route_path", "route_strip_prefix", "rollout_observation_seconds", "rollout_rollback_retention_seconds", "created_by", "created_at", "updated_at") SELECT "id", "name", "version", "image_digest", "command_json", "entrypoint_json", "environment_keys_json", "secrets_json", "volumes_json", "internal_port", "protocol", "nano_cpus", "memory_bytes", "pids_limit", "restart_policy", "runtime_json", "network", "healthcheck_path", "healthcheck_interval_seconds", "healthcheck_timeout_seconds", "healthcheck_retries", "healthcheck_start_period_seconds", "route_hostname", "route_path", "route_strip_prefix", "rollout_observation_seconds", "rollout_rollback_retention_seconds", "created_by", "created_at", "updated_at" FROM `deployment_manifest`;--> statement-breakpoint
DROP TABLE `deployment_manifest`;--> statement-breakpoint
ALTER TABLE `__new_deployment_manifest` RENAME TO `deployment_manifest`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_manifest_name_version_unique` ON `deployment_manifest` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_image_digest_idx` ON `deployment_manifest` (`image_digest`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_created_at_idx` ON `deployment_manifest` (`created_at`);