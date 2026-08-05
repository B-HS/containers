CREATE TABLE `trusted_proxy` (
	`address` text PRIMARY KEY NOT NULL,
	`hostname` text,
	`note` text,
	`approved_by` text,
	`approved_at` integer NOT NULL,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
