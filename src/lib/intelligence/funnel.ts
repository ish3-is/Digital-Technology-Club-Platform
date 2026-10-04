/**
 * Onboarding funnel.
 *
 * Every stage is derived from records that already exist — applications,
 * accounts, placements, tasks, attendance, and onboarding plans. Nothing is
 * stored as a funnel row, and no stage is inferred from a stage before it:
 * a member only appears in "First Task" if they actually reached the previous
 * stage.
 *
 * Each stage below states the exact rule that puts someone in it, so the
 * numbers can be argued with rather than merely trusted.
 */
import type { Snapshots } from "./snapshots";
import { safeNumber } from "./snapshots";
import type { TimeRange } from "./provenance";

export type FunnelStageKey =
  | "application"
  | "accepted"
  | "committee_assigned"
  | "first_task"
  | "first_event"
  | "thirty_day"
  | "account_active";

export type FunnelStage = {
  key: FunnelStageKey;
  title: string;
  /** The precise rule that places a member in this stage. */
  rule: string;
  count: number;
  /** Count of the previous stage, used as the conversion denominator. */
  previousCount: number | null;
  /** Null when the previous stage has no members: "not measurable", not 0%. */
  conversionPercent: number | null;
  /** Conversion from the first stage, where that is meaningful. */
  overallPercent: number | null;
  /** Whether the stage could be measured at all from the available data. */
  available: boolean;
  reasonUnavailable?: string;
  /** Members at this stage, for drill-down, when the viewer may see them. */
  members: { id: string; name: string; href: string }[];
};

export type Funnel = {
  stages: FunnelStage[];
  totalApplications: number;
  period: { from: Date; to: Date; label: string };
  ruleNote: string;
};

/** A member's progression, derived once and reused across every stage. */
type Progression = {
  userId: string;
  name: string;
  hasApplication: boolean;
  appliedAt: Date | null;
  acceptedAt: Date | null;
  accountActive: boolean;
  committeeAssignedAt: Date | null;
  firstTaskAt: Date | null;
  firstEventAt: Date | null;
  completedThirtyDayAt: Date | null;
};

const ORDER: FunnelStageKey[] = [
  "application",
  "accepted",
  "committee_assigned",
  "first_task",
  "first_event",
  "thirty_day",
  "account_active",
];

const RULES: Record<FunnelStageKey, string> = {
  application:
    "وجود طلب انضمام مسجل للعضو (membership_applications)، مرتبط بحسابه عبر converted_user_id",
  accepted:
    "وجود طلب بحالة «مقبول» للعضو، وتاريخ قبوله مسجل",
  account_active:
    "الملف نشط (member_profiles.status = active). ملاحظة: النطاق يفعّل الملف عند اكتمال مسار التأهيل، لذلك هذه نتيجة المرحلة السابقة وليست خطوة قبلها",
  committee_assigned:
    "وجود توزيع ساري في member_committee_history بنهاية end_at غير منتهية",
  first_task:
    "وجود مهمةKind = task مسندة للعضو بلغت حالة «مكتملة» (work_items.status = completed)",
  first_event:
    "وجود سجل في event_attendance بحالة «حاضر» لمشارك مرتبط بحساب عضو. التسجيل المفتوح بلا حساب لا يُحتسب، لأن event_participants لا يحمل مرجعًا إلى العضو",
  thirty_day:
    "اكتمال مسار التأهيل بالكامل (onboarding_plans.status = completed مع completed_at)",
};

const TITLES: Record<FunnelStageKey, string> = {
  application: "طلب الانضمام",
  accepted: "تم القبول",
  committee_assigned: "تم إسناد اللجنة",
  first_task: "أول مهمة",
  first_event: "أول فعالية",
  thirty_day: "إكمال 30 يومًا",
  account_active: "الحساب مفعّل",
};

