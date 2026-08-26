CREATE TABLE "app"."meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'agency_call' NOT NULL,
	"source_ref" text,
	"meeting_date" date NOT NULL,
	"summary" text,
	"transcript" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doc_link" text,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."meeting_notes" ADD CONSTRAINT "meeting_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_notes_source_ref_idx" ON "app"."meeting_notes" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "meeting_notes_date_idx" ON "app"."meeting_notes" USING btree ("meeting_date");--> statement-breakpoint
CREATE INDEX "meeting_notes_client_idx" ON "app"."meeting_notes" USING btree ("client_id");