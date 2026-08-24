CREATE TABLE "app"."ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"face" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"question_id" text,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ai_conversations" ADD CONSTRAINT "ai_conversations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_profile_idx" ON "app"."ai_conversations" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_face_idx" ON "app"."ai_conversations" USING btree ("face");--> statement-breakpoint
CREATE INDEX "ai_conversations_created_idx" ON "app"."ai_conversations" USING btree ("created_at");