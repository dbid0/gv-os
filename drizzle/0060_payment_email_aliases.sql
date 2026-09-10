CREATE TABLE "app"."payment_email_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"alias_email" text NOT NULL,
	"canonical_email" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."payment_email_aliases" ADD CONSTRAINT "payment_email_aliases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_email_aliases_client_alias_key" ON "app"."payment_email_aliases" USING btree ("client_id","alias_email");--> statement-breakpoint
CREATE INDEX "payment_email_aliases_client_idx" ON "app"."payment_email_aliases" USING btree ("client_id");