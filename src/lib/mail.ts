import nodemailer from "nodemailer";

type TextEmail = {
  to: string;
  subject: string;
  text: string;
};

type MailEnvironment = Record<string, string | undefined>;

export function isMailConfigured(env: MailEnvironment = process.env) {
  return Boolean(
    env.MAIL_FROM && (env.RESEND_API_KEY || env.SMTP_URL),
  );
}

/**
 * Sends transactional mail through Resend's HTTPS API on hosted deployments.
 * SMTP remains a supported fallback for local or private infrastructure.
 */
export async function sendTextEmail(
  message: TextEmail,
  env: MailEnvironment = process.env,
) {
  if (!env.MAIL_FROM) throw new Error("عنوان مرسل البريد غير مهيأ");

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // Do not include the provider response: it may contain sensitive details.
      throw new Error(`تعذر إرسال البريد (${response.status})`);
    }
    return;
  }

  if (env.SMTP_URL) {
    await nodemailer.createTransport(env.SMTP_URL).sendMail({
      from: env.MAIL_FROM,
      ...message,
    });
    return;
  }

  throw new Error("خدمة البريد غير مهيأة");
}
