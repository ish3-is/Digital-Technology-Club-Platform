import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { hasLiveGrant, visibleMemberIds } from "./helpers";
import {
  activeMemberRoles,
  currentPlacements,
  getProfile,
  listMembers,
  memberView,
  peopleOptions,
} from "./members.service";
import {
  getApplication,
  listApplications,
  listTransfers,
} from "./applications.service";
import { getPlan, listPlans } from "./onboarding.service";
import {
  achievementOptions,
  badgeDefinitions,
  listBadges,
  listTransactions,
  memberTimeline,
  passport,
  totalsFor,
} from "./contribution.service";
import { listHours } from "./volunteer.service";
import {
  listAchievements,
  listMentorAssignments,
  todayFor,
} from "./development.service";
import { listHandovers, openWorkFor } from "./transitions.service";
import { committeeHistory, roleHistory, statusHistory } from "./members.service";

export const peopleHref = (tab: string, id: string) =>
  `/people?tab=${tab}&member=${encodeURIComponent(id)}`;

export type PeopleAction = {
  id: string;
  title: string;
  action: string;
  reason: string;
  href: string;
  severity: "high" | "medium";
  type: string;
};

/**
 * People items join the existing universal inbox. It is a projection over real
 * pending records, not a second inbox with its own state.
 */
export async function peopleInbox(ctx: Identity): Promise<PeopleAction[]> {
  const actions: PeopleAction[] = [];
  const add = (
    id: string,
    title: string,
    action: string,
    reason: string,
    href: string,
    type: string,
    severity: "high" | "medium" = "medium",
  ) => actions.push({ id, title, action, reason, href, type, severity });
  const has = (p: string) => hasLiveGrant(ctx, p);
  if (has("application.view")) {
    const applications = await db
      .select({
        id: s.membershipApplications.id,
        fullName: s.membershipApplications.fullName,
        status: s.membershipApplications.status,
        assignedReviewerId: s.membershipApplications.assignedReviewerId,
      })
      .from(s.membershipApplications)
      .where(
        sql`${s.membershipApplications.status} in ('submitted','under_review','shortlisted','interview')`,
      )
      .limit(30);
    for (const a of applications)
      add(
        `application:${a.id}`,
        a.fullName,
        has("application.review") ? "راجع طلب الانضمام" : "اطّلع على الطلب",
        `طلب بحالة «${a.status}»${a.assignedReviewerId ? " ومسند لمراجع" : " دون مراجع"}`,
        peopleHref("applications", a.id),
        "application_review",
        a.status === "submitted" ? "high" : "medium",
      );
  }
  if (has("onboarding.view")) {
    const plans = await listPlans(ctx, { status: "in_progress" });
    const now = new Date();
    for (const p of plans) {
      const overdue = p.percent < 100 && p.completed < p.total;
      if (!overdue) continue;
      add(
        `onboarding:${p.id}`,
        p.name,
        "تابع مراحل التأهيل",
        `${p.completed} من ${p.total} مرحلة مكتملة حتى ${now.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}`,
        peopleHref("onboarding", p.id),
        "onboarding_step",
      );
      break;
    }
  }
  if (has("volunteer_hours.approve")) {
    const hours = await listHours(ctx, { status: "pending" });
    for (const h of hours.slice(0, 10))
      add(
        `hours:${h.id}`,
        h.name,
        "اعتمد ساعات تطوعية",
        `${h.hours} ساعة في ${h.activityTitle}`,
        peopleHref("hours", h.id),
        "volunteer_hours",
        "high",
      );
  }
  if (has("transfer.approve")) {
    const transfers = await listTransfers(ctx, { status: "requested" });
    for (const t of transfers)
      add(
        `transfer:${t.id}`,
        "طلب نقل بين لجان",
        "اتخذ قرار النقل",
        t.reason,
        peopleHref("transfers", t.id),
        "transfer",
      );
  }
  if (has("achievement.verify")) {
    const achievements = await listAchievements(ctx, { verificationStatus: "unreviewed" });
    for (const a of achievements.slice(0, 10))
      add(
        `achievement:${a.id}`,
        a.title,
        "وثّق الإنجاز",
        "إنجاز بانتظار التحقق المستقل",
        peopleHref("achievements", a.id),
        "achievement",
      );
  }
  if (has("mentor.update")) {
    const mentorships = await listMentorAssignments(ctx, { status: "active" });
    for (const m of mentorships) {
      if (!m.followUpAt || m.followUpAt > new Date()) continue;
      add(
        `mentor:${m.id}`,
        "متابعة إرشاد",
        "حدّث المتابعة",
        "موعد المتابعة تجاوز دون تحديث",
        peopleHref("mentoring", m.id),
        "mentor_followup",
      );
    }
  }
  if (has("handover.manage")) {
    const handovers = await listHandovers(ctx, { status: "pending" });
    for (const h of handovers.slice(0, 10))
      add(
        `handover:${h.id}`,
        "تسليم معلّق",
        "أكمل التسليم",
        h.notes || "تسجيل تسليم بانتظار الإتمام",
        peopleHref("handovers", h.id),
        "handover",
      );
  }
  return actions;
}

