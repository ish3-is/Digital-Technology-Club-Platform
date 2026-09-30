export const permissionCatalog: Record<string, string> = {
  "organization.manage": "إدارة التنظيم",
  "committee.read": "قراءة مساحة اللجنة",
  "committee.update": "تعديل نبذة اللجنة",
  "report.review": "مراجعة التقارير",
  "audit.read": "قراءة التدقيق",
  "task.read": "قراءة المهام",
  "task.create": "إنشاء مهمة",
  "task.update": "إدارة المهمة",
  "task.update_own": "تحديث المهمة المسندة",
  "task.assign": "تعيين المسؤولين",
  "task.review": "مراجعة المهام",
  "task.override_dependency": "تجاوز اعتماد مهمة",
  "request.read": "قراءة الطلبات",
  "request.create": "إرسال طلب",
  "request.accept": "استلام الطلب",
  "request.update": "تنفيذ الطلب",
  "request.complete": "اعتماد الطلب",
  "meeting.read": "قراءة الاجتماعات",
  "meeting.create": "إنشاء اجتماع",
  "meeting.update": "إدارة الاجتماع",
  "decision.read": "قراءة القرارات",
  "decision.create": "تسجيل قرار",
  "approval.review": "اتخاذ قرار اعتماد",
  "goal.create": "إنشاء هدف",
  "goal.view": "قراءة الأهداف",
  "goal.update": "تعديل الهدف",
  "goal.measure": "تحديث قياس الهدف",
  "initiative.create": "إنشاء مبادرة",
  "initiative.view": "قراءة المبادرات",
  "initiative.update": "تعديل المبادرة",
  "kpi.create": "إنشاء مؤشر",
  "kpi.view": "قراءة المؤشرات",
  "kpi.update": "تعديل المؤشر",
  "kpi.measure": "إضافة قياس للمؤشر",
  "kpi.verify_evidence": "التحقق من أدلة المؤشر",
  "evidence.create": "رفع دليل",
  "evidence.view": "قراءة الأدلة",
  "evidence.verify": "اعتماد الدليل",
  "report.create": "إنشاء تقرير",
  "report.update": "تعديل التقرير",
  "report.view": "قراءة التقارير",
  "report.submit": "تقديم التقرير",
  "report.approve": "اعتماد التقرير",
  "governance.view": "قراءة الحوكمة",
  "governance.alerts": "قراءة تنبيهات الحوكمة",
  "supervisor.view": "قراءة موجز المشرف",
  "supervisor.brief": "الاطلاع على موجز المشرف",
  "club.executive": "مركز قيادة النادي",
};

export const roleCatalog: Record<
  string,
  { name: string; permissions: string[] }
> = {
  system_admin: {
    name: "مدير النظام",
    permissions: Object.keys(permissionCatalog),
  },
  president: {
    name: "رئيس النادي",
    permissions: ["committee.read", "committee.update", "report.review"],
  },
  vice_president: {
    name: "نائب رئيس النادي",
    permissions: ["committee.read", "committee.update", "report.review"],
  },
  male_section_lead: {
    name: "قائد شطر الطلاب",
    permissions: ["committee.read", "committee.update"],
  },
  female_section_lead: {
    name: "قائدة شطر الطالبات",
    permissions: ["committee.read", "committee.update"],
  },
  committee_head: {
    name: "رئيس اللجنة",
    permissions: ["committee.read", "committee.update"],
  },
  deputy_head: {
    name: "نائب رئيس اللجنة",
    permissions: ["committee.read", "committee.update"],
  },
  committee_member: { name: "عضو اللجنة", permissions: ["committee.read"] },
  supervisor: {
    name: "مشرف النادي",
    permissions: ["committee.read", "report.review", "governance.view", "governance.alerts", "supervisor.view", "supervisor.brief", "kpi.view", "evidence.view", "report.view"],
  },
};
const workLeads = Object.keys(permissionCatalog).filter(
  (p) =>
    /^(task|request|meeting|decision|approval)\./.test(p) &&
    p !== "task.override_dependency",
);
for (const id of [
  "president",
  "vice_president",
  "male_section_lead",
  "female_section_lead",
  "committee_head",
  "deputy_head",
])
  roleCatalog[id].permissions.push(...workLeads);
roleCatalog.committee_member.permissions.push(
  "task.read",
  "task.create",
  "task.update_own",
  "request.read",
  "request.create",
  "meeting.read",
  "decision.read",
  "goal.view",
  "initiative.view",
  "kpi.view",
  "evidence.view",
);
roleCatalog.supervisor.permissions.push(
  "task.read",
  "request.read",
  "meeting.read",
  "decision.read",
  "task.review",
  "request.complete",
  "approval.review",
);

const eventPermissions: Record<string, string> = {
  read: "قراءة الفعالية",
  create: "إنشاء فعالية",
  update: "إدارة الفعالية",
  submit: "تقديم الفعالية",
  approve: "اعتماد الفعالية والتقرير",
  cancel: "إلغاء الفعالية",
  archive: "أرشفة الفعالية",
  override_stage: "تجاوز متطلبات مرحلة",
  manage_team: "إدارة فريق الفعالية",
  manage_readiness: "إدارة الجاهزية",
  manage_attendance: "تسجيل الحضور",
  manage_participants: "إدارة بيانات المشاركين",
  view_budget: "قراءة ميزانية الفعالية",
  manage_budget: "تعديل ميزانية الفعالية",
  manage_files: "رفع ملفات الفعالية",
};
for (const [key, label] of Object.entries(eventPermissions))
  permissionCatalog[`event.${key}`] = label;
roleCatalog.system_admin.permissions = Object.keys(permissionCatalog);
for (const id of [
  "president",
  "vice_president",
  "male_section_lead",
  "female_section_lead",
  "committee_head",
  "deputy_head",
])
  roleCatalog[id].permissions.push(
    ...Object.keys(eventPermissions)
      .filter((k) => k !== "override_stage")
      .map((k) => `event.${k}`),
  );

const governancePermissions = Object.keys(permissionCatalog).filter(
  (p) => p.startsWith("goal.") || p.startsWith("initiative.") || p.startsWith("kpi.") || p.startsWith("evidence.") || p.startsWith("report.") || p.startsWith("governance.") || p.startsWith("supervisor."),
);
for (const id of [
  "president",
  "vice_president",
  "male_section_lead",
  "female_section_lead",
  "committee_head",
  "deputy_head",
])
  roleCatalog[id].permissions.push(...governancePermissions);
roleCatalog.committee_member.permissions.push("event.read");
roleCatalog.supervisor.permissions.push(
  "event.read",
  "event.approve",
  "event.view_budget",
);

// A permission may be inherited by multiple catalog groups.
for (const role of Object.values(roleCatalog)) {
  role.permissions = [...new Set(role.permissions)];
}


roleCatalog.supervisor.permissions.push("goal.view", "initiative.view");
for (const id of ["president", "vice_president"]) roleCatalog[id].permissions.push("club.executive");
