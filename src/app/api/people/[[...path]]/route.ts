import { z } from "zod";
import { identity, HttpError } from "@/lib/services";
import * as people from "@/lib/people";
import { peopleInbox } from "@/lib/people/queries";
export const runtime = "nodejs";

const id = z.string().min(1).max(100);
const text = z.string().trim().max(12000);
const reason = z.string().trim().min(3).max(2000);
const name = z.string().trim().min(3).max(200);
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const tags = z.array(z.string().trim().min(1).max(80)).max(20).optional();
const personFields = {
  studentId: z.string().trim().max(30).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  major: z.string().trim().max(120).optional(),
  college: z.string().trim().max(120).optional(),
  academicLevel: z.string().trim().max(60).optional(),
  gender: z.enum(["male", "female"]).optional(),
  joinedAt: date.optional(),
  skills: tags,
  interests: tags,
  developmentGoals: tags,
  previousExperience: z.string().max(4000).optional(),
  preferredAreas: tags,
  availability: z.string().max(500).optional(),
  motivation: z.string().max(4000).optional(),
  imageUrl: z.string().max(500).nullable().optional(),
};
const applicationInput = z
  .object({
    fullName: name,
    studentId: z.string().trim().min(4).max(30),
    major: z.string().max(120).optional(),
    email: z.email(),
    phone: z.string().max(40).optional(),
    skills: tags,
    interests: tags,
    previousExperience: z.string().max(4000).optional(),
    preferredCommitteeId: id.nullable().optional(),
    alternateCommitteeId: id.nullable().optional(),
    motivation: z.string().max(4000).optional(),
    developmentGoals: tags,
    availability: z.string().max(500).optional(),
    notes: z.string().max(4000).optional(),
    academicTermId: id.optional(),
  })
  .strict();
const placement = z
  .object({
    userId: id,
    committeeId: id,
    academicTermId: id,
    assignmentType: z.enum(["permanent", "temporary", "collaboration"]).default("permanent"),
    reason: z.string().max(1000).optional(),
  })
  .strict();

async function body(req: Request, max: number) {
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "حجم الطلب أكبر من الحد");
      }
      chunks.push(part.value);
    }
  return Buffer.concat(chunks);
}

