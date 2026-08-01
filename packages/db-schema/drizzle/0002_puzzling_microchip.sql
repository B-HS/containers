CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_token_hash_unique` ON `api_key` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_key_created_by_idx` ON `api_key` (`created_by`);--> statement-breakpoint
CREATE INDEX `api_key_prefix_idx` ON `api_key` (`prefix`);--> statement-breakpoint
ALTER TABLE `upload_session` ADD `idempotency_key` text;--> statement-breakpoint
UPDATE `upload_session` SET `idempotency_key` = 'legacy-' || `id` WHERE `idempotency_key` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `upload_session_actor_idempotency_unique` ON `upload_session` (`created_by`,`idempotency_key`);
