CREATE TABLE `__new_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`type` text NOT NULL,
	`state` text NOT NULL,
	`team_id` text NOT NULL,
	`epic_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`modified_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tickets` (
	`id`,
	`title`,
	`body`,
	`type`,
	`state`,
	`team_id`,
	`epic_id`,
	`created_by`,
	`created_at`,
	`modified_at`
)
SELECT
	`tickets`.`id`,
	'Untitled Ticket',
	'',
	'task',
	'backlog',
	`tickets`.`team_id`,
	`tickets`.`epic_id`,
	`users`.`id`,
	'1970-01-01T00:00:00.000Z',
	'1970-01-01T00:00:00.000Z'
FROM `tickets`
INNER JOIN `users`
	ON `users`.`id` = (
		SELECT `id`
		FROM `users`
		ORDER BY `created_at`, `id`
		LIMIT 1
	);
--> statement-breakpoint
DROP TABLE `tickets`;
--> statement-breakpoint
ALTER TABLE `__new_tickets` RENAME TO `tickets`;
