PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text NOT NULL,
	`storage_path` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_artifact`("id", "file_name", "media_type", "sha256", "size_bytes", "status", "storage_path", "created_by", "created_at") SELECT "id", "file_name", "media_type", "sha256", "size_bytes", "status", "storage_path", "created_by", "created_at" FROM `artifact`;--> statement-breakpoint
DROP TABLE `artifact`;--> statement-breakpoint
ALTER TABLE `__new_artifact` RENAME TO `artifact`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_sha256_unique` ON `artifact` (`sha256`);--> statement-breakpoint
CREATE INDEX `artifact_created_at_idx` ON `artifact` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_deployment` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text,
	`container_id` text,
	`status` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment`("id", "artifact_id", "container_id", "status", "created_by", "created_at", "updated_at") SELECT "id", "artifact_id", "container_id", "status", "created_by", "created_at", "updated_at" FROM `deployment`;--> statement-breakpoint
DROP TABLE `deployment`;--> statement-breakpoint
ALTER TABLE `__new_deployment` RENAME TO `deployment`;--> statement-breakpoint
CREATE INDEX `deployment_artifact_id_idx` ON `deployment` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `deployment_created_at_idx` ON `deployment` (`created_at`);--> statement-breakpoint
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
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment_manifest`("id", "name", "version", "image_digest", "command_json", "entrypoint_json", "environment_keys_json", "secrets_json", "volumes_json", "internal_port", "protocol", "nano_cpus", "memory_bytes", "pids_limit", "restart_policy", "runtime_json", "network", "healthcheck_path", "healthcheck_interval_seconds", "healthcheck_timeout_seconds", "healthcheck_retries", "healthcheck_start_period_seconds", "route_hostname", "route_path", "route_strip_prefix", "rollout_observation_seconds", "rollout_rollback_retention_seconds", "created_by", "created_at", "updated_at") SELECT "id", "name", "version", "image_digest", "command_json", "entrypoint_json", "environment_keys_json", "secrets_json", "volumes_json", "internal_port", "protocol", "nano_cpus", "memory_bytes", "pids_limit", "restart_policy", "runtime_json", "network", "healthcheck_path", "healthcheck_interval_seconds", "healthcheck_timeout_seconds", "healthcheck_retries", "healthcheck_start_period_seconds", "route_hostname", "route_path", "route_strip_prefix", "rollout_observation_seconds", "rollout_rollback_retention_seconds", "created_by", "created_at", "updated_at" FROM `deployment_manifest`;--> statement-breakpoint
DROP TABLE `deployment_manifest`;--> statement-breakpoint
ALTER TABLE `__new_deployment_manifest` RENAME TO `deployment_manifest`;--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_manifest_name_version_unique` ON `deployment_manifest` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_image_digest_idx` ON `deployment_manifest` (`image_digest`);--> statement-breakpoint
CREATE INDEX `deployment_manifest_created_at_idx` ON `deployment_manifest` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_deployment_release` (
	`id` text PRIMARY KEY NOT NULL,
	`manifest_id` text NOT NULL,
	`previous_release_id` text,
	`container_id` text,
	`container_name` text NOT NULL,
	`nginx_route_id` text,
	`nginx_config_sha256` text,
	`status` text NOT NULL,
	`failure_code` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`activated_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`manifest_id`) REFERENCES `deployment_manifest`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment_release`("id", "manifest_id", "previous_release_id", "container_id", "container_name", "nginx_route_id", "nginx_config_sha256", "status", "failure_code", "created_by", "created_at", "updated_at", "activated_at", "finished_at") SELECT "id", "manifest_id", "previous_release_id", "container_id", "container_name", "nginx_route_id", "nginx_config_sha256", "status", "failure_code", "created_by", "created_at", "updated_at", "activated_at", "finished_at" FROM `deployment_release`;--> statement-breakpoint
DROP TABLE `deployment_release`;--> statement-breakpoint
ALTER TABLE `__new_deployment_release` RENAME TO `deployment_release`;--> statement-breakpoint
CREATE INDEX `deployment_release_manifest_id_idx` ON `deployment_release` (`manifest_id`);--> statement-breakpoint
CREATE INDEX `deployment_release_status_idx` ON `deployment_release` (`status`);--> statement-breakpoint
CREATE INDEX `deployment_release_created_at_idx` ON `deployment_release` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_deployment_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`authentication_tag` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment_secret`("id", "reference", "ciphertext", "initialization_vector", "authentication_tag", "key_version", "version", "created_by", "created_at", "updated_at") SELECT "id", "reference", "ciphertext", "initialization_vector", "authentication_tag", "key_version", "version", "created_by", "created_at", "updated_at" FROM `deployment_secret`;--> statement-breakpoint
DROP TABLE `deployment_secret`;--> statement-breakpoint
ALTER TABLE `__new_deployment_secret` RENAME TO `deployment_secret`;--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_secret_reference_unique` ON `deployment_secret` (`reference`);--> statement-breakpoint
CREATE INDEX `deployment_secret_updated_at_idx` ON `deployment_secret` (`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_deployment_stack` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest_ids_json` text NOT NULL,
	`service_order_json` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment_stack`("id", "name", "version", "manifest_ids_json", "service_order_json", "created_by", "created_at", "updated_at") SELECT "id", "name", "version", "manifest_ids_json", "service_order_json", "created_by", "created_at", "updated_at" FROM `deployment_stack`;--> statement-breakpoint
DROP TABLE `deployment_stack`;--> statement-breakpoint
ALTER TABLE `__new_deployment_stack` RENAME TO `deployment_stack`;--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_stack_name_version_unique` ON `deployment_stack` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `deployment_stack_created_at_idx` ON `deployment_stack` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_deployment_stack_release` (
	`id` text PRIMARY KEY NOT NULL,
	`stack_id` text NOT NULL,
	`release_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`failure_code` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`stack_id`) REFERENCES `deployment_stack`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_deployment_stack_release`("id", "stack_id", "release_ids_json", "status", "failure_code", "created_by", "created_at", "updated_at", "finished_at") SELECT "id", "stack_id", "release_ids_json", "status", "failure_code", "created_by", "created_at", "updated_at", "finished_at" FROM `deployment_stack_release`;--> statement-breakpoint
DROP TABLE `deployment_stack_release`;--> statement-breakpoint
ALTER TABLE `__new_deployment_stack_release` RENAME TO `deployment_stack_release`;--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_stack_release_active_unique` ON `deployment_stack_release` (`stack_id`) WHERE "deployment_stack_release"."status" = 'releasing';--> statement-breakpoint
CREATE INDEX `deployment_stack_release_stack_id_idx` ON `deployment_stack_release` (`stack_id`);--> statement-breakpoint
CREATE INDEX `deployment_stack_release_created_at_idx` ON `deployment_stack_release` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_notification_destination` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`authentication_tag` text NOT NULL,
	`enabled` integer NOT NULL,
	`event_types` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_notification_destination`("id", "name", "type", "ciphertext", "initialization_vector", "authentication_tag", "enabled", "event_types", "key_version", "version", "created_by", "created_at", "updated_at") SELECT "id", "name", "type", "ciphertext", "initialization_vector", "authentication_tag", "enabled", "event_types", "key_version", "version", "created_by", "created_at", "updated_at" FROM `notification_destination`;--> statement-breakpoint
DROP TABLE `notification_destination`;--> statement-breakpoint
ALTER TABLE `__new_notification_destination` RENAME TO `notification_destination`;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_destination_name_unique` ON `notification_destination` (`name`);--> statement-breakpoint
CREATE INDEX `notification_destination_updated_at_idx` ON `notification_destination` (`updated_at`);