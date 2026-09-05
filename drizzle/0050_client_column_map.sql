CREATE TABLE "app"."client_column_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tab" text NOT NULL,
	"header" text NOT NULL,
	"field" text NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"reason" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."client_column_map" ADD CONSTRAINT "client_column_map_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_column_map_key" ON "app"."client_column_map" USING btree ("client_id","tab","header");--> statement-breakpoint
CREATE INDEX "client_column_map_client_idx" ON "app"."client_column_map" USING btree ("client_id");