async function route(req: Request) {
  const ctx = await identity(req.headers);
  const url = new URL(req.url);
  const path = url.pathname.split("/").slice(3).filter(Boolean);
  const [kind, item, action] = path;
  const param = (key: string) => url.searchParams.get(key) ?? undefined;

  if (req.method === "GET") {
    switch (kind) {
      case "lists":
        return Response.json(
          await people.peopleLists(ctx, {
            academicTermId: param("term"),
            committeeId: param("committee"),
            status: param("status") as never,
            query: param("q") ?? undefined,
          }),
        );
      case "options":
        return Response.json(await people.peopleOptions(ctx));
      case "inbox":
        return Response.json(await peopleInbox(ctx));
      case "search":
        return Response.json(await people.searchPeople(ctx, (param("q") ?? "").slice(0, 160)));
      case "me":
        return Response.json({
          today: await people.myToday(ctx),
          totals: await people.totalsFor(ctx.user.id),
          plan: await people.getPlan(ctx, ctx.user.id).catch(() => null),
          badges: await people.listBadges(ctx.user.id),
        });
      case "member":
        id.parse(item);
        return Response.json(await people.memberDetail(ctx, item!));
      case "application": {
        id.parse(item);
        const detail = await people.getApplication(ctx, item!);
        return Response.json(detail);
      }
      case "plan":
        return Response.json(await people.getPlan(ctx, param("member") ?? ctx.user.id));
      case "passport":
        id.parse(item);
        return Response.json(await people.passport(ctx, item!));
      case "timeline":
        id.parse(item);
        return Response.json(await people.memberTimeline(ctx, item!));
      case "badges":
        return Response.json(await people.badgeDefinitions());
      case "hours":
        return Response.json(
          await people.listHours(ctx, {
            memberId: param("member") ?? undefined,
            status: param("status") as never,
          }),
        );
      case "achievements":
        return Response.json(await people.listAchievements(ctx));
      case "mentoring":
        return Response.json(
          await people.listMentorAssignments(ctx, {
            mentorId: param("mentor") ?? undefined,
            menteeId: param("mentee") ?? undefined,
            status: param("status") as never,
          }),
        );
      case "transfers":
        return Response.json(await people.listTransfers(ctx, { status: param("status") as never }));
      case "handovers":
        return Response.json(await people.listHandovers(ctx, { status: param("status") as never }));
      case "xp":
      case "impact": {
        const memberId = param("member") ?? ctx.user.id;
        return Response.json({
          totals: await people.totalsFor(memberId),
          transactions: await people.listTransactions(ctx, memberId, kind),
        });
      }
      case "mentors":
        return Response.json(await people.mentorCandidates(ctx, param("exclude") ?? ctx.user.id));
      default:
        throw new HttpError(404, "المسار غير متاح");
    }
  }

  if (req.method === "POST") {
    if (
      req.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin
    )
      throw new HttpError(403, "مصدر الطلب غير مسموح");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(422, "يلزم JSON");
    const data: unknown = JSON.parse((await body(req, 128000)).toString() || "{}");

    if (path.length === 1) {
      switch (kind) {
        case "applications":
          return Response.json(await people.createApplication(ctx, applicationInput.parse(data)), {
            status: 201,
          });
        case "hours":
          return Response.json(
            await people.submitHours(
              ctx,
              z
                .object({
                  memberId: id,
                  sourceType: z.enum(["event", "meeting", "workshop", "committee_work", "external"]),
                  sourceId: id.nullable().optional(),
                  activityTitle: name,
                  date,
                  hours: z.number().int().positive().max(24),
                  notes: z.string().max(2000).optional(),
                  evidenceId: id.nullable().optional(),
                  academicTermId: id.optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "achievements":
          return Response.json(
            await people.createAchievement(
              ctx,
              z
                .object({
                  memberId: id,
                  title: name,
                  description: z.string().max(4000).optional(),
                  category: z.enum([
                    "project",
                    "event_leadership",
                    "initiative",
                    "certificate",
                    "competition",
                    "milestone",
                    "recognition",
                    "internal_award",
                  ]),
                  achievedAt: date,
                  visibility: z.enum(["management", "committee", "members"]),
                  evidenceId: id.nullable().optional(),
                  sourceEntityType: z.string().max(60).nullable().optional(),
                  sourceEntityId: id.nullable().optional(),
                  academicTermId: id.optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "transfers":
          return Response.json(
            await people.requestTransfer(
              ctx,
              z
                .object({
                  userId: id,
                  toCommitteeId: id,
                  reason,
                  notes: z.string().max(2000).optional(),
                  academicTermId: id.optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "handovers":
          return Response.json(
            await people.createHandover(
              ctx,
              z
                .object({
                  userId: id,
                  kind: z.enum(["role_change", "committee_transfer", "exit"]),
                  committeeId: id.nullable().optional(),
                  successorId: id.nullable().optional(),
                  academicTermId: id,
                  activeTasks: z.string().max(4000).optional(),
                  activeEvents: z.string().max(4000).optional(),
                  files: z.string().max(4000).optional(),
                  resources: z.string().max(4000).optional(),
                  notes: z.string().max(4000).optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        default:
          throw new HttpError(404, "المسار غير متاح");
      }
    }

    // Two-segment paths: /:kind/:action
    if (path.length === 2) {
      switch (`${kind}/${item}`) {
        case "onboarding/start":
          return Response.json(
            await people.startOnboarding(
              ctx,
              z.object({ userId: id, academicTermId: id }).strict().parse(data),
            ),
            { status: 201 },
          );
        case "mentoring/assign":
          return Response.json(
            await people.assignMentor(
              ctx,
              z
                .object({
                  mentorId: id,
                  menteeId: id,
                  academicTermId: id,
                  followUpAt: date.nullable().optional(),
                  notes: z.string().max(2000).optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "badges/award":
          return Response.json(
            await people.awardBadge(
              ctx,
              z
                .object({
                  memberId: id,
                  badgeKey: z.string().min(2).max(60),
                  reason,
                  academicTermId: id,
                  committeeId: id.nullable().optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "points/adjust":
          return Response.json(
            await people.adjustPoints(
              ctx,
              z
                .object({
                  memberId: id,
                  kind: z.enum(["xp", "impact"]),
                  points: z.number().int(),
                  reason,
                  academicTermId: id,
                  committeeId: id.nullable().optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "placement/assign":
          return Response.json(
            await people.placeInCommittee(
              ctx,
              placement.parse(data),
            ),
            { status: 201 },
          );
        default:
          throw new HttpError(404, "الإجراء غير متاح");
      }
    }

    // Three-segment paths: /:kind/:id/:action
    if (path.length === 3) {
      const target = id.parse(item);
      switch (`${kind}/${action}`) {
        case "member/update":
          return Response.json(
            await people.updateMember(ctx, target, z.object(personFields).strict().parse(data)),
          );
        case "member/status":
          return Response.json(
            await people.changeMemberStatus(
              ctx,
              target,
              z
                .object({
                  status: z.enum(["new", "active", "low_engagement", "inactive", "withdrawn", "archived"]),
                  reason: z.string().trim().min(5).max(500),
                })
                .strict()
                .parse(data).status,
              z.string().min(5).max(500).parse((data as { reason: string }).reason),
            ),
          );
        case "member/role":
          return Response.json(
            await people.setClubRole(
              ctx,
              z
                .object({
                  userId: id,
                  clubRole: z.string().trim().min(2).max(80),
                  committeeId: id.nullable().optional(),
                  academicTermId: id,
                  reason: z.string().max(500).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "member/offboard": {
          const parsed = z
            .object({
              reason: z.enum(["resignation", "inactivity", "graduation", "administrative", "term_end"]),
              note: z.string().trim().min(10).max(2000),
              academicTermId: id,
              reassignOpenWork: z.boolean().default(false),
            })
            .strict()
            .parse(data);
          return Response.json(await people.offboardMember(ctx, { userId: target, ...parsed }));
        }
        case "applications/reviewer":
          return Response.json(
            await people.assignReviewer(ctx, target, z.object({ reviewerId: id }).strict().parse(data).reviewerId),
          );
        case "applications/note":
          return Response.json(
            await people.addReviewNote(ctx, target, z.object({ reason }).strict().parse(data).reason),
          );
        case "applications/decide":
          return Response.json(
            await people.decideApplication(
              ctx,
              target,
              z
                .object({
                  decision: z.enum(["shortlisted", "accepted", "rejected", "waitlisted"]),
                  reason,
                })
                .strict()
                .parse(data).decision,
              z.string().min(5).max(2000).parse((data as { reason: string }).reason),
            ),
          );
        case "applications/convert": {
          const applicationId: string = target;
          return Response.json(
            await people.convertToMember(
              ctx,
              z
                .object({
                  applicationId: z.literal(applicationId),
                  userId: id,
                  academicTermId: id,
                  committeeId: id.nullable().optional(),
                  clubRole: z.string().max(80).optional(),
                  clubRoleReason: z.string().max(500).optional(),
                  joinedAt: date.optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        }
        case "steps/complete":
          return Response.json(
            await people.completeStep(
              ctx,
              target,
              z
                .object({
                  note: z.string().trim().min(5).max(1000),
                  linkedWorkId: id.nullable().optional(),
                  linkedEventId: id.nullable().optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "steps/update":
          return Response.json(
            await people.updateStep(
              ctx,
              target,
              z
                .object({
                  ownerId: id.nullable().optional(),
                  dueAt: date.nullable().optional(),
                  status: z.enum(["pending", "in_progress", "skipped"]).optional(),
                  note: z.string().max(1000).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "mentoring/update":
          return Response.json(
            await people.updateMentor(
              ctx,
              target,
              z
                .object({
                  status: z.enum(["active", "completed", "ended"]).optional(),
                  followUpAt: date.nullable().optional(),
                  notes: z.string().max(2000).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "hours/decide": {
          const parsed = z
            .object({ decision: z.enum(["approved", "rejected"]), reason: z.string().trim().min(3).max(1000) })
            .strict()
            .parse(data);
          return Response.json(await people.decideHours(ctx, target, parsed.decision, parsed.reason));
        }
        case "achievements/verify": {
          const parsed = z
            .object({ decision: z.enum(["verified", "rejected"]), reason: z.string().trim().min(3).max(1000) })
            .strict()
            .parse(data);
          return Response.json(
            await people.verifyAchievement(ctx, target, parsed.decision, parsed.reason),
          );
        }
        case "badges/revoke":
          return Response.json(
            await people.revokeBadge(
              ctx,
              target,
              z.object({ reason, academicTermId: id }).strict().parse(data).reason,
              z.string().parse((data as { academicTermId: string }).academicTermId),
            ),
          );
        case "transfers/decide":
          return Response.json(
            await people.decideTransfer(
              ctx,
              target,
              z
                .object({
                  decision: z.enum(["approved", "rejected"]),
                  notes: z.string().trim().min(3).max(1000),
                })
                .strict()
                .parse(data).decision,
              z.string().min(3).max(1000).parse((data as { notes: string }).notes),
            ),
          );
        case "handovers/update":
          return Response.json(
            await people.updateHandover(
              ctx,
              target,
              z
                .object({
                  responsibilities: z.string().max(4000).optional(),
                  activeTasks: z.string().max(4000).optional(),
                  pendingDecisions: z.string().max(4000).optional(),
                  activeEvents: z.string().max(4000).optional(),
                  files: z.string().max(4000).optional(),
                  resources: z.string().max(4000).optional(),
                  notes: z.string().max(4000).optional(),
                  complete: z.boolean().optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        default:
          throw new HttpError(404, "الإجراء غير متاح");
      }
    }
  }
  throw new HttpError(404, "المسار غير متاح");
}

async function handle(req: Request) {
  let response: Response;
  try {
    response = await route(req);
  } catch (e) {
    const status =
      e instanceof HttpError
        ? e.status
        : e instanceof z.ZodError || e instanceof SyntaxError
          ? 422
          : 500;
    response = Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : status === 422
              ? "تحقق من الحقول المدخلة"
              : "تعذر إكمال العملية",
      },
      { status },
    );
    if (status === 500) console.error("people request failed", e);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = handle;
export const POST = handle;
