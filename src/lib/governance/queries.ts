import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq as _eq } from "drizzle-orm";
import { HttpError, type Identity, visibleCommittees } from "@/lib/services";
import { actorContext, grant } from "@/lib/work/access";
import { listWork } from "@/lib/work/queries";
import { allowed, requireActiveSession } from "./helpers";
import { listGoals, getGoal } from "./goals.service";
import { listInitiatives, getInitiative } from "./initiatives.service";
import { listKpis, getKpi, getKpiMeasurements } from "./kpis.service";
import { listReports, getReport, getReportReviewers } from "./reports.service";
import { getEvidence, listEvidence, sourceScope } from "./evidence.service";
import { auth } from "@/lib/auth";
export async function identityFromHeaders(headers: Headers): Promise<Identity> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new HttpError(401, "يرجى تسجيل الدخول");
  const [user] = await db
    .select({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      active: s.user.active,
      onboarded: s.user.onboarded,
    })
    .from(s.user)
    .where(eq(s.user.id, session.user.id));
  if (!user?.active) throw new HttpError(401, "الحساب غير متاح");
  if (!user.onboarded) throw new HttpError(409, "أكمل إعداد حسابك");
  const grants = await db
    .select({
      permission: s.rolePermissions.permissionId,
      scope: s.assignments.scope,
      committeeId: s.assignments.committeeId,
      startAt: s.assignments.startAt,
      endAt: s.assignments.endAt,
      active: s.assignments.active,
      termStatus: s.terms.status,
      termId: s.assignments.termId,
    })
    .from(s.assignments)
    .innerJoin(
      s.rolePermissions,
      eq(s.rolePermissions.roleId, s.assignments.roleId),
    )
    .leftJoin(s.terms, eq(s.assignments.termId, s.terms.id))
    .where(eq(s.assignments.userId, user.id));
  return { user, grants, sessionId: session.session.id };
}
export const governanceKinds = [
  "goals",
  "initiatives",
  "kpis",
  "evidence",
  "reports",
] as const;
export type GovernanceKind = (typeof governanceKinds)[number];
export const governanceHref = (kind: GovernanceKind, id: string) =>
  `/governance?tab=${kind}&item=${encodeURIComponent(id)}`;
