CREATE TABLE "approval_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "approval_status" CHECK ("approval_instances"."status" in ('pending','approved','rejected','changes_requested','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"approver_id" text NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "step_decision" CHECK ("approval_steps"."decision" in ('pending','approved','rejected','changes_requested','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "work_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"file_id" text NOT NULL,
	CONSTRAINT "work_attachments_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "work_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"decided_by" text NOT NULL,
	"decision_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "due_deliveries" (
	"work_id" text NOT NULL,
	"user_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "due_deliveries_work_id_user_id_due_at_pk" PRIMARY KEY("work_id","user_id","due_at")
);
--> statement-breakpoint
CREATE TABLE "file_contents" (
	"file_id" text PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"classification" text DEFAULT 'restricted' NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_size" CHECK ("files"."size">0 AND "files"."size"<=5242880)
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"agenda" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"receiving_committee_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" text NOT NULL,
	"blocker_id" text NOT NULL,
	CONSTRAINT "task_dependencies_task_id_blocker_id_pk" PRIMARY KEY("task_id","blocker_id"),
	CONSTRAINT "no_self_dependency" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."blocker_id")
);
--> statement-breakpoint
CREATE TABLE "task_sources" (
	"task_id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"decision_id" text,
	CONSTRAINT "one_task_source" CHECK (("task_sources"."request_id" IS NOT NULL AND "task_sources"."decision_id" IS NULL) OR ("task_sources"."request_id" IS NULL AND "task_sources"."decision_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_progress" CHECK ("tasks"."progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "work_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"response" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "work_assignment_role" CHECK ("work_assignments"."role" in ('responsible','participant','reviewer','attendee')),
	CONSTRAINT "invitation_response" CHECK ("work_assignments"."response" in ('pending','accepted','declined'))
);
--> statement-breakpoint
CREATE TABLE "work_events" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"created_by" text NOT NULL,
	"committee_id" text,
	"term_id" text NOT NULL,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_kind" CHECK ("work_items"."kind" in ('task','request','meeting','decision')),
	CONSTRAINT "work_priority" CHECK ("work_items"."priority" in ('low','medium','high','urgent')),
	CONSTRAINT "work_dates" CHECK ("work_items"."start_at" IS NULL OR "work_items"."due_at" IS NULL OR "work_items"."due_at" >= "work_items"."start_at"),
	CONSTRAINT "work_state" CHECK (("work_items"."kind"='task' AND "work_items"."status" in ('not_started','in_progress','review','completed','cancelled')) OR ("work_items"."kind"='request' AND "work_items"."status" in ('new','received','in_progress','review','completed','rejected','cancelled')) OR ("work_items"."kind"='meeting' AND "work_items"."status" in ('scheduled','held','cancelled')) OR ("work_items"."kind"='decision' AND "work_items"."status" in ('recorded','revoked')))
);
--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_instance_id_approval_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."approval_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_comments" ADD CONSTRAINT "work_comments_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_comments" ADD CONSTRAINT "work_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_id_work_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_deliveries" ADD CONSTRAINT "due_deliveries_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_deliveries" ADD CONSTRAINT "due_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_contents" ADD CONSTRAINT "file_contents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_id_work_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_mentions" ADD CONSTRAINT "work_mentions_comment_id_work_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."work_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_mentions" ADD CONSTRAINT "work_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_id_work_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_receiving_committee_id_committees_id_fk" FOREIGN KEY ("receiving_committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocker_id_tasks_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sources" ADD CONSTRAINT "task_sources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sources" ADD CONSTRAINT "task_sources_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sources" ADD CONSTRAINT "task_sources_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_work_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_assignments" ADD CONSTRAINT "work_assignments_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_assignments" ADD CONSTRAINT "work_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_events" ADD CONSTRAINT "work_events_work_id_work_items_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_events" ADD CONSTRAINT "work_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_approval" ON "approval_instances" USING btree ("work_id") WHERE "approval_instances"."status"='pending';--> statement-breakpoint
CREATE UNIQUE INDEX "approval_step_position" ON "approval_steps" USING btree ("instance_id","position");--> statement-breakpoint
CREATE INDEX "comments_work_idx" ON "work_comments" USING btree ("work_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_once" ON "work_mentions" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_person_role" ON "work_assignments" USING btree ("work_id","user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "work_single_lead_reviewer" ON "work_assignments" USING btree ("work_id","role") WHERE "work_assignments"."role" in ('responsible','reviewer');--> statement-breakpoint
CREATE INDEX "work_context_idx" ON "work_items" USING btree ("committee_id","term_id","kind");--> statement-breakpoint
CREATE INDEX "work_due_idx" ON "work_items" USING btree ("due_at");