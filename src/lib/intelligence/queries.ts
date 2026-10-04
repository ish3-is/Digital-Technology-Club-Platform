/**
 * The intelligence read API used by every route and by the API surface.
 *
 * Access is decided here, once: a caller needs `intelligence.view` to read
 * anything, `intelligence.executive` for the club-wide picture, and
 * `intelligence.committees` for committee detail. Finance figures appear only
 * when the caller already holds finance access — the intelligence layer never
 * grants visibility the operations screens would refuse.
 */
import type { Identity } from "@/lib/services";
import { HttpError } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { collectSnapshots, executiveScope, type Snapshots } from "./snapshots";
import { rangeOptions, resolveRange, type TimeRange } from "./provenance";
import {
  executionMetrics,
  peopleMetrics,
  financeMetrics,
  mediaMetrics,
  digitalMetrics,
  resourceMetrics,
  workloadByCommittee,
} from "./metrics";
import { allEventReadiness, eventIntelligence, eventReadiness } from "./readiness";
import {
  committeeIntelligence,
  committeeOperationsDetail,
  executiveSummary,
  governanceLinkage,
  kpiExplainability,
  workloadBreakdown,
} from "./committees";
import { clubPulse } from "./pulse";
import { capacitySignals, insights } from "./insights";
import { generateReport, reportTemplates } from "./reports";
import { onboardingFunnel } from "./funnel";
import { trends as buildTrends } from "./trends";
import { supervisorBrief } from "./supervisor";
import { canFile, fileableTemplates, filedIntelligenceReports, fileIntelligenceReport } from "./filing";

export function canRead(ctx: Identity) {
  return hasLiveGrant(ctx, "intelligence.view");
}
export function canReadExecutive(ctx: Identity) {
  return hasLiveGrant(ctx, "intelligence.executive");
}
export function canReadCommittees(ctx: Identity) {
  return hasLiveGrant(ctx, "intelligence.committees") || canReadExecutive(ctx);
}
export function canGenerateReports(ctx: Identity) {
  return hasLiveGrant(ctx, "intelligence.reports") || hasLiveGrant(ctx, "report.create");
}

function demandRead(ctx: Identity) {
  if (!canRead(ctx)) throw new HttpError(403, "لا تملك صلاحية قراءة طبقة الاستخبارات");
}

/** Resolves the reporting window from a route's query string. */
export async function resolveFor(ctx: Identity, rangeKey = "term"): Promise<{ snap: Snapshots; range: TimeRange }> {
  demandRead(ctx);
  const snap = await collectSnapshots(ctx);
  return { snap, range: resolveRange(rangeKey, snap.term) };
}

export const intelligenceRangeOptions = rangeOptions;

export type ExecutiveIntelligence = Awaited<ReturnType<typeof buildExecutiveIntelligence>>;
export type OperationsIntelligence = Awaited<ReturnType<typeof buildOperationsIntelligence>>;
export type EventsIntelligence = Awaited<ReturnType<typeof buildEventsIntelligence>>;
export type CommitteesIntelligence = Awaited<ReturnType<typeof buildCommitteesIntelligence>>;
export type IntelligenceReports = Awaited<ReturnType<typeof buildIntelligenceReports>>;
export type SupervisorBriefShape = Awaited<ReturnType<typeof supervisorBrief>>;
export type FunnelShape = ReturnType<typeof onboardingFunnel>;
export type TrendBundleShape = ReturnType<typeof buildTrends>;
export type GovernanceIntelligence = Awaited<ReturnType<typeof buildGovernanceIntelligence>>;

async function buildExecutiveIntelligence(ctx: Identity, rangeKey = "term") {
  if (!canReadExecutive(ctx))
    throw new HttpError(403, "الاستخبارات التنفيذية متاحة للقيادة والمشرف فقط");
  const { snap, range } = await resolveFor(ctx, rangeKey);
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    summary: executiveSummary(snap, range, now),
    pulse: clubPulse(snap, range, now),
    execution: executionMetrics(snap, range, now),
    people: peopleMetrics(snap, range),
    finance: financeMetrics(snap, range),
    media: mediaMetrics(snap, range, now),
    digital: digitalMetrics(snap, range, now),
    resources: resourceMetrics(snap, range, now),
    events: eventIntelligence(snap, now),
    insights: insights(snap, now),
    capacity: capacitySignals(snap, now),
    range: { from: range.from, to: range.to, label: range.labelAr, key: range.key },
    rangeOptions,
  };
}

async function buildOperationsIntelligence(ctx: Identity, rangeKey = "term") {
  const { snap, range } = await resolveFor(ctx, rangeKey);
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    finance: financeMetrics(snap, range),
    media: mediaMetrics(snap, range, now),
    digital: digitalMetrics(snap, range, now),
    resources: resourceMetrics(snap, range, now),
    workload: workloadBreakdown(snap, now),
    byCommittee: workloadByCommittee(snap, now),
    alerts: insights(snap, now),
    // Phase 7.5: the same snapshots feed the trend series, so no second read.
    trends: buildTrends(snap, range.from, range.to),
    range: { from: range.from, to: range.to, label: range.labelAr, key: range.key },
    rangeOptions,
  };
}

