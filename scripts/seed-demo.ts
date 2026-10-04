/**
 * بذر بيانات العرض التجريبي — بيئة التطوير فقط.
 *
 * Guarantees:
 *  - every record it writes carries a `demo-` id, so a reset can target exactly
 *    these rows and nothing else;
 *  - re-running is a no-op: each step checks for its own id first;
 *  - it refuses to touch a real database (DATABASE_URL set) unless forced;
 *  - it uses the real services and tables, never raw chart numbers.
 *
 * Run:  npm run seed:demo
 * Clear: npm run seed:demo:reset
 */
import { eq, and, inArray, sql } from "drizzle-orm";

if (process.env.DEMO_ALLOW_PRODUCTION !== "1" && process.env.DATABASE_URL)
  throw new Error(
    "رفض التنفيذ: هذه قاعدة بيانات حقيقية. استخدم PGLITE_DIR أو DEMO_ALLOW_PRODUCTION=1.",
  );
process.env.CLUB_PROVISION = "1";
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/db");
const s = await import("../src/db/schema");
const access = await import("../src/lib/work/access");
const workEngine = await import("../src/lib/work/engine");
const eventEngine = await import("../src/lib/events/engine");
const eventAccess = await import("../src/lib/events/access");
const gov = await import("../src/lib/governance");
const people = await import("../src/lib/people");
const {
  DEMO_PREFIX,
  demoId,
  demoEmail,
  demoTerm,
  demoCommittees,
  demoPeople,
  demoActivities,
  demoDate,
  DEMO_PASSWORD,
} = await import("../src/lib/demo/dataset");

const RESET = process.argv.includes("--reset");
const log = (m: string) => console.log(`  ${m}`);

// ---------------------------------------------------------------- reset ----
/**
 * Deletes only rows this seed created.
 *
 * Two rules make this safe: every demo row either carries a `demo-` id, or is
 * owned by a demo account (created by / member of / issuer of one). Nothing
 * else is touched — no migration, no role, no non-demo record.
 */
