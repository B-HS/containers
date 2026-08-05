CREATE TABLE `panel_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`public_origin` text,
	`extra_trusted_origins` text,
	`nginx_hostname` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
