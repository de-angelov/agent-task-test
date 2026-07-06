CREATE TABLE `ticket_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action_type` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