/**
 * Builds each member's progression from the snapshot.
 *
 * Work assignment lives in `work_assignments`, so "first task" means a task
 * assigned to that member that reached `completed` — not merely a task that
 * exists near them.
 */
function progressions(snap: Snapshots, range: TimeRange): Progression[] {
  const nameOf = snap.userNames;
  const profileById = new Map(snap.members.map((m) => [m.userId, m]));
  const inRange = (d: Date | null | undefined) =>
    d !== null && d !== undefined && d >= range.from && d <= range.to;

  // Completed tasks, attributed through the assignment table.
  const taskByMember = new Map<string, Date>();
  for (const a of snap.workAssignments) {
    const work = snap.work.find((w) => w.id === a.workId);
    if (!work || work.kind !== "task" || work.status !== "completed" || !work.completedAt)
      continue;
    const at = work.completedAt;
    const current = taskByMember.get(a.userId);
    if (!current || at < current) taskByMember.set(a.userId, at);
  }

  const eventByMember = new Map<string, Date>();
  for (const row of snap.attendance) {
    // A member counts as having attended once they are marked present; a
    // registration alone is not participation.
    if (row.status !== "present") continue;
    // The participant is only counted when the id resolves to a known member,
    // because `event_participants` carries no account reference.
    if (!profileById.has(row.participantId)) continue;
    const at = row.checkInAt ?? row.updatedAt ?? new Date(0);
    const current = eventByMember.get(row.participantId);
    if (!current || at < current) eventByMember.set(row.participantId, at);
  }

  // An application joins a person through the account it converted into.
  const appByMember = new Map<string, AppRow>();
  for (const a of snap.applications) {
    if (a.convertedUserId) appByMember.set(a.convertedUserId, a);
  }

  const placementByMember = new Map<string, Date>();
  for (const c of snap.committeeHistory)
    if (c.endAt === null && c.startAt) {
      const current = placementByMember.get(c.userId);
      if (!current || c.startAt < current) placementByMember.set(c.userId, c.startAt);
    }

  const onboardingByMember = new Map<string, Date>();
  for (const plan of snap.onboarding)
    if (plan.status === "completed" && plan.completedAt)
      onboardingByMember.set(plan.userId, plan.completedAt);

  const ids = new Set<string>([
    ...snap.members.map((m) => m.userId),
    ...appByMember.keys(),
    ...taskByMember.keys(),
    ...eventByMember.keys(),
  ]);

  return [...ids].map((userId) => {
    const profile = profileById.get(userId);
    const application = appByMember.get(userId);
    return {
      userId,
      name: nameOf.get(userId) || "عضو",
      hasApplication: application !== undefined,
      acceptedAt:
        application &&
        (application.status === "accepted" || application.status === "converted")
          ? (application.decidedAt ?? application.createdAt)
          : null,
      appliedAt: application?.createdAt ?? null,
      accountActive: (profile?.status ?? null) === "active",
      committeeAssignedAt: placementByMember.get(userId) ?? null,
      firstTaskAt: taskByMember.get(userId) ?? null,
      firstEventAt: eventByMember.get(userId) ?? null,
      completedThirtyDayAt: onboardingByMember.get(userId) ?? null,
    };
  });
}

type AppRow = {
  convertedUserId: string | null;
  status: string;
  decidedAt: Date | null;
  createdAt: Date | null;
};

/**
 * Builds the funnel.
 *
 * Each stage is counted only among members who reached the stage before it,
 * so the funnel never shows someone "skipping" a step they were never in.
 */
