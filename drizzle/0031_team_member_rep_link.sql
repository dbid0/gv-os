ALTER TABLE "app"."team_members" ADD COLUMN "rep_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_members_rep_idx" ON "app"."team_members" USING btree ("rep_id");