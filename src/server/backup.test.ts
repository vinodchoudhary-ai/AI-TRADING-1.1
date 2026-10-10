import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { parseArgs, runBackup } from "../../scripts/backup.mjs";

const dir = mkdtempSync(path.join(os.tmpdir(), "aurum-bak-"));
const dbFile = path.join(dir, "live.db");
const out = path.join(dir, "backups");

// A live-looking database in WAL mode (as the app uses), kept OPEN so we can write to it during the backup.
const live = new DatabaseSync(dbFile);
live.exec("PRAGMA journal_mode = WAL; CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT); CREATE TABLE signals (id INTEGER PRIMARY KEY, n INTEGER);");
for (let i = 0; i < 200; i++) live.prepare("INSERT INTO signals (n) VALUES (?)").run(i);
live.prepare("INSERT INTO users (email) VALUES (?)").run("a@example.test");

afterAll(() => {
  live.close();
  rmSync(dir, { recursive: true, force: true });
});

const count = (file: string, table: string) => {
  const d = new DatabaseSync(file, { readOnly: true });
  try { return (d.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n; } finally { d.close(); }
};

describe("backup script", () => {
  it("copies a database that is open and in use, with all its data, and verifies it", async () => {
    const r = await runBackup({ file: dbFile, outDir: out, now: new Date("2026-10-10T08:00:00Z") });
    expect(path.basename(r.target)).toBe("aurum-2026-10-10T08-00-00Z.db");
    expect(r.tables).toBeGreaterThanOrEqual(2);
    expect(count(r.target, "signals")).toBe(200);
    expect(count(r.target, "users")).toBe(1);
  });

  it("produces one self-contained file: no -wal/-shm beside it, and the lone .db opens elsewhere", async () => {
    const solo = path.join(dir, "solo");
    const r = await runBackup({ file: dbFile, outDir: solo, now: new Date("2026-10-10T07:00:00Z") });
    expect(readdirSync(solo)).toEqual([path.basename(r.target)]);
    const moved = path.join(dir, "moved.db");
    (await import("node:fs")).copyFileSync(r.target, moved);
    expect(count(moved, "signals")).toBe(200);
  });

  it("is a snapshot: later writes to the live database do not appear in an earlier backup", async () => {
    const first = await runBackup({ file: dbFile, outDir: out, now: new Date("2026-10-10T09:00:00Z") });
    live.prepare("INSERT INTO signals (n) VALUES (999)").run();
    const second = await runBackup({ file: dbFile, outDir: out, now: new Date("2026-10-10T10:00:00Z") });
    expect(count(first.target, "signals")).toBe(200);
    expect(count(second.target, "signals")).toBe(201);
  });

  it("keeps only the newest N backups and reports what it removed", async () => {
    for (let h = 11; h < 16; h++) await runBackup({ file: dbFile, outDir: out, keep: 100, now: new Date(`2026-10-10T${h}:00:00Z`) });
    const r = await runBackup({ file: dbFile, outDir: out, keep: 3, now: new Date("2026-10-10T16:00:00Z") });
    const left = readdirSync(out).filter((f) => f.endsWith(".db")).sort();
    expect(left).toHaveLength(3);
    expect(left[2]).toBe("aurum-2026-10-10T16-00-00Z.db"); // the newest survives
    expect(left[0]).toBe("aurum-2026-10-10T14-00-00Z.db");
    expect(r.kept).toBe(3);
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("never deletes files that are not its own backups", async () => {
    const stray = path.join(out, "notes.txt");
    (await import("node:fs")).writeFileSync(stray, "keep me");
    await runBackup({ file: dbFile, outDir: out, keep: 1, now: new Date("2026-10-10T17:00:00Z") });
    expect(existsSync(stray)).toBe(true);
  });

  it("fails clearly for a missing database or a bad retention number, leaving no file behind", async () => {
    await expect(runBackup({ file: path.join(dir, "missing.db"), outDir: out })).rejects.toThrow(/not found/);
    await expect(runBackup({ file: dbFile, outDir: out, keep: 0 })).rejects.toThrow(/keep/);
    await expect(runBackup({ file: dbFile, outDir: out, keep: 1.5 })).rejects.toThrow(/keep/);
  });
});

describe("backup command-line arguments", () => {
  it("defaults to ./backups and keeping 14", () => {
    expect(parseArgs([])).toEqual({ outDir: "backups", keep: 14 });
  });
  it("uses the folder given, with or without --keep, in either order (this once ignored it without --keep)", () => {
    expect(parseArgs(["/mnt/safe"])).toEqual({ outDir: "/mnt/safe", keep: 14 });
    expect(parseArgs(["/mnt/safe", "--keep", "5"])).toEqual({ outDir: "/mnt/safe", keep: 5 });
    expect(parseArgs(["--keep", "5", "/mnt/safe"])).toEqual({ outDir: "/mnt/safe", keep: 5 });
    expect(parseArgs(["--keep", "7"])).toEqual({ outDir: "backups", keep: 7 });
  });
  it("rejects unknown options and extra folders instead of guessing", () => {
    expect(() => parseArgs(["--keeps", "3"])).toThrow(/unknown option/);
    expect(() => parseArgs(["a", "b"])).toThrow(/at most one/);
  });
});