async function buildEventsIntelligence(ctx: Identity, rangeKey = "term") {
  const { snap, range } = await resolveFor(ctx, rangeKey);
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    events: allEventReadiness(snap, now),
    range: { from: range.from, to: range.to, label: range.labelAr, key: range.key },
    rangeOptions,
  };
}

export async function singleEventReadiness(ctx: Identity, eventId: string) {
  const snap = await collectSnapshots(ctx);
  return eventReadiness(snap, eventId);
}

async function buildCommitteesIntelligence(ctx: Identity, rangeKey = "term") {
  if (!canReadCommittees(ctx))
    throw new HttpError(403, "استخبارات اللجان متاحة لقيادة اللجان والقيادة التنفيذية");
  const { snap, range } = await resolveFor(ctx, rangeKey);
  return {
    generatedAt: new Date().toISOString(),
    committees: committeeIntelligence(snap),
    workload: workloadByCommittee(snap),
    range: { from: range.from, to: range.to, label: range.labelAr, key: range.key },
    rangeOptions,
    rankingNote:
      "لا يوجد ترتيب بين اللجان. القوائم هنا مرتبة بحسب العمل المفتوح لتسهيل المتابعة فقط، وليست تقييمًا.",
  };
}

export async function committeeDetail(ctx: Identity, committeeId: string, rangeKey = "term") {
  const { snap, range } = await resolveFor(ctx, rangeKey);
  const all = committeeIntelligence(snap);
  const committee = all.find((c) => c.id === committeeId);
  if (!committee) throw new HttpError(404, "اللجنة غير متاحة");
  return {
    generatedAt: new Date().toISOString(),
    committee,
    operations: committeeOperationsDetail(snap, committeeId),
    readiness: allEventReadiness(snap).filter((e) =>
      snap.events.some((ev) => ev.id === e.eventId && ev.committeeId === committeeId),
    ),
    range: { from: range.from, to: range.to, label: range.labelAr, key: range.key },
  };
}

async function buildGovernanceIntelligence(ctx: Identity) {
  demandRead(ctx);
  const snap = await collectSnapshots(ctx);
  return {
    generatedAt: new Date().toISOString(),
    goals: governanceLinkage(snap),
    pulse: clubPulse(snap, resolveRange("term", snap.term), new Date()),
  };
}

export async function kpiExplain(ctx: Identity, kpiId: string) {
  const snap = await collectSnapshots(ctx);
  return kpiExplainability(snap, kpiId);
}

async function buildIntelligenceReports(ctx: Identity) {
  demandRead(ctx);
  return {
    templates: reportTemplates.map((t) => ({
      ...t,
      permitted: hasLiveGrant(ctx, t.requiredPermission),
    })),
    canGenerate: canGenerateReports(ctx),
    note:
      "التقرير يُولَّد من السجلات الحالية وقت الطلب، ولا يُحفظ تلقائيًا. التصدير يلتزم بنفس نطاق الصلاحيات.",
  };
}

export { generateReport, reportTemplates };
export * from "./provenance";
export * from "./metrics";
export * from "./readiness";
export * from "./committees";
export * from "./pulse";
export * from "./insights";
export * from "./reports";
export * from "./snapshots";
export * from "./funnel";
export * from "./trends";
export * from "./supervisor";
export * from "./filing";
export const executiveIntelligence = buildExecutiveIntelligence;

/** Executive intelligence plus the onboarding funnel and trend series. */
export async function executiveIntelligenceFull(ctx: Identity, rangeKey = "term") {
  const [base, funnel, trend] = await Promise.all([
    buildExecutiveIntelligence(ctx, rangeKey),
    funnelFor(ctx, rangeKey),
    trendsFor(ctx, rangeKey),
  ]);
  return { ...base, funnel, trends: trend };
}
export const operationsIntelligence = buildOperationsIntelligence;
export const eventsIntelligence = buildEventsIntelligence;
export const committeesIntelligence = buildCommitteesIntelligence;
export const governanceIntelligence = buildGovernanceIntelligence;
export const intelligenceReports = buildIntelligenceReports;

/** Onboarding funnel for the executive and people views. */
export const funnelFor = (ctx: Identity, rangeKey = "term") =>
  resolveFor(ctx, rangeKey).then(({ snap, range }) => onboardingFunnel(snap, range));

/** Trend series for the intelligence pages. */
export const trendsFor = (ctx: Identity, rangeKey = "term") =>
  resolveFor(ctx, rangeKey).then(({ snap, range }) => buildTrends(snap, range.from, range.to));

/** The oversight brief shown to the supervisor. */
export { supervisorBrief };

export const fileReport = fileIntelligenceReport;
export { canFile, fileableTemplates, filedIntelligenceReports };
