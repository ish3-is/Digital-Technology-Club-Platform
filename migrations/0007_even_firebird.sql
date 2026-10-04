CREATE TABLE "operation_asset_incidents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" text NOT NULL,
	"reported_by_id" text NOT NULL,
	"kind" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"responsible_user_id" text,
	"evidence_file_id" text,
	"resolution" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_kind" CHECK ("operation_asset_incidents"."kind" in ('damaged','missing','maintenance','unavailable')),
	CONSTRAINT "incident_status" CHECK ("operation_asset_incidents"."status" in ('open','resolved'))
);
--> statement-breakpoint
CREATE TABLE "operation_asset_reservations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"purpose" text NOT NULL,
	"event_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"approver_id" text,
	"approved_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"condition_before" text DEFAULT '' NOT NULL,
	"condition_after" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_status" CHECK ("operation_asset_reservations"."status" in ('requested','approved','checked_out','returned','rejected','cancelled')),
	CONSTRAINT "reservation_dates" CHECK ("operation_asset_reservations"."ends_at" > "operation_asset_reservations"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "operation_assets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"asset_code" text,
	"committee_id" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"custodian_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_condition" CHECK ("operation_assets"."condition" in ('new','good','fair','damaged','maintenance')),
	CONSTRAINT "asset_availability" CHECK ("operation_assets"."availability" in ('available','reserved','checked_out','unavailable'))
);
--> statement-breakpoint
CREATE TABLE "operation_budgets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"academic_term_id" text NOT NULL,
	"committee_id" text,
	"event_id" text,
	"initiative_id" text,
	"allocated_amount" integer NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone,
	"alert_threshold_percent" integer DEFAULT 80 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_amount_positive" CHECK ("operation_budgets"."allocated_amount" > 0),
	CONSTRAINT "budget_dates" CHECK ("operation_budgets"."ends_on" IS NULL OR "operation_budgets"."ends_on" >= "operation_budgets"."starts_on"),
	CONSTRAINT "budget_threshold" CHECK ("operation_budgets"."alert_threshold_percent" between 1 and 100),
	CONSTRAINT "budget_status" CHECK ("operation_budgets"."status" in ('active','closed','archived'))
);
--> statement-breakpoint
CREATE TABLE "operation_certificate_batches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"template_ref" text DEFAULT '' NOT NULL,
	"issuer_id" text NOT NULL,
	"event_id" text,
	"issued_on" timestamp with time zone NOT NULL,
	"participant_source" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_status" CHECK ("operation_certificate_batches"."status" in ('draft','generating','generated','sent','partial','archived')),
	CONSTRAINT "certificate_counts" CHECK ("operation_certificate_batches"."generated_count" >= 0 AND "operation_certificate_batches"."sent_count" >= 0 AND "operation_certificate_batches"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operation_digital_forms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"owner_user_id" text NOT NULL,
	"committee_id" text,
	"provider" text DEFAULT '' NOT NULL,
	"url" text,
	"event_id" text,
	"form_type" text DEFAULT 'registration' NOT NULL,
	"opens_on" timestamp with time zone,
	"closes_on" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"response_count" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_form_status" CHECK ("operation_digital_forms"."status" in ('planned','active','closed','archived')),
	CONSTRAINT "digital_form_responses" CHECK ("operation_digital_forms"."response_count" IS NULL OR "operation_digital_forms"."response_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operation_digital_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requested_by_id" text NOT NULL,
	"committee_id" text,
	"event_id" text,
	"work_request_id" text,
	"service_type" text NOT NULL,
	"deadline" timestamp with time zone,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assignee_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"result_url" text,
	"result_form_id" text,
	"result_certificate_batch_id" text,
	"academic_term_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_request_status" CHECK ("operation_digital_requests"."status" in ('new','received','in_progress','waiting_input','in_review','completed','rejected','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "operation_expense_decisions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_expense_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requester_id" text NOT NULL,
	"committee_id" text,
	"budget_id" text,
	"event_id" text,
	"work_request_id" text,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"needed_by" timestamp with time zone,
	"justification" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"academic_term_id" text NOT NULL,
	"reviewed_by" text,
	"approved_by" text,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_positive" CHECK ("operation_expense_requests"."amount" > 0),
	CONSTRAINT "expense_status" CHECK ("operation_expense_requests"."status" in ('draft','submitted','finance_review','changes_requested','approved','rejected','purchased','reconciled','cancelled','archived'))
);
--> statement-breakpoint
CREATE TABLE "operation_media_decisions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_request_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_media_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requested_by_id" text NOT NULL,
	"committee_id" text,
	"event_id" text,
	"work_request_id" text,
	"media_type" text NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"deadline" timestamp with time zone,
	"specs" text DEFAULT '' NOT NULL,
	"copy_text" text DEFAULT '' NOT NULL,
	"references" text DEFAULT '' NOT NULL,
	"assignee_id" text,
	"reviewer_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"academic_term_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_status" CHECK ("operation_media_requests"."status" in ('new','accepted','in_production','in_review','changes_requested','approved','scheduled','published','completed','rejected','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "operation_media_revisions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_request_id" text NOT NULL,
	"revision" integer NOT NULL,
	"file_id" text,
	"note" text DEFAULT '' NOT NULL,
	"submitted_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"domain" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"committee_id" text,
	"event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_domain" CHECK ("operation_events"."domain" in ('finance','media','digital','resource'))
);
--> statement-breakpoint
CREATE TABLE "operation_purchases" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" text NOT NULL,
	"vendor" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"amount" integer NOT NULL,
	"paid_by_id" text NOT NULL,
	"receipt_file_id" text,
	"invoice_file_id" text,
	"budget_id" text,
	"reconciliation_status" text DEFAULT 'pending' NOT NULL,
	"reconciliation_notes" text DEFAULT '' NOT NULL,
	"reconciled_by" text,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_amount_positive" CHECK ("operation_purchases"."amount" > 0),
	CONSTRAINT "purchase_reconciliation" CHECK ("operation_purchases"."reconciliation_status" in ('pending','reconciled'))
);
--> statement-breakpoint
ALTER TABLE "operation_asset_incidents" ADD CONSTRAINT "operation_asset_incidents_asset_id_operation_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."operation_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_incidents" ADD CONSTRAINT "operation_asset_incidents_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_incidents" ADD CONSTRAINT "operation_asset_incidents_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_incidents" ADD CONSTRAINT "operation_asset_incidents_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_reservations" ADD CONSTRAINT "operation_asset_reservations_asset_id_operation_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."operation_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_reservations" ADD CONSTRAINT "operation_asset_reservations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_reservations" ADD CONSTRAINT "operation_asset_reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_asset_reservations" ADD CONSTRAINT "operation_asset_reservations_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_assets" ADD CONSTRAINT "operation_assets_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_assets" ADD CONSTRAINT "operation_assets_custodian_id_users_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_budgets" ADD CONSTRAINT "operation_budgets_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_budgets" ADD CONSTRAINT "operation_budgets_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_budgets" ADD CONSTRAINT "operation_budgets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_budgets" ADD CONSTRAINT "operation_budgets_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_budgets" ADD CONSTRAINT "operation_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_certificate_batches" ADD CONSTRAINT "operation_certificate_batches_issuer_id_users_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_certificate_batches" ADD CONSTRAINT "operation_certificate_batches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_forms" ADD CONSTRAINT "operation_digital_forms_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_forms" ADD CONSTRAINT "operation_digital_forms_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_forms" ADD CONSTRAINT "operation_digital_forms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_work_request_id_requests_id_fk" FOREIGN KEY ("work_request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_result_form_id_operation_digital_forms_id_fk" FOREIGN KEY ("result_form_id") REFERENCES "public"."operation_digital_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_result_certificate_batch_id_operation_certificate_batches_id_fk" FOREIGN KEY ("result_certificate_batch_id") REFERENCES "public"."operation_certificate_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_digital_requests" ADD CONSTRAINT "operation_digital_requests_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_decisions" ADD CONSTRAINT "operation_expense_decisions_expense_id_operation_expense_requests_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."operation_expense_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_decisions" ADD CONSTRAINT "operation_expense_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_budget_id_operation_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."operation_budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_work_request_id_requests_id_fk" FOREIGN KEY ("work_request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_expense_requests" ADD CONSTRAINT "operation_expense_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_decisions" ADD CONSTRAINT "operation_media_decisions_media_request_id_operation_media_requests_id_fk" FOREIGN KEY ("media_request_id") REFERENCES "public"."operation_media_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_decisions" ADD CONSTRAINT "operation_media_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_work_request_id_requests_id_fk" FOREIGN KEY ("work_request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_requests" ADD CONSTRAINT "operation_media_requests_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_revisions" ADD CONSTRAINT "operation_media_revisions_media_request_id_operation_media_requests_id_fk" FOREIGN KEY ("media_request_id") REFERENCES "public"."operation_media_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_revisions" ADD CONSTRAINT "operation_media_revisions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_media_revisions" ADD CONSTRAINT "operation_media_revisions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_expense_id_operation_expense_requests_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."operation_expense_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_invoice_file_id_files_id_fk" FOREIGN KEY ("invoice_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_budget_id_operation_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."operation_budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_purchases" ADD CONSTRAINT "operation_purchases_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_incidents_asset_idx" ON "operation_asset_incidents" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_incidents_status_idx" ON "operation_asset_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_reservations_asset_idx" ON "operation_asset_reservations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_reservations_status_idx" ON "operation_asset_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_reservations_window_idx" ON "operation_asset_reservations" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_code_unique" ON "operation_assets" USING btree ("asset_code") WHERE "operation_assets"."asset_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_committee_idx" ON "operation_assets" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "assets_availability_idx" ON "operation_assets" USING btree ("availability");--> statement-breakpoint
CREATE INDEX "budgets_term_idx" ON "operation_budgets" USING btree ("academic_term_id");--> statement-breakpoint
CREATE INDEX "budgets_committee_idx" ON "operation_budgets" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "budgets_event_idx" ON "operation_budgets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "budgets_status_idx" ON "operation_budgets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certificate_batches_event_idx" ON "operation_certificate_batches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "certificate_batches_status_idx" ON "operation_certificate_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "digital_forms_status_idx" ON "operation_digital_forms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "digital_forms_event_idx" ON "operation_digital_forms" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "digital_requests_term_idx" ON "operation_digital_requests" USING btree ("academic_term_id");--> statement-breakpoint
CREATE INDEX "digital_requests_status_idx" ON "operation_digital_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "digital_requests_event_idx" ON "operation_digital_requests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "digital_requests_assignee_idx" ON "operation_digital_requests" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "expense_decisions_expense_idx" ON "operation_expense_decisions" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_decisions_actor_idx" ON "operation_expense_decisions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "expenses_term_idx" ON "operation_expense_requests" USING btree ("academic_term_id");--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "operation_expense_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_budget_idx" ON "operation_expense_requests" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "expenses_event_idx" ON "operation_expense_requests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "expenses_requester_idx" ON "operation_expense_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "expenses_approver_idx" ON "operation_expense_requests" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "media_decisions_request_idx" ON "operation_media_decisions" USING btree ("media_request_id");--> statement-breakpoint
CREATE INDEX "media_decisions_actor_idx" ON "operation_media_decisions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "media_requests_term_idx" ON "operation_media_requests" USING btree ("academic_term_id");--> statement-breakpoint
CREATE INDEX "media_requests_status_idx" ON "operation_media_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_requests_event_idx" ON "operation_media_requests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "media_requests_assignee_idx" ON "operation_media_requests" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "media_requests_reviewer_idx" ON "operation_media_requests" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_revisions_unique" ON "operation_media_revisions" USING btree ("media_request_id","revision");--> statement-breakpoint
CREATE INDEX "media_revisions_request_idx" ON "operation_media_revisions" USING btree ("media_request_id");--> statement-breakpoint
CREATE INDEX "operations_events_entity_idx" ON "operation_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "operations_events_domain_idx" ON "operation_events" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "operations_events_event_idx" ON "operation_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "operations_events_actor_idx" ON "operation_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "purchases_expense_idx" ON "operation_purchases" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "purchases_reconciliation_idx" ON "operation_purchases" USING btree ("reconciliation_status");