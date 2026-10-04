/**
 * بذر بيانات العرض التجريبي لوحدات العمليات (المرحلة 6) — بيئة التطوير فقط.
 *
 * Called from scripts/seed-demo.ts once the demo term, committees, people and
 * events already exist. Every record is created through the real Phase 6
 * service layer, so the dashboards derive from stored rows exactly as they
 * would in production — nothing here writes a final state directly, and nothing
 * is hardcoded for the interface to display.
 *
 * Guarantees:
 *  - every record carries a deterministic `demo-` id, so `seed:demo:reset`
 *    can target exactly these rows;
 *  - each step checks for its own id first, so re-running is a no-op;
 *  - no new users, committees or events are created here.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import * as s from "../src/db/schema";
import * as ops from "../src/lib/operations";
import { DEMO_PREFIX, demoDate, demoId } from "../src/lib/demo/dataset";

export type SeedContext = {
  db: typeof db;
  s: typeof s;
  ops: typeof ops;
  termId: string;
  /** Resolves a demo person slug to their user id. */
  uid: (slug: string) => string;
  /** Resolves a demo activity slug to its event/work id. */
  eventId: (slug: string) => string | undefined;
  log: (m: string) => void;
};

type Actor = Awaited<ReturnType<typeof import("@/lib/work/access").actorContext>>;

