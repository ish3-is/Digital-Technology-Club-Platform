import type {
  AssetAvailability,
  AssetCondition,
  BudgetStatus,
  CertificateBatchStatus,
  DigitalFormStatus,
  DigitalRequestStatus,
  DigitalServiceType,
  ExpenseCategory,
  ExpenseStatus,
  IncidentKind,
  MediaRequestStatus,
  MediaType,
  ReservationStatus,
} from "@/db/schema";

export const budgetStatusLabels: Record<BudgetStatus, string> = {
  active: "نشطة",
  closed: "مغلقة",
  archived: "مؤرشفة",
};

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  supplies: "مستلزمات",
  catering: "ضيافة",
  venue: "موقع",
  transport: "نقل",
  printing: "طباعة",
  equipment: "تجهيزات",
  software: "برمجيات",
  other: "أخرى",
};

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  finance_review: "قيد المراجعة المالية",
  changes_requested: "يحتاج تعديلات",
  approved: "معتمد",
  rejected: "مرفوض",
  purchased: "تم الشراء",
  reconciled: "تمت المطابقة",
  cancelled: "ملغى",
  archived: "مؤرشف",
};

/**
 * The expense path. Review, approval, purchase and reconciliation are separate
 * steps so no single actor can carry a request from draft to reconciled.
 */
export const expenseTransitions: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["finance_review", "rejected", "cancelled"],
  finance_review: ["approved", "changes_requested", "rejected"],
  changes_requested: ["submitted", "cancelled"],
  approved: ["purchased", "cancelled"],
  purchased: ["reconciled"],
  reconciled: ["archived"],
  rejected: [],
  cancelled: [],
  archived: [],
};

/** Statuses that still consume budget or need a person to act. */
export const openExpenseStatuses: ExpenseStatus[] = [
  "draft",
  "submitted",
  "finance_review",
  "changes_requested",
  "approved",
  "purchased",
];

export const expenseActionLabels: Record<string, string> = {
  submit: "تقديم",
  start_review: "بدء المراجعة",
  approve: "اعتماد",
  request_changes: "طلب تعديلات",
  reject: "رفض",
  record_purchase: "تسجيل الشراء",
  reconcile: "مطابقة",
  cancel: "إلغاء",
  archive: "أرشفة",
};

export const mediaTypeLabels: Record<MediaType, string> = {
  poster: "بوستر",
  announcement: "إعلان",
  social_post: "منشور تواصل",
  event_coverage: "تغطية فعالية",
  photography: "تصوير",
  video: "فيديو",
  certificate: "شهادة",
  member_card: "بطاقة عضو",
  presentation: "عرض تقديمي",
  story_reel: "ستوري/ريل",
  other: "أخرى",
};

export const mediaStatusLabels: Record<MediaRequestStatus, string> = {
  new: "جديد",
  accepted: "تم الاستلام",
  in_production: "قيد التنفيذ",
  in_review: "بانتظار المراجعة",
  changes_requested: "يحتاج تعديلات",
  approved: "معتمد",
  scheduled: "مجدول",
  published: "منشور",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

/** Production flow; publishing is separate so approval never implies it went out. */
export const mediaTransitions: Record<MediaRequestStatus, MediaRequestStatus[]> = {
  new: ["accepted", "rejected", "cancelled"],
  accepted: ["in_production", "rejected", "cancelled"],
  in_production: ["in_review", "cancelled"],
  in_review: ["changes_requested", "approved", "rejected"],
  changes_requested: ["in_production", "cancelled"],
  approved: ["scheduled", "published", "completed"],
  scheduled: ["published", "completed"],
  published: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export const openMediaStatuses: MediaRequestStatus[] = [
  "new",
  "accepted",
  "in_production",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
];

export const priorityLabels: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

export const digitalServiceLabels: Record<DigitalServiceType, string> = {
  registration_form: "نموذج تسجيل",
  survey: "استبانة",
  vote: "تصويت",
  meeting_link: "رابط اجتماع",
  course_setup: "إعداد دورة",
  certificate_generation: "إصدار شهادات",
  mailing_support: "دعم مراسلات",
  data_extraction: "استخراج بيانات",
  account_support: "دعم حساب رسمي",
  digital_archive: "أرشفة رقمية",
  technical_support: "دعم فني",
};

export const digitalStatusLabels: Record<DigitalRequestStatus, string> = {
  new: "جديد",
  received: "تم الاستلام",
  in_progress: "قيد التنفيذ",
  waiting_input: "بانتظار مدخلات",
  in_review: "قيد المراجعة",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export const digitalTransitions: Record<DigitalRequestStatus, DigitalRequestStatus[]> = {
  new: ["received", "rejected", "cancelled"],
  received: ["in_progress", "rejected", "cancelled"],
  in_progress: ["waiting_input", "in_review", "cancelled"],
  waiting_input: ["in_progress", "cancelled"],
  in_review: ["completed", "in_progress", "rejected"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export const openDigitalStatuses: DigitalRequestStatus[] = [
  "new",
  "received",
  "in_progress",
  "waiting_input",
  "in_review",
];

export const formTypeLabels: Record<string, string> = {
  registration: "تسجيل",
  survey: "استبانة",
  vote: "تصويت",
  feedback: "تغذية راجعة",
};

export const formStatusLabels: Record<DigitalFormStatus, string> = {
  planned: "مخطط",
  active: "مفتوح",
  closed: "مغلق",
  archived: "مؤرشف",
};

export const certificateStatusLabels: Record<CertificateBatchStatus, string> = {
  draft: "مسودة",
  generating: "قيد الإصدار",
  generated: "تم الإصدار",
  sent: "تم الإرسال",
  partial: "إرسال جزئي",
  archived: "مؤرشف",
};

export const assetConditionLabels: Record<AssetCondition, string> = {
  new: "جديد",
  good: "جيد",
  fair: "مقبول",
  damaged: "متضرر",
  maintenance: "يحتاج صيانة",
};

export const assetAvailabilityLabels: Record<AssetAvailability, string> = {
  available: "متاح",
  reserved: "محجوز",
  checked_out: "مُستلم",
  unavailable: "غير متاح",
};

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  requested: "مطلوب",
  approved: "معتمد",
  checked_out: "مُستلم",
  returned: "مُرجَع",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export const reservationTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["checked_out", "cancelled"],
  checked_out: ["returned"],
  returned: [],
  rejected: [],
  cancelled: [],
};

export const incidentKindLabels: Record<IncidentKind, string> = {
  damaged: "تضرر",
  missing: "مفقود",
  maintenance: "يحتاج صيانة",
  unavailable: "غير متاح",
};

export const incidentStatusLabels: Record<string, string> = {
  open: "مفتوحة",
  resolved: "مغلقة",
};

export const operationsDomainLabels: Record<string, string> = {
  finance: "المالية",
  media: "الإعلام",
  digital: "الرقمية",
  resource: "الموارد",
};