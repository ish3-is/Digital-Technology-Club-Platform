import { z } from "zod";
import { identity, HttpError } from "@/lib/services";
import * as ops from "@/lib/operations";
export const runtime = "nodejs";

const id = z.string().min(1).max(100);
const title = z.string().trim().min(3).max(200);
const note = z.string().trim().max(4000).optional();
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), "الرابط يجب أن يبدأ بـ http أو https");

const budgetInput = z
  .object({
    title,
    description: z.string().max(4000).optional(),
    committeeId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    initiativeId: id.nullable().optional(),
    allocatedAmount: z.number().int().positive(),
    currency: z.string().trim().max(10).optional(),
    startsOn: date,
    endsOn: date.nullable().optional(),
    alertThresholdPercent: z.number().int().min(1).max(100).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const expenseInput = z
  .object({
    title,
    description: z.string().max(4000).optional(),
    committeeId: id.nullable().optional(),
    budgetId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    workRequestId: id.nullable().optional(),
    category: z.enum([
      "supplies",
      "catering",
      "venue",
      "transport",
      "printing",
      "equipment",
      "software",
      "other",
    ]),
    amount: z.number().int().positive(),
    currency: z.string().trim().max(10).optional(),
    neededBy: date.nullable().optional(),
    justification: z.string().max(4000).optional(),
    submit: z.boolean().optional(),
  })
  .strict();

const mediaInput = z
  .object({
    title,
    description: z.string().max(4000).optional(),
    committeeId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    workRequestId: id.nullable().optional(),
    mediaType: z.enum([
      "poster",
      "announcement",
      "social_post",
      "event_coverage",
      "photography",
      "video",
      "certificate",
      "member_card",
      "presentation",
      "story_reel",
      "other",
    ]),
    audience: z.string().max(200).optional(),
    platform: z.string().max(120).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    deadline: date.nullable().optional(),
    specs: z.string().max(4000).optional(),
    copyText: z.string().max(8000).optional(),
    references: z.string().max(4000).optional(),
  })
  .strict();

const digitalInput = z
  .object({
    title,
    description: z.string().max(4000).optional(),
    committeeId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    workRequestId: id.nullable().optional(),
    serviceType: z.enum([
      "registration_form",
      "survey",
      "vote",
      "meeting_link",
      "course_setup",
      "certificate_generation",
      "mailing_support",
      "data_extraction",
      "account_support",
      "digital_archive",
      "technical_support",
    ]),
    deadline: date.nullable().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  })
  .strict();

const formInput = z
  .object({
    title,
    purpose: z.string().max(2000).optional(),
    committeeId: id.nullable().optional(),
    provider: z.string().max(120).optional(),
    url: httpUrl.nullable().optional(),
    eventId: id.nullable().optional(),
    formType: z.enum(["registration", "survey", "vote", "feedback"]).optional(),
    opensOn: date.nullable().optional(),
    closesOn: date.nullable().optional(),
    status: z.enum(["planned", "active", "closed", "archived"]).optional(),
    responseCount: z.number().int().min(0).nullable().optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const assetInput = z
  .object({
    name: title,
    category: z.string().trim().min(2).max(120),
    assetCode: z.string().trim().max(60).nullable().optional(),
    committeeId: id.nullable().optional(),
    condition: z.enum(["new", "good", "fair", "damaged", "maintenance"]).optional(),
    custodianId: id.nullable().optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const reservationInput = z
  .object({
    assetId: id,
    purpose: title,
    eventId: id.nullable().optional(),
    startsAt: date,
    endsAt: date,
    notes: z.string().max(2000).optional(),
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
      case "home":
        return Response.json(await ops.operationsHome(ctx));
      case "finance":
        return Response.json(await ops.financeOverview(ctx));
      case "media":
        return Response.json(await ops.mediaOverview(ctx));
      case "digital":
        return Response.json(await ops.digitalOverview(ctx));
      case "resources":
        return Response.json(await ops.resourceOverview(ctx));
      case "expenses":
        return Response.json(
          await ops.listExpenses(ctx, {
            status: param("status"),
            budgetId: param("budget"),
            eventId: param("event"),
            committeeId: param("committee"),
            q: param("q"),
          }),
        );
      case "expense": {
        const target = id.parse(item);
        const [row, decisions, purchases] = await Promise.all([
          ops.getExpense(ctx, target),
          ops.expenseDecisions(ctx, target),
          ops.listPurchases(ctx, target),
        ]);
        return Response.json({ ...row, decisions, purchases });
      }
      case "media-requests":
        return Response.json(
          await ops.listMediaRequests(ctx, {
            status: param("status"),
            eventId: param("event"),
            type: param("type"),
            q: param("q"),
          }),
        );
      case "media-request":
        return Response.json(await ops.mediaDetail(ctx, id.parse(item)));
      case "media-archive":
        return Response.json(
          await ops.archiveIndex(ctx, {
            eventId: param("event"),
            type: param("type"),
            platform: param("platform"),
            from: param("from"),
            to: param("to"),
          }),
        );
      case "digital-requests":
        return Response.json(
          await ops.listDigitalRequests(ctx, {
            status: param("status"),
            serviceType: param("type"),
            eventId: param("event"),
            q: param("q"),
          }),
        );
      case "digital-request":
        return Response.json(await ops.getDigitalRequest(ctx, id.parse(item)));
      case "forms":
        return Response.json(
          await ops.listForms(ctx, {
            status: param("status"),
            eventId: param("event"),
            formType: param("type"),
          }),
        );
      case "batches":
        return Response.json(await ops.listBatches(ctx, param("event")));
      case "assets":
        return Response.json(
          await ops.listAssets(ctx, {
            availability: param("availability"),
            committeeId: param("committee"),
            q: param("q"),
          }),
        );
      case "asset":
        return Response.json(await ops.getAsset(ctx, id.parse(item)));
      case "reservations":
        return Response.json(
          await ops.listReservations(ctx, {
            assetId: param("asset"),
            status: param("status"),
          }),
        );
      case "reservation":
        return Response.json(await ops.getReservation(ctx, id.parse(item)));
      case "incidents":
        return Response.json(await ops.listIncidents(ctx, param("asset")));
      case "alerts":
        return Response.json(await ops.alerts(ctx));
      case "inbox":
        return Response.json(await ops.operationsInbox(ctx));
      case "search":
        return Response.json(await ops.operationsSearch(ctx, (param("q") ?? "").slice(0, 160)));
      case "activity":
        return Response.json(await ops.operationsActivity(ctx));
      case "event-support":
        return Response.json(await ops.eventSupport(ctx, id.parse(item)));
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
        case "budgets":
          return Response.json(await ops.createBudget(ctx, budgetInput.parse(data)), {
            status: 201,
          });
        case "expenses":
          return Response.json(await ops.createExpense(ctx, expenseInput.parse(data)), {
            status: 201,
          });
        case "purchases":
          return Response.json(
            await ops.recordPurchase(
              ctx,
              z
                .object({
                  expenseId: id,
                  vendor: title,
                  reference: z.string().max(200).optional(),
                  purchasedAt: date,
                  amount: z.number().int().positive(),
                  receiptFileId: id.nullable().optional(),
                  invoiceFileId: id.nullable().optional(),
                  reconciliationNotes: z.string().max(4000).optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "media-requests":
          return Response.json(
            await ops.createMediaRequest(ctx, mediaInput.parse(data)),
            { status: 201 },
          );
        case "digital-requests":
          return Response.json(
            await ops.createDigitalRequest(ctx, digitalInput.parse(data)),
            { status: 201 },
          );
        case "forms":
          return Response.json(await ops.createForm(ctx, formInput.parse(data)), {
            status: 201,
          });
        case "batches":
          return Response.json(
            await ops.createBatch(
              ctx,
              z
                .object({
                  title,
                  templateRef: z.string().max(200).optional(),
                  eventId: id.nullable().optional(),
                  issuedOn: date,
                  participantSource: z.string().max(500).optional(),
                  notes: z.string().max(4000).optional(),
                })
                .strict()
                .parse(data),
            ),
            { status: 201 },
          );
        case "assets":
          return Response.json(await ops.createAsset(ctx, assetInput.parse(data)), {
            status: 201,
          });
        case "reservations":
          return Response.json(
            await ops.reserveAsset(ctx, reservationInput.parse(data)),
            { status: 201 },
          );
        case "incidents":
          return Response.json(
            await ops.reportIncident(
              ctx,
              z
                .object({
                  assetId: id,
                  kind: z.enum(["damaged", "missing", "maintenance", "unavailable"]),
                  details: z.string().max(4000).optional(),
                  responsibleUserId: id.nullable().optional(),
                  evidenceFileId: id.nullable().optional(),
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

    // /:kind/:id — a single record transition.
    if (path.length === 2) {
      const target = id.parse(item);
      switch (kind) {
        case "budget":
          return Response.json(
            await ops.updateBudget(
              ctx,
              target,
              z
                .object({
                  title: title.optional(),
                  description: z.string().max(4000).optional(),
                  endsOn: date.nullable().optional(),
                  alertThresholdPercent: z.number().int().min(1).max(100).optional(),
                  status: z.enum(["active", "closed", "archived"]).optional(),
                  notes: z.string().max(4000).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "expense": {
          const parsed = z
            .object({
              action: z.enum([
                "submit",
                "start_review",
                "approve",
                "request_changes",
                "reject",
                "record_purchase",
                "reconcile",
                "cancel",
                "archive",
              ]),
              note: z.string().max(2000).optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.transitionExpense(ctx, target, parsed.action, parsed.note ?? ""),
          );
        }
        case "purchase":
          return Response.json(
            await ops.reconcilePurchase(
              ctx,
              target,
              z.object({ notes: z.string().max(4000).optional() }).strict().parse(data).notes ?? "",
            ),
          );
        case "media-request":
          return Response.json(
            await ops.updateMediaRequest(ctx, target, mediaInput.partial().strict().parse(data)),
          );
        case "digital-request": {
          const parsed = z
            .object({
              status: z.enum([
                "received",
                "in_progress",
                "waiting_input",
                "in_review",
                "rejected",
                "cancelled",
              ]),
              note: z.string().max(2000).optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.advanceDigital(ctx, target, parsed.status, parsed.note ?? ""),
          );
        }
        case "digital": {
          const parsed = z
            .object({
              status: z.enum([
                "received",
                "in_progress",
                "waiting_input",
                "in_review",
                "rejected",
                "cancelled",
              ]),
              note: z.string().max(2000).optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.advanceDigital(ctx, target, parsed.status, parsed.note ?? ""),
          );
        }
        case "reservation":
          return Response.json(
            await ops.advanceReservation(
              ctx,
              target,
              z.object({ action: z.string() }).strict().parse(data).action,
            ),
          );
        case "incident": {
          const parsed = z
            .object({
              resolution: z.string().min(3).max(4000),
              restoreAsset: z.boolean().optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.resolveIncident(ctx, target, parsed.resolution, parsed.restoreAsset ?? true),
          );
        }
        case "form":
          return Response.json(
            await ops.recordFormResponses(
              ctx,
              target,
              z
                .object({ responseCount: z.number().int().min(0) })
                .strict()
                .parse(data).responseCount,
            ),
          );
        case "batch":
          return Response.json(
            await ops.recordDelivery(
              ctx,
              target,
              z
                .object({
                  generated: z.number().int().min(0).optional(),
                  sent: z.number().int().min(0).optional(),
                  failures: z.number().int().min(0).optional(),
                  status: z
                    .enum(["draft", "generating", "generated", "sent", "partial", "archived"])
                    .optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        default:
          throw new HttpError(404, "المسار غير متاح");
      }
    }

    // /:kind/:id/:action
    if (path.length === 3) {
      const target = id.parse(item);
      switch (`${kind}/${action}`) {
        case "media/assign": {
          const parsed = z
            .object({
              assigneeId: z.string().min(1),
              reviewerId: z.string().nullable().optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.assignMedia(ctx, target, parsed.assigneeId, parsed.reviewerId ?? null),
          );
        }
        case "media/revision":
          return Response.json(
            await ops.submitRevision(
              ctx,
              target,
              z
                .object({
                  fileId: id.nullable().optional(),
                  note: z.string().max(2000).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "media/review": {
          const parsed = z
            .object({
              decision: z.enum(["approve", "request_changes", "reject"]),
              note: z.string().max(4000).optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.reviewMedia(ctx, target, parsed.decision, parsed.note ?? ""),
          );
        }
        case "media/schedule":
          return Response.json(
            await ops.scheduleMedia(
              ctx,
              target,
              z.object({ scheduledFor: date }).strict().parse(data).scheduledFor,
            ),
          );
        case "media/publish":
          return Response.json(await ops.publishMedia(ctx, target));
        case "media/advance": {
          const parsed = z
            .object({
              status: z.enum([
                "accepted",
                "in_production",
                "in_review",
                "changes_requested",
                "scheduled",
                "published",
                "completed",
                "rejected",
                "cancelled",
              ]),
              note: z.string().max(2000).optional(),
            })
            .strict()
            .parse(data);
          return Response.json(
            await ops.advanceMedia(ctx, target, parsed.status, parsed.note ?? ""),
          );
        }
        case "digital/complete":
          return Response.json(
            await ops.completeDigitalRequest(
              ctx,
              target,
              z
                .object({
                  resultUrl: httpUrl.nullable().optional(),
                  resultFormId: id.nullable().optional(),
                  resultCertificateBatchId: id.nullable().optional(),
                  note: z.string().max(4000).optional(),
                })
                .strict()
                .parse(data),
            ),
          );
        case "digital/assign":
          return Response.json(
            await ops.assignDigital(
              ctx,
              target,
              z.object({ assigneeId: z.string().min(1) }).strict().parse(data).assigneeId,
            ),
          );
        case "asset/update":
          return Response.json(
            await ops.updateAsset(
              ctx,
              target,
              assetInput
                .partial()
                .extend({
                  availability: z
                    .enum(["available", "reserved", "checked_out", "unavailable"])
                    .optional(),
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
    if (status === 500) console.error("operations request failed", e);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = handle;
export const POST = handle;