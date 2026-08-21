CREATE TABLE "app"."settings" (
	"id" text PRIMARY KEY DEFAULT 'org' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
