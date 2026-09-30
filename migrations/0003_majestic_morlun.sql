CREATE TABLE "event_attendance" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"check_in_at" timestamp with time zone,
	"recorded_by" text NOT NULL,
	"source" text NOT NULL,
	"check_in_session_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_status" CHECK ("event_attendance"."status" in ('registered','present','absent','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "event_files" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"file_id" text NOT NULL,
	"category" text NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	CONSTRAINT "event_files_file_id_unique" UNIQUE("file_id"),
	CONSTRAINT "event_file_visibility" CHECK ("event_files"."visibility" in ('team','participants','budget'))
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"university_id" text,
	"major" text,
	"registration_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qr_token_hash" text,
	CONSTRAINT "event_participants_qr_token_hash_unique" UNIQUE("qr_token_hash")
);
--> statement-breakpoint
CREATE TABLE "event_playbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reports" (
	"event_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"objectives" text NOT NULL,
	"execution" text NOT NULL,
	"results" text NOT NULL,
	"challenges" text NOT NULL,
	"recommendations" text NOT NULL,
	"evaluation" text NOT NULL,
	"lessons" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_report_status" CHECK ("event_reports"."status" in ('draft','pending','approved','changes_requested','rejected'))
);
--> statement-breakpoint
CREATE TABLE "event_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"owner_id" text NOT NULL,
	"due_at" timestamp with time zone,
	"evidence" text DEFAULT '' NOT NULL,
	"gate" text DEFAULT 'ready' NOT NULL,
	CONSTRAINT "readiness_status" CHECK ("event_requirements"."status" in ('pending','completed')),
	CONSTRAINT "readiness_gate" CHECK ("event_requirements"."gate" in ('pending_approval','registration_open','ready','final_report','archived'))
);
--> statement-breakpoint
CREATE TABLE "event_risks" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"probability" integer NOT NULL,
	"impact" integer NOT NULL,
	"owner_id" text NOT NULL,
	"mitigation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	CONSTRAINT "risk_scale" CHECK ("event_risks"."probability" between 1 and 3 AND "event_risks"."impact" between 1 and 3),
	CONSTRAINT "risk_status" CHECK ("event_risks"."status" in ('open','mitigating','closed'))
);
--> statement-breakpoint
CREATE TABLE "event_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_team" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"committee_id" text,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	CONSTRAINT "event_team_dates" CHECK ("event_team"."end_at" IS NULL OR "event_team"."end_at">"event_team"."start_at")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"lead_id" text NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location_type" text NOT NULL,
	"location_text" text DEFAULT '' NOT NULL,
	"meeting_url" text,
	"target_audience" text NOT NULL,
	"capacity" integer,
	"registration_url" text,
	"planned_budget" integer,
	"approved_budget" integer,
	"actual_spend" integer,
	"approver_id" text NOT NULL,
	"report_required" boolean DEFAULT true NOT NULL,
	"playbook_id" text,
	"playbook_version" integer,
	CONSTRAINT "event_capacity" CHECK ("events"."capacity" IS NULL OR "events"."capacity">0),
	CONSTRAINT "event_budgets" CHECK (coalesce("events"."planned_budget",0)>=0 AND coalesce("events"."approved_budget",0)>=0 AND coalesce("events"."actual_spend",0)>=0),
	CONSTRAINT "event_location" CHECK ("events"."location_type" in ('onsite','online','hybrid'))
);
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_kind";--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_state";--> statement-breakpoint
ALTER TABLE "approval_instances" ADD COLUMN "purpose" text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "track" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_files" ADD CONSTRAINT "event_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_requirements" ADD CONSTRAINT "event_requirements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_requirements" ADD CONSTRAINT "event_requirements_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_risks" ADD CONSTRAINT "event_risks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_risks" ADD CONSTRAINT "event_risks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_role_id_event_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."event_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_id_work_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_playbook_id_event_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."event_playbooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participant_event_email" ON "event_participants" USING btree ("event_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_event_university" ON "event_participants" USING btree ("event_id","university_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_team_role" ON "event_team" USING btree ("event_id","user_id","role_id");--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_kind" CHECK ("work_items"."kind" in ('task','request','meeting','decision','event'));--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_state" CHECK (("work_items"."kind"='task' AND "work_items"."status" in ('not_started','in_progress','review','completed','cancelled')) OR ("work_items"."kind"='request' AND "work_items"."status" in ('new','received','in_progress','review','completed','rejected','cancelled')) OR ("work_items"."kind"='meeting' AND "work_items"."status" in ('scheduled','held','cancelled')) OR ("work_items"."kind"='decision' AND "work_items"."status" in ('recorded','revoked')) OR ("work_items"."kind"='event' AND "work_items"."status" in ('idea','planning','pending_approval','approved','registration_open','preparing','ready','running','evaluation','final_report','archived','cancelled')));