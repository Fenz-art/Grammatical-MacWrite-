CREATE TABLE `provider_circuit_states` (
	`providerKey` varchar(96) NOT NULL,
	`consecutiveFailures` int NOT NULL DEFAULT 0,
	`openUntil` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `provider_circuit_states_providerKey` PRIMARY KEY(`providerKey`)
);
--> statement-breakpoint
CREATE TABLE `provider_spend_windows` (
	`dayStart` timestamp NOT NULL,
	`reservedTokens` int NOT NULL DEFAULT 0,
	`requestCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `provider_spend_windows_dayStart` PRIMARY KEY(`dayStart`)
);
--> statement-breakpoint
CREATE TABLE `transform_concurrency_leases` (
	`requestId` varchar(120) NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`acquiredAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `transform_concurrency_leases_requestId` PRIMARY KEY(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `transform_control_locks` (
	`id` varchar(32) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transform_control_locks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `transform_control_locks` (`id`) VALUES ('global');
--> statement-breakpoint
CREATE TABLE `transform_metric_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`at` timestamp NOT NULL,
	`elapsedMs` int NOT NULL,
	`queueWaitMs` int NOT NULL DEFAULT 0,
	`mode` enum('proofread','improve','natural','rewrite') NOT NULL,
	`intensity` enum('low','standard','high') NOT NULL,
	`outcome` enum('accepted','rejected','error','cancelled') NOT NULL,
	`providerFailure` boolean NOT NULL DEFAULT false,
	`failureCode` varchar(64),
	CONSTRAINT `transform_metric_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transform_usage_windows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`windowType` enum('minute','day') NOT NULL,
	`windowStart` timestamp NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transform_usage_windows_id` PRIMARY KEY(`id`),
	CONSTRAINT `transform_usage_user_window_unique` UNIQUE(`userOpenId`,`windowType`,`windowStart`)
);
--> statement-breakpoint
CREATE INDEX `transform_concurrency_active_idx` ON `transform_concurrency_leases` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `transform_concurrency_user_idx` ON `transform_concurrency_leases` (`userOpenId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `transform_metric_event_time_idx` ON `transform_metric_events` (`at`);--> statement-breakpoint
CREATE INDEX `transform_metric_outcome_time_idx` ON `transform_metric_events` (`outcome`,`at`);--> statement-breakpoint
CREATE INDEX `transform_usage_window_expiry_idx` ON `transform_usage_windows` (`windowType`,`windowStart`);
