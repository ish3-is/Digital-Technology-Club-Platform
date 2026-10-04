import {
  pgTable,
  text,
  timestamp,
  boolean,
  primaryKey,
  jsonb,
  index,
  check,
  bigint,
  integer,
  uniqueIndex,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  onboarded: boolean("onboarded").notNull().default(false),
});
export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: time("access_token_expires_at"),
  refreshTokenExpiresAt: time("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const rateLimit = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  bio: text("bio").notNull().default(""),
  classification: text("classification").notNull().default("internal"),
});
export const terms = pgTable(
  "academic_terms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    year: text("academic_year").notNull(),
    status: text("status").notNull().default("planned"),
    startAt: time("start_at").notNull(),
    endAt: time("end_at").notNull(),
  },
  (t) => [
    check("term_dates", sql`${t.endAt} > ${t.startAt}`),
    check("term_status", sql`${t.status} in ('planned','active','closed')`),
  ],
);
export const committees = pgTable("committees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
});
export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const permissions = pgTable("permissions", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
});
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);
export const assignments = pgTable(
  "user_role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    committeeId: text("committee_id").references(() => committees.id),
    termId: text("term_id").references(() => terms.id),
    scope: text("scope").notNull(),
    startAt: time("start_at").notNull().defaultNow(),
    endAt: time("end_at"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("assignment_user_idx").on(t.userId),
    check(
      "assignment_scope",
      sql`(${t.scope} = 'club' AND ${t.committeeId} IS NULL) OR (${t.scope} = 'committee' AND ${t.committeeId} IS NOT NULL) OR (${t.scope} = 'self' AND ${t.committeeId} IS NULL)`,
    ),
    check(
      "assignment_dates",
      sql`${t.endAt} IS NULL OR ${t.endAt} > ${t.startAt}`,
    ),
  ],
);
export const memberships = pgTable("committee_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  committeeId: text("committee_id")
    .notNull()
    .references(() => committees.id),
  termId: text("term_id")
    .notNull()
    .references(() => terms.id),
  startAt: time("start_at").notNull(),
  endAt: time("end_at"),
});
export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  committeeId: text("committee_id").references(() => committees.id),
  ownerId: text("owner_id").references(() => user.id),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => user.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  sessionId: text("session_id"),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    workId: text("work_id").references(() => workItems.id),
    readAt: time("read_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("notification_owner_idx").on(t.userId)],
);

