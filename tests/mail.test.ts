import { afterEach, describe, expect, it, vi } from "vitest";
import { isMailConfigured, sendTextEmail } from "../src/lib/mail";

afterEach(() => vi.restoreAllMocks());

describe("إرسال البريد", () => {
  it("يعتبر Brevo أو Resend أو SMTP إعدادًا صالحًا عند وجود المرسل", () => {
    expect(
      isMailConfigured({ BREVO_API_KEY: "xkeysib-test", MAIL_FROM: "club@test" }),
    ).toBe(true);
    expect(
      isMailConfigured({ RESEND_API_KEY: "re_test", MAIL_FROM: "club@test" }),
    ).toBe(true);
    expect(
      isMailConfigured({ SMTP_URL: "smtps://test", MAIL_FROM: "club@test" }),
    ).toBe(true);
    expect(isMailConfigured({ RESEND_API_KEY: "re_test" })).toBe(false);
  });

  it("يرسل عبر Brevo API باستخدام المرسل الموثق", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ messageId: "mail-1" })));

    await sendTextEmail(
      { to: "member@example.test", subject: "اختبار", text: "رسالة" },
      {
        BREVO_API_KEY: "xkeysib-secret",
        MAIL_FROM: "نادي التقنية الرقمية <club@gmail.com>",
      },
    );

    expect(request).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({ method: "POST" }),
    );
    const options = request.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({
      sender: { email: "club@gmail.com", name: "نادي التقنية الرقمية" },
      to: [{ email: "member@example.test" }],
      subject: "اختبار",
      textContent: "رسالة",
    });
  });

  it("يرسل عبر Resend API دون كشف المفتاح", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "mail-1" })));

    await sendTextEmail(
      { to: "member@example.test", subject: "اختبار", text: "رسالة" },
      { RESEND_API_KEY: "re_secret", MAIL_FROM: "club@example.test" },
    );

    expect(request).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer re_secret" }),
      }),
    );
    const options = request.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({
      from: "club@example.test",
      to: ["member@example.test"],
      subject: "اختبار",
      text: "رسالة",
    });
  });

  it("يفشل برسالة عامة عند رفض المزود", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider secret detail", { status: 422 }),
    );
    await expect(
      sendTextEmail(
        { to: "member@example.test", subject: "اختبار", text: "رسالة" },
        { RESEND_API_KEY: "re_secret", MAIL_FROM: "club@example.test" },
      ),
    ).rejects.toThrow("تعذر إرسال البريد (422)");
  });
});
