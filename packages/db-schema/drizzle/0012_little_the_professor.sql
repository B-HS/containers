CREATE TABLE `maintenance_state` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`reason` text,
	`actor_id` text,
	`job_id` text,
	`started_at` integer,
	`updated_at` integer NOT NULL
);
