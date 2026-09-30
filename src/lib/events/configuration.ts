import { db } from "../../db";
import * as s from "../../db/schema";
export async function seedEventConfiguration() {
  await db
    .insert(s.eventPlaybooks)
    .values({
      id: "workshop",
      name: "ورشة عمل",
      definition: {
        requirements: [
          {
            title: "تحديد الموقع",
            category: "الموقع",
            required: true,
            gate: "pending_approval",
          },
          {
            title: "اعتماد الموعد وخطة الورشة",
            category: "التنظيم",
            required: true,
            gate: "pending_approval",
          },
          {
            title: "تجهيز رابط أو قائمة التسجيل",
            category: "التسجيل",
            required: true,
            gate: "registration_open",
          },
          {
            title: "خطة الطوارئ",
            category: "التنظيم",
            required: true,
            gate: "ready",
          },
          {
            title: "تجهيز الحضور",
            category: "الحضور",
            required: true,
            gate: "ready",
          },
          {
            title: "تجهيز الشهادات",
            category: "الشهادات",
            required: false,
            gate: "final_report",
          },
          {
            title: "إرسال الاستبيان",
            category: "التقرير",
            required: true,
            gate: "final_report",
          },
          {
            title: "رفع التقرير النهائي",
            category: "التقرير",
            required: true,
            gate: "archived",
          },
        ],
        tasks: [
          { title: "تجهيز الموقع والتقنية", category: "technical" },
          { title: "إنشاء طلب التصميم ومتابعة البوستر", category: "media" },
          { title: "تجهيز قائمة الحضور والشهادات", category: "organization" },
        ],
      },
    })
    .onConflictDoNothing();
  for (const [id, name, permissions] of [
    [
      "lead",
      "قائد الفعالية",
      [
        "event.update",
        "event.submit",
        "event.manage_readiness",
        "event.manage_files",
      ],
    ],
    ["coordinator", "منسق", ["event.manage_readiness", "event.manage_files"]],
    [
      "organization",
      "تنظيم",
      ["event.manage_participants", "event.manage_attendance"],
    ],
    ["media", "إعلام", ["event.manage_files"]],
    ["technical", "تقنية", []],
    ["finance", "مالية", []],
    ["volunteer", "متطوع", []],
  ] as [string, string, string[]][])
    await db
      .insert(s.eventRoles)
      .values({ id, name, permissions })
      .onConflictDoNothing();
}