export async function peopleLists(
  ctx: Identity,
  filters: {
    academicTermId?: string;
    committeeId?: string;
    status?: s.MemberStatus;
    query?: string;
  } = {},
) {
  const [members, applications, plans, hours, achievements, mentorships, transfers, handovers, badges] =
    await Promise.all([
      listMembers(ctx, {
        status: filters.status,
        committeeId: filters.committeeId,
        query: filters.query,
      }),
      listApplications(ctx, { academicTermId: filters.academicTermId }),
      listPlans(ctx, { academicTermId: filters.academicTermId }),
      listHours(ctx),
      listAchievements(ctx),
      listMentorAssignments(ctx),
      listTransfers(ctx),
      listHandovers(ctx),
      badgeDefinitions(),
    ]);
  return {
    members,
    applications,
    plans,
    hours,
    achievements,
    mentorships,
    transfers,
    handovers,
    badges,
  };
}

export type PeopleLists = Awaited<ReturnType<typeof peopleLists>>;

/**
 * The canonical empty People result. Every collection is an array so a viewer
 * with no visible records — or an installation with no active term — still gets
 * a well-formed structure instead of a null the interface would have to guess at.
 */
export function emptyPeopleLists(): PeopleLists {
  return {
    members: [],
    applications: [],
    plans: [],
    hours: [],
    achievements: [],
    mentorships: [],
    transfers: [],
    handovers: [],
    badges: [],
  };
}

/**
 * Reads the People lists for a viewer. A genuine read failure is surfaced as an
 * empty structure plus the reason, so the page renders an empty state and can
 * explain itself rather than crashing on a null prop.
 */
export async function peopleListsSafe(
  ctx: Identity,
  filters: {
    academicTermId?: string;
    committeeId?: string;
    status?: s.MemberStatus;
    query?: string;
  } = {},
): Promise<{ lists: PeopleLists; error: string | null }> {
  try {
    return { lists: await peopleLists(ctx, filters), error: null };
  } catch (e) {
    return {
      lists: emptyPeopleLists(),
      error: e instanceof HttpError ? e.message : "تعذر تحميل بيانات مساحة الناس",
    };
  }
}

/** The full member panel. Every section is filtered by what this viewer may see. */
export async function memberDetail(ctx: Identity, userId: string) {
  const base = await memberView(ctx, userId);
  const [plan, totals, achievements, mentorships, hours, transfers, handovers, timeline, badges, openWork] =
    await Promise.all([
      getPlan(ctx, userId).catch(() => null),
      totalsFor(userId),
      listAchievements(ctx, { memberId: userId }),
      listMentorAssignments(ctx, { menteeId: userId }),
      listHours(ctx, { memberId: userId }),
      listTransfers(ctx, { userId }),
      listHandovers(ctx, { userId }),
      memberTimeline(ctx, userId).catch(() => []),
      listBadges(userId),
      openWorkFor(userId),
    ]);
  const canSeePrivate =
    base.view.private || hasLiveGrant(ctx, "member.update");
  return {
    ...base,
    plan,
    totals,
    badges,
    achievements,
    mentorships,
    hours,
    transfers,
    handovers,
    timeline,
    openWork,
    statusHistory: canSeePrivate ? await statusHistory(userId) : [],
    sections: {
      responsibilities: canSeePrivate,
      onboarding: canSeePrivate,
      mentoring: canSeePrivate || userId === ctx.user.id,
      history: canSeePrivate,
      timeline: true,
    },
  };
}

/** "وش عليك اليوم؟" for the signed-in member, from real records only. */
export async function myToday(ctx: Identity) {
  return todayFor(ctx.user.id, ctx.user.id);
}

export async function searchPeople(ctx: Identity, query: string) {
  if (query.trim().length < 2) return [];
  const rows = await listMembers(ctx, { query: query.trim() });
  return rows.slice(0, 30).map((m) => ({
    id: m.userId,
    title: m.name,
    kind: "member",
    href: peopleHref("members", m.userId),
  }));
}

export { peopleOptions, achievementOptions, getProfile, committeeHistory, roleHistory };
