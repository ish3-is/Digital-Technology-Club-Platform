-- 0004_governance_evidence_reports.sql
-- Phase 4: Governance, Evidence & Institutional Reporting
-- Goals, Initiatives, KPIs with measurement history, Evidence Vault, Reports system,
-- governance alerts, committee health, club pulse foundation

-- ========================
-- GOALS
-- ========================
CREATE TABLE "goals" (
    "id" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "academic_term_id" text NOT NULL,
    "owner_user_id" text,
    "committee_id" text,
    "target_type" text NOT NULL DEFAULT 'qualitative',
    "target_value" integer,
    "current_value" integer,
    "start_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "status" text NOT NULL DEFAULT 'not_started',
    "weight" integer,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "goal_status" CHECK ("goals"."status" in ('not_started','in_progress','at_risk','completed','cancelled')),
    CONSTRAINT "goal_dates" CHECK ("goals"."due_at" IS NULL OR "goals"."start_at" IS NULL OR "goals"."due_at" >= "goals"."start_at"),
    CONSTRAINT "goal_target_type" CHECK ("goals"."target_type" in ('qualitative','quantitative'))
);
--> statement-breakpoint

ALTER TABLE "goals" ADD CONSTRAINT "goals_academic_term_id_fkey"
    FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "goals" ADD CONSTRAINT "goals_committee_id_fkey"
    FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "goals" ADD CONSTRAINT "goals_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "goals_term_idx" ON "goals"("academic_term_id");
--> statement-breakpoint
CREATE INDEX "goals_committee_idx" ON "goals"("committee_id");
--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals"("status");
--> statement-breakpoint
CREATE INDEX "goals_created_by_idx" ON "goals"("created_by");
--> statement-breakpoint

-- ========================
-- INITIATIVES
-- ========================
CREATE TABLE "initiatives" (
    "id" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "goal_id" text NOT NULL,
    "committee_id" text,
    "owner_user_id" text NOT NULL,
    "start_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "status" text NOT NULL DEFAULT 'not_started',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "initiative_status" CHECK ("initiatives"."status" in ('not_started','in_progress','completed','cancelled')),
    CONSTRAINT "initiative_dates" CHECK ("initiatives"."due_at" IS NULL OR "initiatives"."start_at" IS NULL OR "initiatives"."due_at" >= "initiatives"."start_at")
);
--> statement-breakpoint

ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_committee_id_fkey"
    FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "initiatives_goal_idx" ON "initiatives"("goal_id");
--> statement-breakpoint
CREATE INDEX "initiatives_committee_idx" ON "initiatives"("committee_id");
--> statement-breakpoint
CREATE INDEX "initiatives_status_idx" ON "initiatives"("status");
--> statement-breakpoint

-- ========================
-- KPIs
-- ========================
CREATE TABLE "kpis" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "academic_term_id" text NOT NULL,
    "committee_id" text,
    "goal_id" text,
    "owner_user_id" text,
    "unit" text NOT NULL DEFAULT '',
    "direction" text NOT NULL DEFAULT 'higher_is_better',
    "target_value" integer NOT NULL,
    "baseline_value" integer,
    "current_value" integer,
    "weight" integer,
    "measurement_frequency" text NOT NULL DEFAULT 'monthly',
    "due_at" timestamp with time zone,
    "status" text NOT NULL DEFAULT 'active',
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "kpi_direction" CHECK ("kpis"."direction" in ('higher_is_better','lower_is_better','target_exact')),
    CONSTRAINT "kpi_status" CHECK ("kpis"."status" in ('active','paused','completed','cancelled')),
    CONSTRAINT "kpi_frequency" CHECK ("kpis"."measurement_frequency" in ('daily','weekly','monthly','quarterly','annual'))
);
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_academic_term_id_fkey"
    FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_committee_id_fkey"
    FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "kpis_term_idx" ON "kpis"("academic_term_id");