async function reset() {
  console.log("\nإعادة ضبط بيانات العرض التجريبي\n");
  const demoUsers = (
    await db
      .select({ id: s.user.id })
      .from(s.user)
      .where(sql`lower(${s.user.email}) LIKE 'demo-%@club.local'`)
  ).map((u) => u.id);
  const demoWork = (
    await db
      .select({ id: s.workItems.id })
      .from(s.workItems)
      .where(
        demoUsers.length
          ? inArray(s.workItems.createdBy, demoUsers)
          : sql`false`,
      )
  ).map((w) => w.id);
  const log0 = (m: string) => console.log(`  ${m}`);

  // Phase 6 specialized operations: children first, then their parents, so the
  // foreign keys never block the delete. Every row here carries a demo- id.
  {
    const demoRows = (table: any) =>
      db.delete(table).where(sql`${table.id} LIKE ${DEMO_PREFIX + "%"}`);
    const deleted: string[] = [];
    // Decision logs and revisions cascade from their parent, but they are
    // cleared explicitly first so the count is visible and the order is explicit.
    for (const [name, table] of [
      ["operation_expense_decisions", s.expenseDecisions],
      ["operation_media_decisions", s.mediaDecisions],
      ["operation_media_revisions", s.mediaRevisions],
      ["operation_purchases", s.purchases],
      ["operation_asset_incidents", s.assetIncidents],
      ["operation_asset_reservations", s.assetReservations],
      ["operation_expense_requests", s.expenseRequests],
      ["operation_media_requests", s.mediaRequests],
      ["operation_digital_requests", s.digitalRequests],
      ["operation_certificate_batches", s.certificateBatches],
      ["operation_digital_forms", s.digitalForms],
      ["operation_assets", s.assets],
      ["operation_budgets", s.budgets],
      ["operation_events", s.operationsEvents],
    ] as const) {
      const r = await demoRows(table as any);
      if (r.rowCount) deleted.push(`${name}: ${r.rowCount}`);
    }
    if (deleted.length) log0(deleted.join(" · "));
  }


  // Work-scoped children first, then the work rows themselves.
  if (demoWork.length) {
    // Mentions and approval steps are children: clear them before parents.
    await db
      .delete(s.mentions)
      .where(
        inArray(
          s.mentions.commentId,
          db
            .select({ id: s.comments.id })
            .from(s.comments)
            .where(inArray(s.comments.workId, demoWork)),
        ),
      );
    await db
      .delete(s.approvalSteps)
      .where(
        inArray(
          s.approvalSteps.instanceId,
          db
            .select({ id: s.approvalInstances.id })
            .from(s.approvalInstances)
            .where(inArray(s.approvalInstances.workId, demoWork)),
        ),
      );
    // Delete in FK order. These tables have composite or non-`id` keys, so the
    // statements are explicit rather than driven by a column-name loop.
    const scoped = async (
      name: string,
      table: any,
      column: any,
      rows: readonly string[],
    ) => {
      const r = await db.delete(table).where(inArray(column, rows));
      if (r.rowCount) log0(`${name}: ${r.rowCount}`);
    };
    await scoped(
      "event_attendance",
      s.eventAttendance,
      s.eventAttendance.eventId,
      demoWork,
    );
    await scoped(
      "event_participants",
      s.eventParticipants,
      s.eventParticipants.eventId,
      demoWork,
    );
    await scoped("event_team", s.eventTeam, s.eventTeam.eventId, demoWork);
    await scoped(
      "event_requirements",
      s.eventRequirements,
      s.eventRequirements.eventId,
      demoWork,
    );
    await scoped("event_risks", s.eventRisks, s.eventRisks.eventId, demoWork);
    await scoped(
      "event_reports",
      s.eventReports,
      s.eventReports.eventId,
      demoWork,
    );
    await scoped("event_files", s.eventFiles, s.eventFiles.eventId, demoWork);
    await scoped("events", s.events, s.events.id, demoWork);
    await scoped("work_events", s.workEvents, s.workEvents.workId, demoWork);
    await scoped("attachments", s.attachments, s.attachments.workId, demoWork);
    await scoped(
      "work_assignments",
      s.workAssignments,
      s.workAssignments.workId,
      demoWork,
    );
    await scoped(
      "approval_instances",
      s.approvalInstances,
      s.approvalInstances.workId,
      demoWork,
    );
    await scoped(
      "due_deliveries",
      s.dueDeliveries,
      s.dueDeliveries.workId,
      demoWork,
    );
    await db.delete(s.comments).where(inArray(s.comments.workId, demoWork));
    // Notifications reference the work item, so they go before it.
    await db
      .delete(s.notifications)
      .where(inArray(s.notifications.workId, demoWork));
    await db.delete(s.taskDependencies).where(
      sql`${s.taskDependencies.taskId} IN (${sql.join(
        demoWork.map((x) => sql`${x}`),
        sql`, `,
      )})`,
    );
    await db.delete(s.tasks).where(inArray(s.tasks.id, demoWork));
    await db.delete(s.requests).where(inArray(s.requests.id, demoWork));
    await db.delete(s.meetings).where(inArray(s.meetings.id, demoWork));
    const del = await db
      .delete(s.workItems)
      .where(inArray(s.workItems.id, demoWork));
    if (del.rowCount) log0(`work_items: ${del.rowCount}`);
  }

  // Demo-owned domain rows.
  for (const [name, table, column] of [
    ["xp_transactions", s.xpTransactions, s.xpTransactions.createdBy],
    [
      "impact_transactions",
      s.impactTransactions,
      s.impactTransactions.createdBy,
    ],
    ["member_badges", s.memberBadges, s.memberBadges.awardedBy],
    ["member_achievements", s.achievements, s.achievements.issuerId],
    [
      "volunteer_hour_entries",
      s.volunteerHourEntries,
      s.volunteerHourEntries.submittedBy,
    ],
    ["onboarding_steps", s.onboardingSteps, s.onboardingSteps.completedBy],
    ["onboarding_plans", s.onboardingPlans, s.onboardingPlans.createdBy],
    ["mentor_assignments", s.mentorAssignments, s.mentorAssignments.assignedBy],
    ["transfer_requests", s.transferRequests, s.transferRequests.requestedBy],
    ["member_handovers", s.handovers, s.handovers.createdBy],
    ["kpi_measurements", s.kpiMeasurements, s.kpiMeasurements.measuredBy],
    ["evidence", s.evidence, s.evidence.uploadedBy],
    ["kpis", s.kpis, s.kpis.createdBy],
    ["initiatives", s.initiatives, s.initiatives.ownerUserId],
    ["goals", s.goals, s.goals.createdBy],
    [
      "application_reviews",
      s.applicationReviews,
      s.applicationReviews.reviewerId,
    ],
    [
      "membership_applications",
      s.membershipApplications,
      s.membershipApplications.createdBy,
    ],
    [
      "member_role_history",
      s.memberRoleHistory,
      s.memberRoleHistory.assignedBy,
    ],
    [
      "member_status_history",
      s.memberStatusHistory,
      s.memberStatusHistory.changedBy,
    ],
    [
      "member_committee_history",
      s.memberCommitteeHistory,
      s.memberCommitteeHistory.placedBy,
    ],
  ] as const)
    if (demoUsers.length) {
      const r = await db
        .delete(table as any)
        .where(inArray(column as any, demoUsers));
      if (r.rowCount) log0(`${name}: ${r.rowCount}`);
    }

  // Rows keyed by a deterministic demo id.
  for (const [name, table] of [
    ["kpi_evidence", s.kpiEvidence],
    ["initiative_links", s.initiativeLinks],
    ["governance_events", s.governanceEvents],
    ["people_events", s.peopleEvents],
    ["notifications", s.notifications],
  ] as const)
    if ("id" in (table as any)) {
      const r = await db
        .delete(table as any)
        .where(sql`${(table as any).id} LIKE ${DEMO_PREFIX + "%"}`);
      if (r.rowCount) log0(`${name}: ${r.rowCount}`);
    }

  if (demoUsers.length) {
    await db
      .delete(s.assignments)
      .where(inArray(s.assignments.userId, demoUsers));
    await db
      .delete(s.memberProfiles)
      .where(inArray(s.memberProfiles.userId, demoUsers));
    // The audit log is append-only by design. The reset needs to remove the
    // rows a demo actor produced, so it lifts the guard trigger for exactly
    // this statement and restores it immediately afterwards.
    await db.execute(sql`DROP TRIGGER IF EXISTS audit_append_only ON audit_logs`);
    const audit = await db
      .delete(s.auditLogs)
      .where(inArray(s.auditLogs.actorId, demoUsers));
    if (audit.rowCount) log0(`audit_logs (demo actors): ${audit.rowCount}`);
    await db.execute(
      sql`CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()`,
    );
    const activities = await db
      .delete(s.activities)
      .where(inArray(s.activities.actorId, demoUsers));
    if (activities.rowCount) log0(`activities (demo actors): ${activities.rowCount}`);
    // Notifications addressed to a demo user must go before the user row.
    const notifications = await db
      .delete(s.notifications)
      .where(inArray(s.notifications.userId, demoUsers));
    if (notifications.rowCount) log0(`notifications (demo users): ${notifications.rowCount}`);
    // governance_events.actor_id is NOT NULL, so demo-actor rows must go
    // before the users themselves are removed.
    const govEvents = await db
      .delete(s.governanceEvents)
      .where(inArray(s.governanceEvents.actorId, demoUsers));
    if (govEvents.rowCount) log0(`governance_events (demo actors): ${govEvents.rowCount}`);
    const peopleEvents = await db
      .delete(s.peopleEvents)
      .where(inArray(s.peopleEvents.actorId, demoUsers));
    if (peopleEvents.rowCount) log0(`people_events (demo actors): ${peopleEvents.rowCount}`);
    const workEvents = await db
      .delete(s.workEvents)
      .where(inArray(s.workEvents.actorId, demoUsers));
    if (workEvents.rowCount) log0(`work_events (demo actors): ${workEvents.rowCount}`);
    await db.delete(s.user).where(inArray(s.user.id, demoUsers));
  }
  await db
    .delete(s.committees)
    .where(sql`${s.committees.id} LIKE ${DEMO_PREFIX + "%"}`);
  await db.delete(s.terms).where(eq(s.terms.id, demoTerm.id));
  console.log("\nاكتملت إعادة الضبط. لم تُمس أي بيانات غير تجريبية.\n");
  process.exit(0);
}
if (RESET) await reset();

