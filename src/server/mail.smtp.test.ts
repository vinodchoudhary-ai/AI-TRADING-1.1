import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Talks to a throwaway local SMTP server, so the real transport path (SMTP_URL -> nodemailer) is exercised.
const received: { from: string; to: string[]; data: string }[] = [];
let server: SMTPServer;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onMailFrom(address, _session, cb) { (received[received.length] = { from: address.address, to: [], data: "" }); cb(); },
    onRcptTo(address, _session, cb) { received[received.length - 1].to.push(address.address); cb(); },
    onData(stream, _session, cb) {
      let buf = "";
      stream.on("data", (c: Buffer) => (buf += c.toString("utf8")));
      stream.on("end", () => { received[received.length - 1].data = buf; cb(); });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address() as AddressInfo;
  process.env.SMTP_URL = `smtp://127.0.0.1:${port}?ignoreTLS=true`;
  process.env.MAIL_FROM = "Aurum Desk <noreply@aurum.example>";
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("real SMTP transport", () => {
  it("sends a message through SMTP_URL with the configured sender", async () => {
    const mail = await import("./mail");
    expect(mail.mailMode()).toBe("smtp");
    const ok = await mail.sendMail({
      to: "reader@example.test",
      subject: "Aurum Desk: reset your password / पासवर्ड रीसेट करें",
      text: "Reset: https://aurum.example/reset?token=abc123",
    });
    expect(ok).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0].from).toBe("noreply@aurum.example");
    expect(received[0].to).toEqual(["reader@example.test"]);
    expect(received[0].data).toContain("https://aurum.example/reset?token=abc123");
    expect(received[0].data).toContain("Subject:");
  });

  it("returns false (and does not throw) when the mail server is unreachable", async () => {
    const mail = await import("./mail");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // transport is cached, so point a fresh process-level cache at a dead port
    (globalThis as unknown as { aurumMailer?: unknown }).aurumMailer = undefined;
    process.env.SMTP_URL = "smtp://127.0.0.1:1?ignoreTLS=true";
    const ok = await mail.sendMail({ to: "x@example.test", subject: "s", text: "t" });
    expect(ok).toBe(false);
  }, 20000);
});
