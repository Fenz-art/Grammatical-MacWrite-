CREATE TABLE `transformation_history` (
	`id` varchar(36) NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`mode` enum('proofread','improve','natural','rewrite') NOT NULL,
	`title` varchar(180) NOT NULL,
	`inputText` mediumtext NOT NULL,
	`outputHtml` mediumtext NOT NULL,
	`outputText` mediumtext NOT NULL,
	`blockCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transformation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `transformation_history_user_created_idx` ON `transformation_history` (`userOpenId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `transformation_history_user_search_idx` ON `transformation_history` (`userOpenId`,`title`);