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

// Phase 5: People, membership and contribution. Self-service read stays narrow;
// management actions are never granted to the supervisor by default.
const peoplePermissions: Record<string, string> = {
  "member.view": "قراءة ملفات الأعضاء",
  "member.create": "إنشاء ملف عضو",
  "member.update": "تعديل ملف عضو",
  "member.archive": "أرشفة عضو",
  "application.view": "قراءة طلبات الانضمام",
  "application.create": "تسجيل طلب انضمام",
  "application.review": "مراجعة طلب انضمام",
  "application.decide": "اتخاذ قرار على الطلب",
  "onboarding.view": "قراءة مسارات التأهيل",
  "onboarding.manage": "إدارة مراحل التأهيل",
  "committee_assignment.view": "قراءة توزيع اللجان",
  "committee_assignment.manage": "إدارة توزيع اللجان",
  "mentor.view": "قراءة الإرشاد",
  "mentor.assign": "تعيين مرشد",
  "mentor.update": "تحديث متابعة الإرشاد",
  "volunteer_hours.view": "قراءة الساعات التطوعية",
  "volunteer_hours.submit": "تسجيل ساعات تطوعية",
  "volunteer_hours.approve": "اعتماد الساعات التطوعية",
  "achievement.view": "قراءة الإنجازات",
  "achievement.create": "تسجيل إنجاز",
  "achievement.verify": "التحقق من الإنجاز",
  "badge.view": "قراءة الشارات",
  "badge.manage": "إدارة تعريفات الشارات",
  "badge.award": "منح شارة",
  "xp.view": "قراءة نقاط الخبرة",
  "xp.adjust": "تعديل نقاط الخبرة",
  "impact.view": "قراءة نقاط الأثر",
  "impact.adjust": "تعديل نقاط الأثر",
  "transfer.view": "قراءة طلبات النقل",
  "transfer.request": "طلب نقل",
  "transfer.approve": "اعتماد النقل",
  "handover.view": "قراءة عمليات التسليم",
  "handover.manage": "إدارة عمليات التسليم",
};
for (const [key, label] of Object.entries(peoplePermissions))
  permissionCatalog[key] = label;
// system_admin re-derives from the catalog, so it picks the new families up here.
roleCatalog.system_admin.permissions = Object.keys(permissionCatalog);
const peopleLeads = Object.keys(peoplePermissions);
for (const id of [
  "president",
  "vice_president",
  "male_section_lead",
  "female_section_lead",
  "committee_head",
  "deputy_head",
])
  roleCatalog[id].permissions.push(...peopleLeads);
// Committee leadership sees only its own committee's members; the scope on the
// assignment decides which rows are visible, not the permission alone.
roleCatalog.committee_member.permissions.push(
  "member.view",
  "application.view",
  "onboarding.view",
  "committee_assignment.view",
  "mentor.view",
  "volunteer_hours.view",
  "volunteer_hours.submit",
  "achievement.view",
  "badge.view",
  "xp.view",
  "impact.view",
  "transfer.view",
  "transfer.request",
  "handover.view",
);
// The supervisor observes progress and approves independent records only.
// No member.create/update/archive, no committee placement, no XP or impact edits.
roleCatalog.supervisor.permissions.push(
  "member.view",
  "application.view",
  "application.review",
  "onboarding.view",
  "committee_assignment.view",
  "mentor.view",
  "volunteer_hours.view",
  "achievement.view",
  "achievement.verify",
  "badge.view",
  "xp.view",
  "impact.view",
  "transfer.view",
  "transfer.approve",
  "handover.view",
  "volunteer_hours.approve",
);

for (const role of Object.values(roleCatalog)) {
  role.permissions = [...new Set(role.permissions)];
}


roleCatalog.supervisor.permissions.push("goal.view", "initiative.view");
for (const id of ["president", "vice_president"]) roleCatalog[id].permissions.push("club.executive");

