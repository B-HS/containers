ALTER TABLE `deployment_secret` ADD `key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_destination` ADD `key_version` integer DEFAULT 1 NOT NULL;