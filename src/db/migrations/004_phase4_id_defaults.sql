-- Migration: إضافة default لعمود id في جداول Phase 4
-- السبب: Drizzle 0.45.3 يستبعد عمود id من $inferInsert عندما تكون الجداول تحتوي على أعمدة $type()
-- مما يسبب أخطاء TypeScript عند إدراج القيم. الحل هو جعل PostgreSQL يولد الـ UUID تلقائيًا.
-- الملاحظة: gen_random_uuid() متوفرة افتراضيًا في PostgreSQL 13+

ALTER TABLE goals ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE initiatives ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE kpis ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE kpi_measurements ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE evidence ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE report_types ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE reports ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE report_sections ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE report_reviews ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE governance_alerts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE club_rankings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE kpi_formula_definitions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE initiative_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE governance_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE governance_audit_trail ALTER COLUMN id SET DEFAULT gen_random_uuid();
