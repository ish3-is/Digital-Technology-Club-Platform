import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";

export const accountCommitteeOptions = [
  { id: "management", name: "إدارة النادي", committeeId: null },
  { id: "media", name: "اللجنة الإعلامية", committeeId: "media" },
  {
    id: "organization",
    name: "لجنة التنظيم والتخطيط",
    committeeId: "organization",
  },
  { id: "finance", name: "اللجنة المالية", committeeId: "finance" },
  { id: "digital", name: "اللجنة الرقمية", committeeId: "digital" },
] as const;

export type AccountCommitteeKey = (typeof accountCommitteeOptions)[number]["id"];

type RosterSeed = {
  id: string;
  fullName: string;
  groupKey: AccountCommitteeKey;
  position: string;
  aliases?: string[];
};

export function normalizeArabicName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

export const officialRoster: readonly RosterSeed[] = [
  { id: "management-club-leader", fullName: "إياد القحطاني", groupKey: "management", position: "رائد النادي" },
  { id: "management-deputy", fullName: "رغد مدخلي", groupKey: "management", position: "نائبة رائد النادي" },
  { id: "management-male-lead", fullName: "عمار محمد", groupKey: "management", position: "رئيس شطر الطلاب" },
  { id: "management-female-lead", fullName: "ريوف القحطاني", groupKey: "management", position: "رئيسة شطر الطالبات" },

  { id: "media-head", fullName: "عبدالرحمن عسيري", groupKey: "media", position: "رئيس اللجنة" },
  { id: "media-deputy", fullName: "سارة الأسمري", groupKey: "media", position: "نائبة رئيس اللجنة" },
  { id: "media-01", fullName: "فهد عبدالله آل جرمان", groupKey: "media", position: "عضو" },
  { id: "media-02", fullName: "ريما", groupKey: "media", position: "عضو" },
  { id: "media-03", fullName: "فراس عبدالله الصاقطي", groupKey: "media", position: "عضو" },
  { id: "media-04", fullName: "ود صالح القحطاني", groupKey: "media", position: "عضو" },
  { id: "media-05", fullName: "دانه باسم آل محفوظ", groupKey: "media", position: "عضو" },
  { id: "media-06", fullName: "البراء ياسر علي أحمد", groupKey: "media", position: "عضو" },
  { id: "media-07", fullName: "غلا علي سعيد القحطاني", groupKey: "media", position: "عضو" },
  { id: "media-08", fullName: "أنس عبدالله محمد عسيري", groupKey: "media", position: "عضو" },
  { id: "media-09", fullName: "مها علي سعد القحطاني", groupKey: "media", position: "عضو" },
  { id: "media-10", fullName: "أسماء علي يحيى الفيفي", groupKey: "media", position: "عضو" },

  { id: "organization-head", fullName: "محمد آل ملحّة", groupKey: "organization", position: "رئيس اللجنة" },
  { id: "organization-deputy", fullName: "لمى القحطاني", groupKey: "organization", position: "نائبة رئيس اللجنة" },
  { id: "organization-01", fullName: "محمد زياد محمد الشريف", groupKey: "organization", position: "عضو" },
  { id: "organization-02", fullName: "سما علي محمد الشهري", groupKey: "organization", position: "عضو" },
  { id: "organization-03", fullName: "رانيا بنت يحي بن أحمد آل مداوي عسيري", groupKey: "organization", position: "عضو" },
  { id: "organization-04", fullName: "زايد عمر أحمد", groupKey: "organization", position: "عضو" },
  { id: "organization-05", fullName: "لمى محمد ذيبان", groupKey: "organization", position: "عضو" },
  { id: "organization-06", fullName: "أسيل شبيلي حسن عايض الشهري", groupKey: "organization", position: "عضو" },
  { id: "organization-07", fullName: "سالم سعيد سالم آل حميد الشهراني", groupKey: "organization", position: "عضو" },
  { id: "organization-08", fullName: "عبدالله منصور بن عبدالله الشهراني", groupKey: "organization", position: "عضو" },
  { id: "organization-09", fullName: "أسماء جابر يحيى الحريصي", groupKey: "organization", position: "عضو" },
  { id: "organization-10", fullName: "حاتم بن محمد يحيى العسيري", groupKey: "organization", position: "عضو" },
  { id: "organization-11", fullName: "نهى بنت سعيد بن حسن آل حيدر", groupKey: "organization", position: "عضو" },
  { id: "organization-12", fullName: "رغد خالد الشاويش", groupKey: "organization", position: "عضو" },
  { id: "organization-13", fullName: "محمد عوض عثمان الشهري", groupKey: "organization", position: "عضو" },
  { id: "organization-14", fullName: "عبير إبراهيم حسن حمدي", groupKey: "organization", position: "عضو" },
  { id: "organization-15", fullName: "فاطمة بنت سعيد بن جابر القحطاني", groupKey: "organization", position: "عضو" },
  { id: "organization-16", fullName: "رانيا عبدالرحمن غرمان آل غرمان العمري", groupKey: "organization", position: "عضو" },
  { id: "organization-17", fullName: "طلال حسين سعيد آل ناحي القحطاني", groupKey: "organization", position: "عضو" },
  { id: "organization-18", fullName: "وعد بنت علي بن يحيى شراحيلي", groupKey: "organization", position: "عضو" },

  { id: "finance-head", fullName: "سامر القرني", groupKey: "finance", position: "رئيس اللجنة" },
  { id: "finance-01", fullName: "باسل حمدان الشهري", groupKey: "finance", position: "عضو" },
  { id: "finance-02", fullName: "محمد سعيد سبرة الشهراني", groupKey: "finance", position: "عضو" },
  { id: "finance-03", fullName: "ياسر إبراهيم", groupKey: "finance", position: "عضو" },

  {
    id: "digital-head",
    fullName: "مشعل الجذمي",
    groupKey: "digital",
    position: "رئيس اللجنة",
    aliases: ["مشعل جذمي"],
  },
  { id: "digital-01", fullName: "براء", groupKey: "digital", position: "عضو" },
] as const;

