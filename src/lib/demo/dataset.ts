/**
 * تعريف بيانات العرض التجريبي (DEMO) — غير إنتاجي.
 *
 * كل معرّف هنا يبدأ بـ `demo-` وبريده `demo-<name>@club.local`، وهو ما يجعل
 * السجلات قابلة للتعرّف والحذف الآمن دون لمس أي بيانات حقيقية.
 *
 * الأسماء في هذا الملف مأخوذة من القائمة التي زودت بها إدارة النادي هذا
 * المشروع. الحسابات محلية تجريبية فقط ولا تستخدم بريد الأعضاء أو أرقامهم.
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
    head: "مشعل جذمي",
    members: ["براء"],
  },
  {
    id: "demo-c-organization",
    name: "اللجنة التنظيمية",
    description: "التجهيز واللوجستيات والحضور وتنسيق المتطوعين.",
    head: "محمد آل ملحة",
    deputy: "لمى القحطاني",
    members: [
      "محمد زياد محمد الشريف",
      "سما علي محمد الشهري",
      "رانيا بنت يحيى بن أحمد آل مداوي عسيري",
      "زايد عمر أحمد",
      "لمى محمد ذبيان",
      "أسيل شيلي حسن عايض الشهري",
      "سالم سعيد سالم آل حميد الشهراني",
      "عبدالله منصور بن عبدالله الشهراني",
      "أسماء جابر يحيى الحريصي",
      "حاتم بن محمد يحيى العسيري",
      "نهى بنت سعيد بن حسن آل حيدر",
      "رغد خالد الشاويش",
      "محمد عوض عثمان الشهري",
      "عبير إبراهيم حسن حمدي",
      "فاطمة بنت سعيد بن جابر القحطاني",
      "رانيا عبدالرحمن غرمان آل غرمان العمري",
      "طلال حسين سعيد آل ناجي القحطاني",
      "وعد بنت علي بن يحيى شراحيلي",
    ],
  },
  {
    id: "demo-c-media",
    name: "اللجنة الإعلامية",
    description: "التصميم والإعلانات والتغطية والبث والأرشفة.",
    head: "عبدالرحمن عسيري",
    deputy: "سارة الأسمري",
    members: [
      "فهد عبدالله آل دهمان",
      "ريما",
      "فراس عبدالله الصائغ",
      "ود صالح القحطاني",
      "دانة باسم آل محفوظ",
      "البراء ياسر علي أحمد",
      "غلا علي سعيد القحطاني",
      "أنس عبدالله محمد عسيري",
      "مها علي سعد القحطاني",
      "أسماء علي يحيى الفيفي",
    ],
  },
  {
    id: "demo-c-finance",
    name: "اللجنة المالية",
    description: "الميزانيات والمصروفات والوثائق المالية. الوصول محدود.",
    head: "سامر القرني",
    members: ["باسل حمدان الشهري", "محمد سعيد سيرة الشهراني", "ياسر إبراهيم"],
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
  { slug: "leader", name: "إياد القحطاني", roleId: "president", clubWide: true },
  { slug: "deputy-leader", name: "رغد مدخلي", roleId: "vice_president", clubWide: true },
  { slug: "section-head", name: "عمار محمد", roleId: "male_section_lead", clubWide: true },
  { slug: "female-section-head", name: "ريوف القحطاني", roleId: "female_section_lead", clubWide: true },
];

export const demoCommitteePeople: DemoPerson[] = [
  { slug: "digital-head", name: "مشعل جذمي", roleId: "committee_head", committeeId: "demo-c-digital" },
  { slug: "org-head", name: "محمد آل ملحة", roleId: "committee_head", committeeId: "demo-c-organization" },
  { slug: "org-deputy", name: "لمى القحطاني", roleId: "deputy_head", committeeId: "demo-c-organization" },
  { slug: "media-head", name: "عبدالرحمن عسيري", roleId: "committee_head", committeeId: "demo-c-media" },
  { slug: "media-deputy", name: "سارة الأسمري", roleId: "deputy_head", committeeId: "demo-c-media" },
  { slug: "finance-demo", name: "سامر القرني", roleId: "committee_head", committeeId: "demo-c-finance" },
];

export const demoMembers: DemoPerson[] = [
  { slug: "digital-m1", name: "براء", roleId: "committee_member", committeeId: "demo-c-digital" },
  { slug: "media-m1", name: "فهد عبدالله آل دهمان", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m2", name: "ريما", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m3", name: "فراس عبدالله الصائغ", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m4", name: "ود صالح القحطاني", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m5", name: "دانة باسم آل محفوظ", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m6", name: "البراء ياسر علي أحمد", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m7", name: "غلا علي سعيد القحطاني", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m8", name: "أنس عبدالله محمد عسيري", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m9", name: "مها علي سعد القحطاني", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "media-m10", name: "أسماء علي يحيى الفيفي", roleId: "committee_member", committeeId: "demo-c-media" },
  { slug: "org-m1", name: "محمد زياد محمد الشريف", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m2", name: "سما علي محمد الشهري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m3", name: "رانيا بنت يحيى بن أحمد آل مداوي عسيري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m4", name: "زايد عمر أحمد", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m5", name: "لمى محمد ذبيان", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m6", name: "أسيل شيلي حسن عايض الشهري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m7", name: "سالم سعيد سالم آل حميد الشهراني", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m8", name: "عبدالله منصور بن عبدالله الشهراني", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m9", name: "أسماء جابر يحيى الحريصي", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m10", name: "حاتم بن محمد يحيى العسيري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m11", name: "نهى بنت سعيد بن حسن آل حيدر", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m12", name: "رغد خالد الشاويش", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m13", name: "محمد عوض عثمان الشهري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m14", name: "عبير إبراهيم حسن حمدي", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m15", name: "فاطمة بنت سعيد بن جابر القحطاني", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m16", name: "رانيا عبدالرحمن غرمان آل غرمان العمري", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m17", name: "طلال حسين سعيد آل ناجي القحطاني", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "org-m18", name: "وعد بنت علي بن يحيى شراحيلي", roleId: "committee_member", committeeId: "demo-c-organization" },
  { slug: "finance-m1", name: "باسل حمدان الشهري", roleId: "committee_member", committeeId: "demo-c-finance" },
  { slug: "finance-m2", name: "محمد سعيد سيرة الشهراني", roleId: "committee_member", committeeId: "demo-c-finance" },
  { slug: "finance-m3", name: "ياسر إبراهيم", roleId: "committee_member", committeeId: "demo-c-finance" },
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