// ========================
// Phase 6: Specialized Committee Operations
// ========================
// Finance separates create / review / approve / reconcile so a submitter cannot
// walk an expense through all four by itself. Media and digital keep their
// review and approval apart for the same reason. The supervisor receives read
// and independent-approval rights only — never committee-internal edit.
const operationsPermissions: Record<string, string> = {
  "finance.view": "قراءة العمليات المالية",
  "finance.budget.create": "إنشاء ميزانية",
  "finance.budget.update": "تعديل الميزانية",
  "finance.expense.create": "إنشاء طلب مصروف",
  "finance.expense.review": "مراجعة طلب المصروف",
  "finance.expense.approve": "اعتماد طلب المصروف",
  "finance.purchase.record": "تسجيل عملية الشراء",
  "finance.reconcile": "مطابقة المصروفات",
  "media.view": "قراءة طلبات الإعلام",
  "media.request.create": "إنشاء طلب إعلامي",
  "media.request.manage": "إدارة الطلب الإعلامي",
  "media.assign": "إسناد التنفيذ",
  "media.review": "مراجعة المخرجات الإعلامية",
  "media.approve": "اعتماد المخرجات الإعلامية",
  "media.publish": "جدولة ونشر المحتوى",
  "media.archive": "أرشفة الأرشيف الإعلامي",
  "digital.view": "قراءة الخدمات الرقمية",
  "digital.request.create": "إنشاء طلب خدمة رقمية",
  "digital.request.manage": "إدارة الطلب الرقمي",
  "digital.forms.manage": "إدارة سجل النماذج",
  "digital.surveys.manage": "إدارة الاستبانات والتصويت",
  "digital.certificates.manage": "إدارة دفعات الشهادات",
  "digital.resources.manage": "إدارة الموارد الرقمية",
  "resource.view": "قراءة الأصول والحجوزات",
  "resource.manage": "إدارة الأصول",
  "resource.reserve": "حجز أصل",
  "resource.approve": "اعتماد حجز الأصل",
  "resource.checkout": "استلام وإرجاع الأصل",
};
for (const [key, label] of Object.entries(operationsPermissions))
  permissionCatalog[key] = label;
roleCatalog.system_admin.permissions = Object.keys(permissionCatalog);

const financeLeads = [
  "finance.view",
  "finance.budget.create",
  "finance.budget.update",
  "finance.expense.review",
  "finance.expense.approve",
  "finance.purchase.record",
  "finance.reconcile",
];
const mediaLeads = [
  "media.view",
  "media.request.manage",
  "media.assign",
  "media.review",
  "media.approve",
  "media.publish",
  "media.archive",
];
const digitalLeads = [
  "digital.view",
  "digital.request.manage",
  "digital.forms.manage",
  "digital.surveys.manage",
  "digital.certificates.manage",
  "digital.resources.manage",
];
const resourceLeads = [
  "resource.view",
  "resource.manage",
  "resource.approve",
  "resource.checkout",
];
// Club-wide leadership carries the full specialized surface; committee-scoped
// roles reach it only through grants, so the scope on the assignment decides
// which rows they see rather than the permission name alone.
for (const id of ["president", "vice_president"]) {
  roleCatalog[id].permissions.push(
    ...financeLeads,
    ...mediaLeads,
    ...digitalLeads,
    ...resourceLeads,
    "finance.expense.create",
    "media.request.create",
    "digital.request.create",
    "resource.reserve",
  );
}
for (const id of ["male_section_lead", "female_section_lead"])
  roleCatalog[id].permissions.push("finance.view", "media.view", "digital.view", "resource.view");
// A committee head runs its own committee's media, digital and resource desk.
// Finance stays out: money is separated from committee leadership on purpose.
for (const id of ["committee_head", "deputy_head"])
  roleCatalog[id].permissions.push(
    ...mediaLeads,
    ...digitalLeads,
    ...resourceLeads,
    "media.request.create",
    "digital.request.create",
    "resource.reserve",
    "finance.expense.create",
  );
