CREATE TABLE "app"."payment_tag_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"match_field" text NOT NULL,
	"match_op" text NOT NULL,
	"match_value" text NOT NULL,
	"counts_as_revenue" boolean DEFAULT true NOT NULL,
	"counts_as_optin" boolean DEFAULT false NOT NULL,
	"exclude" boolean DEFAULT false NOT NULL,
	"exclude_from_aov" boolean DEFAULT false NOT NULL,
	"hide_from_dashboard" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_tag_rules_field_check" CHECK ("app"."payment_tag_rules"."match_field" in ('label', 'email', 'provider', 'kind', 'amount_cents')),
	CONSTRAINT "payment_tag_rules_op_check" CHECK ("app"."payment_tag_rules"."match_op" in ('equals', 'contains', 'starts_with', 'ends_with', 'amount_eq', 'amount_gte', 'amount_lte')),
	CONSTRAINT "payment_tag_rules_op_fits_field_check" CHECK (("app"."payment_tag_rules"."match_field" = 'amount_cents') = ("app"."payment_tag_rules"."match_op" in ('amount_eq', 'amount_gte', 'amount_lte'))),
	CONSTRAINT "payment_tag_rules_tag_check" CHECK (length(trim("app"."payment_tag_rules"."tag")) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "app"."payment_tag_rules" ADD CONSTRAINT "payment_tag_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_tag_rules_client_idx" ON "app"."payment_tag_rules" USING btree ("client_id","sort_order");