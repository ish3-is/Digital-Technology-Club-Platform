import { z } from "zod";
export const stages = [
  "idea",
  "planning",
  "pending_approval",
  "approved",
  "registration_open",
  "preparing",
  "ready",
  "running",
  "evaluation",
  "final_report",
  "archived",
  "cancelled",
] as const;
export const stageLabels: Record<string, string> = {
  idea: "فكرة",
  planning: "تخطيط",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمدة",
  registration_open: "فتح التسجيل",
  preparing: "تجهيز",
  ready: "جاهزة للتنفيذ",
  running: "قيد التنفيذ",
  evaluation: "تقييم",
  final_report: "تقرير نهائي",
  archived: "مؤرشفة",
  cancelled: "ملغاة",
};
export const transitions: Record<string, string[]> = {
  idea: ["planning", "pending_approval"],
  planning: ["pending_approval"],
  pending_approval: [],
  approved: ["registration_open", "preparing"],
  registration_open: ["preparing"],
  preparing: ["ready"],
  ready: ["running"],
  running: ["evaluation"],
  evaluation: ["final_report"],
  final_report: ["archived"],
  archived: [],
  cancelled: [],
};
export const url = z
  .string()
  .url()
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "الرابط غير صالح",
  )
  .nullable()
  .optional();
const money = z.number().int().min(0).max(100000000).nullable().optional();
export const createSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().max(6000).default(""),
    termId: z.string(),
    committeeId: z.string(),
    leadId: z.string(),
    approverId: z.string(),
    eventType: z.string().min(2).max(80).default("ورشة عمل"),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    locationType: z.enum(["onsite", "online", "hybrid"]),
    locationText: z.string().max(500).default(""),
    meetingUrl: url,
    targetAudience: z.string().min(2).max(1000),
    capacity: z.number().int().positive().max(100000).nullable().optional(),
    registrationUrl: url,
    plannedBudget: money,
    reportRequired: z.boolean().default(true),
    playbookId: z.string().optional(),
  })
  .strict();
export const requirementSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(2).max(160),
    category: z.string().min(2).max(80),
    required: z.boolean(),
    status: z.enum(["pending", "completed"]).default("pending"),
    ownerId: z.string(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    evidence: z.string().max(2000).default(""),
    gate: z
      .enum([
        "pending_approval",
        "registration_open",
        "ready",
        "final_report",
        "archived",
      ])
      .default("ready"),
  })
  .strict();
export const riskSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(2).max(160),
    description: z.string().max(2000).default(""),
    probability: z.number().int().min(1).max(3),
    impact: z.number().int().min(1).max(3),
    ownerId: z.string(),
    mitigation: z.string().max(2000).default(""),
    status: z.enum(["open", "mitigating", "closed"]).default("open"),
  })
  .strict();
export const participantSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.email().max(200).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    universityId: z.string().max(80).nullable().optional(),
    major: z.string().max(160).nullable().optional(),
    status: z
      .enum(["registered", "present", "absent", "cancelled"])
      .default("registered"),
  })
  .strict();
export const reportSchema = z
  .object({
    summary: z.string().min(2).max(6000),
    objectives: z.string().min(2).max(6000),
    execution: z.string().min(2).max(6000),
    results: z.string().min(2).max(6000),
    challenges: z.string().min(2).max(4000),
    recommendations: z.string().min(2).max(4000),
    evaluation: z.string().min(2).max(4000),
    lessons: z.string().min(2).max(6000),
  })
  .strict();
// RFC4180 subset: quoted commas/newlines and escaped quotes, fixed allowlisted columns.
export function parseCSV(text: string) {
  if (text.length > 200000) throw new Error("CSV أكبر من الحد");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("اقتباس CSV غير مكتمل");
  row.push(cell.replace(/\r$/, ""));
  if (row.some(Boolean)) rows.push(row);
  const header =
    rows.shift()?.map((v) => v.replace(/^\uFEFF/, "").trim()) || [];
  const allowed = ["name", "email", "phone", "universityId", "major", "status"];
  if (
    !header.includes("name") ||
    new Set(header).size !== header.length ||
    header.some((h) => !allowed.includes(h))
  )
    throw new Error("حقول CSV: name,email,phone,universityId,major,status");
  if (rows.length > 500) throw new Error("الحد ٥٠٠ مشارك");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== header.length)
        throw new Error("عدد أعمدة CSV غير متطابق");
      return participantSchema.parse(
        Object.fromEntries(header.map((h, i) => [h, r[i].trim() || undefined])),
      );
    });
}
export function readiness(
  items: {
    status: string;
    required: boolean;
    dueAt: Date | null;
    title: string;
    gate: string;
  }[],
) {
  const completed = items.filter((r) => r.status === "completed");
  return {
    total: items.length,
    completed: completed.length,
    percentage: items.length
      ? Math.round((completed.length / items.length) * 100)
      : null,
    remaining: items.filter((r) => r.status !== "completed"),
    overdue: items.filter(
      (r) => r.status !== "completed" && r.dueAt && r.dueAt < new Date(),
    ),
  };
}