export function rosterNameMatches(
  entry: Pick<RosterSeed, "fullName" | "aliases">,
  submittedName: string,
) {
  const normalized = normalizeArabicName(submittedName);
  return [entry.fullName, ...(entry.aliases ?? [])].some(
    (candidate) => normalizeArabicName(candidate) === normalized,
  );
}

export async function seedOfficialRoster() {
  for (const option of accountCommitteeOptions) {
    if (!option.committeeId) continue;
    await db
      .insert(s.committees)
      .values({ id: option.committeeId, name: option.name })
      .onConflictDoUpdate({
        target: s.committees.id,
        set: { name: option.name, active: true },
      });
  }

  for (const member of officialRoster) {
    const committeeId =
      accountCommitteeOptions.find((option) => option.id === member.groupKey)
        ?.committeeId ?? null;
    await db
      .insert(s.officialClubRoster)
      .values({
        ...member,
        aliases: [...(member.aliases ?? [])],
        normalizedName: normalizeArabicName(member.fullName),
        committeeId,
      })
      .onConflictDoUpdate({
        target: s.officialClubRoster.id,
        set: {
          fullName: member.fullName,
          normalizedName: normalizeArabicName(member.fullName),
          aliases: [...(member.aliases ?? [])],
          groupKey: member.groupKey,
          committeeId,
          position: member.position,
          active: true,
          updatedAt: new Date(),
        },
      });
  }

  const [admin] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(eq(s.user.email, "mesh.jth@gmail.com"));
  if (admin)
    await db
      .update(s.officialClubRoster)
      .set({ claimedUserId: admin.id, updatedAt: new Date() })
      .where(eq(s.officialClubRoster.id, "digital-head"));

  return { committees: accountCommitteeOptions.length - 1, members: officialRoster.length };
}
