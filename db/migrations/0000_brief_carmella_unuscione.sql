CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"event_index" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"players" jsonb NOT NULL,
	"rounds" jsonb NOT NULL,
	"final_scores" jsonb NOT NULL,
	"highest_bid" integer,
	"highest_score" integer,
	"lowest_score" integer,
	"most_consecutive_wins" integer,
	"most_consecutive_losses" integer,
	"highest_misplay" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_summaries_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_seed" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_lifetime_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"highest_score" integer,
	"lowest_score" integer,
	"total_points" integer DEFAULT 0 NOT NULL,
	"total_tricks_won" integer DEFAULT 0 NOT NULL,
	"most_consecutive_wins" integer DEFAULT 0 NOT NULL,
	"most_consecutive_losses" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"current_loss_streak" integer DEFAULT 0 NOT NULL,
	"total_misplays" integer DEFAULT 0 NOT NULL,
	"last_game_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_lifetime_stats_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"avatar_seed" text NOT NULL,
	"color" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "room_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"join_code" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"max_players" integer NOT NULL,
	"current_players" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_directory_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_summaries" ADD CONSTRAINT "game_summaries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_lifetime_stats" ADD CONSTRAINT "player_lifetime_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_directory" ADD CONSTRAINT "room_directory_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_events_game_id_idx" ON "game_events" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_id_event_index_idx" ON "game_events" USING btree ("game_id","event_index");--> statement-breakpoint
CREATE INDEX "game_summaries_game_id_idx" ON "game_summaries" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_created_at_idx" ON "games" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pls_last_game_idx" ON "player_lifetime_stats" USING btree ("last_game_at");--> statement-breakpoint
CREATE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");