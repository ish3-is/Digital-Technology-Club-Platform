// 📁 الحوكمة - الواجهة الموحدة
// بإعادة تصدير من ملفات الخدمات المخصصة، دون احتواء منطق إضافي.

// Goals
export {
  createGoal,
  getGoal,
  updateGoal,
  listGoals,
  deleteGoal,
} from "./goals.service";

// Initiatives
export {
  createInitiative,
  getInitiative,
  updateInitiative,
  listInitiatives,
  deleteInitiative,
  linkInitiativeToGoal,
} from "./initiatives.service";

// KPIs
export {
  createKpi,
  getKpi,
  updateKpi,
  listKpis,
  addKpiMeasurement,
  getKpiMeasurements,
  deleteKpi,
} from "./kpis.service";

// Evidence
export {
  createEvidence,
  getEvidence,
  updateEvidence,
  listEvidence,
  verifyEvidence,
  linkEvidenceToKpiMeasurement,
  getEvidenceForSource,
} from "./evidence.service";

// Reports
export {
  createReport,
  getReport,
  updateReport,
  listReports,
  submitReport,
  assignReviewers,
  reviewReport,
  getReportReviewers,
} from "./reports.service";

// Alerts
export {
  createAlert,
  getAlert,
  listAlerts,
  dismissAlert,
  deleteAlert,
} from "./alerts.service";

// Formulas
export {
  createFormulaDefinition,
  getFormulaDefinition,
  listFormulaDefinitions,
  updateFormulaDefinition,
  deleteFormulaDefinition,
} from "./formulas.service";

// Types
export * from "./types";

// Helpers
export { generateId, requireActiveSession } from "./helpers";

// access helpers
export { hasPermission, hasPermissionOnCommittee } from "./helpers";
