CREATE TABLE "app"."mcp_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{read}'::text[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mcp_api_keys_scopes_check" CHECK ("app"."mcp_api_keys"."scopes" <@ '{read}'::text[]),
	CONSTRAINT "mcp_api_keys_name_check" CHECK (length(trim("app"."mcp_api_keys"."name")) between 1 and 60),
	CONSTRAINT "mcp_api_keys_hash_check" CHECK ("app"."mcp_api_keys"."key_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_api_keys_hash_key" ON "app"."mcp_api_keys" USING btree ("key_hash");