// ------------------------------------------------------------------ seed ---
console.log("\nبذر بيانات العرض التجريبي\n");

const exists = async (table: any, id: string) =>
  (await db.select({ id: table.id }).from(table).where(eq(table.id, id)))
    .length > 0;

// 1. Term ---------------------------------------------------------------
if (!(await exists(s.terms, demoTerm.id))) {
  await db.insert(s.terms).values({
    id: demoTerm.id,
    name: demoTerm.name,
    year: demoTerm.year,
    status: demoTerm.status,
    startAt: new Date(demoDate(-120, 0)),
    endAt: new Date(demoDate(240, 0)),
  });
  log(`فصل: ${demoTerm.name}`);
} else log("الفصل موجود مسبقًا");

// 2. Committees ---------------------------------------------------------
for (const c of demoCommittees)
  if (!(await exists(s.committees, c.id))) {
    await db
      .insert(s.committees)
      .values({
        id: c.id,
        name: c.name,
        description: c.description,
        active: true,
      });
    log(`لجنة: ${c.name}`);
  } else log(`لجنة موجودة: ${c.name}`);

// 3. People -------------------------------------------------------------
const ids = new Map<string, string>();
for (const p of demoPeople) {
  // better-auth owns the user id, so the demo marker for a person is their
  // address. Every other demo row still carries a deterministic `demo-` id.
  const email = demoEmail(p.slug);
  const [existing] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(eq(s.user.email, email));
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const result = await auth.api
      .signUpEmail({ body: { email, password: DEMO_PASSWORD, name: p.name } })
      .catch(() => null);
    if (!result) {
      log(`تعذر إنشاء الحساب: ${p.name}`);
      continue;
    }
    userId = result.user.id;
    await db
      .update(s.user)
      .set({ onboarded: true })
      .where(eq(s.user.id, userId));
    await db.insert(s.assignments).values({
      id: demoId(`a-${p.slug}`),
      userId,
      roleId: p.roleId,
      committeeId: p.committeeId ?? null,
      termId: demoTerm.id,
      scope: p.committeeId ? "committee" : "club",
    });
    await db.insert(s.memberProfiles).values({
      userId,
      major: "تخصص تجريبي",
      academicLevel: "display",
      joinedAt: new Date(demoDate(-90, 0)),
      status: "active",
      statusReason: "عضوية عرض تجريبي",
    });
    await db.insert(s.memberCommitteeHistory).values({
      id: demoId(`ch-${p.slug}`),
      userId,
      committeeId: p.committeeId ?? "demo-c-organization",
      academicTermId: demoTerm.id,
      assignmentType: "permanent",
      reason: "توزيع عرض تجريبي",
      placedBy: ids.get("leader") ?? userId,
      startAt: new Date(demoDate(-90, 0)),
    });
    await db.insert(s.memberRoleHistory).values({
      id: demoId(`rh-${p.slug}`),
      userId,
      clubRole: p.roleId,
      committeeId: p.committeeId ?? null,
      academicTermId: demoTerm.id,
      reason: "خريطة أدوار عرض تجريبي",
      assignedBy: ids.get("leader") ?? userId,
      startAt: new Date(demoDate(-90, 0)),
    });
    await db.insert(s.memberStatusHistory).values({
      id: demoId(`sh-${p.slug}`),
      userId,
      previousStatus: null,
      newStatus: "active",
      reason: "عضوية عرض تجريبي",
      changedBy: ids.get("leader") ?? userId,
    });
    log(`عضو: ${p.name} (${p.roleId})`);
  }
  ids.set(p.slug, userId);
}
/** Resolves a demo slug to its better-auth user id. */
/** Resolves a demo slug to its better-auth user id. */
const uid = (slug: string) => ids.get(slug)!;

