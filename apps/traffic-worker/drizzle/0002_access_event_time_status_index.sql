DROP INDEX IF EXISTS `access_event_status_idx`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_event_occurred_at_status_idx` ON `access_event` (`occurred_at`,`status`);
