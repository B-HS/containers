CREATE TABLE `artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text NOT NULL,
	`storage_path` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_sha256_unique` ON `artifact` (`sha256`);--> statement-breakpoint
CREATE INDEX `artifact_created_at_idx` ON `artifact` (`created_at`);--> statement-breakpoint
CREATE TABLE `deployment` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`container_id` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `deployment_artifact_id_idx` ON `deployment` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `deployment_created_at_idx` ON `deployment` (`created_at`);--> statement-breakpoint
CREATE TABLE `upload_chunk` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`offset_bytes` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `upload_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_chunk_session_offset_unique` ON `upload_chunk` (`session_id`,`offset_bytes`);--> statement-breakpoint
CREATE TABLE `upload_session` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`expected_sha256` text NOT NULL,
	`expected_size_bytes` integer NOT NULL,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`temporary_path` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_session_created_by_idx` ON `upload_session` (`created_by`);--> statement-breakpoint
CREATE INDEX `upload_session_expires_at_idx` ON `upload_session` (`expires_at`);