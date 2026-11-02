import { describe, expect, it } from "vitest";
import {
  normalizeArabicName,
  officialRoster,
  rosterNameMatches,
} from "../src/lib/account-requests/official-roster";
import { permissionCatalog, roleCatalog } from "../src/db/catalog";

describe("سجل العضوية الرسمي وطلبات الحساب", () => {
  it("يطابق اختلافات الكتابة العربية الآمنة دون مطابقة جزئية", () => {
    expect(normalizeArabicName("  مُحمّد   آل مَلحّة ")).toBe(
      normalizeArabicName("محمد آل ملحة"),
    );
    expect(
      rosterNameMatches(
        { fullName: "مشعل الجذمي", aliases: ["مشعل جذمي"] },
        "مشعل جذمي",
      ),
    ).toBe(true);
    expect(
      rosterNameMatches(
        { fullName: "البراء ياسر علي أحمد", aliases: [] },
        "براء",
      ),
    ).toBe(false);
  });

  it("يحفظ السجل الرسمي كاملًا ويُبقي الاسم القصير داخل لجنته", () => {
    expect(officialRoster).toHaveLength(42);
    expect(
      officialRoster.find(
        (member) => member.fullName === "براء" && member.groupKey === "digital",
      ),
    ).toBeTruthy();
  });

  it("يمنح مدير النظام جميع الصلاحيات المسجلة", () => {
    expect(new Set(roleCatalog.system_admin.permissions)).toEqual(
      new Set(Object.keys(permissionCatalog)),
    );
  });
});