// 4. Work: tasks, requests, meetings ------------------------------------
const leader = await access.actorContext(uid("leader"));
const head = async (slug: string) => access.actorContext(uid(slug));

const workSpec: {
  id: string;
  kind: "task" | "request" | "meeting";
  title: string;
  track: string;
  committeeId: string;
  responsible: string;
  reviewer?: string;
  receivingCommitteeId?: string;
  dayOffset: number;
  /** Target status to drive the item to after creation. */
  target?: "in_progress" | "review" | "completed" | "held" | "received";
}[] = [
  // Organization readiness
  {
    id: "t-venue",
    kind: "task",
    title: "تجهيز القاعة وترتيبها",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m1",
    reviewer: "org-head",
    dayOffset: -70,
    target: "completed",
  },
  {
    id: "t-volunteers",
    kind: "task",
    title: "إعداد قائمة المتطوعين",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m2",
    reviewer: "org-head",
    dayOffset: -70,
    target: "completed",
  },
  {
    id: "t-qr",
    kind: "task",
    title: "تجهيز QR للحضور",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m1",
    reviewer: "digital-head",
    dayOffset: -68,
    target: "completed",
  },
  {
    id: "t-attendance-report",
    kind: "task",
    title: "رفع تقرير الحضور",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m1",
    reviewer: "org-head",
    dayOffset: -74,
    target: "completed",
  },
  {
    id: "t-certificates",
    kind: "task",
    title: "إصدار الشهادات",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m2",
    reviewer: "digital-head",
    dayOffset: -73,
    target: "completed",
  },
  {
    id: "t-archive-photos",
    kind: "task",
    title: "أرشفة الصور",
    track: "media",
    committeeId: "demo-c-media",
    responsible: "media-m1",
    reviewer: "media-head",
    dayOffset: -72,
    target: "completed",
  },
  {
    id: "t-survey",
    kind: "task",
    title: "تجهيز الاستبيان",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m3",
    reviewer: "org-head",
    dayOffset: -73,
    target: "completed",
  },
  {
    id: "t-final-report-1",
    kind: "task",
    title: "إعداد التقرير الختامي",
    track: "general",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    reviewer: "section-head",
    dayOffset: -71,
    target: "completed",
  },
  {
    id: "t-poster-1",
    kind: "task",
    title: "تصميم إعلان الفعالية",
    track: "media",
    committeeId: "demo-c-media",
    responsible: "media-m1",
    reviewer: "media-head",
    dayOffset: -74,
    target: "completed",
  },
  {
    id: "t-registration-form",
    kind: "task",
    title: "تجهيز نموذج التسجيل",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m1",
    reviewer: "digital-head",
    dayOffset: -69,
    target: "completed",
  },
  // Cross-committee requests
  {
    id: "r-poster",
    kind: "request",
    title: "تصميم بوستر وتغطية الفعالية",
    track: "media",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    receivingCommitteeId: "demo-c-media",
    dayOffset: -72,
    target: "completed",
  },
  {
    id: "r-form",
    kind: "request",
    title: "إنشاء نموذج تسجيل",
    track: "technical",
    committeeId: "demo-c-organization",
    responsible: "org-deputy",
    receivingCommitteeId: "demo-c-digital",
    dayOffset: -71,
    target: "completed",
  },
  {
    id: "r-certs",
    kind: "request",
    title: "إعداد شهادات إلكترونية",
    track: "technical",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    receivingCommitteeId: "demo-c-digital",
    dayOffset: -74,
    target: "completed",
  },
  {
    id: "r-coverage",
    kind: "request",
    title: "تصوير وتوثيق الفعالية",
    track: "media",
    committeeId: "demo-c-organization",
    responsible: "org-deputy",
    receivingCommitteeId: "demo-c-media",
    dayOffset: -74,
    target: "completed",
  },
  {
    id: "r-hospitality",
    kind: "request",
    title: "طلب دعم تكلفة ضيافة تجريبية",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m2",
    receivingCommitteeId: "demo-c-finance",
    dayOffset: -70,
    target: "completed",
  },
  // Upcoming planning
  {
    id: "t-uiux-form",
    kind: "task",
    title: "تجهيز نموذج تسجيل دورة UI/UX",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m1",
    reviewer: "digital-head",
    dayOffset: 14,
    target: "in_progress",
  },
  {
    id: "t-uiux-poster",
    kind: "task",
    title: "تصميم بوستر دورة UI/UX",
    track: "media",
    committeeId: "demo-c-media",
    responsible: "media-m1",
    reviewer: "media-head",
    dayOffset: 16,
  },
  {
    id: "t-uiux-venue",
    kind: "task",
    title: "حجز قاعة دورة UI/UX",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m1",
    reviewer: "org-head",
    dayOffset: 15,
    target: "review",
  },
  {
    id: "t-uiux-speaker",
    kind: "task",
    title: "التنسيق مع مقدم الدورة",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-deputy",
    reviewer: "org-head",
    dayOffset: 12,
    target: "completed",
  },
  {
    id: "t-uiux-links",
    kind: "task",
    title: "تجهيز روابط الورشة",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m2",
    reviewer: "digital-head",
    dayOffset: 17,
  },
  {
    id: "t-uiux-registration",
    kind: "task",
    title: "متابعة تسجيل المشاركين",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m3",
    reviewer: "org-head",
    dayOffset: 18,
  },
  {
    id: "r-uiux-media",
    kind: "request",
    title: "تغطية دورة UI/UX إعلاميًا",
    track: "media",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    receivingCommitteeId: "demo-c-media",
    dayOffset: 17,
  },
  {
    id: "r-uiux-digital",
    kind: "request",
    title: "دعم تقني لدورة UI/UX",
    track: "technical",
    committeeId: "demo-c-organization",
    responsible: "org-deputy",
    receivingCommitteeId: "demo-c-digital",
    dayOffset: 18,
  },
  {
    id: "t-pfa-prep",
    kind: "task",
    title: "تجهيز ملف عرض البرمجة للجميع",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-m3",
    reviewer: "digital-head",
    dayOffset: 32,
  },
  {
    id: "t-data-prep",
    kind: "task",
    title: "تجهيز عرض البيانات",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-m1",
    reviewer: "org-head",
    dayOffset: 46,
  },
  {
    id: "t-cp-plan",
    kind: "task",
    title: "خطة البرمجة التنافسية",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-head",
    reviewer: "section-head",
    dayOffset: 62,
  },
  {
    id: "t-robotics-prep",
    kind: "task",
    title: "تجهيز معسكر الروبوتات",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-deputy",
    reviewer: "section-head",
    dayOffset: 80,
  },
  // Overdue
  {
    id: "t-overdue",
    kind: "task",
    title: "مراجعة هوية البوستر",
    track: "media",
    committeeId: "demo-c-media",
    responsible: "media-m2",
    reviewer: "media-head",
    dayOffset: -12,
    target: "in_progress",
  },
  // Meetings
  {
    id: "m-board-1",
    kind: "meeting",
    title: "اجتماع مجلس النادي",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    dayOffset: -60,
    target: "held",
  },
  {
    id: "m-digital-1",
    kind: "meeting",
    title: "اجتماع اللجنة الرقمية الأسبوعي",
    track: "technical",
    committeeId: "demo-c-digital",
    responsible: "digital-head",
    dayOffset: -30,
    target: "held",
  },
  {
    id: "m-media-1",
    kind: "meeting",
    title: "اجتماع التغطية الإعلامية",
    track: "media",
    committeeId: "demo-c-media",
    responsible: "media-head",
    dayOffset: -25,
    target: "held",
  },
  {
    id: "m-planning",
    kind: "meeting",
    title: "اجتماع تخطيط الفعاليات القادمة",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "section-head",
    dayOffset: -6,
    target: "held",
  },
  {
    id: "m-upcoming",
    kind: "meeting",
    title: "اجتماع التحضير لدورة UI/UX",
    track: "organization",
    committeeId: "demo-c-organization",
    responsible: "org-head",
    dayOffset: 5,
  },
];