export async function seedOperations(ctx: SeedContext) {
  const { termId, uid, eventId, log } = ctx;
  const access = await import("../src/lib/work/access");
  const actor = async (slug: string): Promise<Actor> => access.actorContext(uid(slug));

  const exists = async (table: any, id: string) =>
    (await db.select({ id: table.id }).from(table).where(eq(table.id, id))).length > 0;

  // Phase 6 desks run at club scope through dedicated service-desk roles. The
  // demo committee heads already exist as people, so each gets the matching
  // desk role as an additional club-scoped assignment rather than a new account.
  // The committee assignment is left untouched, so committee scope is unchanged.
  const deskAssignments: [string, string][] = [
    ["media-head", "media_lead"],
    ["media-deputy", "media_lead"],
    ["digital-head", "digital_lead"],
    ["digital-deputy", "digital_lead"],
    ["finance-demo", "finance_lead"],
    ["org-deputy", "resources_lead"],
  ];
  for (const [slug, role] of deskAssignments) {
    const id = demoId(`a-desk-${slug}-${role}`);
    if (await exists(s.assignments, id)) continue;
    const userId = uid(slug);
    if (!userId) continue;
    await db.insert(s.assignments).values({
      id,
      userId,
      roleId: role,
      committeeId: null,
      termId,
      scope: "club",
    });
    log(`دور مكتب: ${role} (${slug})`);
  }

  // The organization committee raises the requests; the three desks serve them.
  const orgHead = await actor("org-head");
  const leader = await actor("leader");
  const supervisor = await actor("supervisor");
  // Phase 6 desks run at club scope through their own service-desk roles, so
  // the seed grants those roles to existing demo accounts rather than inventing
  // new people.
  const mediaLead = await actor("media-head");
  const digitalLead = await actor("digital-head");
  const financeLead = await actor("finance-demo");
  const resourcesLead = await actor("org-deputy");

  const uiux = eventId("uiux");
  const all = eventId("programming-for-all");
  const robotics = eventId("robotics-camp") ?? eventId("robotics");
  const data = eventId("data-to-decisions");
  const competitive = eventId("competitive-programming");

  // ---------------------------------------------------------------- finance
  // Budgets are seeded directly because they are configuration rather than a
  // workflow; expenses, purchases and reconciliation go through the services.
  const budgets = [
    {
      id: demoId("ops-budget-operating"),
      title: "الميزانية التشغيلية التجريبية",
      description: "ميزانية تشغيلية للنادي للفصل التجريبي. أرقام عرض توضيحي فقط.",
      allocatedAmount: 15000,
      committeeId: null,
      eventId: null,
      startsOn: new Date(demoDate(-120, 0)),
      endsOn: new Date(demoDate(240, 0)),
      alertThresholdPercent: 80,
      notes: "بيانات تجريبية — غير مصروفات فعلية.",
    },
    {
      id: demoId("ops-budget-uiux"),
      title: "ميزانية دورة UI/UX التجريبية",
      description: "تخصيص عرض تجريبي لفعالية دورة UI/UX.",
      allocatedAmount: 3000,
      committeeId: "demo-c-organization",
      eventId: uiux ?? null,
      startsOn: new Date(demoDate(-30, 0)),
      endsOn: new Date(demoDate(60, 0)),
      alertThresholdPercent: 75,
      notes: "بيانات تجريبية.",
    },
    {
      id: demoId("ops-budget-robotics"),
      title: "ميزانية معسكر الروبوتات التجريبية",
      description: "تخصيص عرض تجريبي لمعسكر الروبوتات والتقنيات الحديثة.",
      allocatedAmount: 2000,
      committeeId: "demo-c-organization",
      eventId: robotics ?? null,
      startsOn: new Date(demoDate(-20, 0)),
      endsOn: new Date(demoDate(80, 0)),
      alertThresholdPercent: 80,
      notes: "بيانات تجريبية.",
    },
  ];
  for (const b of budgets)
    if (!(await exists(s.budgets, b.id))) {
      await db.insert(s.budgets).values({
        ...b,
        academicTermId: termId,
        currency: "SAR",
        createdBy: leader.user.id,
      });
      log(`ميزانية: ${b.title}`);
    } else log(`ميزانية موجودة: ${b.title}`);

  /**
   * Full lifecycle through the service layer: the organization committee
   * submits, finance reviews, an authorised approver approves, a purchase is
   * recorded, then the purchase is reconciled.
   *
   * The requested amount deliberately differs from the recorded purchase, which
   * is what proves the derived budget totals read the real outflow.
   */
  async function expenseFlow(spec: {
    slug: string;
    title: string;
    category: "supplies" | "catering" | "venue" | "transport" | "printing" | "equipment" | "software" | "other";
    amount: number;
    purchaseAmount: number | null;
    budgetId: string;
    eventId: string | null;
    justification: string;
    committeeId: string;
  }) {
    const id = demoId(spec.slug);
    if (await exists(s.expenseRequests, id)) {
      log(`طلب مصروف موجود: ${spec.title}`);
      return;
    }
    // The deterministic id is supplied up front, so the decision log and the
    // purchase reference it from the first write and nothing is ever re-keyed.
    await ops.createExpense(orgHead, {
      id,
      title: spec.title,
      category: spec.category,
      amount: spec.amount,
      budgetId: spec.budgetId,
      eventId: spec.eventId,
      committeeId: spec.committeeId,
      justification: spec.justification,
      submit: true,
    });
    await ops.transitionExpense(financeLead, id, "start_review", "بدء مراجعة تجريبية");
    await ops.transitionExpense(financeLead, id, "approve", "اعتماد تجريبي");
    if (spec.purchaseAmount !== null) {
      const purchase = await ops.recordPurchase(financeLead, {
        expenseId: id,
        vendor: "مورّد تجريبي",
        reference: `DEMO-${spec.slug.toUpperCase()}`,
        purchasedAt: new Date(demoDate(-5, 0)),
        amount: spec.purchaseAmount,
      });
      await ops.reconcilePurchase(financeLead, purchase.purchase.id, "مطابقة تجريبية");
    }
    log(`طلب مصروف: ${spec.title} (${spec.purchaseAmount === null ? "معتمد" : "تمت مطابقته"})`);
  }

  // Waiting for review — produces a real "pending review" alert.
  {
    const id = demoId("ops-expense-catering");
    if (!(await exists(s.expenseRequests, id))) {
      await ops.createExpense(orgHead, {
        id,
        title: "ضيافة دورة UI/UX",
        category: "catering",
        amount: 1200,
        budgetId: demoId("ops-budget-uiux"),
        eventId: uiux ?? null,
        committeeId: "demo-c-organization",
        justification: "ضيافة واستراحة — عرض تجريبي",
        submit: true,
      });
      log("طلب مصروف: ضيافة دورة UI/UX (بانتظار المراجعة)");
    } else log("طلب مصروف موجود: ضيافة دورة UI/UX");
  }

  // Approved but not yet reconciled — produces a real unreconciled alert.
  if (!(await exists(s.expenseRequests, demoId("ops-expense-printing")))) {
    await expenseFlow({
      slug: "ops-expense-printing",
      title: "طباعة مواد معسكر الروبوتات",
      category: "printing",
      amount: 900,
      purchaseAmount: null,
      budgetId: demoId("ops-budget-robotics"),
      eventId: robotics ?? null,
      committeeId: "demo-c-organization",
      justification: "مطويات وأرقام تجريبية",
    });
  }

  // Full lifecycle with a different actual purchase amount (1200 → 1150).
  if (!(await exists(s.expenseRequests, demoId("ops-expense-supplies"))))
    await expenseFlow({
      slug: "ops-expense-supplies",
      title: "مستلزمات فعالية البرمجة التنافسية",
      category: "supplies",
      amount: 1200,
      purchaseAmount: 1150,
      budgetId: demoId("ops-budget-operating"),
      eventId: competitive ?? null,
      committeeId: "demo-c-organization",
      justification: "مستلزمات تدريب تجريبية",
    });

  // ------------------------------------------------------------------ media
  const mediaRequests = [
    {
      slug: "ops-media-poster-uiux",
      title: "تصميم بوستر دورة UI/UX",
      mediaType: "poster" as const,
      eventId: uiux ?? null,
      committeeId: "demo-c-organization",
      priority: "high" as const,
      // Past the approved stage, so the archive and the dashboard both fill.
      target: "approved" as const,
      dueOffset: 6,
      platform: "حسابات النادي التجريبية",
    },
    {
      slug: "ops-media-coverage-all",
      title: "تغطية إعلامية لدورة البرمجة للجميع",
      mediaType: "event_coverage" as const,
      eventId: all ?? null,
      committeeId: "demo-c-organization",
      priority: "medium" as const,
      target: "in_production" as const,
      dueOffset: 14,
      platform: "منصة التواصل التجريبية",
    },
    {
      slug: "ops-media-photo-robotics",
      title: "تصوير وتوثيق معسكر الروبوتات",
      mediaType: "photography" as const,
      eventId: robotics ?? null,
      committeeId: "demo-c-organization",
      priority: "low" as const,
      target: "received" as const,
      dueOffset: 21,
      platform: "أرشيف النادي التجريبي",
    },
  ];
  for (const spec of mediaRequests) {
    const id = demoId(spec.slug);
    if (await exists(s.mediaRequests, id)) {
      log(`طلب إعلامي موجود: ${spec.title}`);
      continue;
    }
    const assignee = await actor("media-m1");
    await ops.createMediaRequest(orgHead, {
      id,
      title: spec.title,
      mediaType: spec.mediaType,
      eventId: spec.eventId,
      committeeId: spec.committeeId,
      priority: spec.priority,
      platform: spec.platform,
      deadline: new Date(demoDate(spec.dueOffset, 0)),
      description: `طلب عرض تجريبي مرتبط بفعالية ${spec.title}.`,
    });
    await ops.assignMedia(mediaLead, id, assignee.user.id, mediaLead.user.id);
    if (spec.target !== "received") {
      await ops.advanceMedia(mediaLead, id, "in_production");
      await ops.submitRevision(assignee, id, { note: "النسخة الأولى (تجريبية)" });
      if (spec.target === "approved") {
        // A change request plus a revision, so the history shows a real review.
        await ops.reviewMedia(mediaLead, id, "request_changes", "تعديل ألوان تجريبي");
        await ops.advanceMedia(mediaLead, id, "in_production");
        await ops.submitRevision(assignee, id, { note: "النسخة الثانية (تجريبية)" });
        await ops.reviewMedia(mediaLead, id, "approve", "اعتماد تجريبي");
      }
    }
    log(`طلب إعلامي: ${spec.title} (${spec.target})`);
  }

  // ---------------------------------------------------------------- digital
  const digitalRequests = [
    {
      slug: "ops-digital-registration",
      title: "إنشاء نموذج تسجيل لدورة UI/UX",
      serviceType: "registration_form" as const,
      eventId: uiux ?? null,
      committeeId: "demo-c-organization",
      priority: "high" as const,
      target: "completed" as const,
      dueOffset: 5,
    },
    {
      slug: "ops-digital-survey",
      title: "إعداد استبيان تقييم دورة البيانات",
      serviceType: "survey" as const,
      eventId: data ?? null,
      committeeId: "demo-c-organization",
      priority: "medium" as const,
      target: "in_progress" as const,
      dueOffset: 12,
    },
    {
      slug: "ops-digital-certificates",
      title: "إصدار شهادات إلكترونية لفعالية البرمجة التنافسية",
      serviceType: "certificate_generation" as const,
      eventId: competitive ?? null,
      committeeId: "demo-c-organization",
      priority: "medium" as const,
      target: "received" as const,
      dueOffset: 18,
    },
  ];
  for (const spec of digitalRequests) {
    const id = demoId(spec.slug);
    if (await exists(s.digitalRequests, id)) {
      log(`خدمة رقمية موجودة: ${spec.title}`);
      continue;
    }
    const assignee = await actor("digital-m1");
    await ops.createDigitalRequest(orgHead, {
      id,
      title: spec.title,
      serviceType: spec.serviceType,
      eventId: spec.eventId,
      committeeId: spec.committeeId,
      priority: spec.priority,
      deadline: new Date(demoDate(spec.dueOffset, 0)),
    });
    await ops.assignDigital(digitalLead, id, assignee.user.id);
    await ops.advanceDigital(digitalLead, id, "received");
    let formId: string | null = null;
    let batchId: string | null = null;
    if (spec.target === "completed") {
      await ops.advanceDigital(digitalLead, id, "in_progress");
      // The form registry row is the recorded output of the completed service.
      const formIdSeed = demoId("ops-form-registration");
      if (!(await exists(s.digitalForms, formIdSeed))) {
        await db.insert(s.digitalForms).values({
          id: formIdSeed,
          title: "نموذج تسجيل دورة UI/UX (تجريبي)",
          purpose: "تسجيل المشاركين في فعالية تجريبية",
          ownerUserId: digitalLead.user.id,
          committeeId: "demo-c-digital",
          provider: "منصة تجريبية",
          url: "https://demo.invalid/forms/uiux-registration",
          eventId: spec.eventId,
          formType: "registration",
          opensOn: new Date(demoDate(-10, 0)),
          closesOn: new Date(demoDate(spec.dueOffset, 0)),
          status: "active",
          responseCount: null,
          notes: "رابط توضيحي فقط — لا يوجد نموذج فعلي.",
        });
        log("نموذج: نموذج تسجيل دورة UI/UX (تجريبي)");
      }
      formId = formIdSeed;
      await ops.advanceDigital(digitalLead, id, "in_review");
      await ops.completeDigitalRequest(digitalLead, id, {
        resultFormId: formId,
        resultUrl: "https://demo.invalid/forms/uiux-registration",
      });
    } else if (spec.target === "in_progress") {
      await ops.advanceDigital(digitalLead, id, "in_progress");
    }
    log(`خدمة رقمية: ${spec.title} (${spec.target})`);
  }

  // The survey registry entry and the certificate batch are standalone records.
  const surveyId = demoId("ops-form-survey");
  if (!(await exists(s.digitalForms, surveyId))) {
    await db.insert(s.digitalForms).values({
      id: surveyId,
      title: "استبيان تقييم دورة البيانات (تجريبي)",
      purpose: "قياس رضا المشاركين — عرض توضيحي",
      ownerUserId: digitalLead.user.id,
      committeeId: "demo-c-digital",
      provider: "منصة تجريبية",
      url: "https://demo.invalid/forms/data-survey",
      eventId: data ?? null,
      formType: "survey",
      opensOn: new Date(demoDate(-5, 0)),
      closesOn: new Date(demoDate(12, 0)),
      status: "active",
      // Left null on purpose: nobody has measured this, so nothing is claimed.
      responseCount: null,
      notes: "رابط توضيحي فقط.",
    });
    log("نموذج: استبيان تقييم دورة البيانات (تجريبي)");
  }
  const pollId = demoId("ops-form-poll");
  if (!(await exists(s.digitalForms, pollId))) {
    await db.insert(s.digitalForms).values({
      id: pollId,
      title: "استطلاع اختيار موضوع الدورة القادمة (تجريبي)",
      purpose: "تصويت داخلي تجريبي على موضوع الورشة القادمة",
      ownerUserId: digitalLead.user.id,
      committeeId: "demo-c-digital",
      provider: "منصة تجريبية",
      url: "https://demo.invalid/forms/next-topic-poll",
      formType: "vote",
      status: "planned",
      responseCount: null,
      notes: "رابط توضيحي فقط.",
    });
    log("نموذج: استطلاع اختيار موضوع الدورة القادمة (تجريبي)");
  }
  const batchId = demoId("ops-batch-certificates");
  if (!(await exists(s.certificateBatches, batchId))) {
    await db.insert(s.certificateBatches).values({
      id: batchId,
      title: "دفعة شهادات فعالية البرمجة التنافسية (تجريبية)",
      templateRef: "قالب تجريبي ١",
      issuerId: digitalLead.user.id,
      eventId: competitive ?? null,
      issuedOn: new Date(demoDate(-2, 0)),
      participantSource: "قائمة المشاركين المسجلة في الفعالية",
      // Prepared only: nothing is claimed as generated or delivered.
      status: "draft",
      generatedCount: 0,
      sentCount: 0,
      failureCount: 0,
      notes: "دفعة تجريبية — لم يُسجَّل أي إرسال فعلي.",
    });
    log("دفعة شهادات: فعالية البرمجة التنافسية (مسودة)");
  }

  // -------------------------------------------------------------- resources
  const assets = [
    { slug: "cam", name: "كاميرا تصوير (تجريبية)", category: "تصوير", code: "DEMO-CAM-001", committeeId: "demo-c-media", condition: "good" as const, availability: "available" as const },
    { slug: "tripod", name: "حامل ثلاثي (تجريبي)", category: "تصوير", code: "DEMO-TRP-001", committeeId: "demo-c-media", condition: "maintenance" as const, availability: "unavailable" as const },
    { slug: "mic", name: "ميكروفون لاسلكي (تجريبي)", category: "صوت", code: "DEMO-MIC-001", committeeId: "demo-c-media", condition: "good" as const, availability: "available" as const },
    { slug: "laptop", name: "لابتوب النادي (تجريبي)", category: "حاسوب", code: "DEMO-LAP-001", committeeId: "demo-c-digital", condition: "good" as const, availability: "available" as const },
    { slug: "screen", name: "شاشة عرض (تجريبية)", category: "عرض", code: "DEMO-SCR-001", committeeId: "demo-c-organization", condition: "good" as const, availability: "available" as const },
    { slug: "banner", name: "رول أب النادي (تجريبي)", category: "مطبوعات", code: "DEMO-BNR-001", committeeId: "demo-c-organization", condition: "new" as const, availability: "available" as const },
  ];
  const assetIds = new Map<string, string>();
  for (const a of assets) {
    const id = demoId(`ops-asset-${a.slug}`);
    assetIds.set(a.slug, id);
    if (!(await exists(s.assets, id))) {
      await db.insert(s.assets).values({
        id,
        name: a.name,
        category: a.category,
        assetCode: a.code,
        committeeId: a.committeeId,
        condition: a.condition,
        availability: a.availability,
        custodianId: null,
        notes: " أصل عرض تجريبي — غير مملوك فعليًا للنادي.",
      });
      log(`أصل: ${a.name}`);
    }
  }

  const reservations = [
    {
      slug: "cam-uiux",
      asset: "cam",
      purpose: "تغطية دورة UI/UX",
      eventId: uiux ?? null,
      start: 2,
      end: 3,
      approve: true,
    },
    {
      slug: "mic-all",
      asset: "mic",
      purpose: "تغطية دورة البرمجة للجميع",
      eventId: all ?? null,
      start: 6,
      end: 7,
      approve: true,
    },
    {
      slug: "screen-data",
      asset: "screen",
      purpose: "عرض دورة البيانات",
      eventId: data ?? null,
      start: 9,
      end: 10,
      approve: false,
    },
  ];
  for (const r of reservations) {
    const id = demoId(`ops-reservation-${r.slug}`);
    const assetId = assetIds.get(r.asset)!;
    if (await exists(s.assetReservations, id)) {
      log(`حجز موجود: ${r.purpose}`);
      continue;
    }
    await ops.reserveAsset(orgHead, {
      id,
      assetId,
      purpose: r.purpose,
      eventId: r.eventId,
      startsAt: new Date(demoDate(r.start, 0)),
      endsAt: new Date(demoDate(r.end, 9)),
      notes: "حجز عرض تجريبي.",
    });
    if (r.approve) await ops.approveReservation(resourcesLead, id);
    log(`حجز: ${r.purpose} (${r.approve ? "معتمد" : "مطلوب"})`);
  }

  const incidentId = demoId("ops-incident-tripod");
  if (!(await exists(s.assetIncidents, incidentId))) {
    await db.insert(s.assetIncidents).values({
      id: incidentId,
      assetId: assetIds.get("tripod")!,
      reportedById: resourcesLead.user.id,
      kind: "maintenance",
      // No responsible user: blame is never inferred from an incident.
      responsibleUserId: null,
      details: "يحتاج فحص قبل الاستخدام القادم",
      status: "open",
    });
    log("بلاغ: حامل ثلاثي (يحتاج صيانة)");
  }

  // ------------------------------------------------------------- operations
  // The audit stream for this seed is written by the services above; the demo
  // marker here only keeps the reset able to find rows that have no actor link.
  log(
    `عمليات العرض التجريبي جاهزة: ميزانيات ${budgets.length} · طلبات إعلام ${mediaRequests.length} · خدمات رقمية ${digitalRequests.length} · أصول ${assets.length} · حجوزات ${reservations.length}`,
  );
  void supervisor;
  void financeLead;
  void DEMO_PREFIX;
}