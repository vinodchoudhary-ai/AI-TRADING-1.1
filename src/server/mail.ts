import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * smtp     – SMTP_URL and MAIL_FROM are set: real email.
 * dev-log  – not production and no SMTP: messages are appended to a local file instead (never sent).
 * disabled – production without SMTP: email features are switched off.
 */
export type MailMode = "smtp" | "dev-log" | "disabled";

export function mailMode(env: Record<string, string | undefined> = process.env): MailMode {
  if (env.SMTP_URL && env.MAIL_FROM) return "smtp";
  return env.NODE_ENV === "production" ? "disabled" : "dev-log";
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const g = globalThis as unknown as { aurumMailer?: Transporter };

/** Returns true if the message was handed to the mail server (or written to the dev log). Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const mode = mailMode();
  try {
    if (mode === "smtp") {
      g.aurumMailer ??= nodemailer.createTransport(process.env.SMTP_URL as string);
      await g.aurumMailer.sendMail({ from: process.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
      return true;
    }
    if (mode === "dev-log") {
      const file = process.env.MAIL_OUTBOX_FILE ?? path.join(process.cwd(), "data", "outbox.log");
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, `--- ${new Date().toISOString()} ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n\n`);
      return true;
    }
    console.warn("[mail] email is not configured (set SMTP_URL and MAIL_FROM); message not sent");
    return false;
  } catch (e) {
    // Log the reason, never the message (it contains a secret link) or the SMTP credentials.
    console.warn("[mail] sending failed:", e instanceof Error ? e.message : "unknown error");
    return false;
  }
}