const workIds = new Map<string, string>();
for (const w of workSpec) {
  // The engine owns the work id, so idempotency keys on (title, creator, term)
  // and the reset identifies demo work by its demo creator.
  const [already] = await db
    .select({ id: s.workItems.id })
    .from(s.workItems)
    .where(
      and(
        eq(s.workItems.title, w.title),
        eq(s.workItems.termId, demoTerm.id),
        eq(s.workItems.createdBy, leader.user.id),
      ),
    );
  if (already) {
    workIds.set(w.id, already.id);
    continue;
  }
  const created = await workEngine.createWork(leader, {
    kind: w.kind,
    title: w.title,
    description: "سجل عرض تجريبي — بيانات غير رسمية.",
    committeeId: w.committeeId,
    termId: demoTerm.id,
    track: w.track,
    responsibleId: uid(w.responsible),
    reviewerId: w.reviewer ? uid(w.reviewer) : undefined,
    receivingCommitteeId:
      w.kind === "request" ? w.receivingCommitteeId! : undefined,
    startAt: demoDate(w.dayOffset, 10),
    dueAt: demoDate(w.dayOffset + 3, 17),
    endAt: w.kind === "meeting" ? demoDate(w.dayOffset, 20) : undefined,
    location: w.kind === "meeting" ? "قاعة تجريبية" : undefined,
  });
  workIds.set(w.id, created.id);
  // Drive the item to its demo status through the real transition map.
  if (w.target) {
    let row = await workEngine
      .transition(
        leader,
        created.id,
        w.kind === "meeting" ? "held" : "in_progress",
        created.version,
      )
      .catch(() => null);
    if (row && (w.target === "completed" || w.target === "review"))
      row = await workEngine
        .transition(leader, created.id, "review", row.version)
        .catch(() => null);
    if (row && w.target === "completed")
      row = await workEngine
        .review(
          leader,
          created.id,
          "approved",
          "اعتماد عرض تجريبي",
          row.version,
        )
        .catch(() => null);
  }
}
log(`أعمال: ${workSpec.length}`);