// Phase 2: a relational work envelope; typed details keep domain invariants separate.
export const workItems = pgTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").references((): AnyPgColumn => events.id),
    track: text("track").notNull().default("general"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull(),
    priority: text("priority").notNull().default("medium"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    termId: text("term_id")
      .notNull()
      .references(() => terms.id),
    startAt: time("start_at"),
    dueAt: time("due_at"),
    completedAt: time("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "work_kind",
      sql`${t.kind} in ('task','request','meeting','decision','event')`,
    ),
    check(
      "work_priority",
      sql`${t.priority} in ('low','medium','high','urgent')`,
    ),
    check(
      "work_dates",
      sql`${t.startAt} IS NULL OR ${t.dueAt} IS NULL OR ${t.dueAt} >= ${t.startAt}`,
    ),
    check(
      "work_state",
      sql`(${t.kind}='task' AND ${t.status} in ('not_started','in_progress','review','completed','cancelled')) OR (${t.kind}='request' AND ${t.status} in ('new','received','in_progress','review','completed','rejected','cancelled')) OR (${t.kind}='meeting' AND ${t.status} in ('scheduled','held','cancelled')) OR (${t.kind}='decision' AND ${t.status} in ('recorded','revoked')) OR (${t.kind}='event' AND ${t.status} in ('idea','planning','pending_approval','approved','registration_open','preparing','ready','running','evaluation','final_report','archived','cancelled'))`,
    ),
    index("work_context_idx").on(t.committeeId, t.termId, t.kind),
    index("work_due_idx").on(t.dueAt),
  ],
);
export const tasks = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .references(() => workItems.id),
    progress: integer("progress").notNull().default(0),
  },
  (t) => [check("task_progress", sql`${t.progress} between 0 and 100`)],
);
export const requests = pgTable("requests", {
  id: text("id")
    .primaryKey()
    .references(() => workItems.id),
  receivingCommitteeId: text("receiving_committee_id")
    .notNull()
    .references(() => committees.id),
});
export const meetings = pgTable("meetings", {
  id: text("id")
    .primaryKey()
    .references(() => workItems.id),
  endAt: time("end_at").notNull(),
  location: text("location").notNull().default(""),
  agenda: text("agenda").notNull().default(""),
  notes: text("notes").notNull().default(""),
});
export const decisions = pgTable("decisions", {
  id: text("id")
    .primaryKey()
    .references(() => workItems.id),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id),
  decidedBy: text("decided_by")
    .notNull()
    .references(() => user.id),
  decisionDate: time("decision_date").notNull().defaultNow(),
});
export const workAssignments = pgTable(
  "work_assignments",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => workItems.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull(),
    response: text("response").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("work_person_role").on(t.workId, t.userId, t.role),
    uniqueIndex("work_single_lead_reviewer")
      .on(t.workId, t.role)
      .where(sql`${t.role} in ('responsible','reviewer')`),
    check(
      "work_assignment_role",
      sql`${t.role} in ('responsible','participant','reviewer','attendee')`,
    ),
    check(
      "invitation_response",
      sql`${t.response} in ('pending','accepted','declined')`,
    ),
  ],
);
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => tasks.id),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.blockerId] }),
    check("no_self_dependency", sql`${t.taskId} <> ${t.blockerId}`),
  ],
);
export const taskSources = pgTable(
  "task_sources",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => tasks.id),
    requestId: text("request_id").references(() => requests.id),
    decisionId: text("decision_id").references(() => decisions.id),
  },
  (t) => [
    check(
      "one_task_source",
      sql`(${t.requestId} IS NOT NULL AND ${t.decisionId} IS NULL) OR (${t.requestId} IS NULL AND ${t.decisionId} IS NOT NULL)`,
    ),
  ],
);
export const comments = pgTable(
  "work_comments",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => workItems.id),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("comments_work_idx").on(t.workId)],
);
export const mentions = pgTable(
  "work_mentions",
  {
    id: text("id").primaryKey(),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    acknowledgedAt: time("acknowledged_at"),
  },
  (t) => [uniqueIndex("mention_once").on(t.commentId, t.userId)],
);
export const approvalInstances = pgTable(
  "approval_instances",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").notNull().default("work"),
    workId: text("work_id")
      .notNull()
      .references(() => workItems.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    status: text("status").notNull().default("pending"),
    createdAt: time("created_at").notNull().defaultNow(),
    decidedAt: time("decided_at"),
  },
  (t) => [
    uniqueIndex("one_pending_approval")
      .on(t.workId)
      .where(sql`${t.status}='pending'`),
    check(
      "approval_status",
      sql`${t.status} in ('pending','approved','rejected','changes_requested','cancelled')`,
    ),
  ],
);
export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => approvalInstances.id),
    position: integer("position").notNull().default(1),
    approverId: text("approver_id")
      .notNull()
      .references(() => user.id),
    decision: text("decision").notNull().default("pending"),
    comment: text("comment").notNull().default(""),
    decidedAt: time("decided_at"),
  },
  (t) => [
    uniqueIndex("approval_step_position").on(t.instanceId, t.position),
    check(
      "step_decision",
      sql`${t.decision} in ('pending','approved','rejected','changes_requested','cancelled')`,
    ),
  ],
);
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    classification: text("classification").notNull().default("restricted"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [check("file_size", sql`${t.size}>0 AND ${t.size}<=5242880`)],
);
export const fileContents = pgTable("file_contents", {
  fileId: text("file_id")
    .primaryKey()
    .references(() => files.id),
  content: bytes("content").notNull(),
});
export const attachments = pgTable("work_attachments", {
  id: text("id").primaryKey(),
  workId: text("work_id")
    .notNull()
    .references(() => workItems.id),
  fileId: text("file_id")
    .notNull()
    .unique()
    .references(() => files.id),
});
export const workEvents = pgTable("work_events", {
  id: text("id").primaryKey(),
  workId: text("work_id")
    .notNull()
    .references(() => workItems.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  label: text("label").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const dueDeliveries = pgTable(
  "due_deliveries",
  {
    workId: text("work_id")
      .notNull()
      .references(() => workItems.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    dueAt: time("due_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workId, t.userId, t.dueAt] })],
);

// ========================
// Phase 4: Governance, Evidence & Institutional Reporting
// ========================
export const goals = pgTable("goals", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  academicTermId: text("academic_term_id")
    .notNull()
    .references(() => terms.id),
  ownerUserId: text("owner_user_id").references(() => user.id),
  committeeId: text("committee_id").references(() => committees.id),
  targetType: text("target_type")
    .notNull()
    .default("qualitative")
    .$type<"qualitative" | "quantitative">(),
  targetValue: integer("target_value"),
  currentValue: integer("current_value"),
  startAt: time("start_at"),
  dueAt: time("due_at"),
  status: text("status")
    .notNull()
    .default("not_started")
    .$type<"not_started" | "in_progress" | "at_risk" | "completed" | "cancelled">(),
  weight: integer("weight"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  check("goal_status", sql`${t.status} in ('not_started','in_progress','at_risk','completed','cancelled')`),
  check("goal_dates", sql`${t.dueAt} IS NULL OR ${t.startAt} IS NULL OR ${t.dueAt} >= ${t.startAt}`),
  check("goal_target_type", sql`${t.targetType} in ('qualitative','quantitative')`),
  index("goals_term_idx").on(t.academicTermId),
  index("goals_committee_idx").on(t.committeeId),
  index("goals_status_idx").on(t.status),
  index("goals_created_by_idx").on(t.createdBy),
]);

export const initiatives = pgTable("initiatives", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  committeeId: text("committee_id").references(() => committees.id),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  startAt: time("start_at"),
  dueAt: time("due_at"),
  status: text("status")
    .notNull()
    .default("not_started")
    .$type<"not_started" | "in_progress" | "completed" | "cancelled">(),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  check("initiative_status", sql`${t.status} in ('not_started','in_progress','completed','cancelled')`),
  check("initiative_dates", sql`${t.dueAt} IS NULL OR ${t.startAt} IS NULL OR ${t.dueAt} >= ${t.startAt}`),
  index("initiatives_goal_idx").on(t.goalId),
  index("initiatives_committee_idx").on(t.committeeId),
  index("initiatives_status_idx").on(t.status),
]);

export const kpis = pgTable("kpis", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  academicTermId: text("academic_term_id")
    .notNull()
    .references(() => terms.id),
  committeeId: text("committee_id").references(() => committees.id),
  goalId: text("goal_id").references(() => goals.id),
  ownerUserId: text("owner_user_id").references(() => user.id),
  unit: text("unit").notNull().default(""),
  direction: text("direction")
    .notNull()
    .default("higher_is_better")
    .$type<"higher_is_better" | "lower_is_better" | "target_exact">(),
  targetValue: integer("target_value").notNull(),
  baselineValue: integer("baseline_value"),
  currentValue: integer("current_value"),
  weight: integer("weight"),
  measurementFrequency: text("measurement_frequency")
    .notNull()
    .default("monthly")
    .$type<"daily" | "weekly" | "monthly" | "quarterly" | "annual">(),
  dueAt: time("due_at"),
  status: text("status")
    .notNull()
    .default("active")
    .$type<"active" | "paused" | "completed" | "cancelled">(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
  formulaId: text("formula_id").references(() => kpiFormulaDefinitions.id),
}, (t) => [
  check("kpi_direction", sql`${t.direction} in ('higher_is_better','lower_is_better','target_exact')`),
  check("kpi_status", sql`${t.status} in ('active','paused','completed','cancelled')`),
  check("kpi_frequency", sql`${t.measurementFrequency} in ('daily','weekly','monthly','quarterly','annual')`),
  index("kpis_term_idx").on(t.academicTermId),
  index("kpis_committee_idx").on(t.committeeId),
  index("kpis_goal_idx").on(t.goalId),
  index("kpis_status_idx").on(t.status),
  index("kpis_formula_idx").on(t.formulaId),
]);

export const kpiMeasurements = pgTable("kpi_measurements", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  kpiId: text("kpi_id")
    .notNull()
    .references(() => kpis.id, { onDelete: "cascade" }),
  value: integer("value").notNull(),
  measuredAt: time("measured_at").notNull(),
  measuredBy: text("measured_by")
    .notNull()
    .references(() => user.id),
  sourceType: text("source_type")
    .notNull()
    .default("manual")
    .$type<"manual" | "task_derived" | "event_derived" | "attendance_derived" | "report_derived">(),
  sourceId: text("source_id"),
  note: text("note"),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("measurement_source_type", sql`${t.sourceType} in ('manual','task_derived','event_derived','attendance_derived','report_derived')`),
  index("measurements_kpi_idx").on(t.kpiId),
  index("measurements_measured_at_idx").on(t.measuredAt),
]);

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  evidenceType: text("evidence_type")
    .notNull()
    .default("manual")
    .$type<"file" | "event" | "report" | "survey" | "attendance" | "task_aggregate" | "manual">(),
  sourceEntityType: text("source_entity_type").notNull()
    .$type<"goal" | "initiative" | "kpi" | "event" | "report" | "task" | "meeting" | "decision" | "request">(),
  sourceEntityId: text("source_entity_id").notNull(),
  fileId: text("file_id").references(() => files.id),
  url: text("url"),
  date: time("date"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id),
  classification: text("classification")
    .notNull()
    .default("internal")
    .$type<"public" | "internal" | "restricted" | "confidential">(),
  verificationStatus: text("verification_status")
    .notNull()
    .default("unreviewed")
    .$type<"unreviewed" | "reviewed" | "rejected">(),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  check("evidence_type", sql`${t.evidenceType} in ('file','event','report','survey','attendance','task_aggregate','manual')`),
  check("evidence_classification", sql`${t.classification} in ('public','internal','restricted','confidential')`),
  check("evidence_verification", sql`${t.verificationStatus} in ('unreviewed','reviewed','rejected')`),
  index("evidence_source_idx").on(t.sourceEntityType, t.sourceEntityId),
  index("evidence_type_idx").on(t.evidenceType),
  index("evidence_classification_idx").on(t.classification),
  index("evidence_verification_idx").on(t.verificationStatus),
]);

export const kpiEvidence = pgTable("kpi_evidence", {
  kpiMeasurementId: text("kpi_measurement_id")
    .notNull()
    .references(() => kpiMeasurements.id, { onDelete: "cascade" }),
  evidenceId: text("evidence_id")
    .notNull()
    .references(() => evidence.id, { onDelete: "cascade" }),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.kpiMeasurementId, t.evidenceId] }),
]);

