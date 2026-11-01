CREATE TABLE "committee_approvers" (
	"committee_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committee_approvers_committee_id_user_id_pk" PRIMARY KEY("committee_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "committee_approvers" ADD CONSTRAINT "committee_approvers_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "committee_approvers" ADD CONSTRAINT "committee_approvers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "committee_approvers" ADD CONSTRAINT "committee_approvers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "committee_approvers_user_idx" ON "committee_approvers" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_presence_seen_idx" ON "user_presence" USING btree ("last_seen_at");
