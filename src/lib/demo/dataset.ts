/**
 * تعريف بيانات العرض التجريبي (DEMO) — غير إنتاجي.
 *
 * كل معرّف هنا يبدأ بـ `demo-` وبريده `demo-<name>@club.local`، وهو ما يجعل
 * السجلات قابلة للتعرّف والحذف الآمن دون لمس أي بيانات حقيقية.
 *
 * لا يحتوي هذا الملف على أي بيانات شخصية حقيقية: الأسماء المذكورة أعلاه هي
 * أدوار قيادية provided من إدارة النادي، وأي عضو إضافي يحمل بادئة «تجريبي».
 */

/** بادئة كل معرّف يكتبه هذا الملف. لا تستخدمها في أي مكان آخر. */
export const DEMO_PREFIX = "demo-";

export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX);

/** البريد التجريبي: نطاق محلي غير قابل للتسجيل، وليس حسابًا جامعيًا. */
export const demoEmail = (slug: string) => `demo-${slug}@club.local`;

/** كلمة مرور موحدة للعرض فقط — لا تُستخدم خارج بيئة التطوير. */
export const DEMO_PASSWORD = "DemoClub2026!";

export const demoTerm = {
  id: "demo-term",
  name: "الفصل التجريبي — تشغيل النادي",
  year: "بيانات عرض تجريبية",
  status: "active" as const,
};

export type DemoCommittee = {
  id: string;
  name: string;
  description: string;
  head: string;
  deputy?: string;
  members: string[];
};

/**
 * Club committees in the demo dataset.
 * - «مسؤول مالي تجريبي» is a development-only account: no finance leadership
 *   names were supplied, so none were invented.
 */
export const demoCommittees: DemoCommittee[] = [
  {
    id: "demo-c-digital",
    name: "اللجنة الرقمية",
    description: "النماذج والروابط والشهادات والدعم التقني للفعاليات.",
    head: "مشعل",
    deputy: "البراء",
    members: ["عضو رقمي تجريبي ١", "عضو رقمي تجريبي ٢", "عضو رقمي تجريبي ٣"],
  },
  {
    id: "demo-c-organization",
    name: "اللجنة التنظيمية",
    description: "التجهيز واللوجستيات والحضور وتنسيق المتطوعين.",
    head: "محمد آل ملحة",
    deputy: "غلا",
    members: [
      "عضو تنظيمي تجريبي ١",
      "عضو تنظيمي تجريبي ٢",
      "عضو تنظيمي تجريبي ٣",
    ],
  },
  {
    id: "demo-c-media",
    name: "اللجنة الإعلامية",
    description: "التصميم والإعلانات والتغطية والبث والأرشفة.",
    head: "عبدالرحمن",
    deputy: "سارة",
    members: ["عضو إعلامي تجريبي ١", "عضو إعلامي تجريبي ٢"],
  },
  {
    id: "demo-c-finance",
    name: "اللجنة المالية",
    description: "الميزانيات والمصروفات والوثائق المالية. الوصول محدود.",
    // No real leadership names were supplied for finance; this is a dev-only actor.
    head: "مسؤول مالي تجريبي",
    members: ["عضو مالي تجريبي ١"],
  },
];

export type DemoPerson = {
  slug: string;
  name: string;
  roleId: string;
  committeeId?: string;
  clubWide?: boolean;
};

/**
 * Leadership map. `supervisor`, `president`, `vice_president` and `male_section_lead`
 * already exist in the role catalog; no new roles are introduced and no ordinary
 * leader is mapped to system_admin.
 */
export const demoLeadership: DemoPerson[] = [
  { slug: "supervisor", name: "د. عبدالمنعم الشهراني", roleId: "supervisor", clubWide: true },
  { slug: "leader", name: "إياد", roleId: "president", clubWide: true },
  { slug: "deputy-leader", name: "رغد", roleId: "vice_president", clubWide: true },
  { slug: "section-head", name: "محمد عمار", roleId: "male_section_lead", clubWide: true },
];

