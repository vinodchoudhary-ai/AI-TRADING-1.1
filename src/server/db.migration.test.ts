import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";

// Build a database in the OLD format (before strategies, verification and reward:risk existed).
const dir = mkdtempSync(path.join(os.tmpdir(), "aurum-mig-"));
const file = path.join(dir, "old.db");
const old = new DatabaseSync(file);
old.exec(`
  CREATE TABLE signals (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tf TEXT NOT NULL, time INTEGER NOT NULL,
    direction TEXT NOT NULL, entry REAL NOT NULL, stop_loss REAL NOT NULL, take_profit REAL NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'open', resolved_at INTEGER
  );
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, prefs TEXT);
`);
old.prepare("INSERT INTO signals (id, symbol, tf, time, direction, entry, stop_loss, take_profit, outcome, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run("XAUUSD|1h|1791554400", "XAUUSD", "1h", 1791554400, "BUY", 4184.0, 4164.0, 4224.0, "win", 1791558000);
old.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)").run("u1", "a@b.test", "hash", 1);
old.close();

process.env.DATABASE_FILE = file;
afterAll(async () => {
  const { db } = await import("./db");
  db().close(); // Windows refuses to delete a database file that is still open
  rmSync(dir, { recursive: true, force: true });
});

describe("opening a database from before the strategy tracker", () => {
  it("adds the new columns without losing anything", async () => {
    const { db, listSignals } = await import("./db");
    const cols = (db().prepare("PRAGMA table_info(signals)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["strategy", "tier", "rr", "r"]));
    const userCols = (db().prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    expect(userCols).toContain("email_verified_at");
    expect(db().prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 1 });

    const rows = listSignals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ strategy: "legacy", tier: null, outcome: "win", direction: "BUY" });
    expect(rows[0].rr).toBeCloseTo(2); // worked out from the levels: 40 reward / 20 risk
    expect(rows[0].r).toBeUndefined();
  });

  it("new-style rows can be saved and read back next to the old ones", async () => {
    const { saveSignals, listSignals } = await import("./db");
    saveSignals([{
      id: "XAUUSD|1h|smc|1791558000", symbol: "XAUUSD", tf: "1h", time: 1791558000, strategy: "smc", tier: "promising",
      direction: "SELL", entry: 4200, stopLoss: 4210, takeProfit: 4175, rr: 2.5, outcome: "loss", r: -1.01, resolvedAt: 1791561600,
    }]);
    const rows = listSignals("XAUUSD", "1h");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.strategy === "smc")).toMatchObject({ tier: "promising", rr: 2.5, r: -1.01, outcome: "loss" });
  });

  it("opening it again is harmless (the migration only runs once)", async () => {
    const { db } = await import("./db");
    const cols = (db().prepare("PRAGMA table_info(signals)").all() as { name: string }[]).map((c) => c.name);
    expect(new Set(cols).size).toBe(cols.length);
  });
});