export function onboardingFunnel(snap: Snapshots, range: TimeRange): Funnel {
  const all = progressions(snap, range);
  const first = all.filter((p) => p.hasApplication);

  const total = first.length;

  // Cumulative reach: each stage is intersected with the stages before it, so
  // the counts form a true funnel and a percentage can never exceed 100%.
  const cumulative: Record<FunnelStageKey, Progression[]> = {
    application: first,
    accepted: [],
    account_active: [],
    committee_assigned: [],
    first_task: [],
    first_event: [],
    thirty_day: [],
  };
  // Stages 1–4 form a strict progression: reaching a later one implies the
  // earlier ones. From "first event" the branches are independent, because not
  // every member attends an event and demanding attendance would hide members
  // who genuinely completed onboarding.
  const CUMULATIVE_THROUGH: FunnelStageKey = "first_task";

  let soFar: Progression[] = first;
  for (const key of ORDER.slice(1)) {
    if (
      key === "first_event" ||
      key === "thirty_day" ||
      key === "account_active"
    ) {
      const rule: keyof Progression =
        key === "first_event"
          ? "firstEventAt"
          : key === "thirty_day"
            ? "completedThirtyDayAt"
            : "accountActive";
      cumulative[key] = soFar.filter((p) =>
        key === "account_active"
          ? p.accountActive
          : p[rule] !== null && p[rule] !== undefined,
      );
      continue;
    }
    // Only the strictly cumulative stages reach this point.
    const rule: keyof Progression =
      key === "accepted"
        ? "acceptedAt"
        : key === "committee_assigned"
          ? "committeeAssignedAt"
          : "firstTaskAt";
    soFar = soFar.filter((p) => p[rule] !== null && p[rule] !== undefined);
    cumulative[key] = soFar;
  }

  const stages: FunnelStage[] = ORDER.map((key, index) => {
    const list = cumulative[key];
    // A cumulative stage is measured against the stage before it. An
    // independent branch is measured against the last cumulative stage, since
    // the row above it is a branch that may legitimately be empty.
    const previous =
      index === 0
        ? null
        : key === "first_event" || key === "thirty_day" || key === "account_active"
          ? cumulative[CUMULATIVE_THROUGH].length
          : cumulative[ORDER[index - 1]].length;
    // A conversion needs a non-empty previous stage; with none, it is
    // unmeasurable rather than 0%.
    const conversion =
      previous === null ? null : previous > 0 ? Math.round((list.length / previous) * 100) : null;
    const overall = total > 0 ? Math.round((list.length / total) * 100) : null;
    const measurable = previous === null ? total > 0 : previous > 0;
    return {
      key,
      title: TITLES[key],
      rule: RULES[key],
      count: list.length,
      previousCount: previous,
      conversionPercent: conversion,
      overallPercent: overall,
      available: measurable,
      reasonUnavailable: measurable
        ? undefined
        : previous === null
          ? "لا توجد طلبات انضمام مسجلة، فلا يبدأ قمع التأهيل"
          : "المرحلة السابقة لا تحتوي أعضاء، فيستحيل حساب التحويل",
      members: list.slice(0, 50).map((p) => ({
        id: p.userId,
        name: p.name,
        href: `/people?member=${p.userId}`,
      })),
    };
  });

  return {
    stages,
    totalApplications: total,
    period: { from: range.from, to: range.to, label: range.labelAr },
    ruleNote:
      "كل مرحلة مشتقة من سجلات قائمة، وكل مرحلة تذكر القاعدة التي أدرجت العضو فيها. المراحل من «الطلب» إلى «أول مهمة» تتراكم، أما «أول فعالية» و«إكمال 30 يومًا» و«الحساب مفعّل» فهي فروع مستقلة تُقاس من «أول مهمة»، لأن الحضور ليس شرطًا لإتمام التأهيل. التحويل غير متاح عندما تكون مرحلة القياس فارغة، ولا يُعرض كصفر.",
  };
}

/** Stage counts only, for compact summaries on other intelligence pages. */
export function funnelSummary(funnel: Funnel) {
  return funnel.stages.map((s) => ({
    key: s.key,
    title: s.title,
    count: s.count,
    conversionPercent: s.conversionPercent,
    available: s.available,
  }));
}

/** Guards against NaN reaching a chart when the funnel is empty. */
export function safeFunnelValue(value: number | null): number | null {
  return safeNumber(value);
}