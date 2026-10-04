/**
 * Serializable shapes shared by the server and the browser.
 *
 * This module deliberately imports nothing: a client component may reference
 * these types without pulling the database layer into the browser bundle.
 */
import type { Metric } from "./provenance";

export type JsonMetric = Omit<Metric, "range" | "sources"> & {
  range: { from: string; to: string; label: string };
  sources: { title: string; href?: string; id?: string }[];
};

export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type InsightShape = {
  id: string;
  severity: "info" | "attention" | "important" | "critical";
  title: string;
  explanation: string;
  source: string;
  href: string;
};

export type PulseShape = {
  headline: { label: string; explanation: string; drivenBy: string | null };
  note: string;
  dimensions: {
    key: string;
    title: string;
    state: string;
    explanation: string;
    href: string;
    primary: JsonMetric;
  }[];
};

export type CapacityShape = {
  key: string;
  title: string;
  detail: string;
  active: boolean;
  href: string;
};

export type ExecutiveShape = {
  generatedAt: string;
  range: { from: string; to: string; label: string; key: string };
  summary: {
    term: { id: string; name: string } | null;
    committees: number;
    members: number;
    upcomingEvents: number;
    completedEvents: number;
    pendingApprovals: number;
    openRequests: number;
  };
  pulse: PulseShape;
  execution: Record<string, JsonMetric>;
  people: Record<string, JsonMetric> & { membersByStatus: Record<string, number> };
  finance: Record<string, JsonMetric> & { available: boolean };
  media: Record<string, JsonMetric> & { available: boolean; byStatus: Record<string, number> };
  digital: Record<string, JsonMetric> & { available: boolean; byStatus: Record<string, number> };
  resources: Record<string, JsonMetric> & { available_: boolean; byAvailability: Record<string, number> };
  events: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    readinessPercent: number | null;
    completed: number;
    total: number;
    supportLinked: boolean;
  }[];
  insights: InsightShape[];
  capacity: CapacityShape[];
  /** Phase 7.5 additions, present on the executive view. */
  funnel?: FunnelShape;
  trends?: TrendBundleShape;
};

export type OperationsShape = {
  generatedAt: string;
  range: { from: string; to: string; label: string; key: string };
  finance: Record<string, JsonMetric> & { available: boolean };
  media: Record<string, JsonMetric> & { available: boolean; byStatus: Record<string, number> };
  digital: Record<string, JsonMetric> & { available: boolean; byStatus: Record<string, number> };
  resources: Record<string, JsonMetric> & { available_: boolean; byAvailability: Record<string, number> };
  workload: {
    byStatus: Record<string, number>;
    open: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
    inReview: number;
    eventLinked: number;
  };
  byCommittee: {
    committeeId: string | null;
    committeeName: string;
    open: number;
    overdue: number;
    inReview: number;
    requestsSent: number;
    requestsReceived: number;
  }[];
  alerts: InsightShape[];
  /** Phase 7.5: trend series for the operations domains. */
  trends?: TrendBundleShape;
};

export type EventReadinessShape = {
  eventId: string;
  eventTitle: string;
  percent: number | null;
  completed: number;
  pending: number;
  overdue: number;
  blocked: number;
  total: number;
  dimensions: {
    key: string;
    title: string;
    applicable: boolean;
    completed: number;
    pending: number;
    overdue: number;
    blocked: number;
    total: number;
    percent: number | null;
    note?: string;
  }[];
  reasonUnavailable?: string;
  statement: string;
  status: string;
  startsAt: string | null;
};

export type EventsShape = {
  generatedAt: string;
  range: { from: string; to: string; label: string; key: string };
  events: EventReadinessShape[];
};

export type CommitteeShape = {
  id: string;
  name: string;
  description: string;
  leadership: { name: string; role: string }[];
  activeMembers: number | null;
  openWork: number;
  overdue: number;
  inReview: number;
  requestsSent: number;
  requestsReceived: number;
  upcomingEventResponsibilities: number;
  volunteerHours: number | null;
  attendanceInvolvement: number;
  openRequests: number;
  statuses: { key: string; label: string; basis: string[] }[];
  scoreNote: string;
  recentActivity: { title: string; href: string; at: string }[];
  operationsQueue: Record<string, number>;
};

export type CommitteesShape = {
  generatedAt: string;
  range: { from: string; to: string; label: string; key: string };
  committees: CommitteeShape[];
  rankingNote: string;
};

export type ReportsShape = {
  templates: {
    key: string;
    title: string;
    description: string;
    requiredPermission: string;
    supportsCommittee: boolean;
    permitted: boolean;
  }[];
  canGenerate: boolean;
  note: string;
};

export type FunnelStageShape = {
  key: string;
  title: string;
  rule: string;
  count: number;
  previousCount: number | null;
  conversionPercent: number | null;
  overallPercent: number | null;
  available: boolean;
  reasonUnavailable?: string;
  members: { id: string; name: string; href: string }[];
};

export type FunnelShape = {
  totalApplications: number;
  ruleNote: string;
  period: { from: string; to: string; label: string };
  stages: FunnelStageShape[];
};

export type TrendSeriesShape = {
  key: string;
  title: string;
  rule: string;
  bucket: "day" | "week" | "month";
  points: { date: string; label: string; value: number }[];
  empty: boolean;
  total: number;
  href?: string;
  comparison?: { available: boolean; wording: string; direction: string };
};

export type TrendBundleShape = {
  bucket: "day" | "week" | "month";
  series: TrendSeriesShape[];
};