export function ratio(numerator: number, denominator: number) {
  return {
    value: denominator ? Math.round((numerator / denominator) * 100) : null,
    numerator,
    denominator,
    formula:
      "البسط ÷ المقام × ١٠٠؛ التقريب لأقرب عدد صحيح، وغياب المقام لا يعني صفرًا",
  };
}
export function targetProgress(
  value: number | null,
  target: number,
  direction: s.KpiDirection,
) {
  if (value === null)
    return { reached: null, explanation: "لا يوجد قياس حتى الآن" };
  const reached =
    direction === "higher_is_better"
      ? value >= target
      : direction === "lower_is_better"
        ? value <= target
        : value === target;
  return {
    reached,
    explanation: `${value} ${direction === "higher_is_better" ? "≥" : direction === "lower_is_better" ? "≤" : "="} ${target}`,
  };
}
export async function governanceOptions(ctx: Identity) {
  await requireActiveSession(ctx);
  const assignments = await db
    .select({
      roleId: s.roles.id,
      roleName: s.roles.name,
      active: s.assignments.active,
      startAt: s.assignments.startAt,
      endAt: s.assignments.endAt,
    })
    .from(s.assignments)
    .innerJoin(s.roles, eq(s.roles.id, s.assignments.roleId))
    .where(eq(s.assignments.userId, ctx.user.id));
  const now = new Date();
  const roles = assignments
    .filter((a) => a.active && a.startAt <= now && (!a.endAt || a.endAt > now))
    .map((a) => ({ id: a.roleId, name: a.roleName }));
  const grantedCreatePermissions = Object.keys(safePermissions).filter(
    (p) =>
      p.endsWith(".create") &&
      ctx.grants.some((g) =>
        grant(
          { ...ctx, grants: [g] },
          p,
          g.committeeId,
          g.termId ?? "",
          ctx.user.id,
        ),
      ),
  );
  const terms = await db
    .select()
    .from(s.terms)
    .where(eq(s.terms.status, "active"));
  const committees = await visibleCommittees(ctx);
  const contexts = terms
    .flatMap((t) =>
      [null, ...committees.map((c) => c.id)].map((committeeId) => ({
        academicTermId: t.id,
        committeeId,
        label: `${t.name} · ${committees.find((c) => c.id === committeeId)?.name ?? "النادي"}`,
        permissions: Object.keys(safePermissions).filter((p) =>
          grant(ctx, p, committeeId, t.id, ctx.user.id),
        ),
      })),
    )
    .filter((x) => x.permissions.length);
  const people: {
    id: string;
    name: string;
    scopes: {
      academicTermId: string;
      committeeId: string | null;
      permissions: string[];
    }[];
  }[] = [];
  const users = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(and(eq(s.user.active, true), eq(s.user.onboarded, true)));
  for (const person of users) {
    const c = await actorContext(person.id);
    const scopes = contexts
      .map((x) => ({
        academicTermId: x.academicTermId,
        committeeId: x.committeeId,
        permissions: [
          "goal.view",
          "initiative.view",
          "kpi.view",
          "report.review",
          "report.view",
        ].filter((p) => allowed(c, p, { ...x, ownerUserId: person.id })),
      }))
      .filter((x) => x.permissions.length);
    if (scopes.length) people.push({ ...person, scopes });
  }
  return {
    contexts,
    people,
    activeTermCount: terms.length,
    activeTerms: terms.map((t) => ({ id: t.id, name: t.name })),
    roles,
    grantedCreatePermissions,
    reportTypes: await db.select().from(s.reportTypes),
  };
}
const safePermissions = {
  "goal.create": true,
  "initiative.create": true,
  "kpi.create": true,
  "evidence.create": true,
  "report.create": true,
  "goal.view": true,
  "initiative.view": true,
  "kpi.view": true,
  "report.view": true,
};
export async function governanceLists(ctx: Identity) {
  return {
    goals: await listGoals(ctx),
    initiatives: await listInitiatives(ctx),
    kpis: await listKpis(ctx),
    evidence: await listEvidence(ctx),
    reports: await listReports(ctx),
  };
}
export async function governanceDetail(
  ctx: Identity,
  kind: GovernanceKind,
  id: string,
) {
  const row =
    kind === "goals"
      ? await getGoal(ctx, id)
      : kind === "initiatives"
        ? await getInitiative(ctx, id)
        : kind === "kpis"
          ? await getKpi(ctx, id)
          : kind === "reports"
            ? await getReport(ctx, id)
            : await getEvidence(ctx, id);
  const entityType =
    kind === "goals"
      ? "goal"
      : kind === "initiatives"
        ? "initiative"
        : kind === "kpis"
          ? "kpi"
          : kind === "reports"
            ? "report"
            : "evidence";
  const timeline = await db
    .select({
      action: s.governanceEvents.action,
      actor: s.user.name,
      createdAt: s.governanceEvents.createdAt,
      metadata: s.governanceEvents.metadata,
    })
    .from(s.governanceEvents)
    .leftJoin(s.user, eq(s.user.id, s.governanceEvents.actorId))
    .where(
      and(
        eq(s.governanceEvents.entityType, entityType),
        eq(s.governanceEvents.entityId, id),
      ),
    )
    .orderBy(desc(s.governanceEvents.createdAt))
    .limit(100);
  const measurements = kind === "kpis" ? await getKpiMeasurements(ctx, id) : [];
  const evidenceLinks = measurements.length
    ? await db
        .select()
        .from(s.kpiEvidence)
        .where(
          inArray(
            s.kpiEvidence.kpiMeasurementId,
            measurements.map((m) => m.id),
          ),
        )
    : [];
  const visibleEvidence = await listEvidence(ctx);
  const linkedEvidence = evidenceLinks.filter((l) =>
    visibleEvidence.some((e) => e.id === l.evidenceId),
  );
  const links =
    kind === "initiatives"
      ? await db
          .select()
          .from(s.initiativeLinks)
          .where(eq(s.initiativeLinks.initiativeId, id))
      : [];
  const work = links.length ? await listWork(ctx) : [];
  const resourceScope =
    "sourceEntityType" in row
      ? await sourceScope(ctx, row.sourceEntityType, row.sourceEntityId)
      : await sourceScope(
          ctx,
          entityType === "evidence" ? "goal" : entityType,
          id,
        );
  const [term] = await db
    .select()
    .from(s.terms)
    .where(eq(s.terms.id, resourceScope.academicTermId));
  const permissions =
    term?.status === "active"
      ? [
          "goal.update",
          "goal.measure",
          "initiative.update",
          "kpi.update",
          "kpi.measure",
          "evidence.create",
          "evidence.verify",
          "report.update",
          "report.submit",
          "report.review",
          "report.approve",
        ].filter((p) => allowed(ctx, p, resourceScope))
      : [];
  return {
    kind,
    row,
    permissions,
    timeline,
    measurements,
    linkedEvidence,
    reviewers: kind === "reports" ? await getReportReviewers(ctx, id) : [],
    work: work
      .filter((w) => links.some((l) => l.linkedId === w.id))
      .map((w) => ({
        id: w.id,
        title: w.title,
        kind: w.kind,
        status: w.status,
      })),
    evidence: visibleEvidence.filter(
      (e) => e.sourceEntityType === entityType && e.sourceEntityId === id,
    ),
  };
}
export type GovernanceAction = {
  id: string;
  title: string;
  action: string;
  reason: string;
  href: string;
  severity: "high" | "medium";
  type: string;
};
export async function governanceInbox(
  ctx: Identity,
): Promise<GovernanceAction[]> {
  const reports = await listReports(ctx),
    actions: GovernanceAction[] = [];
  const reviews = await db
    .select()
    .from(s.reportReviews)
    .where(
      and(
        eq(s.reportReviews.reviewerId, ctx.user.id),
        eq(s.reportReviews.decision, "pending"),
      ),
    );
  for (const r of reports) {
    const [term] = await db
      .select()
      .from(s.terms)
      .where(eq(s.terms.id, r.academicTermId));
    if (term?.status !== "active") continue;
    if (
      ["submitted", "under_review"].includes(r.status) &&
      r.createdBy !== ctx.user.id &&
      reviews.some((v) => v.reportId === r.id) &&
      allowed(ctx, "report.review", r)
    )
      actions.push({
        id: `review:${r.id}`,
        title: r.title,
        action: "راجع التقرير",
        reason: "مراجعة مسندة إليك ضمن نطاقك",
        href: governanceHref("reports", r.id),
        severity: "medium",
        type: "report_review",
      });
    if (
      r.status === "changes_requested" &&
      r.createdBy === ctx.user.id &&
      allowed(ctx, "report.update", r)
    )
      actions.push({
        id: `changes:${r.id}`,
        title: r.title,
        action: "استكمل التعديلات",
        reason: "طلب المراجع تصحيح التقرير",
        href: governanceHref("reports", r.id),
        severity: "medium",
        type: "report_changes",
      });
    if (
      r.status === "under_review" &&
      r.createdBy !== ctx.user.id &&
      allowed(ctx, "report.approve", r)
    ) {
      const all = await db
        .select()
        .from(s.reportReviews)
        .where(eq(s.reportReviews.reportId, r.id));
      if (all.length && all.every((x) => x.decision === "approved"))
        actions.push({
          id: `approve:${r.id}`,
          title: r.title,
          action: "اتخذ قرار الاعتماد",
          reason: "اكتملت توصيات المراجعة؛ الاعتماد إجراء مستقل",
          href: governanceHref("reports", r.id),
          severity: "medium",
          type: "report_approval",
        });
    }
  }
  return actions;
}
export async function governanceSearch(ctx: Identity, query: string) {
  if (query.trim().length < 2) return [];
  const all = await governanceLists(ctx),
    result: { id: string; title: string; kind: string; href: string }[] = [];
  for (const kind of governanceKinds)
    for (const row of all[kind]) {
      const name = "name" in row ? row.name : row.title;
      if (name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        result.push({
          id: row.id,
          title: name,
          kind,
          href: governanceHref(kind, row.id),
        });
    }
  return result.slice(0, 30);
}
export async function governanceSnapshot(
  ctx: Identity,
  filter: { academicTermId?: string; committeeId?: string } = {},
) {
  await requireActiveSession(ctx);
  const all = await governanceLists(ctx);
  const inScope = (r: { academicTermId: string; committeeId: string | null }) =>
    (!filter.academicTermId || r.academicTermId === filter.academicTermId) &&
    (!filter.committeeId || r.committeeId === filter.committeeId);
  const goals = all.goals.filter(inScope),
    kpis = all.kpis.filter(inScope),
    reports = all.reports.filter(inScope);
  const initiatives = all.initiatives.filter((i) =>
    goals.some((g) => g.id === i.goalId),
  );
  const work = (await listWork(ctx)).filter((w) =>
    inScope({ academicTermId: w.termId, committeeId: w.committeeId }),
  );
  const tasks = work.filter(
      (w) => w.kind === "task" && w.status !== "cancelled",
    ),
    done = tasks.filter((w) => w.status === "completed");
  const now = new Date(),
    weekStart = new Date(now.getTime() - 7 * 86400000);
  const events = work.filter(
    (w) => w.kind === "event" && w.status !== "cancelled",
  );
  const attendance = events.length
    ? await db
        .select({
          eventId: s.eventAttendance.eventId,
          status: s.eventAttendance.status,
        })
        .from(s.eventAttendance)
        .where(
          inArray(
            s.eventAttendance.eventId,
            events.map((e) => e.id),
          ),
        )
    : [];
  const attendanceRows = attendance.filter((a) => a.status !== "cancelled");
  const measures = kpis.length
    ? await db
        .select()
        .from(s.kpiMeasurements)
        .where(
          inArray(
            s.kpiMeasurements.kpiId,
            kpis.map((k) => k.id),
          ),
        )
        .orderBy(
          desc(s.kpiMeasurements.measuredAt),
          desc(s.kpiMeasurements.createdAt),
          desc(s.kpiMeasurements.id),
        )
    : [];
  const evidenceLinks = measures.length
    ? await db
        .select()
        .from(s.kpiEvidence)
        .where(
          inArray(
            s.kpiEvidence.kpiMeasurementId,
            measures.map((m) => m.id),
          ),
        )
    : [];
  const alerts: GovernanceAction[] = [];
  const add = (
    kind: GovernanceKind,
    id: string,
    name: string,
    type: string,
    reason: string,
    severity: "high" | "medium" = "medium",
  ) =>
    alerts.push({
      id: `${type}:${id}`,
      title: name,
      action: "افتح المصدر للمتابعة",
      reason,
      href: governanceHref(kind, id),
      severity,
      type,
    });
  const metricRows = kpis.map((k) => {
    const latest = measures.find((m) => m.kpiId === k.id) ?? null;
    const days = {
      daily: 1,
      weekly: 7,
      monthly: 31,
      quarterly: 93,
      annual: 366,
    }[k.measurementFrequency];
    const stale =
      k.status === "active" &&
      (!latest ||
        now.getTime() - latest.measuredAt.getTime() > days * 86400000);
    if (stale)
      add(
        "kpis",
        k.id,
        k.name,
        "kpi_no_update",
        `لا يوجد قياس حديث خلال ${days} يومًا وفق دورية المؤشر`,
      );
    const verified =
      latest &&
      evidenceLinks.some(
        (l) =>
          l.kpiMeasurementId === latest.id &&
          all.evidence.some(
            (e) => e.id === l.evidenceId && e.verificationStatus === "reviewed",
          ),
      );
    if (latest && !verified)
      add(
        "kpis",
        k.id,
        k.name,
        "kpi_no_evidence",
        "آخر قياس بلا دليل مراجع مرئي لك؛ تحقق من اكتمال التوثيق",
      );
    const progress = targetProgress(
      latest?.value ?? null,
      k.targetValue,
      k.direction,
    );
    if (
      k.status === "active" &&
      k.dueAt &&
      k.dueAt < now &&
      progress.reached === false
    )
      add(
        "kpis",
        k.id,
        k.name,
        "kpi_target_missed",
        `انقضى الموعد ولم يتحقق الشرط: ${progress.explanation}`,
        "high",
      );
    return {
      ...k,
      currentValue: latest?.value ?? null,
      latest,
      stale,
      verified: Boolean(verified),
      progress,
    };
  });
  for (const g of goals)
    if (!["completed", "cancelled"].includes(g.status)) {
      if (g.status === "at_risk" || (g.dueAt && g.dueAt < now))
        add(
          "goals",
          g.id,
          g.title,
          "goal_at_risk",
          g.status === "at_risk"
            ? "وُسم الهدف معرضًا للتأخر بقرار إداري"
            : "موعد الهدف تجاوز ولم يكتمل",
          "high",
        );
      else if (g.dueAt && g.dueAt.getTime() <= now.getTime() + 7 * 86400000)
        add(
          "goals",
          g.id,
          g.title,
          "goal_approaching_due",
          "الموعد خلال سبعة أيام",
        );
    }
  for (const i of initiatives)
    if (
      !["completed", "cancelled"].includes(i.status) &&
      i.dueAt &&
      i.dueAt < now
    )
      add(
        "initiatives",
        i.id,
        i.title,
        "initiative_overdue",
        "موعد المبادرة تجاوز ولم تكتمل",
        "high",
      );
  for (const r of reports) {
    if (["submitted", "under_review"].includes(r.status))
      add(
        "reports",
        r.id,
        r.title,
        "report_waiting_review",
        "التقرير ينتظر اكتمال المراجعة أو الاعتماد",
      );
    if (
      ["draft", "changes_requested"].includes(r.status) &&
      r.periodEnd < weekStart
    )
      add(
        "reports",
        r.id,
        r.title,
        "report_overdue",
        "انتهت فترة المسودة منذ أكثر من سبعة أيام؛ ليست مهلة مؤسسية ملزمة",
      );
  }
  const eventReports = events.length
    ? await db
        .select()
        .from(s.eventReports)
        .where(
          inArray(
            s.eventReports.eventId,
            events.map((e) => e.id),
          ),
        )
    : [];
  for (const e of events)
    if (
      ["evaluation", "final_report"].includes(e.status) &&
      !eventReports.some((r) => r.eventId === e.id && r.status === "approved")
    )
      alerts.push({
        id: `event:${e.id}`,
        title: e.title,
        action: "استكمل التقرير النهائي",
        reason: "الفعالية في التقييم أو التقرير النهائي دون تقرير معتمد",
        href: `/events/${e.id}`,
        severity: "medium",
        type: "event_no_final_report",
      });
  const decisionIds = work
    .filter((w) => w.kind === "decision" && w.status === "recorded")
    .map((w) => w.id);
  const executions = decisionIds.length
    ? await db
        .select()
        .from(s.taskSources)
        .where(inArray(s.taskSources.decisionId, decisionIds))
    : [];
  for (const d of work.filter(
    (w) =>
      decisionIds.includes(w.id) &&
      !executions.some((x) => x.decisionId === w.id),
  ))
    alerts.push({
      id: `decision:${d.id}`,
      title: d.title,
      action: "راجع تنفيذ القرار",
      reason: "لا توجد مهمة مرتبطة بهذا القرار",
      href: `/work?item=${d.id}`,
      severity: "medium",
      type: "decision_no_execution",
    });
  const pending = work.filter(
    (w) => w.status === "review" || w.status === "pending_approval",
  );
  for (const p of pending.filter((w) => w.updatedAt < weekStart))
    alerts.push({
      id: `approval:${p.id}`,
      title: p.title,
      action: "تابع المراجعة",
      reason: "الحالة تنتظر اعتمادًا منذ أكثر من سبعة أيام وفق آخر تحديث",
      href: p.kind === "event" ? `/events/${p.id}` : `/work?item=${p.id}`,
      severity: "high",
      type: "approval_delayed",
    });
  const committees = await visibleCommittees(ctx);
  const health = committees
    .filter((c) => !filter.committeeId || c.id === filter.committeeId)
    .map((c) => {
      const rows = work.filter((w) => w.committeeId === c.id),
        late = rows.filter((w) => w.overdue);
      return {
        id: c.id,
        name: c.name,
        total: rows.length,
        overdue: late.length,
        waiting: rows.filter((w) =>
          ["review", "pending_approval"].includes(w.status),
        ).length,
        evidenceGaps: metricRows.filter(
          (k) => k.committeeId === c.id && !k.verified,
        ).length,
        explanation: !rows.length
          ? "لا توجد أعمال مرئية في النطاق المختار"
          : late.length
            ? "تحتاج متابعة المواعيد؛ لا يمثل تقييمًا للأعضاء"
            : "لا توجد أعمال متأخرة ظاهرة؛ ليس تقييم جودة شاملًا",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const datedDone = done.filter((w) => w.dueAt);
  return {
    asOf: now.toISOString(),
    scope: "جميع القيم من الموارد المرئية لك فقط؛ لا ترتيب للأعضاء أو اللجان",
    period: { from: weekStart.toISOString(), to: now.toISOString() },
    pulse: [
      {
        id: "completion",
        label: "إكمال المهام",
        ...ratio(done.length, tasks.length),
        sources: tasks.map((w) => ({
          title: w.title,
          href: `/work?item=${w.id}`,
        })),
        description: "المكتملة ÷ جميع المهام غير الملغاة",
      },
      {
        id: "on_time",
        label: "الإكمال في الموعد",
        ...ratio(
          datedDone.filter((w) => w.completedAt && w.completedAt <= w.dueAt!)
            .length,
          datedDone.length,
        ),
        sources: datedDone.map((w) => ({
          title: w.title,
          href: `/work?item=${w.id}`,
        })),
        description:
          "المكتملة في الموعد ÷ المكتملة ذات الموعد؛ غير المؤرخة مستبعدة",
      },
      {
        id: "attendance",
        label: "الحضور",
        ...ratio(
          attendanceRows.filter((a) => a.status === "present").length,
          attendanceRows.length,
        ),
        sources: events.map((w) => ({
          title: w.title,
          href: `/events/${w.id}`,
        })),
        description: "الحاضرون ÷ المشاركون غير الملغين؛ دون بيانات شخصية",
      },
      {
        id: "reports",
        label: "التقارير المعتمدة",
        ...ratio(
          reports.filter((r) => ["approved", "archived"].includes(r.status))
            .length,
          reports.length,
        ),
        sources: reports.map((r) => ({
          title: r.title,
          href: governanceHref("reports", r.id),
        })),
        description:
          "المعتمدة أو المؤرشفة ÷ التقارير الموجودة؛ لا يدعي اكتمال كل التقارير المطلوبة",
      },
    ],
    kpis: metricRows,
    health,
    alerts,
    weekly: {
      completed: done
        .filter((w) => w.completedAt && w.completedAt >= weekStart)
        .map((w) => ({ id: w.id, title: w.title, href: `/work?item=${w.id}` })),
      overdue: work
        .filter((w) => w.overdue)
        .map((w) => ({
          id: w.id,
          title: w.title,
          href: w.kind === "event" ? `/events/${w.id}` : `/work?item=${w.id}`,
        })),
      upcoming: work
        .filter(
          (w) =>
            w.dueAt &&
            w.dueAt >= now &&
            w.dueAt.getTime() <= now.getTime() + 7 * 86400000 &&
            !["completed", "cancelled", "rejected", "archived"].includes(
              w.status,
            ),
        )
        .map((w) => ({
          id: w.id,
          title: w.title,
          href: w.kind === "event" ? `/events/${w.id}` : `/work?item=${w.id}`,
        })),
    },
    actions: await governanceInbox(ctx),
  };
}
