CREATE TABLE `audit_chain_anchor` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`sequence` integer NOT NULL,
	`updated_at` integer NOT NULL
);