export const demoCommitteePeople: DemoPerson[] = [
  { slug: "digital-head", name: "مشعل", roleId: "committee_head", committeeId: "demo-c-digital" },
  { slug: "digital-deputy", name: "البراء", roleId: "deputy_head", committeeId: "demo-c-digital" },
  { slug: "org-head", name: "محمد آل ملحة", roleId: "committee_head", committeeId: "demo-c-organization" },
  { slug: "org-deputy", name: "غلا", roleId: "deputy_head", committeeId: "demo-c-organization" },
  { slug: "media-head", name: "عبدالرحمن", roleId: "committee_head", committeeId: "demo-c-media" },
  { slug: "media-deputy", name: "سارة", roleId: "deputy_head", committeeId: "demo-c-media" },
  { slug: "finance-demo", name: "مسؤول مالي تجريبي", roleId: "committee_head", committeeId: "demo-c-finance" },
];

export const demoMembers: DemoPerson[] = [
  { slug: "digital-m1", name: "عضو رقمي تجريبي ١", roleId: "committee_member", committeeId: "demo-c-digital" },
  { slug: "digital-m2", name: "عضو رقمي تجريبي ٢", roleId: "committee_member", committeeId: "demo-c-digital" },
  { slug: "digital-m3", name: "عضو رقمي تجريبي ٣", roleId: "committee_member", committeeId: "demo-c-digital" },
  { slug: "org-m1", name: "عضو تنظيمي تجريبي ١", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m2", name: "عضو تنظيمي تجريبي ٢", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m3", name: "عضو تنظيمي تجريبي ٣", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "media-m1", name: "عضو إعلامي تجريبي ١", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m2", name: "عضو إعلامي تجريبي ٢", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "finance-m1", name: "عضو مالي تجريبي ١", roleId: "committee_member", committeeId: "demo-c-finance" },
];

export const demoPeople = [...demoLeadership, ...demoCommitteePeople, ...demoMembers];

/** Maps a display name to its demo slug. */
export const slugByName = (name: string) =>
  demoPeople.find((p) => p.name === name)?.slug;

/** Activity category for visualisation only; not an official classification. */
export type DemoCategory =
  | "الذكاء الاصطناعي"
  | "البيانات"
  | "التطوير المهني"
  | "الأمن السيبراني"
  | "UI/UX"
  | "البرمجة"
  | "الروبوتات والتقنيات الحديثة";

export type DemoActivity = {
  slug: string;
  title: string;
  category: DemoCategory;
  completed: boolean;
  /** Lead committee; the others collaborate. */
  lead: string;
  /** Partner organisations recorded in the event notes. */
  partners?: string[];
  /** Offset in days from today; negative means it already happened. */
  dayOffset: number;
  attendees?: number;
};

export const demoActivities: DemoActivity[] = [
  {
    slug: "deep-learning",
    title: "دورة التعلم العميق",
    category: "الذكاء الاصطناعي",
    completed: true,
    lead: "demo-c-digital",
    dayOffset: -75,
    attendees: 42,
  },
  {
    slug: "career-profile",
    title: "ورشة تطوير الملف المهني",
    category: "التطوير المهني",
    completed: true,
    lead: "demo-c-organization",
    dayOffset: -52,
    attendees: 35,
  },
  {
    slug: "cybersecurity-basics",
    title: "دورة أساسيات الأمن السيبراني",
    category: "الأمن السيبراني",
    completed: true,
    lead: "demo-c-digital",
    partners: ["نادي الأمن السيبراني"],
    dayOffset: -28,
    attendees: 48,
  },
  {
    slug: "uiux",
    title: "دورة UI/UX",
    category: "UI/UX",
    completed: false,
    lead: "demo-c-digital",
    dayOffset: 21,
  },
  {
    slug: "programming-for-all",
    title: "البرمجة للجميع",
    category: "البرمجة",
    completed: false,
    lead: "demo-c-digital",
    dayOffset: 38,
  },
  {
    slug: "data-to-decisions",
    title: "البيانات: من الأرقام إلى القرارات",
    category: "البيانات",
    completed: false,
    lead: "demo-c-organization",
    dayOffset: 54,
  },
  {
    slug: "competitive-programming",
    title: "البرمجة التنافسية",
    category: "البرمجة",
    completed: false,
    lead: "demo-c-digital",
    dayOffset: 70,
  },
  {
    slug: "robotics-camp",
    title: "معسكر الروبوتات والتقنيات الحديثة",
    category: "الروبوتات والتقنيات الحديثة",
    completed: false,
    lead: "demo-c-organization",
    dayOffset: 92,
  },
];

/**eterministic ISO date helper for the demo dataset. */
export const demoDate = (dayOffset: number, hour = 17) => {
  const base = new Date();
  base.setUTCHours(hour, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString();
};

export const demoId = (slug: string) => `${DEMO_PREFIX}${slug}`;