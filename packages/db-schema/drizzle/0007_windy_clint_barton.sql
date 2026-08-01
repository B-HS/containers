CREATE TABLE `deployment_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`authentication_tag` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deployment_secret_reference_unique` ON `deployment_secret` (`reference`);--> statement-breakpoint
CREATE INDEX `deployment_secret_updated_at_idx` ON `deployment_secret` (`updated_at`);