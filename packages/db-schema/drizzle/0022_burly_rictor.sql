PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployment` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text,
	`container_id` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_deployment`("id", "artifact_id", "container_id", "status", "created_by", "created_at", "updated_at") SELECT "id", "artifact_id", "container_id", "status", "created_by", "created_at", "updated_at" FROM `deployment`;--> statement-breakpoint
DROP TABLE `deployment`;--> statement-breakpoint
ALTER TABLE `__new_deployment` RENAME TO `deployment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `deployment_artifact_id_idx` ON `deployment` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `deployment_created_at_idx` ON `deployment` (`created_at`);