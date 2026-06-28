CREATE TABLE `__new_epics` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_epics` (`id`, `team_id`, `title`, `description`, `created_at`, `updated_at`)
SELECT `id`, `team_id`, 'Untitled Epic', NULL, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM `epics`;
--> statement-breakpoint
DROP TABLE `epics`;
--> statement-breakpoint
ALTER TABLE `__new_epics` RENAME TO `epics`;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `epic_id` text REFERENCES epics(id);