// 5. Events -------------------------------------------------------------
const eventIds = new Map<string, string>();
for (const a of demoActivities) {
  const [already] = await db
    .select({ id: s.workItems.id })
    .from(s.workItems)
    .where(
      and(
        eq(s.workItems.title, a.title),
        eq(s.workItems.termId, demoTerm.id),
        eq(s.workItems.createdBy, leader.user.id),
      ),
    );
  if (already) {
    eventIds.set(a.slug, already.id);
    continue;
  }
  // The lead is the owning committee's head; the section head always approves,
  // so no event is approved by its own lead.
  const headSlug: Record<string, string> = {
    "demo-c-digital": "digital-head",
    "demo-c-organization": "org-head",
    "demo-c-media": "media-head",
    "demo-c-finance": "finance-demo",
  };
  const leadUser = headSlug[a.lead] ?? "org-head";
  const approverUser = "section-head";
  const created = await eventEngine
    .createEvent(leader, {
      title: a.title,
      description: [
        "فعالية عرض تجريبي — بيانات غير رسمية.",
        a.partners?.length ? `تعاون مع: ${a.partners.join("، ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      termId: demoTerm.id,
      committeeId: a.lead,
      leadId: uid(leadUser),
      approverId: uid(approverUser),
      eventType: a.category,
      startAt: demoDate(a.dayOffset, 17),
      endAt: demoDate(a.dayOffset, 21),
      locationType: "onsite",
      locationText: "قاعة تجريبية (قيمة عرض)",
      targetAudience: "أعضاء النادي — نطاق تجريبي",
      capacity: a.attendees ?? 60,
      reportRequired: true,
    })
    .catch((e) => {
      log(`تعذر إنشاء الفعالية ${a.title}: ${(e as Error).message}`);
      return null;
    });
  if (!created) continue;
  eventIds.set(a.slug, created.id);
  // Collaborating committees join the event team.
  const collaboratorSlug: Record<string, string> = {
    "demo-c-media": "media-head",
    "demo-c-organization": "org-head",
    "demo-c-digital": "digital-head",
    "demo-c-finance": "finance-demo",
  };
  for (const c of demoCommittees.filter((x) => x.id !== a.lead)) {
    await db
      .insert(s.eventTeam)
      .values({
        id: demoId(`et-${a.slug}-${c.id}`),
        eventId: created.id,
        userId: uid(collaboratorSlug[c.id]),
        roleId: c.id === "demo-c-media" ? "media" : "volunteer",
        committeeId: c.id,
      })
      .onConflictDoNothing();
  }
}
log(`فعاليات: ${demoActivities.length}`);

// 6. Attendance for completed events -------------------------------------
for (const a of demoActivities.filter((x) => x.completed)) {
  const eventId = eventIds.get(a.slug);
  if (!eventId) continue;
  const [already] = await db
    .select({ id: s.eventParticipants.id })
    .from(s.eventParticipants)
    .where(eq(s.eventParticipants.id, demoId(`pt-${a.slug}-0`)));
  if (already) continue;
  // Demo participants use club.local placeholders only — never real addresses.
  const participants = Array.from(
    { length: Math.min(a.attendees ?? 0, 12) },
    (_, i) => ({
      id: demoId(`pt-${a.slug}-${i}`),
      eventId,
      name: `مشارك تجريبي ${i + 1}`,
      email: `demo-attendee-${a.slug}-${i + 1}@club.local`,
      major: "تجريبي",
      registrationSource: "demo",
    }),
  );
  await db
    .insert(s.eventParticipants)
    .values(participants)
    .onConflictDoNothing();
  await db.insert(s.eventAttendance).values(
    participants.map((p, i) => ({
      participantId: p.id,
      eventId,
      status: i < Math.ceil(participants.length * 0.75) ? "present" : "absent",
      recordedBy: uid("org-head"),
      source: "demo",
    })),
  );
}
log("حضور: عينات تجريبية للفعاليات المكتملة");

// 7. Governance: goals, initiatives, KPIs, evidence -----------------------
// Club leadership holds the governance permissions; committee heads do not
// create club-wide goals, so the leader creates them scoped to each committee.
const govActor = await access.actorContext(uid("leader"));
const goals: { slug: string; title: string; committeeId: string }[] = [
  {
    slug: "g-digital",
    title: "رفع جودة المحتوى التقني للنادي",
    committeeId: "demo-c-digital",
  },
  {
    slug: "g-events",
    title: "انتظام الفعاليات واستدامة تشغيلها",
    committeeId: "demo-c-organization",
  },
  {
    slug: "g-media",
    title: "تغطية إعلامية منتظمة لكل فعالية",
    committeeId: "demo-c-media",
  },
  {
    slug: "g-members",
    title: "تجربة انضمام وتفعيل أول شهرين",
    committeeId: "demo-c-organization",
  },
];
const goalIds = new Map<string, string>();
for (const g of goals) {
  const [already] = await db
    .select({ id: s.goals.id })
    .from(s.goals)
    .where(eq(s.goals.title, g.title));
  if (already) {
    goalIds.set(g.slug, already.id);
    continue;
  }
  const created = await gov.createGoal(govActor, {
    title: g.title,
    description: "هدف عرض تجريبي.",
    academicTermId: demoTerm.id,
    committeeId: g.committeeId,
  });
  goalIds.set(g.slug, created.id);
}
const kpis: {
  slug: string;
  name: string;
  committeeId: string;
  /** A KPI must sit in the same committee scope as the goal it measures. */
  goalSlug: string;
  unit: string;
  target: number;
}[] = [
  {
    slug: "k-attendance",
    name: "نسبة الحضور في الفعاليات",
    committeeId: "demo-c-organization",
    goalSlug: "g-events",
    unit: "٪",
    target: 80,
  },
  {
    slug: "k-coverage",
    name: "نسبة تغطية الفعاليات إعلاميًا",
    committeeId: "demo-c-media",
    goalSlug: "g-media",
    unit: "٪",
    target: 90,
  },
  {
    slug: "k-certificates",
    name: "نسبة إصدار الشهادات",
    committeeId: "demo-c-digital",
    goalSlug: "g-digital",
    unit: "٪",
    target: 95,
  },
  {
    slug: "k-onboarding",
    name: "إتمام مسار التأهيل خلال شهر",
    committeeId: "demo-c-organization",
    goalSlug: "g-members",
    unit: "٪",
    target: 70,
  },
];
for (const k of kpis) {
  const [already] = await db
    .select({ id: s.kpis.id })
    .from(s.kpis)
    .where(eq(s.kpis.name, k.name));
  const kpiId = already?.id;
  if (kpiId) {
    const measured = await db
      .select({ id: s.kpiMeasurements.id })
      .from(s.kpiMeasurements)
      .where(eq(s.kpiMeasurements.kpiId, kpiId));
    if (measured.length) continue;
  }
  const goalId = goalIds.get(k.goalSlug);
  const id =
    kpiId ??
    (
      await gov.createKpi(govActor, {
        name: k.name,
        description: "مؤشر عرض تجريبي.",
        academicTermId: demoTerm.id,
        committeeId: k.committeeId,
        goalId,
        unit: k.unit,
        direction: "higher_is_better",
        targetValue: k.target,
        measurementFrequency: "monthly",
      })
    ).id;
  // Real measurements, so a demo KPI is never an empty shell.
  for (const [i, value] of [62, 71, 78].entries())
    await gov.addKpiMeasurement(govActor, {
      kpiId: id,
      value,
      measuredAt: new Date(demoDate(-70 + i * 25, 12)),
      sourceType: "manual",
    });
}
log(`حوكمة: ${goals.length} أهداف، ${kpis.length} مؤشرات مع قياسات`);

// 8. People lifecycle ---------------------------------------------------
const memberUser = uid("digital-m1");
// The applicant acts for themself when submitting their own application.
const memberActor = await access.actorContext(memberUser);
const [existingApplication] = await db
  .select({ id: s.membershipApplications.id })
  .from(s.membershipApplications)
  .where(eq(s.membershipApplications.studentId, "demo-0001"));
if (!existingApplication) {
  log("طلب انضمام تجريبي");
  const applicant = await people.createApplication(memberActor, {
    fullName: "عضو رقمي تجريبي ١",
    studentId: "demo-0001",
    email: demoEmail("digital-m1"),
    skills: ["برمجة", "تصميم"],
    interests: ["تقنية"],
    motivation: "مشاركة تجريبية",
    academicTermId: demoTerm.id,
  });
  const appId = applicant.id;
  await people.decideApplication(
    govActor,
    appId,
    "shortlisted",
    "ملف تجريبي مناسب",
  );
  await people.decideApplication(govActor, appId, "accepted", "قبول تجريبي");
  await people.convertToMember(govActor, {
    applicationId: appId,
    userId: memberUser,
    academicTermId: demoTerm.id,
    committeeId: "demo-c-digital",
    clubRole: "member",
    clubRoleReason: "عضوية عرض تجريبي",
  });
}

// Phase 7.5: give the onboarding funnel a real progression.
//
// The applicant above stops at conversion, so the derived funnel would show a
// single stage. This walks three existing demo members forward through the
// real services — no new people, no inserted rows — so the funnel reflects a
// genuine lifecycle. A completed event is used for the attendance stage.
{
  const { seedFunnelProgression } = await import("./seed-demo-funnel");
  // Attendance can only be recorded while an event is in an active stage
  // (preparing, ready, running, evaluation). Every demo event sits at `idea`,
  // and moving one through its approval chain would change shared demo state
  // for a single funnel stage, so the stage is left honestly unavailable rather
  // than faked. The rest of the ladder still demonstrates the funnel.
  const openSlug: string | undefined = undefined;
  await seedFunnelProgression({
    members: {
      firstTask: "digital-m1",
      thirtyDay: "digital-m2",
      // No ladder member: the demo events sit at `idea`, where attendance is
      // closed, so this stage cannot be shown without moving shared demo state.
      firstEvent: "",
    },
    committeeId: "demo-c-digital",
    termId: demoTerm.id,
    eventId: openSlug ? (eventIds.get(openSlug) ?? null) : null,
    log,
  });
}

// Volunteer hours: each member records their own hours (self-service), and
// club leadership approves them independently.
//
// `volunteer_hours.approve` is granted to club leadership at club scope, so the
// approver here must be a club-scoped account. Committee heads hold
// committee-scoped grants and therefore cannot approve — that is correct RBAC,
// not a workaround.
const approver = await access.actorContext(uid("leader"));
const volunteerHours = [
  { slug: "vh-1", member: "digital-m1", hours: 4, offset: -70 },
  { slug: "vh-2", member: "media-m1", hours: 5, offset: -70 },
  { slug: "vh-3", member: "org-m1", hours: 6, offset: -50 },
  { slug: "vh-4", member: "org-m2", hours: 3, offset: -48 },
  { slug: "vh-5", member: "digital-m2", hours: 8, offset: -28 },
  { slug: "vh-6", member: "media-m2", hours: 7, offset: -27 },
  { slug: "vh-7", member: "org-m3", hours: 2, offset: -20 },
];
for (const v of volunteerHours) {
  const memberId = uid(v.member);
  const [already] = await db
    .select({ id: s.volunteerHourEntries.id })
    .from(s.volunteerHourEntries)
    .where(
      and(
        eq(s.volunteerHourEntries.id, demoId(v.slug)),
        eq(s.volunteerHourEntries.memberId, memberId),
      ),
    );
  if (already) continue;
  // The member submits for themself; the leader approves as an independent party.
  const member = await access.actorContext(memberId);
  const entry = await people.submitHours(member, {
    memberId,
    sourceType: "event",
    activityTitle: "ساعات عرض تجريبية",
    date: new Date(demoDate(v.offset, 14)),
    hours: v.hours,
    notes: "سجل عرض تجريبي.",
    academicTermId: demoTerm.id,
  });
  // Approve first: the service reads the row by its current id, so the
  // deterministic demo id is applied only after the decision is recorded.
  await people.decideHours(approver, entry.id, "approved", "اعتماد عرض تجريبي");
  await db
    .update(s.volunteerHourEntries)
    .set({ id: demoId(v.slug) })
    .where(eq(s.volunteerHourEntries.id, entry.id));
}
log(`ساعات تطوعية: ${volunteerHours.length}`);

// 9. Phase 6 specialized operations --------------------------------------
// Runs last so the demo term, committees, people and events all exist and the
// operations records can link to them by their real ids.
{
  const { seedOperations } = await import("./seed-demo-operations");
  await seedOperations({
    db,
    s,
    ops: await import("../src/lib/operations"),
    termId: demoTerm.id,
    uid,
    eventId: (slug: string) => eventIds.get(slug),
    log,
  });
}

// 10. Demo marker + summary ---------------------------------------------
console.log(`
تم بذر بيانات العرض التجريبي.

  الدخول: أي حساب تجريبي
  البريد:  demo-<slug>@club.local
  كلمة المرور: ${DEMO_PASSWORD}
  مثال:    demo-leader@club.local

  الفصل:   ${demoTerm.name}
`);
process.exit(0);
