import { describe, expect, it } from "vitest";

process.env.DATABASE_FILE = ":memory:";
const svc = await import("./service");

const OLD = "correct horse battery";
const NEW = "a brand new passphrase";

async function user(email: string) {
  const r = await svc.createUser(email, OLD);
  if (!r.ok) throw new Error("setup failed");
  return r.user;
}

describe("changePassword", () => {
  it("rejects a wrong current password and changes nothing", async () => {
    const u = await user("c1@example.test");
    const keep = svc.createSession(u.id);
    const other = svc.createSession(u.id);
    expect(await svc.changePassword(u.id, "not my password!!", NEW, keep)).toBe("wrong_password");
    expect(await svc.authenticate("c1@example.test", OLD)).not.toBeNull();
    expect(await svc.authenticate("c1@example.test", NEW)).toBeNull();
    expect(svc.getUserByToken(other)).not.toBeNull(); // nobody was signed out
  });

  it("sets the new password, keeps this browser signed in and signs every other session out", async () => {
    const u = await user("c2@example.test");
    const mine = svc.createSession(u.id);
    const phone = svc.createSession(u.id);
    const stolen = svc.createSession(u.id);
    expect(await svc.changePassword(u.id, OLD, NEW, mine)).toBe("ok");

    expect(await svc.authenticate("c2@example.test", OLD)).toBeNull();
    expect(await svc.authenticate("c2@example.test", NEW)).not.toBeNull();
    expect(svc.getUserByToken(mine)?.id).toBe(u.id);
    expect(svc.getUserByToken(phone)).toBeNull();
    expect(svc.getUserByToken(stolen)).toBeNull();
  });

  it("leaves other users' sessions alone", async () => {
    const a = await user("c3@example.test");
    const b = await user("c4@example.test");
    const aTok = svc.createSession(a.id);
    const bTok = svc.createSession(b.id);
    await svc.changePassword(a.id, OLD, NEW, aTok);
    expect(svc.getUserByToken(bTok)?.id).toBe(b.id);
  });
});

describe("deleteSessionsFor", () => {
  it("removes every session of the user and reports how many", async () => {
    const u = await user("s1@example.test");
    const t1 = svc.createSession(u.id);
    const t2 = svc.createSession(u.id);
    const bystander = await user("s2@example.test");
    const bt = svc.createSession(bystander.id);
    expect(svc.deleteSessionsFor(u.id)).toBe(2);
    expect(svc.getUserByToken(t1)).toBeNull();
    expect(svc.getUserByToken(t2)).toBeNull();
    expect(svc.getUserByToken(bt)).not.toBeNull();
  });

  it("can spare exactly one session", async () => {
    const u = await user("s3@example.test");
    const keep = svc.createSession(u.id);
    svc.createSession(u.id);
    svc.createSession(u.id);
    expect(svc.deleteSessionsFor(u.id, keep)).toBe(2);
    expect(svc.getUserByToken(keep)).not.toBeNull();
  });
});
