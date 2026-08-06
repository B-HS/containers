CREATE TABLE `login_lockout` (
	`email_key` text PRIMARY KEY NOT NULL,
	`failed_count` integer NOT NULL,
	`first_failed_at` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
