import { describe, it, expect } from "vitest";
import { permits, type Grant } from "../src/lib/policy";
const base: Grant = {
  permission: "committee.update",
  scope: "committee",
  committeeId: "a",
  startAt: new Date("2025-01-01"),
  endAt: null,
  active: true,
};
describe("نطاق الصلاحيات", () => {
  it("يسمح باللجنة المعينة ويمنع تغيير المعرف", () => {
    expect(permits([base], "committee.update", { committeeId: "a" })).toBe(
      true,
    );
    expect(permits([base], "committee.update", { committeeId: "b" })).toBe(
      false,
    );
  });
  it("يرفض غياب المورد أو الدور", () => {
    expect(permits([base], "committee.update")).toBe(false);
    expect(permits([], "committee.read", { committeeId: "a" })).toBe(false);
  });
  it("يرفض التعيين المستقبلي والمنتهي والملغى", () => {
    for (const change of [
      { startAt: new Date("2100-01-01") },
      { endAt: new Date("2020-01-01") },
      { active: false },
    ])
      expect(
        permits([{ ...base, ...change }], "committee.update", {
          committeeId: "a",
        }),
      ).toBe(false);
  });
  it("لا يمنح المشرف تعديل اللجنة", () => {
    expect(
      permits(
        [{ ...base, permission: "report.review", scope: "club" }],
        "committee.update",
        { committeeId: "a" },
      ),
    ).toBe(false);
  });
  it("يحترم الملكية", () => {
    expect(
      permits(
        [{ ...base, scope: "self" }],
        "committee.update",
        { ownerId: "u" },
        "u",
      ),
    ).toBe(true);
    expect(
      permits(
        [{ ...base, scope: "self" }],
        "committee.update",
        { ownerId: "x" },
        "u",
      ),
    ).toBe(false);
  });
  it("يمنع تعديل الفصل المغلق مع السماح بالقراءة", () => {
    expect(
      permits([{ ...base, termStatus: "closed" }], "committee.update", {
        committeeId: "a",
      }),
    ).toBe(false);
    expect(
      permits(
        [{ ...base, termStatus: "closed", permission: "committee.read" }],
        "committee.read",
        { committeeId: "a" },
      ),
    ).toBe(true);
  });
});
