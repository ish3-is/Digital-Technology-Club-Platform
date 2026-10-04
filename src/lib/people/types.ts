import type {
  ApplicationStatus,
  AchievementCategory,
  MemberStatus,
  OnboardingStepStatus,
  VolunteerHourStatus,
} from "@/db/schema";

export const memberStatusLabels: Record<MemberStatus, string> = {
  new: "جديد",
  active: "نشط",
  low_engagement: "منخفض التفاعل",
  inactive: "غير نشط",
  withdrawn: "منسحب",
  archived: "مؤرشف",
};

// Moving to a sensitive label requires an explicit, recorded reason; nothing is inferred.
export const memberStatusTransitions: Record<MemberStatus, MemberStatus[]> = {
  new: ["active", "inactive", "withdrawn", "archived"],
  active: ["low_engagement", "inactive", "withdrawn", "archived"],
  low_engagement: ["active", "inactive", "withdrawn", "archived"],
  inactive: ["active", "low_engagement", "withdrawn", "archived"],
  withdrawn: ["archived"],
  archived: [],
};

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  submitted: "مُقدَّم",
  under_review: "قيد المراجعة",
  shortlisted: "في القائمة المختصرة",
  interview: "مقابلة أو تقييم",
  accepted: "مقبول",
  rejected: "مرفوض",
  waitlisted: "قائمة الانتظار",
  converted: "أُدمج كعضو",
};

export const applicationStatusTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["under_review", "shortlisted", "rejected", "waitlisted"],
  under_review: ["shortlisted", "interview", "rejected", "waitlisted"],
  shortlisted: ["interview", "accepted", "rejected", "waitlisted"],
  interview: ["accepted", "rejected", "waitlisted"],
  accepted: ["converted", "rejected"],
  rejected: [],
  waitlisted: ["shortlisted", "interview", "accepted", "rejected"],
  converted: [],
};

/** Terminal states never move again. */
export const isApplicationFinal = (status: ApplicationStatus) =>
  status === "rejected" || status === "converted";

export const applicationDecisionLabels: Record<string, string> = {
  assigned: "إسناد للمراجعة",
  shortlisted: "إدراج في القائمة المختصرة",
  accepted: "قبول",
  rejected: "رفض",
  waitlisted: "إدراج في قائمة الانتظار",
  note: "ملاحظة مراجعة",
};

export const onboardingStepLabels: Record<OnboardingStepStatus, string> = {
  pending: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  skipped: "متخطى بقرار",
};

/**
 * The club onboarding pipeline. Steps are created from this definition so the
 * sequence lives in one place instead of inside a component.
 */
export const onboardingStages: {
  key: string;
  title: string;
  position: string;
  offsetDays: number;
}[] = [
  { key: "registration", title: "التسجيل", position: "before_acceptance", offsetDays: 0 },
  { key: "review", title: "مراجعة الطلب", position: "before_acceptance", offsetDays: 1 },
  { key: "acceptance", title: "القبول", position: "before_acceptance", offsetDays: 2 },
  { key: "welcome", title: "الترحيب", position: "day_1", offsetDays: 3 },
  { key: "club_introduction", title: "تعريف النادي", position: "day_1", offsetDays: 4 },
  { key: "skills_confirmation", title: "تأكيد المهارات والاهتمامات", position: "day_2", offsetDays: 5 },
  { key: "committee_match", title: "مطابقة اللجنة", position: "day_3", offsetDays: 6 },
  { key: "team_introduction", title: "التعرف على الفريق", position: "day_4", offsetDays: 7 },
  { key: "first_task", title: "أول مهمة", position: "week_1", offsetDays: 10 },
  { key: "first_event", title: "أول فعالية", position: "week_2", offsetDays: 17 },
  { key: "thirty_day_review", title: "تقييم الثلاثين يومًا", position: "day_30", offsetDays: 30 },
];

/**
 * تحدي أول 30 يوم — seven contributions. Thresholds live in contribution_rules
 * so the challenge is configurable rather than hardcoded in the interface.
 */
export const thirtyDayChallenge = {
  key: "thirty_day_challenge",
  badgeKey: "launching_member",
  name: "تحدي أول 30 يوم",
  steps: onboardingStages.filter((s) => s.position !== "before_acceptance"),
} as const;

export const volunteerSourceLabels: Record<string, string> = {
  event: "فعالية",
  meeting: "اجتماع",
  workshop: "ورشة عمل",
  committee_work: "عمل لجنة",
  external: "مساهمة خارجية معتمدة",
};

export const volunteerStatusLabels: Record<VolunteerHourStatus, string> = {
  pending: "بانتظار الاعتماد",
  approved: "معتمدة",
  rejected: "مرفوضة",
};

export const achievementCategoryLabels: Record<AchievementCategory, string> = {
  project: "مشروع رئيسي",
  event_leadership: "قيادة فعالية",
  initiative: "مبادرة",
  certificate: "شهادة",
  competition: "مسابقة",
  milestone: "محطة",
  recognition: "تقدير",
  internal_award: "جائزة داخلية",
};

export const achievementVisibilityLabels: Record<string, string> = {
  management: "الإدارة فقط",
  committee: "اللجنة فقط",
  members: "جميع الأعضاء",
};

export const achievementVerificationLabels: Record<string, string> = {
  unreviewed: "بانتظار التحقق",
  verified: "موثق",
  rejected: "غير موثق",
};

export const transferStatusLabels: Record<string, string> = {
  requested: "مطلوب",
  approved: "معتمد",
  rejected: "مرفوض",
};

export const handoverKindLabels: Record<string, string> = {
  role_change: "تغيير دور",
  committee_transfer: "نقل بين لجان",
  exit: "خروج",
};

export const assignmentTypeLabels: Record<string, string> = {
  permanent: "دائم",
  temporary: "مؤقت",
  collaboration: "تعاون مؤقت",
};

export const memberRoleLabels: Record<string, string> = {
  member: "عضو",
  committee_vice_head: "نائب رئيس لجنة",
  committee_head: "رئيس لجنة",
  club_leadership: "قيادة النادي",
  mentor: "مرشد",
};

export const mentorStatusLabels: Record<string, string> = {
  active: "جارٍ",
  completed: "مكتمل",
  ended: "منتهي",
};

/** XP levels are presentation only; the total always comes from real transactions. */
export const xpLevels = [
  { key: "beginner", name: "مبتدئ", min: 0 },
  { key: "contributor", name: "مساهم", min: 50 },
  { key: "effective", name: "فعال", min: 150 },
  { key: "influencer", name: "مؤثر", min: 350 },
  { key: "leader", name: "قيادي", min: 700 },
  { key: "impact_maker", name: "صانع أثر", min: 1200 },
] as const;

export function xpLevelFor(total: number) {
  let current: (typeof xpLevels)[number] = xpLevels[0];
  for (const level of xpLevels) if (total >= level.min) current = level;
  const next = xpLevels.find((l) => l.min > current.min) ?? null;
  return {
    key: current.key,
    name: current.name,
    next,
    remainingToNext: next ? Math.max(0, next.min - total) : 0,
    explanation: next
      ? `${total} نقطة؛ المستوى التالي ${next.name} عند ${next.min}`
      : `${total} نقطة؛ أعلى مستوى في السلم الحالي`,
  };
}

/** Volunteer hours must be approved before they count anywhere. */
export const approvedHours = (rows: { status: string; hours: number }[]) =>
  rows
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.hours, 0);
