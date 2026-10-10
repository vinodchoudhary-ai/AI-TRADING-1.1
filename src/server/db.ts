import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { StoredSignal } from "@/lib/history";

const globalForDb = globalThis as unknown as { aurumDb?: DatabaseSync };

function open(): DatabaseSync {
  const file = process.env.DATABASE_FILE ?? path.join(process.cwd(), "data", "aurum.db");
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, prefs TEXT, email_verified_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens (user_id, purpose);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tf TEXT NOT NULL, time INTEGER NOT NULL,
      direction TEXT NOT NULL, entry REAL NOT NULL, stop_loss REAL NOT NULL, take_profit REAL NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'open', resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_signals_key ON signals (symbol, tf, time);
  `);
  // Older databases lack columns added later. Add them in place; existing rows keep working.
  const addColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn("users", "email_verified_at", "INTEGER");
  addColumn("signals", "strategy", "TEXT NOT NULL DEFAULT 'legacy'"); // rows from the original single rule
  addColumn("signals", "tier", "TEXT");
  addColumn("signals", "rr", "REAL");
  addColumn("signals", "r", "REAL");
  return db;
}

export function db(): DatabaseSync {
  return (globalForDb.aurumDb ??= open());
}

type Row = {
  id: string; symbol: string; tf: string; time: number; direction: "BUY" | "SELL";
  entry: number; stop_loss: number; take_profit: number; outcome: StoredSignal["outcome"]; resolved_at: number | null;
  strategy: string; tier: StoredSignal["tier"]; rr: number | null; r: number | null;
};

const fromRow = (r: Row): StoredSignal => ({
  id: r.id, symbol: r.symbol, tf: r.tf, time: r.time, direction: r.direction, entry: r.entry,
  stopLoss: r.stop_loss, takeProfit: r.take_profit, outcome: r.outcome,
  strategy: r.strategy, tier: r.tier,
  // rows from before reward:risk was stored: work it out from the levels
  rr: r.rr ?? Math.abs(r.take_profit - r.entry) / Math.abs(r.entry - r.stop_loss),
  ...(r.r != null ? { r: r.r } : {}),
  ...(r.resolved_at != null ? { resolvedAt: r.resolved_at } : {}),
});

export function listSignals(symbol?: string, tf?: string): StoredSignal[] {
  const rows = (symbol && tf
    ? db().prepare("SELECT * FROM signals WHERE symbol = ? AND tf = ? ORDER BY time").all(symbol, tf)
    : db().prepare("SELECT * FROM signals ORDER BY time").all()) as unknown as Row[];
  return rows.map(fromRow);
}

/** Insert new signals and update outcomes of existing ones, atomically. */
export function saveSignals(list: StoredSignal[]): void {
  const d = db();
  const stmt = d.prepare(`
    INSERT INTO signals (id, symbol, tf, time, direction, entry, stop_loss, take_profit, outcome, resolved_at, strategy, tier, rr, r)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, resolved_at = excluded.resolved_at, r = excluded.r`);
  d.exec("BEGIN");
  try {
    for (const s of list) {
      stmt.run(
        s.id, s.symbol, s.tf, s.time, s.direction, s.entry, s.stopLoss, s.takeProfit, s.outcome, s.resolvedAt ?? null,
        s.strategy, s.tier, s.rr, s.r ?? null,
      );
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
