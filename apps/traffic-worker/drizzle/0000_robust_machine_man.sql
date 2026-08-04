CREATE TABLE IF NOT EXISTS `access_event` (
	`request_id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`client_ip` text NOT NULL,
	`host` text NOT NULL,
	`method` text NOT NULL,
	`uri_path` text NOT NULL,
	`status` integer NOT NULL,
	`request_time_ms` real NOT NULL,
	`bytes_sent` integer NOT NULL,
	`country` text NOT NULL,
	`user_agent` text NOT NULL,
	`raw_json` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_event_occurred_at_idx` ON `access_event` (`occurred_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_event_status_idx` ON `access_event` (`status`);