export const reportTypes = pgTable("report_types", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  category: text("category")
    .notNull()
    .default("standard")
    .$type<"standard" | "custom">(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("report_types_category_check", sql`${t.category} in ('standard','custom')`),
]);

export const reports = pgTable("reports", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  typeId: text("type_id")
    .notNull()
    .references(() => reportTypes.id),
  academicTermId: text("academic_term_id")
    .notNull()
    .references(() => terms.id),
  committeeId: text("committee_id").references(() => committees.id),
  periodStart: time("period_start").notNull(),
  periodEnd: time("period_end").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status")
    .notNull()
    .default("draft")
    .$type<"draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "rejected" | "archived">(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  submittedAt: time("submitted_at"),
  reviewedAt: time("reviewed_at"),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  check("report_status", sql`${t.status} in ('draft','submitted','under_review','changes_requested','approved','rejected','archived')`),
  check("report_dates", sql`${t.periodEnd} >= ${t.periodStart}`),
  index("reports_type_idx").on(t.typeId),
  index("reports_term_idx").on(t.academicTermId),
  index("reports_committee_idx").on(t.committeeId),
  index("reports_status_idx").on(t.status),
  index("reports_created_by_idx").on(t.createdBy),
]);

export const reportSections = pgTable("report_sections", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  sectionKey: text("section_key")
    .notNull()
    .$type<
      | "achievements"
      | "completed_work"
      | "ongoing_work"
      | "delayed_work"
      | "challenges"
      | "needs"
      | "next_plan"
      | "kpi_updates"
      | "event_summaries"
      | "decisions_summaries"
      | "task_aggregates"
      | "attendance_summaries"
    >(),
  content: text("content").notNull().default(""),
  autoGenerated: boolean("auto_generated").notNull().default(false),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  check("report_sections_key_check", sql`${t.sectionKey} in (
    'achievements','completed_work','ongoing_work','delayed_work',
    'challenges','needs','next_plan','kpi_updates','event_summaries',
    'decisions_summaries','task_aggregates','attendance_summaries'
  )`),
  index("report_sections_report_idx").on(t.reportId),
]);

export const reportReviews = pgTable("report_reviews", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => user.id),
  decision: text("decision")
    .notNull()
    .default("pending")
    .$type<"pending" | "approved" | "rejected" | "changes_requested">(),
  comment: text("comment").notNull().default(""),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("report_review_decision", sql`${t.decision} in ('pending','approved','rejected','changes_requested')`),
  index("report_reviews_report_idx").on(t.reportId),
  index("report_reviews_reviewer_idx").on(t.reviewerId),
  index("report_reviews_decision_idx").on(t.decision),
]);

export const governanceAlerts = pgTable("governance_alerts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type")
    .notNull()
    .$type<
      | "kpi_no_update"
      | "kpi_no_evidence"
      | "goal_at_risk"
      | "report_overdue"
      | "report_waiting_review"
      | "event_no_final_report"
      | "decision_no_execution"
      | "approval_delayed"
      | "kpi_target_missed"
      | "goal_approaching_due"
      | "initiative_overdue"
    >(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  severity: text("severity")
    .notNull()
    .default("medium")
    .$type<"low" | "medium" | "high" | "critical">(),
  relatedEntityType: text("related_entity_type")
    .$type<"goal" | "initiative" | "kpi" | "report" | "event" | "decision" | "approval" | "general">()
    .notNull()
    .default("general"),
  relatedEntityId: text("related_entity_id"),
  createdAt: time("created_at").notNull().defaultNow(),
  dismissedAt: time("dismissed_at"),
  dismissedBy: text("dismissed_by").references(() => user.id),
}, (t) => [
  check("alert_type", sql`${t.type} in (
    'kpi_no_update','kpi_no_evidence','goal_at_risk','report_overdue',
    'report_waiting_review','event_no_final_report','decision_no_execution',
    'approval_delayed','kpi_target_missed','goal_approaching_due','initiative_overdue'
  )`),
  check("alert_severity", sql`${t.severity} in ('low','medium','high','critical')`),
  index("governance_alerts_type_idx").on(t.type),
  index("governance_alerts_severity_idx").on(t.severity),
  index("governance_alerts_entity_idx").on(t.relatedEntityType, t.relatedEntityId),
  index("governance_alerts_created_idx").on(t.createdAt),
  index("governance_alerts_dismissed_idx").on(t.dismissedAt),
]);

export const clubRankings = pgTable("club_ranking", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  academicTermId: text("academic_term_id")
    .notNull()
    .references(() => terms.id),
  currentPosition: integer("current_position"),
  targetPosition: integer("target_position"),
  officialCriteriaDocument: text("official_criteria_document"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("club_ranking_term_unique").on(t.academicTermId),
]);

export const kpiFormulaDefinitions = pgTable("kpi_formula_definitions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  formulaType: text("formula_type")
    .notNull()
    .$type<
      | "simple_ratio"
      | "task_aggregate"
      | "attendance_rate"
      | "report_completion"
      | "manual"
      | "sql_aggregate"
    >(),
  definition: jsonb("definition").notNull().default({}),
  description: text("description").notNull().default(""),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("kpi_formula_type", sql`${t.formulaType} in ('simple_ratio','task_aggregate','attendance_rate','report_completion','manual','sql_aggregate')`),
  index("kpi_formula_type_idx").on(t.formulaType),
]);

export const initiativeLinks = pgTable("initiative_links", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  initiativeId: text("initiative_id")
    .notNull()
    .references(() => initiatives.id, { onDelete: "cascade" }),
  linkType: text("link_type")
    .$type<"event" | "task" | "meeting" | "decision" | "request">()
    .notNull(),
  linkedId: text("linked_id").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("initiative_link_type", sql`${t.linkType} in ('event','task','meeting','decision','request')`),
  index("initiative_links_initiative_idx").on(t.initiativeId),
  index("initiative_links_linked_idx").on(t.linkType, t.linkedId),
]);