// Any committee member may raise a cross-committee request and reserve a shared
// asset. Finance is deliberately absent: ordinary members do not get
// finance.view, so private financial records stay out of reach. They may still
// submit their own expense request, which only they and the finance desk read.
roleCatalog.committee_member.permissions.push(
  "finance.expense.create",
  "media.view",
  "media.request.create",
  "digital.view",
  "digital.request.create",
  "resource.view",
  "resource.reserve",
);
// The supervisor observes and approves independent records. No committee
// internals: no media.request.manage, no digital.forms.manage, no resource.manage.
roleCatalog.supervisor.permissions.push(
  "finance.view",
  "finance.expense.approve",
  "finance.reconcile",
  "media.view",
  "media.approve",
  "digital.view",
  "resource.view",
);

// Media and digital are club-wide service desks: the organization committee
// raises a request and the media committee must be able to read and work it, so
// those desks are granted at club scope through dedicated roles. A media lead
// still cannot reach digital records — the permission families stay separate.
const serviceDesks = [
  {
    id: "media_lead",
    name: "مسؤول الإعلام",
    permissions: mediaLeads,
  },
  {
    id: "digital_lead",
    name: "مسؤول الخدمات الرقمية",
    permissions: digitalLeads,
  },
  {
    id: "finance_lead",
    name: "مسؤول المالية",
    // The finance desk reviews and approves what members submit, and may raise
    // a request of its own.
    permissions: [...financeLeads, "finance.expense.create"],
  },
  {
    id: "resources_lead",
    name: "مسؤول الموارد",
    permissions: resourceLeads,
  },
];
for (const desk of serviceDesks) {
  roleCatalog[desk.id] = {
    name: desk.name,
    permissions: [...new Set(desk.permissions)],
  };
  roleCatalog.system_admin.permissions.push(...roleCatalog[desk.id].permissions);
}
// A service desk can see the queues it serves plus a bare read of the others, so
// cross-desk status is visible while the other domain's internals stay closed.
roleCatalog.media_lead.permissions.push("digital.view", "resource.view");
roleCatalog.digital_lead.permissions.push("media.view", "resource.view");
roleCatalog.resources_lead.permissions.push("media.view", "digital.view");
// Finance stays closed to the other three desks: amounts and vendors are not
// something a media or digital desk needs in order to do its job.
roleCatalog.finance_lead.permissions.push(
  "media.view",
  "digital.view",
  "resource.view",
);

// ========================
// Phase 7: Operational intelligence
// ========================
// Read-only by construction: every permission here grants visibility, never an
// edit. The supervisor gets oversight without committee-internal access, and
// committee members see their own scope rather than the club-wide picture.
const intelligencePermissions: Record<string, string> = {
  "intelligence.view": "قراءة طبقة الاستخبارات التشغيلية",
  "intelligence.executive": "الاطلاع على الاستخبارات التنفيذية للنادي",
  "intelligence.committees": "الاطلاع على استخبارات اللجان",
  "intelligence.events": "الاطلاع على استخبارات الفعاليات",
  "intelligence.reports": "إنشاء تقارير تشغيلية وتصديرها",
};
for (const [key, label] of Object.entries(intelligencePermissions))
  permissionCatalog[key] = label;
roleCatalog.system_admin.permissions = Object.keys(permissionCatalog);

// Club leadership sees the whole operational picture; the supervisor sees the
// same read-only oversight without any committee-internal edit right.
for (const id of ["president", "vice_president"])
  roleCatalog[id].permissions.push(
    "intelligence.view",
    "intelligence.executive",
    "intelligence.committees",
    "intelligence.events",
    "intelligence.reports",
  );
roleCatalog.supervisor.permissions.push(
  "intelligence.view",
  "intelligence.executive",
  "intelligence.events",
  "intelligence.reports",
);
// Committee heads see their own committee's detail, not the executive view.
for (const id of ["committee_head", "deputy_head"])
  roleCatalog[id].permissions.push(
    "intelligence.view",
    "intelligence.committees",
    "intelligence.events",
  );
roleCatalog.committee_member.permissions.push("intelligence.view");

for (const role of Object.values(roleCatalog))
  role.permissions = [...new Set(role.permissions)];
