// حقوق Formulas (تعريفات صيغ KPI)
import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError } from "@/lib/services";
import type { Identity } from "@/lib/services";
import type { KpiFormulaType } from "./types";
import { kpiFormulaTypeLabels } from "./types";
import { generateId, requireActiveSession, hasPermission } from "./helpers";

// =====================
// PUBLIC API
// =====================

export async function createFormulaDefinition(
  ctx: Identity,
  input: {
    name: string;
    formulaType: KpiFormulaType;
    definition: Record<string, unknown>;
    description?: string;
  },
): Promise<(typeof s.kpiFormulaDefinitions.$inferSelect)> {
  await requireActiveSession(ctx);

  // validations
  if (!input.name || input.name.trim().length < 3 || input.name.trim().length > 200) {
    throw new HttpError(422, "اسم الصيغة يجب أن يكون بين 3 و200 حرف");
  }
  if (!input.formulaType || !kpiFormulaTypeLabels[input.formulaType]) {
    throw new HttpError(422, "نوع الصيغة غير صحيح");
  }
  if (!input.definition || typeof input.definition !== "object") {
    throw new HttpError(422, "تعريف الصيغة مطلوب");
  }

  // يجب أن يكون المستخدم مسؤولًا
  if (!(await hasPermission(ctx, "organization.manage"))) {
    throw new HttpError(403, "ليس لديك صلاحية إنشاء تعريفات صيغ");
  }

  const [created] = await db
    .insert(s.kpiFormulaDefinitions)
    .values({
      name: input.name.trim(),
      formulaType: input.formulaType,
      definition: input.definition,
      description: input.description?.trim() ?? "",
    })
    .returning();

  return created!;
}

export async function getFormulaDefinition(
  ctx: Identity,
  formulaId: string,
): Promise<(typeof s.kpiFormulaDefinitions.$inferSelect)> {
  await requireActiveSession(ctx);

  if (!(await hasPermission(ctx, "governance.view"))) {
    throw new HttpError(403, "ليس لديك صلاحية قراءة تعريفات الصيغ");
  }

  const [formula] = await db
    .select()
    .from(s.kpiFormulaDefinitions)
    .where(eq(s.kpiFormulaDefinitions.id, formulaId))
    .limit(1);

  if (!formula) {
    throw new HttpError(404, "تعريف الصيغة غير موجود");
  }

  return formula;
}

export async function listFormulaDefinitions(
  ctx: Identity,
  filters?: {
    formulaType?: KpiFormulaType;
  },
): Promise<(typeof s.kpiFormulaDefinitions.$inferSelect)[]> {
  await requireActiveSession(ctx);

  if (!(await hasPermission(ctx, "governance.view"))) {
    return [];
  }

  const conditions: SQL[] = [];

  if (filters?.formulaType) {
    conditions.push(eq(s.kpiFormulaDefinitions.formulaType, filters.formulaType));
  }

  return await db
    .select()
    .from(s.kpiFormulaDefinitions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(s.kpiFormulaDefinitions.createdAt));
}

export async function updateFormulaDefinition(
  ctx: Identity,
  formulaId: string,
  input: {
    name?: string;
    formulaType?: KpiFormulaType;
    definition?: Record<string, unknown>;
    description?: string;
  },
): Promise<typeof s.kpiFormulaDefinitions.$inferSelect> {
  await requireActiveSession(ctx);

  if (!(await hasPermission(ctx, "organization.manage"))) {
    throw new HttpError(403, "ليس لديك صلاحية تعديل تعريفات الصيغ");
  }

  const [existing] = await db
    .select()
    .from(s.kpiFormulaDefinitions)
    .where(eq(s.kpiFormulaDefinitions.id, formulaId))
    .limit(1);

  if (!existing) {
    throw new HttpError(404, "تعريف الصيغة غير موجود");
  }

  const now = new Date();
  const sets: Partial<typeof s.kpiFormulaDefinitions.$inferInsert> = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 3 || input.name.trim().length > 200) {
      throw new HttpError(422, "اسم الصيغة يجب أن يكون بين 3 و200 حرف");
    }
    sets.name = input.name.trim();
  }
  if (input.formulaType !== undefined) {
    if (!kpiFormulaTypeLabels[input.formulaType]) {
      throw new HttpError(422, "نوع الصيغة غير صحيح");
    }
    sets.formulaType = input.formulaType;
  }
  if (input.definition !== undefined) {
    if (!input.definition || typeof input.definition !== "object") {
      throw new HttpError(422, "تعريف الصيغة مطلوب");
    }
    sets.definition = input.definition;
  }
  if (input.description !== undefined) {
    sets.description = input.description.trim();
  }

  const [updated] = await db
    .update(s.kpiFormulaDefinitions)
    .set(sets)
    .where(eq(s.kpiFormulaDefinitions.id, formulaId))
    .returning();

  return updated!;
}

export async function deleteFormulaDefinition(
  ctx: Identity,
  formulaId: string,
): Promise<{ ok: true }> {
  await requireActiveSession(ctx);

  if (!(await hasPermission(ctx, "organization.manage"))) {
    throw new HttpError(403, "ليس لديك صلاحية حذف تعريفات الصيغ");
  }

  const [existing] = await db
    .select()
    .from(s.kpiFormulaDefinitions)
    .where(eq(s.kpiFormulaDefinitions.id, formulaId))
    .limit(1);

  if (!existing) {
    throw new HttpError(404, "تعريف الصيغة غير موجود");
  }

  await db.delete(s.kpiFormulaDefinitions).where(eq(s.kpiFormulaDefinitions.id, formulaId));

  return { ok: true };
}

// =====================
// PRIVATE HELPERS
// =====================

// لا توجد مساعدات إضافية مطلوبة للحالة الحالية