--> statement-breakpoint
CREATE INDEX "kpis_committee_idx" ON "kpis"("committee_id");
--> statement-breakpoint
CREATE INDEX "kpis_goal_idx" ON "kpis"("goal_id");
--> statement-breakpoint
CREATE INDEX "kpis_status_idx" ON "kpis"("status");
--> statement-breakpoint

-- ========================
-- KPI MEASUREMENTS (المسار التاريخي للقياسات)
-- ========================
CREATE TABLE "kpi_measurements" (
    "id" text PRIMARY KEY NOT NULL,
    "kpi_id" text NOT NULL,
    "value" integer NOT NULL,
    "measured_at" timestamp with time zone NOT NULL,
    "measured_by" text NOT NULL,
    "source_type" text NOT NULL DEFAULT 'manual',
    "source_id" text,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "measurement_source_type" CHECK ("kpi_measurements"."source_type" in ('manual','task_derived','event_derived','attendance_derived','report_derived'))
);
--> statement-breakpoint

ALTER TABLE "kpi_measurements" ADD CONSTRAINT "measurements_kpi_id_fkey"
    FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "kpi_measurements" ADD CONSTRAINT "measurements_measured_by_fkey"
    FOREIGN KEY ("measured_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "measurements_kpi_idx" ON "kpi_measurements"("kpi_id");
--> statement-breakpoint
CREATE INDEX "measurements_measured_at_idx" ON "kpi_measurements"("measured_at");
--> statement-breakpoint

-- ========================
-- EVIDENCE VAULT
-- ========================
CREATE TABLE "evidence" (
    "id" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "evidence_type" text NOT NULL DEFAULT 'manual',
    "source_entity_type" text NOT NULL,
    "source_entity_id" text NOT NULL,
    "file_id" text,
    "url" text,
    "date" timestamp with time zone,
    "uploaded_by" text NOT NULL,
    "classification" text NOT NULL DEFAULT 'internal',
    "verification_status" text NOT NULL DEFAULT 'unreviewed',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "evidence_type" CHECK ("evidence"."evidence_type" in ('file','event','report','survey','attendance','task_aggregate','manual')),
    CONSTRAINT "evidence_classification" CHECK ("evidence"."classification" in ('public','internal','restricted','confidential')),
    CONSTRAINT "evidence_verification" CHECK ("evidence"."verification_status" in ('unreviewed','reviewed','rejected')),
    CONSTRAINT "evidence_entity_type" CHECK ("evidence"."source_entity_type" in ('goal','initiative','kpi','event','report','task','meeting','decision','request'))
);
--> statement-breakpoint

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "evidence_source_idx" ON "evidence"("source_entity_type","source_entity_id");
--> statement-breakpoint
CREATE INDEX "evidence_type_idx" ON "evidence"("evidence_type");
--> statement-breakpoint
CREATE INDEX "evidence_classification_idx" ON "evidence"("classification");
--> statement-breakpoint
CREATE INDEX "evidence_verification_idx" ON "evidence"("verification_status");
--> statement-breakpoint

-- KPI Measurement <-> Evidence (متعدد للكثير من الأدلة لكل قياس)
CREATE TABLE "kpi_evidence" (
    "kpi_measurement_id" text NOT NULL,
    "evidence_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("kpi_measurement_id","evidence_id")
);
--> statement-breakpoint

ALTER TABLE "kpi_evidence" ADD CONSTRAINT "kpi_evidence_measurement_fkey"
    FOREIGN KEY ("kpi_measurement_id") REFERENCES "kpi_measurements"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "kpi_evidence" ADD CONSTRAINT "kpi_evidence_evidence_fkey"
    FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ========================
-- REPORT SYSTEM (نظام التقارير المؤسسية)
-- ========================

-- أنواع التقارير
CREATE TABLE "report_types" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "is_system" boolean NOT NULL DEFAULT false,
    "category" text NOT NULL DEFAULT 'standard',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "report_types" ADD CONSTRAINT "report_types_category_check"
    CHECK ("report_types"."category" in ('standard','custom'));
--> statement-breakpoint

-- التقارير المؤسسية
CREATE TABLE "reports" (
    "id" text PRIMARY KEY NOT NULL,
    "type_id" text NOT NULL,
    "academic_term_id" text NOT NULL,
    "committee_id" text,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "title" text NOT NULL,
    "summary" text NOT NULL DEFAULT '',
    "status" text NOT NULL DEFAULT 'draft',
    "created_by" text NOT NULL,
    "submitted_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "report_status" CHECK ("reports"."status" in ('draft','submitted','under_review','changes_requested','approved','rejected','archived')),
    CONSTRAINT "report_dates" CHECK ("reports"."period_end" >= "reports"."period_start")
);
--> statement-breakpoint

ALTER TABLE "reports" ADD CONSTRAINT "reports_type_id_fkey"
    FOREIGN KEY ("type_id") REFERENCES "report_types"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "reports" ADD CONSTRAINT "reports_academic_term_id_fkey"
    FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "reports" ADD CONSTRAINT "reports_committee_id_fkey"
    FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "reports_type_idx" ON "reports"("type_id");
--> statement-breakpoint
CREATE INDEX "reports_term_idx" ON "reports"("academic_term_id");
--> statement-breakpoint
CREATE INDEX "reports_committee_idx" ON "reports"("committee_id");
--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports"("status");
--> statement-breakpoint
CREATE INDEX "reports_created_by_idx" ON "reports"("created_by");
--> statement-breakpoint

-- أقسام التقرير المهيكلة
CREATE TABLE "report_sections" (
    "id" text PRIMARY KEY NOT NULL,
    "report_id" text NOT NULL,
    "section_key" text NOT NULL,
    "content" text NOT NULL DEFAULT '',
    "auto_generated" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "report_sections_key_check" CHECK ("report_sections"."section_key" in (
        'achievements','completed_work','ongoing_work','delayed_work',
        'challenges','needs','next_plan','kpi_updates','event_summaries',
        'decisions_summaries','task_aggregates','attendance_summaries'
    ))
);
--> statement-breakpoint

ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX "report_sections_report_idx" ON "report_sections"("report_id");
--> statement-breakpoint

-- مراجعات التقارير
CREATE TABLE "report_reviews" (
    "id" text PRIMARY KEY NOT NULL,
    "report_id" text NOT NULL,
    "reviewer_id" text NOT NULL,
    "decision" text NOT NULL DEFAULT 'pending',
    "comment" text NOT NULL DEFAULT '',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "report_review_decision" CHECK ("report_reviews"."decision" in ('pending','approved','rejected','changes_requested'))
);
--> statement-breakpoint

ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "report_reviews_report_idx" ON "report_reviews"("report_id");
--> statement-breakpoint
CREATE INDEX "report_reviews_reviewer_idx" ON "report_reviews"("reviewer_id");
--> statement-breakpoint
CREATE INDEX "report_reviews_decision_idx" ON "report_reviews"("decision");
--> statement-breakpoint

-- ========================
-- GOVERNANCE ALERTS
-- ========================
CREATE TABLE "governance_alerts" (
    "id" text PRIMARY KEY NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "severity" text NOT NULL DEFAULT 'medium',
    "related_entity_type" text NOT NULL DEFAULT 'general',
    "related_entity_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "dismissed_at" timestamp with time zone,
    "dismissed_by" text,
    CONSTRAINT "alert_type" CHECK ("governance_alerts"."type" in (
        'kpi_no_update','kpi_no_evidence','goal_at_risk','report_overdue',
        'report_waiting_review','event_no_final_report','decision_no_execution',
        'approval_delayed','kpi_target_missed','goal_approaching_due','initiative_overdue'
    )),
    CONSTRAINT "alert_severity" CHECK ("governance_alerts"."severity" in ('low','medium','high','critical')),
    CONSTRAINT "alert_entity_type" CHECK ("governance_alerts"."related_entity_type" in (
        'goal','initiative','kpi','report','event','decision','approval','general'
    ))
);
--> statement-breakpoint

ALTER TABLE "governance_alerts" ADD CONSTRAINT "governance_alerts_dismissed_by_fkey"
    FOREIGN KEY ("dismissed_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "governance_alerts_type_idx" ON "governance_alerts"("type");
--> statement-breakpoint
CREATE INDEX "governance_alerts_severity_idx" ON "governance_alerts"("severity");
--> statement-breakpoint
CREATE INDEX "governance_alerts_entity_idx" ON "governance_alerts"("related_entity_type","related_entity_id");
--> statement-breakpoint
CREATE INDEX "governance_alerts_created_idx" ON "governance_alerts"("created_at");
--> statement-breakpoint
CREATE INDEX "governance_alerts_dismissed_idx" ON "governance_alerts"("dismissed_at") WHERE "dismissed_at" IS NULL;
--> statement-breakpoint

-- ========================
-- CLUB RANKING ("رحلتنا نحو المركز الأول")
-- ========================
CREATE TABLE "club_ranking" (
    "id" text PRIMARY KEY NOT NULL,
    "academic_term_id" text NOT NULL,
    "current_position" integer,
    "target_position" integer,
    "official_criteria_document" text,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "club_ranking_term_unique" UNIQUE ("academic_term_id")
);
--> statement-breakpoint

ALTER TABLE "club_ranking" ADD CONSTRAINT "club_ranking_term_fkey"
    FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "club_ranking" ADD CONSTRAINT "club_ranking_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ========================
-- KPI FORMULA DEFINITIONS (Registry آمن للحسابات)
-- ========================
CREATE TABLE "kpi_formula_definitions" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "formula_type" text NOT NULL,
    "definition" jsonb NOT NULL DEFAULT '{}',
    "description" text NOT NULL DEFAULT '',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "kpi_formula_type" CHECK ("kpi_formula_definitions"."formula_type" in ('simple_ratio','task_aggregate','attendance_rate','report_completion','manual','sql_aggregate'))
);
--> statement-breakpoint

CREATE INDEX "kpi_formula_type_idx" ON "kpi_formula_definitions"("formula_type");
--> statement-breakpoint

-- ربط صيغ KPI بالقياسات
ALTER TABLE "kpis" ADD COLUMN "formula_id" text;
--> statement-breakpoint

ALTER TABLE "kpis" ADD CONSTRAINT "kpis_formula_id_fkey"
    FOREIGN KEY ("formula_id") REFERENCES "kpi_formula_definitions"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "kpis_formula_idx" ON "kpis"("formula_id");
--> statement-breakpoint

-- ========================
-- INITIATIVE-OBJECT LINKING (ربط المبادرات بالأحداث والمهام)
-- ========================
CREATE TABLE "initiative_links" (
    "id" text PRIMARY KEY NOT NULL,
    "initiative_id" text NOT NULL,
    "link_type" text NOT NULL,
    "linked_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "initiative_link_type" CHECK ("initiative_links"."link_type" in ('event','task','meeting','decision','request'))
);
--> statement-breakpoint

ALTER TABLE "initiative_links" ADD CONSTRAINT "initiative_links_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX "initiative_links_initiative_idx" ON "initiative_links"("initiative_id");
--> statement-breakpoint
CREATE INDEX "initiative_links_linked_idx" ON "initiative_links"("link_type","linked_id");
--> statement-breakpoint

-- ========================
-- GOVERNANCE EVENTS (للتدقيق والمracingنة)
-- ========================
-- إضافة جدول events لنشاط الحوكمة (مشابه لـ work_events ولكن مخصص للحوكمة)
CREATE TABLE "governance_events" (
    "id" text PRIMARY KEY NOT NULL,
    "actor_id" text NOT NULL,
    "action" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "committee_id" text,
    "metadata" jsonb NOT NULL DEFAULT '{}',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "governance_event_entity_type" CHECK ("governance_events"."entity_type" in (
        'goal','initiative','kpi','kpi_measurement','evidence','report',
        'report_section','report_review','governance_alert','club_ranking',
        'kpi_formula_definition'
    ))
);
--> statement-breakpoint

ALTER TABLE "governance_events" ADD CONSTRAINT "governance_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "governance_events_entity_idx" ON "governance_events"("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "governance_events_actor_idx" ON "governance_events"("actor_id");
--> statement-breakpoint
CREATE INDEX "governance_events_created_idx" ON "governance_events"("created_at");
--> statement-breakpoint

-- ========================
-- SEED: أنواع التقارير المؤسسية الافتراضية
-- ========================
INSERT INTO "report_types" ("id","name","description","category") VALUES
    ('weekly_committee','تقرير أسبوعي للجنة','تقرير دوري أسبوعي للجنة Gives حالة العمل والمهمات والفعاليات','standard'),
    ('periodic_committee','تقرير دوري للجنة','تقرير دوري (شهري/ربع سنوي) للجنة مع تقدم الأهداف والمؤشرات','standard'),
    ('event_final_report','تقرير فعالية نهائي','تقرير ختامي للفعالية يتضمن الإنجازات والدروس المستفادة والمؤشرات','standard'),
    ('administrative_report','تقرير إداري','تقرير إداري عام يغطي وضع النادي والحوكمة والمؤشرات الرئيسية','standard');
--> statement-breakpoint

-- ========================
-- SEED: صيغ KPI الافتراضية
-- ========================
INSERT INTO "kpi_formula_definitions" ("id","name","formula_type","definition","description") VALUES
    ('task_completion_ratio','معدل إكمال المهام','simple_ratio','{"numerator":"completed_tasks","denominator":"total_tasks","label":"% إكمال المهام"}', 'عدد المهام المكتملة مقسومًا على إجمالي المهام المعلقة'),
    ('on_time_completion_rate','معدل الالتزام بالموعد','simple_ratio','{"numerator":"on_time_completed","denominator":"completed_tasks","label":"% الالتزام بالموعد"}', 'عدد المهام المنفذة في موعدها مقسومًا على المهام المكتملة'),
    ('attendance_rate','معدل الحضور','simple_ratio','{"numerator":"attended","denominator":"registered","label":"% الحضور"}', 'عدد الحاضرين مقسومًا على المسجلين في الفعاليات'),
    ('report_submission_rate','معدل تقديم التقارير','simple_ratio','{"numerator":"submitted_reports","denominator":"required_reports","label":"% تقديم التقارير"}', 'عدد التقارير المقدمة مقسومًا على التقارير المطلوبة'),
    ('manual_entry','إدخال يدوي','manual','{}','نسبة أو قيمة يدوية الإدخال بدون اشتقاق آلي'),
    ('sql_aggregate','مجموعة SQL 맞춤ة','sql_aggregate','{"query":"","label":"المجموعة المشتقة"}', 'قياس مشتق من استعلام SQL معرف مسبق');
--> statement-breakpoint

-- السجل 버전: إضافة مسار التتبع الكامل للحوكمة
CREATE TABLE "governance_audit_trail" (
    "id" text PRIMARY KEY NOT NULL,
    "actor_id" text,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "action" text NOT NULL,
    "previous_value" jsonb,
    "new_value" jsonb,
    "session_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "audit_entity_type" CHECK ("governance_audit_trail"."entity_type" in (
        'goal','initiative','kpi','kpi_measurement','evidence','report',
        'report_section','report_review','club_ranking','kpi_formula_definition'
    )),
    CONSTRAINT "audit_action" CHECK ("governance_audit_trail"."action" in (
        'created','updated','submitted','reviewed','approved','rejected',
        'changed','measured','verified','dismissed','linked','unlinked'
    ))
);
--> statement-breakpoint

ALTER TABLE "governance_audit_trail" ADD CONSTRAINT "governance_audit_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX "governance_audit_entity_idx" ON "governance_audit_trail"("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "governance_audit_action_idx" ON "governance_audit_trail"("action");
--> statement-breakpoint
CREATE INDEX "governance_audit_created_idx" ON "governance_audit_trail"("created_at");
--> statement-breakpoint