export const governanceEvents = pgTable("governance_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: text("actor_id").references(() => user.id),
  action: text("action").notNull(),
  entityType: text("entity_type")
    .notNull()
    .$type<
      | "goal"
      | "initiative"
      | "kpi"
      | "kpi_measurement"
      | "evidence"
      | "report"
      | "report_section"
      | "report_review"
      | "governance_alert"
      | "club_ranking"
      | "kpi_formula_definition"
    >(),
  entityId: text("entity_id").notNull(),
  committeeId: text("committee_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("governance_event_entity_type", sql`${t.entityType} in (
    'goal','initiative','kpi','kpi_measurement','evidence','report',
    'report_section','report_review','governance_alert','club_ranking',
    'kpi_formula_definition'
  )`),
  index("governance_events_entity_idx").on(t.entityType, t.entityId),
  index("governance_events_actor_idx").on(t.actorId),
  index("governance_events_created_idx").on(t.createdAt),
]);

export const governanceAuditTrail = pgTable("governance_audit_trail", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: text("actor_id").references(() => user.id),
  entityType: text("entity_type")
    .notNull()
    .$type<
      | "goal"
      | "initiative"
      | "kpi"
      | "kpi_measurement"
      | "evidence"
      | "report"
      | "report_section"
      | "report_review"
      | "club_ranking"
      | "kpi_formula_definition"
    >(),
  entityId: text("entity_id").notNull(),
  action: text("action")
    .notNull()
    .$type<
      | "created"
      | "updated"
      | "submitted"
      | "reviewed"
      | "approved"
      | "rejected"
      | "changed"
      | "measured"
      | "verified"
      | "dismissed"
      | "linked"
      | "unlinked"
    >(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  sessionId: text("session_id"),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  check("audit_entity_type", sql`${t.entityType} in (
    'goal','initiative','kpi','kpi_measurement','evidence','report',
    'report_section','report_review','club_ranking','kpi_formula_definition'
  )`),
  check("audit_action", sql`${t.action} in (
    'created','updated','submitted','reviewed','approved','rejected',
    'changed','measured','verified','dismissed','linked','unlinked'
  )`),
  index("governance_audit_entity_idx").on(t.entityType, t.entityId),
  index("governance_audit_action_idx").on(t.action),
  index("governance_audit_created_idx").on(t.createdAt),
]);

// ========================
// Phase 4 Type Exports
// ========================
export type GoalStatus = typeof goals.$inferSelect["status"];
export type InitiativeStatus = typeof initiatives.$inferSelect["status"];
export type KpiDirection = typeof kpis.$inferSelect["direction"];
export type KpiFrequency = typeof kpis.$inferSelect["measurementFrequency"];
export type KpiStatus = typeof kpis.$inferSelect["status"];
export type MeasurementSourceType = typeof kpiMeasurements.$inferSelect["sourceType"];
export type EvidenceType = typeof evidence.$inferSelect["evidenceType"];
export type EvidenceClassification = typeof evidence.$inferSelect["classification"];
export type EvidenceVerificationStatus = typeof evidence.$inferSelect["verificationStatus"];
export type ReportStatus = typeof reports.$inferSelect["status"];
export type ReportSectionKey = typeof reportSections.$inferSelect["sectionKey"];
export type ReportReviewDecision = typeof reportReviews.$inferSelect["decision"];
export type GovernanceAlertType = typeof governanceAlerts.$inferSelect["type"];
export type GovernanceAlertSeverity = typeof governanceAlerts.$inferSelect["severity"];
export type GovernanceAlertEntityType = typeof governanceAlerts.$inferSelect["relatedEntityType"];
export type KpiFormulaType = typeof kpiFormulaDefinitions.$inferSelect["formulaType"];
export type InitiativeLinkType = typeof initiativeLinks.$inferSelect["linkType"];
export type GovernanceEntityType = typeof governanceEvents.$inferSelect["entityType"];
export type GovernanceAuditAction = typeof governanceAuditTrail.$inferSelect["action"];
export type GovernanceAuditEntityType = typeof governanceAuditTrail.$inferSelect["entityType"];

// ========================
// End Phase 4 Type Exports
// ========================

export const eventPlaybooks = pgTable("event_playbooks", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  definition: jsonb("definition")
    .$type<{
      requirements: {
        title: string;
        category: string;
        required: boolean;
        gate: string;
      }[];
      tasks: { title: string; category: string }[];
    }>()
    .notNull(),
});
export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .references(() => workItems.id),
    eventType: text("event_type").notNull(),
    leadId: text("lead_id")
      .notNull()
      .references(() => user.id),
    endAt: time("end_at").notNull(),
    locationType: text("location_type").notNull(),
    locationText: text("location_text").notNull().default(""),
    meetingUrl: text("meeting_url"),
    targetAudience: text("target_audience").notNull(),
    capacity: integer("capacity"),
    registrationUrl: text("registration_url"),
    plannedBudget: integer("planned_budget"),
    approvedBudget: integer("approved_budget"),
    actualSpend: integer("actual_spend"),
    approverId: text("approver_id")
      .notNull()
      .references(() => user.id),
    reportRequired: boolean("report_required").notNull().default(true),
    playbookId: text("playbook_id").references(() => eventPlaybooks.id),
    playbookVersion: integer("playbook_version"),
  },
  (t) => [
    check("event_capacity", sql`${t.capacity} IS NULL OR ${t.capacity}>0`),
    check(
      "event_budgets",
      sql`coalesce(${t.plannedBudget},0)>=0 AND coalesce(${t.approvedBudget},0)>=0 AND coalesce(${t.actualSpend},0)>=0`,
    ),
    check(
      "event_location",
      sql`${t.locationType} in ('onsite','online','hybrid')`,
    ),
  ],
);
export const eventRoles = pgTable("event_roles", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
});
export const eventTeam = pgTable(
  "event_team",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    roleId: text("role_id")
      .notNull()
      .references(() => eventRoles.id),
    committeeId: text("committee_id").references(() => committees.id),
    startAt: time("start_at").notNull().defaultNow(),
    endAt: time("end_at"),
  },
  (t) => [
    uniqueIndex("event_team_role").on(t.eventId, t.userId, t.roleId),
    check(
      "event_team_dates",
      sql`${t.endAt} IS NULL OR ${t.endAt}>${t.startAt}`,
    ),
  ],
);
export const eventRequirements = pgTable(
  "event_requirements",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    title: text("title").notNull(),
    category: text("category").notNull(),
    required: boolean("required").notNull().default(true),
    status: text("status").notNull().default("pending"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    dueAt: time("due_at"),
    evidence: text("evidence").notNull().default(""),
    gate: text("gate").notNull().default("ready"),
  },
  (t) => [
    check("readiness_status", sql`${t.status} in ('pending','completed')`),
    check(
      "readiness_gate",
      sql`${t.gate} in ('pending_approval','registration_open','ready','final_report','archived')`,
    ),
  ],
);
export const eventRisks = pgTable(
  "event_risks",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    probability: integer("probability").notNull(),
    impact: integer("impact").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    mitigation: text("mitigation").notNull().default(""),
    status: text("status").notNull().default("open"),
  },
  (t) => [
    check(
      "risk_scale",
      sql`${t.probability} between 1 and 3 AND ${t.impact} between 1 and 3`,
    ),
    check("risk_status", sql`${t.status} in ('open','mitigating','closed')`),
  ],
);
export const eventParticipants = pgTable(
  "event_participants",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    universityId: text("university_id"),
    major: text("major"),
    registrationSource: text("registration_source").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    qrTokenHash: text("qr_token_hash").unique(),
  },
  (t) => [
    uniqueIndex("participant_event_email").on(t.eventId, t.email),
    uniqueIndex("participant_event_university").on(t.eventId, t.universityId),
  ],
);
export const eventAttendance = pgTable(
  "event_attendance",
  {
    participantId: text("participant_id")
      .primaryKey()
      .references(() => eventParticipants.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    status: text("status").notNull().default("registered"),
    checkInAt: time("check_in_at"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    source: text("source").notNull(),
    checkInSessionId: text("check_in_session_id"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "attendance_status",
      sql`${t.status} in ('registered','present','absent','cancelled')`,
    ),
  ],
);
export const eventFiles = pgTable(
  "event_files",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    fileId: text("file_id")
      .notNull()
      .unique()
      .references(() => files.id),
    category: text("category").notNull(),
    visibility: text("visibility").notNull().default("team"),
  },
  (t) => [
    check(
      "event_file_visibility",
      sql`${t.visibility} in ('team','participants','budget')`,
    ),
  ],
);
export const eventReports = pgTable(
  "event_reports",
  {
    eventId: text("event_id")
      .primaryKey()
      .references(() => events.id),
    summary: text("summary").notNull(),
    objectives: text("objectives").notNull(),
    execution: text("execution").notNull(),
    results: text("results").notNull(),
    challenges: text("challenges").notNull(),
    recommendations: text("recommendations").notNull(),
    evaluation: text("evaluation").notNull(),
    lessons: text("lessons").notNull(),
    status: text("status").notNull().default("draft"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "event_report_status",
      sql`${t.status} in ('draft','pending','approved','changes_requested','rejected')`,
    ),
  ],
);

// ========================
// Phase 5: People, Membership & Contribution
// ========================

// Identity fields live here; authorization lives in user_role_assignments.
export const memberProfiles = pgTable(
  "member_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    studentId: text("student_id"),
    phone: text("phone"),
    major: text("major"),
    college: text("college"),
    academicLevel: text("academic_level"),
    gender: text("gender").$type<"male" | "female">(),
    joinedAt: time("joined_at"),
    status: text("status")
      .notNull()
      .default("new")
      .$type<
        "new" | "active" | "low_engagement" | "inactive" | "withdrawn" | "archived"
      >(),
    // Explainable only: leadership records the reason; nothing is inferred silently.
    statusReason: text("status_reason"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    developmentGoals: jsonb("development_goals").$type<string[]>().notNull().default([]),
    previousExperience: text("previous_experience").notNull().default(""),
    preferredAreas: jsonb("preferred_areas").$type<string[]>().notNull().default([]),
    availability: text("availability").notNull().default(""),
    motivation: text("motivation").notNull().default(""),
    managementNotes: text("management_notes").notNull().default(""),
    imageUrl: text("image_url"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "member_status",
      sql`${t.status} in ('new','active','low_engagement','inactive','withdrawn','archived')`,
    ),
    uniqueIndex("member_profiles_student_idx")
      .on(t.studentId)
      .where(sql`${t.studentId} IS NOT NULL`),
    index("member_profiles_status_idx").on(t.status),
  ],
);

// The club-level role a member holds, kept separate from RBAC role assignments.
export const memberRoleHistory = pgTable(
  "member_role_history",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clubRole: text("club_role").notNull(),
    previousClubRole: text("previous_club_role"),
    committeeId: text("committee_id").references(() => committees.id),
    academicTermId: text("academic_term_id").references(() => terms.id),
    reason: text("reason").notNull().default(""),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => user.id),
    startAt: time("start_at").notNull().defaultNow(),
    endAt: time("end_at"),
  },
  (t) => [
    index("member_role_history_user_idx").on(t.userId, t.startAt),
    uniqueIndex("member_role_history_active")
      .on(t.userId)
      .where(sql`${t.endAt} IS NULL`),
  ],
);

export const membershipApplications = pgTable(
  "membership_applications",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    fullName: text("full_name").notNull(),
    studentId: text("student_id").notNull(),
    major: text("major").notNull().default(""),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    previousExperience: text("previous_experience").notNull().default(""),
    preferredCommitteeId: text("preferred_committee_id").references(
      () => committees.id,
    ),
    alternateCommitteeId: text("alternate_committee_id").references(
      () => committees.id,
    ),
    motivation: text("motivation").notNull().default(""),
    developmentGoals: jsonb("development_goals").$type<string[]>().notNull().default([]),
    availability: text("availability").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status")
      .notNull()
      .default("submitted")
      .$type<
        | "submitted"
        | "under_review"
        | "shortlisted"
        | "interview"
        | "accepted"
        | "rejected"
        | "waitlisted"
        | "converted"
      >(),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    assignedReviewerId: text("assigned_reviewer_id").references(() => user.id),
    convertedUserId: text("converted_user_id").references(() => user.id),
    decidedAt: time("decided_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "application_status",
      sql`${t.status} in ('submitted','under_review','shortlisted','interview','accepted','rejected','waitlisted','converted')`,
    ),
    index("application_status_idx").on(t.status),
    index("application_reviewer_idx").on(t.assignedReviewerId),
    index("application_term_idx").on(t.academicTermId),
  ],
);

// Append-only decision log; a decision never overwrites the previous one.
export const applicationReviews = pgTable(
  "application_reviews",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: text("application_id")
      .notNull()
      .references(() => membershipApplications.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    decision: text("decision")
      .notNull()
      .$type<"assigned" | "shortlisted" | "accepted" | "rejected" | "waitlisted" | "note">(),
    reason: text("reason").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("application_reviews_application_idx").on(t.applicationId),
    index("application_reviews_reviewer_idx").on(t.reviewerId),
  ],
);

// Placement history; the previous row is closed, never deleted.
export const memberCommitteeHistory = pgTable(
  "member_committee_history",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    committeeId: text("committee_id")
      .notNull()
      .references(() => committees.id),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    assignmentType: text("assignment_type")
      .notNull()
      .default("permanent")
      .$type<"permanent" | "temporary" | "collaboration">(),
    reason: text("reason").notNull().default(""),
    placedBy: text("placed_by")
      .notNull()
      .references(() => user.id),
    startAt: time("start_at").notNull().defaultNow(),
    endAt: time("end_at"),
  },
  (t) => [
    index("member_committee_history_user_idx").on(t.userId, t.startAt),
    index("member_committee_history_committee_idx").on(t.committeeId),
  ],
);

export const memberStatusHistory = pgTable(
  "member_status_history",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status"),
    newStatus: text("new_status").notNull(),
    reason: text("reason").notNull().default(""),
    changedBy: text("changed_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("member_status_history_user_idx").on(t.userId, t.createdAt)],
);

export const transferRequests = pgTable(
  "transfer_requests",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fromCommitteeId: text("from_committee_id").references(() => committees.id),
    toCommitteeId: text("to_committee_id")
      .notNull()
      .references(() => committees.id),
    reason: text("reason").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status")
      .notNull()
      .default("requested")
      .$type<"requested" | "approved" | "rejected">(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    decisionNotes: text("decision_notes").notNull().default(""),
    decidedAt: time("decided_at"),
    effectiveAt: time("effective_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("transfer_status", sql`${t.status} in ('requested','approved','rejected')`),
    index("transfer_requests_user_idx").on(t.userId),
    index("transfer_requests_status_idx").on(t.status),
  ],
);

export const onboardingPlans = pgTable(
  "onboarding_plans",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    status: text("status")
      .notNull()
      .default("in_progress")
      .$type<"in_progress" | "completed" | "cancelled">(),
    startedAt: time("started_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    uniqueIndex("onboarding_plan_term_unique").on(t.userId, t.academicTermId),
    index("onboarding_plans_status_idx").on(t.status),
  ],
);

export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    planId: text("plan_id")
      .notNull()
      .references(() => onboardingPlans.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    title: text("title").notNull(),
    position: text("position").notNull(),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "in_progress" | "completed" | "skipped">(),
    ownerId: text("owner_id").references(() => user.id),
    dueAt: time("due_at"),
    completedAt: time("completed_at"),
    // A step is never auto-completed; this records the action that justified it.
    completionNote: text("completion_note").notNull().default(""),
    linkedWorkId: text("linked_work_id"),
    linkedEventId: text("linked_event_id"),
    completedBy: text("completed_by").references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("onboarding_steps_plan_key").on(t.planId, t.stepKey),
    check(
      "onboarding_step_status",
      sql`${t.status} in ('pending','in_progress','completed','skipped')`,
    ),
    index("onboarding_steps_plan_idx").on(t.planId),
  ],
);

export const mentorAssignments = pgTable(
  "mentor_assignments",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    mentorId: text("mentor_id")
      .notNull()
      .references(() => user.id),
    menteeId: text("mentee_id")
      .notNull()
      .references(() => user.id),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    status: text("status")
      .notNull()
      .default("active")
      .$type<"active" | "completed" | "ended">(),
    notes: text("notes").notNull().default(""),
    followUpAt: time("follow_up_at"),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
    endedAt: time("ended_at"),
  },
  (t) => [
    check("no_self_mentoring", sql`${t.mentorId} <> ${t.menteeId}`),
    check("mentor_status", sql`${t.status} in ('active','completed','ended')`),
    index("mentor_assignments_mentor_idx").on(t.mentorId),
    index("mentor_assignments_mentee_idx").on(t.menteeId),
  ],
);

export const volunteerHourEntries = pgTable(
  "volunteer_hour_entries",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id),
    sourceType: text("source_type")
      .notNull()
      .$type<"event" | "meeting" | "workshop" | "committee_work" | "external">(),
    sourceId: text("source_id"),
    activityTitle: text("activity_title").notNull(),
    date: time("date").notNull(),
    hours: integer("hours").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "approved" | "rejected">(),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id),
    approverId: text("approver_id").references(() => user.id),
    decisionNotes: text("decision_notes").notNull().default(""),
    decidedAt: time("decided_at"),
    evidenceId: text("evidence_id").references(() => evidence.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("volunteer_status", sql`${t.status} in ('pending','approved','rejected')`),
    check("volunteer_hours_positive", sql`${t.hours} > 0`),
    check(
      "volunteer_hours_integer",
      sql`${t.hours} = round(${t.hours})`,
    ),
    index("volunteer_hours_member_idx").on(t.memberId, t.date),
    index("volunteer_hours_status_idx").on(t.status),
  ],
);

export const achievements = pgTable(
  "member_achievements",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category")
      .notNull()
      .$type<
        | "project"
        | "event_leadership"
        | "initiative"
        | "certificate"
        | "competition"
        | "milestone"
        | "recognition"
        | "internal_award"
      >(),
    achievedAt: time("achieved_at").notNull(),
    issuerId: text("issuer_id")
      .notNull()
      .references(() => user.id),
    visibility: text("visibility")
      .notNull()
      .default("members")
      .$type<"management" | "committee" | "members">(),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unreviewed")
      .$type<"unreviewed" | "verified" | "rejected">(),
    evidenceId: text("evidence_id").references(() => evidence.id),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "achievement_verification",
      sql`${t.verificationStatus} in ('unreviewed','verified','rejected')`,
    ),
    check(
      "achievement_visibility",
      sql`${t.visibility} in ('management','committee','members')`,
    ),
    index("achievements_member_idx").on(t.memberId, t.achievedAt),
  ],
);

export const badgeDefinitions = pgTable(
  "badge_definitions",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    icon: text("icon").notNull().default("award"),
    // Machine-readable, explainable eligibility; never a free-form score.
    rule: jsonb("rule")
      .$type<{ type: string; threshold: number; unit: string }>()
      .notNull(),
    active: boolean("active").notNull().default(true),
    repeatable: boolean("repeatable").notNull().default(false),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("badge_definitions_active_idx").on(t.active)],
);

export const memberBadges = pgTable(
  "member_badges",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key")
      .notNull()
      .references(() => badgeDefinitions.key),
    reason: text("reason").notNull().default(""),
    awardedBy: text("awarded_by")
      .notNull()
      .references(() => user.id),
    awardedAt: time("awarded_at").notNull().defaultNow(),
    revokedAt: time("revoked_at"),
    revokeReason: text("revoke_reason").notNull().default(""),
  },
  (t) => [
    index("member_badges_member_idx").on(t.memberId),
    uniqueIndex("member_badge_once")
      .on(t.memberId, t.badgeKey)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    reason: text("reason").notNull(),
    ruleKey: text("rule_key"),
    automatic: boolean("automatic").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("xp_points_sign", sql`${t.points} <> 0`),
    index("xp_transactions_member_idx").on(t.memberId, t.createdAt),
  ],
);

export const impactTransactions = pgTable(
  "impact_transactions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    reason: text("reason").notNull(),
    ruleKey: text("rule_key"),
    automatic: boolean("automatic").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("impact_points_sign", sql`${t.points} <> 0`),
    index("impact_transactions_member_idx").on(t.memberId, t.createdAt),
  ],
);

export const handovers = pgTable(
  "member_handovers",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind")
      .notNull()
      .$type<"role_change" | "committee_transfer" | "exit">(),
    committeeId: text("committee_id").references(() => committees.id),
    successorId: text("successor_id").references(() => user.id),
    responsibilities: text("responsibilities").notNull().default(""),
    activeTasks: text("active_tasks").notNull().default(""),
    pendingDecisions: text("pending_decisions").notNull().default(""),
    activeEvents: text("active_events").notNull().default(""),
    files: text("files").notNull().default(""),
    resources: text("resources").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "completed">(),
    completedAt: time("completed_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("handover_status", sql`${t.status} in ('pending','completed')`),
    index("handovers_user_idx").on(t.userId),
    index("handovers_status_idx").on(t.status),
  ],
);

// Configurable progression and impact rules; no leaderboard is derived here.
export const contributionRules = pgTable(
  "contribution_rules",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    metric: text("metric")
      .notNull()
      .$type<"completed_tasks" | "event_participation" | "event_organized" | "onboarding_completed" | "volunteer_hours" | "meetings_attended">(),
    threshold: integer("threshold").notNull().default(1),
    xpPoints: integer("xp_points").notNull().default(0),
    impactPoints: integer("impact_points").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("contribution_rules_active_idx").on(t.active)],
);

export const peopleEvents = pgTable(
  "people_events",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: text("actor_id").references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    memberId: text("member_id").references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("people_events_entity_idx").on(t.entityType, t.entityId),
    index("people_events_member_idx").on(t.memberId),
    index("people_events_actor_idx").on(t.actorId),
  ],
);

export type MemberStatus = typeof memberProfiles.$inferSelect["status"];
export type ApplicationStatus = typeof membershipApplications.$inferSelect["status"];
export type TransferStatus = typeof transferRequests.$inferSelect["status"];
export type OnboardingStepStatus = typeof onboardingSteps.$inferSelect["status"];
export type VolunteerHourStatus = typeof volunteerHourEntries.$inferSelect["status"];
export type AchievementCategory = typeof achievements.$inferSelect["category"];
export type AchievementVerification = typeof achievements.$inferSelect["verificationStatus"];
export type MentorStatus = typeof mentorAssignments.$inferSelect["status"];
export type HandoverStatus = typeof handovers.$inferSelect["status"];

// ========================
// End Phase 5 Type Exports
// ========================

// ========================
// Phase 6: Specialized Committee Operations
// ========================

// --- Finance -------------------------------------------------------------
export const budgets = pgTable(
  "operation_budgets",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    committeeId: text("committee_id").references(() => committees.id),
    eventId: text("event_id").references(() => events.id),
    initiativeId: text("initiative_id").references(() => initiatives.id),
    allocatedAmount: integer("allocated_amount").notNull(),
    currency: text("currency").notNull().default("SAR"),
    startsOn: time("starts_on").notNull(),
    // Nullable so an open-ended budget does not need a sentinel date.
    endsOn: time("ends_on"),
    // A threshold, not a stored alert: alerts are derived, never persisted.
    alertThresholdPercent: integer("alert_threshold_percent")
      .notNull()
      .default(80),
    status: text("status")
      .notNull()
      .default("active")
      .$type<"active" | "closed" | "archived">(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("budget_amount_positive", sql`${t.allocatedAmount} > 0`),
    check(
      "budget_dates",
      sql`${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`,
    ),
    check(
      "budget_threshold",
      sql`${t.alertThresholdPercent} between 1 and 100`,
    ),
    check(
      "budget_status",
      sql`${t.status} in ('active','closed','archived')`,
    ),
    index("budgets_term_idx").on(t.academicTermId),
    index("budgets_committee_idx").on(t.committeeId),
    index("budgets_event_idx").on(t.eventId),
    index("budgets_status_idx").on(t.status),
  ],
);

export const expenseRequests = pgTable(
  "operation_expense_requests",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    budgetId: text("budget_id").references(() => budgets.id),
    eventId: text("event_id").references(() => events.id),
    workRequestId: text("work_request_id").references(() => requests.id),
    category: text("category")
      .notNull()
      .$type<
        | "supplies"
        | "catering"
        | "venue"
        | "transport"
        | "printing"
        | "equipment"
        | "software"
        | "other"
      >(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("SAR"),
    neededBy: time("needed_by"),
    justification: text("justification").notNull().default(""),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<
        | "draft"
        | "submitted"
        | "finance_review"
        | "changes_requested"
        | "approved"
        | "rejected"
        | "purchased"
        | "reconciled"
        | "cancelled"
        | "archived"
      >(),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    approvedBy: text("approved_by").references(() => user.id),
    submittedAt: time("submitted_at"),
    decidedAt: time("decided_at"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("expense_amount_positive", sql`${t.amount} > 0`),
    check(
      "expense_status",
      sql`${t.status} in ('draft','submitted','finance_review','changes_requested','approved','rejected','purchased','reconciled','cancelled','archived')`,
    ),
    index("expenses_term_idx").on(t.academicTermId),
    index("expenses_status_idx").on(t.status),
    index("expenses_budget_idx").on(t.budgetId),
    index("expenses_event_idx").on(t.eventId),
    index("expenses_requester_idx").on(t.requesterId),
    index("expenses_approver_idx").on(t.approvedBy),
  ],
);

// Append-only decision log; it is the record that survived every state change.
export const expenseDecisions = pgTable(
  "operation_expense_decisions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenseRequests.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    note: text("note").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("expense_decisions_expense_idx").on(t.expenseId),
    index("expense_decisions_actor_idx").on(t.actorId),
  ],
);

export const purchases = pgTable(
  "operation_purchases",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenseRequests.id, { onDelete: "cascade" }),
    vendor: text("vendor").notNull(),
    reference: text("reference").notNull().default(""),
    purchasedAt: time("purchased_at").notNull(),
    amount: integer("amount").notNull(),
    paidById: text("paid_by_id")
      .notNull()
      .references(() => user.id),
    receiptFileId: text("receipt_file_id").references(() => files.id),
    invoiceFileId: text("invoice_file_id").references(() => files.id),
    budgetId: text("budget_id").references(() => budgets.id),
    reconciliationStatus: text("reconciliation_status")
      .notNull()
      .default("pending")
      .$type<"pending" | "reconciled">(),
    reconciliationNotes: text("reconciliation_notes").notNull().default(""),
    reconciledBy: text("reconciled_by").references(() => user.id),
    reconciledAt: time("reconciled_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("purchase_amount_positive", sql`${t.amount} > 0`),
    check(
      "purchase_reconciliation",
      sql`${t.reconciliationStatus} in ('pending','reconciled')`,
    ),
    index("purchases_expense_idx").on(t.expenseId),
    index("purchases_reconciliation_idx").on(t.reconciliationStatus),
  ],
);

// --- Media ---------------------------------------------------------------
export const mediaRequests = pgTable(
  "operation_media_requests",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    eventId: text("event_id").references(() => events.id),
    workRequestId: text("work_request_id").references(() => requests.id),
    mediaType: text("media_type")
      .notNull()
      .$type<
        | "poster"
        | "announcement"
        | "social_post"
        | "event_coverage"
        | "photography"
        | "video"
        | "certificate"
        | "member_card"
        | "presentation"
        | "story_reel"
        | "other"
      >(),
    audience: text("audience").notNull().default(""),
    platform: text("platform").notNull().default(""),
    priority: text("priority")
      .notNull()
      .default("medium")
      .$type<"low" | "medium" | "high" | "urgent">(),
    deadline: time("deadline"),
    specs: text("specs").notNull().default(""),
    copyText: text("copy_text").notNull().default(""),
    references: text("references").notNull().default(""),
    assigneeId: text("assignee_id").references(() => user.id),
    reviewerId: text("reviewer_id").references(() => user.id),
    status: text("status")
      .notNull()
      .default("new")
      .$type<
        | "new"
        | "accepted"
        | "in_production"
        | "in_review"
        | "changes_requested"
        | "approved"
        | "scheduled"
        | "published"
        | "completed"
        | "rejected"
        | "cancelled"
      >(),
    scheduledFor: time("scheduled_for"),
    publishedAt: time("published_at"),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "media_status",
      sql`${t.status} in ('new','accepted','in_production','in_review','changes_requested','approved','scheduled','published','completed','rejected','cancelled')`,
    ),
    index("media_requests_term_idx").on(t.academicTermId),
    index("media_requests_status_idx").on(t.status),
    index("media_requests_event_idx").on(t.eventId),
    index("media_requests_assignee_idx").on(t.assigneeId),
    index("media_requests_reviewer_idx").on(t.reviewerId),
  ],
);

export const mediaRevisions = pgTable(
  "operation_media_revisions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    mediaRequestId: text("media_request_id")
      .notNull()
      .references(() => mediaRequests.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    fileId: text("file_id").references(() => files.id),
    note: text("note").notNull().default(""),
    submittedById: text("submitted_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_revisions_unique").on(t.mediaRequestId, t.revision),
    index("media_revisions_request_idx").on(t.mediaRequestId),
  ],
);

export const mediaDecisions = pgTable(
  "operation_media_decisions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    mediaRequestId: text("media_request_id")
      .notNull()
      .references(() => mediaRequests.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    note: text("note").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("media_decisions_request_idx").on(t.mediaRequestId),
    index("media_decisions_actor_idx").on(t.actorId),
  ],
);

// --- Digital -------------------------------------------------------------
export const digitalRequests = pgTable(
  "operation_digital_requests",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    eventId: text("event_id").references(() => events.id),
    workRequestId: text("work_request_id").references(() => requests.id),
    serviceType: text("service_type")
      .notNull()
      .$type<
        | "registration_form"
        | "survey"
        | "vote"
        | "meeting_link"
        | "course_setup"
        | "certificate_generation"
        | "mailing_support"
        | "data_extraction"
        | "account_support"
        | "digital_archive"
        | "technical_support"
      >(),
    deadline: time("deadline"),
    priority: text("priority")
      .notNull()
      .default("medium")
      .$type<"low" | "medium" | "high" | "urgent">(),
    assigneeId: text("assignee_id").references(() => user.id),
    status: text("status")
      .notNull()
      .default("new")
      .$type<
        | "new"
        | "received"
        | "in_progress"
        | "waiting_input"
        | "in_review"
        | "completed"
        | "rejected"
        | "cancelled"
      >(),
    // The produced resource, recorded rather than assumed.
    resultUrl: text("result_url"),
    resultFormId: text("result_form_id").references((): AnyPgColumn => digitalForms.id),
    resultCertificateBatchId: text("result_certificate_batch_id").references(
      (): AnyPgColumn => certificateBatches.id,
    ),
    academicTermId: text("academic_term_id")
      .notNull()
      .references(() => terms.id),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "digital_request_status",
      sql`${t.status} in ('new','received','in_progress','waiting_input','in_review','completed','rejected','cancelled')`,
    ),
    index("digital_requests_term_idx").on(t.academicTermId),
    index("digital_requests_status_idx").on(t.status),
    index("digital_requests_event_idx").on(t.eventId),
    index("digital_requests_assignee_idx").on(t.assigneeId),
  ],
);

export const digitalForms = pgTable(
  "operation_digital_forms",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    purpose: text("purpose").notNull().default(""),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id),
    committeeId: text("committee_id").references(() => committees.id),
    provider: text("provider").notNull().default(""),
    // Only a public form URL; no credential is ever stored here.
    url: text("url"),
    eventId: text("event_id").references(() => events.id),
    formType: text("form_type")
      .notNull()
      .default("registration")
      .$type<"registration" | "survey" | "vote" | "feedback">(),
    opensOn: time("opens_on"),
    closesOn: time("closes_on"),
    status: text("status")
      .notNull()
      .default("active")
      .$type<"planned" | "active" | "closed" | "archived">(),
    // Only recorded when someone actually supplies a measured count.
    responseCount: integer("response_count"),
    notes: text("notes").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "digital_form_status",
      sql`${t.status} in ('planned','active','closed','archived')`,
    ),
    check(
      "digital_form_responses",
      sql`${t.responseCount} IS NULL OR ${t.responseCount} >= 0`,
    ),
    index("digital_forms_status_idx").on(t.status),
    index("digital_forms_event_idx").on(t.eventId),
  ],
);

export const certificateBatches = pgTable(
  "operation_certificate_batches",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    templateRef: text("template_ref").notNull().default(""),
    issuerId: text("issuer_id")
      .notNull()
      .references(() => user.id),
    eventId: text("event_id").references(() => events.id),
    issuedOn: time("issued_on").notNull(),
    participantSource: text("participant_source").notNull().default(""),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<"draft" | "generating" | "generated" | "sent" | "partial" | "archived">(),
    // Counts are only ever advanced by a recorded action, never assumed.
    generatedCount: integer("generated_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "certificate_status",
      sql`${t.status} in ('draft','generating','generated','sent','partial','archived')`,
    ),
    check(
      "certificate_counts",
      sql`${t.generatedCount} >= 0 AND ${t.sentCount} >= 0 AND ${t.failureCount} >= 0`,
    ),
    index("certificate_batches_event_idx").on(t.eventId),
    index("certificate_batches_status_idx").on(t.status),
  ],
);

// --- Resources -----------------------------------------------------------
export const assets = pgTable(
  "operation_assets",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    category: text("category").notNull(),
    assetCode: text("asset_code"),
    committeeId: text("committee_id").references(() => committees.id),
    condition: text("condition")
      .notNull()
      .default("good")
      .$type<"new" | "good" | "fair" | "damaged" | "maintenance">(),
    availability: text("availability")
      .notNull()
      .default("available")
      .$type<"available" | "reserved" | "checked_out" | "unavailable">(),
    custodianId: text("custodian_id").references(() => user.id),
    // Operational notes only; account credentials are never stored.
    notes: text("notes").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assets_code_unique")
      .on(t.assetCode)
      .where(sql`${t.assetCode} IS NOT NULL`),
    check(
      "asset_condition",
      sql`${t.condition} in ('new','good','fair','damaged','maintenance')`,
    ),
    check(
      "asset_availability",
      sql`${t.availability} in ('available','reserved','checked_out','unavailable')`,
    ),
    index("assets_committee_idx").on(t.committeeId),
    index("assets_availability_idx").on(t.availability),
  ],
);

export const assetReservations = pgTable(
  "operation_asset_reservations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id),
    purpose: text("purpose").notNull(),
    eventId: text("event_id").references(() => events.id),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    status: text("status")
      .notNull()
      .default("requested")
      .$type<"requested" | "approved" | "checked_out" | "returned" | "rejected" | "cancelled">(),
    approverId: text("approver_id").references(() => user.id),
    approvedAt: time("approved_at"),
    checkedOutAt: time("checked_out_at"),
    returnedAt: time("returned_at"),
    conditionBefore: text("condition_before").notNull().default(""),
    conditionAfter: text("condition_after").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "reservation_status",
      sql`${t.status} in ('requested','approved','checked_out','returned','rejected','cancelled')`,
    ),
    check("reservation_dates", sql`${t.endsAt} > ${t.startsAt}`),
    index("asset_reservations_asset_idx").on(t.assetId),
    index("asset_reservations_status_idx").on(t.status),
    index("asset_reservations_window_idx").on(t.startsAt, t.endsAt),
  ],
);

export const assetIncidents = pgTable(
  "operation_asset_incidents",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    reportedById: text("reported_by_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind")
      .notNull()
      .$type<"damaged" | "missing" | "maintenance" | "unavailable">(),
    details: text("details").notNull().default(""),
    // Deliberately optional: blame is never inferred.
    responsibleUserId: text("responsible_user_id").references(() => user.id),
    evidenceFileId: text("evidence_file_id").references(() => files.id),
    resolution: text("resolution").notNull().default(""),
    resolvedAt: time("resolved_at"),
    status: text("status")
      .notNull()
      .default("open")
      .$type<"open" | "resolved">(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "incident_kind",
      sql`${t.kind} in ('damaged','missing','maintenance','unavailable')`,
    ),
    check("incident_status", sql`${t.status} in ('open','resolved')`),
    index("asset_incidents_asset_idx").on(t.assetId),
    index("asset_incidents_status_idx").on(t.status),
  ],
);

// Specialized operations audit; kept apart from Activity like the other domains.
export const operationsEvents = pgTable(
  "operation_events",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: text("actor_id").references(() => user.id),
    action: text("action").notNull(),
    domain: text("domain").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    committeeId: text("committee_id").references(() => committees.id),
    eventId: text("event_id").references(() => events.id),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "operations_domain",
      sql`${t.domain} in ('finance','media','digital','resource')`,
    ),
    index("operations_events_entity_idx").on(t.entityType, t.entityId),
    index("operations_events_domain_idx").on(t.domain),
    index("operations_events_event_idx").on(t.eventId),
    index("operations_events_actor_idx").on(t.actorId),
  ],
);

export type BudgetStatus = typeof budgets.$inferSelect["status"];
export type ExpenseStatus = typeof expenseRequests.$inferSelect["status"];
export type ExpenseCategory = typeof expenseRequests.$inferSelect["category"];
export type PurchaseReconciliation = typeof purchases.$inferSelect["reconciliationStatus"];
export type MediaRequestStatus = typeof mediaRequests.$inferSelect["status"];
export type MediaType = typeof mediaRequests.$inferSelect["mediaType"];
export type DigitalRequestStatus = typeof digitalRequests.$inferSelect["status"];
export type DigitalServiceType = typeof digitalRequests.$inferSelect["serviceType"];
export type DigitalFormStatus = typeof digitalForms.$inferSelect["status"];
export type CertificateBatchStatus = typeof certificateBatches.$inferSelect["status"];
export type AssetCondition = typeof assets.$inferSelect["condition"];
export type AssetAvailability = typeof assets.$inferSelect["availability"];
export type ReservationStatus = typeof assetReservations.$inferSelect["status"];
export type IncidentKind = typeof assetIncidents.$inferSelect["kind"];

// ========================
// End Phase 6 Type Exports
// ========================
