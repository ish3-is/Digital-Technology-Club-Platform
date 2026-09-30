// Types and constants for Phase 4 Governance entities
import type {
  GoalStatus,
  InitiativeStatus,
  KpiDirection,
  KpiFrequency,
  KpiStatus,
  MeasurementSourceType,
  EvidenceType,
  EvidenceClassification,
  EvidenceVerificationStatus,
  ReportStatus,
  ReportSectionKey,
  ReportReviewDecision,
  GovernanceAlertType,
  GovernanceAlertSeverity,
  KpiFormulaType,
  InitiativeLinkType,
} from "@/db/schema";

// ======================
// Goal types
// ======================
export type { GoalStatus };

export const goalStatusLabels: Record<GoalStatus, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  at_risk: "معرض للتأخر",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const goalStatusTransitions: Record<GoalStatus, GoalStatus[]> = {
  not_started: ["in_progress", "cancelled"],
  in_progress: ["at_risk", "completed", "cancelled"],
  at_risk: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// ======================
// Initiative types
// ======================
export type { InitiativeStatus };

export const initiativeStatusLabels: Record<InitiativeStatus, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const initiativeStatusTransitions: Record<InitiativeStatus, InitiativeStatus[]> = {
  not_started: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// ======================
// KPI types
// ======================
export type { KpiDirection, KpiFrequency, KpiStatus, MeasurementSourceType };

export const kpiDirectionLabels: Record<KpiDirection, string> = {
  higher_is_better: "كلما ارتفع كان أفضل",
  lower_is_better: "كلما انخفض كان أفضل",
  target_exact: "قيمة مستهدفة دقيقة",
};

export const kpiFrequencyLabels: Record<KpiFrequency, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهرى",
  quarterly: "ربع سنوي",
  annual: "سنوي",
};

export const kpiStatusLabels: Record<KpiStatus, string> = {
  active: "فعال",
  paused: "متوقف مؤقتًا",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const kpiStatusTransitions: Record<KpiStatus, KpiStatus[]> = {
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const measurementSourceLabels: Record<MeasurementSourceType, string> = {
  manual: "يدوي",
  task_derived: "مشتق من المهام",
  event_derived: "مشتق من الفعالية",
  attendance_derived: "مشتق من الحضور",
  report_derived: "مشتق من التقرير",
};

// ======================
// Evidence types
// ======================
export type { EvidenceType, EvidenceClassification, EvidenceVerificationStatus };

export const evidenceTypeLabels: Record<EvidenceType, string> = {
  file: "ملف",
  event: "فعالية",
  report: "تقرير",
  survey: "استبيان",
  attendance: "حضور",
  task_aggregate: "Aggregated مهام",
  manual: "يدوي",
};

export const evidenceClassificationLabels: Record<EvidenceClassification, string> = {
  public: "عام",
  internal: "داخلي",
  restricted: "محدود",
  confidential: "سري",
};

export const evidenceVerificationLabels: Record<EvidenceVerificationStatus, string> = {
  unreviewed: "غير مراجع",
  reviewed: "مراجع",
  rejected: "مرفوض",
};

// ======================
// Report types
// ======================
export type { ReportStatus, ReportSectionKey, ReportReviewDecision };

export const reportStatusLabels: Record<ReportStatus, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  under_review: "تحت المراجعة",
  changes_requested: "طلب تعديل",
  approved: "معتمد",
  rejected: "مرفوض",
  archived: "مؤرشف",
};

export const reportReviewDecisionLabels: Record<ReportReviewDecision, string> = {
  pending: "بانتظار",
  approved: "معتمد",
  rejected: "مرفوض",
  changes_requested: "طلب تعديل",
};

export const reportSectionLabels: Record<ReportSectionKey, string> = {
  achievements: "الإنجازات",
  completed_work: "العمل المكتمل",
  ongoing_work: "العمل الجاري",
  delayed_work: "العمل المتأخر",
  challenges: "التحديات",
  needs: "الاحتياجات",
  next_plan: "خطة الفترة القادمة",
  kpi_updates: "تحديثات المؤشرات",
  event_summaries: "ملخصات الفعاليات",
  decisions_summaries: "ملخصات القرارات",
  task_aggregates: "مجمّع المهام",
  attendance_summaries: "ملخصات الحضور",
};

// ======================
// Report status transitions
// ======================
export const reportStatusTransitions: Record<ReportStatus, ReportStatus[]> = {
  draft: ["submitted", "archived"],
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "changes_requested", "rejected"],
  changes_requested: ["submitted", "draft"],
  approved: ["archived"],
  rejected: ["draft"],
  archived: [],
};

// ======================
// Governance Alert types
// ======================
export type { GovernanceAlertType, GovernanceAlertSeverity };

export const governanceAlertTypeLabels: Record<GovernanceAlertType, string> = {
  kpi_no_update: "KPI بدون تحديث",
  kpi_no_evidence: "KPI بدون دليل",
  goal_at_risk: "هدف معرض للتأخر",
  report_overdue: "تقرير متأخر",
  report_waiting_review: "تقرير ينتظر مراجعة",
  event_no_final_report: "فعالية بدون تقرير نهائي",
  decision_no_execution: "قرار بدون تنفيذ مرتبط",
  approval_delayed: "اعتماد متأخر",
  kpi_target_missed: "KPI لم ي достиг هدفه",
  goal_approaching_due: "هدف يقترب مواعيدها",
  initiative_overdue: "مبادرة متأخرة",
};

export const governanceAlertSeverityLabels: Record<GovernanceAlertSeverity, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "عالي",
  critical: "حرج",
};

// ======================
// KPI Formula types
// ======================
export type { KpiFormulaType };

export const kpiFormulaTypeLabels: Record<KpiFormulaType, string> = {
  simple_ratio: "نسبة بسيطة",
  task_aggregate: "مجموعة مهام",
  attendance_rate: "معدل الحضور",
  report_completion: "إكمال التقرير",
  manual: "يدوي",
  sql_aggregate: "مجموعة SQL",
};

// ======================
// Initiative Link types
// ======================
export type { InitiativeLinkType };

export const initiativeLinkTypeLabels: Record<InitiativeLinkType, string> = {
  event: "فعالية",
  task: "مهمة",
  meeting: "اجتماع",
  decision: "قرار",
  request: "طلب",
};

// ======================
// Helper: status is calculable (derived) vs stored
// ======================
/**
 * الأهداف: status مخزّن (يدوي/إداري)، وليس محسوبًا آليًا.
 * يمكن اشتقاق "معرض للتأخر" من due_at < الآن و status في progress،
 * لكن القرار يبقىstored ليتم المتابعة اليدوية.
 */
export function isGoalAtRisk(goal: { status: GoalStatus; dueAt: Date | null }): boolean {
  if (goal.status === "at_risk") return true;
  if (goal.status !== "in_progress") return false;
  if (!goal.dueAt) return false;
  return goal.dueAt < new Date();
}

/**
 * KPIs: current_value يمكن أن يكون مخزّنًا (يدوي) أو مشتقًا من آخر قياس.
 * نفضّل الاشتقاق من آخر قياس عند العرض لتجنب التناقض.
 */
