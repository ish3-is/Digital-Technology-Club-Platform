import { z } from "zod";
export const kinds = [
  "task",
  "request",
  "meeting",
  "decision",
  "event",
] as const;
export type Kind = (typeof kinds)[number];
export const kindLabels: Record<string, string> = {
  event: "فعالية",
  task: "مهمة",
  request: "طلب",
  meeting: "اجتماع",
  decision: "قرار",
};
export const stateLabels: Record<string, string> = {
  idea: "فكرة",
  planning: "تخطيط",
  pending_approval: "بانتظار الاعتماد",
  registration_open: "فتح التسجيل",
  preparing: "تجهيز",
  ready: "جاهزة للتنفيذ",
  running: "قيد التنفيذ",
  evaluation: "تقييم",
  final_report: "تقرير نهائي",
  archived: "مؤرشفة",
  not_started: "لم تبدأ",
  in_progress: "قيد التنفيذ",
  review: "بانتظار المراجعة",
  completed: "مكتملة",
  cancelled: "ملغاة",
  new: "جديد",
  received: "تم الاستلام",
  rejected: "مرفوض",
  scheduled: "مجدول",
  held: "منعقد",
  recorded: "موثق",
  revoked: "ملغى",
  pending: "بانتظار",
  approved: "معتمد",
  changes_requested: "طلب تعديل",
};
export const priorityLabels: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};
export const transitionMap: Record<string, Record<string, string[]>> = {
  task: {
    not_started: ["in_progress", "cancelled"],
    in_progress: ["review", "cancelled"],
    review: ["in_progress", "cancelled"],
    completed: ["in_progress"],
    cancelled: ["not_started"],
  },
  request: {
    new: ["received", "rejected", "cancelled"],
    received: ["in_progress", "rejected", "cancelled"],
    in_progress: ["review", "cancelled"],
    review: ["in_progress", "cancelled"],
    completed: [],
    rejected: [],
    cancelled: [],
  },
  meeting: { scheduled: ["held", "cancelled"], held: [], cancelled: [] },
  decision: { recorded: ["revoked"], revoked: [] },
};
const instant = z.iso.datetime({ offset: true }).nullable().optional();
export const createSchema = z
  .object({
    kind: z.enum(kinds),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(6000).default(""),
    committeeId: z.string().nullable().optional(),
    termId: z.string().min(1),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    startAt: instant,
    dueAt: instant,
    responsibleId: z.string().optional(),
    reviewerId: z.string().optional(),
    participantIds: z.array(z.string()).max(30).default([]),
    receivingCommitteeId: z.string().optional(),
    endAt: instant,
    location: z.string().max(500).default(""),
    agenda: z.string().max(6000).default(""),
    attendeeIds: z.array(z.string()).max(60).default([]),
    meetingId: z.string().optional(),
    sourceId: z.string().optional(),
    eventId: z.string().optional(),
    track: z
      .enum(["general", "media", "technical", "organization"])
      .default("general"),
  })
  .strict();
export type CreateInput = z.input<typeof createSchema>;
export function overdue(
  item: { kind: string; dueAt: Date | string | null; status: string },
  now = new Date(),
) {
  return (
    ["task", "request"].includes(item.kind) &&
    !!item.dueAt &&
    new Date(item.dueAt) < now &&
    !["completed", "cancelled", "rejected"].includes(item.status)
  );
}
export function riyadhDay(date: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function urgency(
  item: { priority: string; dueAt: Date | string | null },
  now = new Date(),
) {
  if (item.priority === "urgent" || (item.dueAt && new Date(item.dueAt) < now))
    return {
      bucket: "عاجل",
      rank: 0,
      reason: item.priority === "urgent" ? "أولوية عاجلة" : "تجاوز الموعد",
    };
  if (item.dueAt && riyadhDay(item.dueAt) === riyadhDay(now))
    return { bucket: "اليوم", rank: 1, reason: "موعده اليوم بتوقيت الرياض" };
  if (
    item.dueAt &&
    new Date(item.dueAt).getTime() <= now.getTime() + 7 * 86400000
  )
    return {
      bucket: "هذا الأسبوع",
      rank: 2,
      reason: "خلال الأيام السبعة القادمة",
    };
  return {
    bucket: "لاحقًا",
    rank: 3,
    reason: item.dueAt ? "موعد لاحق" : "لا يوجد موعد محدد",
  };
}
export function dueSoonHours() {
  const n = Number(process.env.WORK_DUE_SOON_HOURS || 24);
  return Number.isFinite(n) && n > 0 && n <= 168 ? n : 24;
}
