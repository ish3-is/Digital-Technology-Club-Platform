CREATE TABLE "official_club_roster" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_key" text NOT NULL,
	"committee_id" text,
	"position" text DEFAULT 'member' NOT NULL,
	"source_label" text DEFAULT 'سجل أعضاء النادي' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"claimed_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_access_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roster_id" text NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"email" text NOT NULL,
	"group_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text DEFAULT '' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_access_request_status" CHECK ("account_access_requests"."status" in ('pending','approved','rejected','provisioned'))
);
--> statement-breakpoint
ALTER TABLE "official_club_roster" ADD CONSTRAINT "official_club_roster_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "official_club_roster" ADD CONSTRAINT "official_club_roster_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_access_requests" ADD CONSTRAINT "account_access_requests_roster_id_official_club_roster_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."official_club_roster"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_access_requests" ADD CONSTRAINT "account_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "official_roster_group_idx" ON "official_club_roster" USING btree ("group_key");
--> statement-breakpoint
CREATE INDEX "official_roster_name_idx" ON "official_club_roster" USING btree ("normalized_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "official_roster_claimed_user_idx" ON "official_club_roster" USING btree ("claimed_user_id") WHERE "official_club_roster"."claimed_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "account_access_request_status_idx" ON "account_access_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_access_request_email_pending" ON "account_access_requests" USING btree ("email") WHERE "account_access_requests"."status" = 'pending';
