CREATE TABLE `nginx_route` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`path` text NOT NULL,
	`path_mode` text NOT NULL,
	`target_container` text NOT NULL,
	`target_port` integer NOT NULL,
	`protocol` text NOT NULL,
	`strip_prefix` integer NOT NULL,
	`timeout_seconds` integer NOT NULL,
	`body_size_megabytes` integer NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nginx_route_hostname_path_mode_unique` ON `nginx_route` (`hostname`,`path`,`path_mode`);--> statement-breakpoint
CREATE INDEX `nginx_route_hostname_idx` ON `nginx_route` (`hostname`);