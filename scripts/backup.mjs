#!/usr/bin/env node
// Consistent backup of the Aurum Desk SQLite database, safe to run while the app is running.
//   node scripts/backup.mjs [outDir] [--keep N]
// Reads DATABASE_FILE (default data/aurum.db). Writes aurum-YYYY-MM-DDTHH-MM-SSZ.db into outDir
// (default ./backups), checks the copy is healthy, and deletes all but the newest N backups (default 14).
// The backup holds emails and password hashes: store it somewhere access-controlled and encrypted.

import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";

const PREFIX = "aurum-";
const stamp = (d = new Date()) => d.toISOString().replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");

export async function runBackup({ file, outDir, keep = 14, now = new Date() }) {
  if (!existsSync(file)) throw new Error(`database not found: ${file}`);
  if (!Number.isInteger(keep) || keep < 1) throw new Error("keep must be a whole number of 1 or more");
  mkdirSync(outDir, { recursive: true });

  const target = path.join(outDir, `${PREFIX}${stamp(now)}.db`);
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    await backup(source, target); // SQLite's online backup API: consistent even while the app writes
  } finally {
    source.close();
  }

  // Verify the copy before trusting it, and before deleting any older one.
  // Switch the copy out of WAL mode so the backup is ONE self-contained file (no -wal / -shm beside it).
  const copy = new DatabaseSync(target);
  let tables, check;
  try {
    copy.exec("PRAGMA journal_mode = DELETE");
    check = copy.prepare("PRAGMA integrity_check").get().integrity_check;
    tables = copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  } finally {
    copy.close();
  }
  for (const side of ["-wal", "-shm"]) rmSync(target + side, { force: true });
  if (check !== "ok" || tables < 1) {
    rmSync(target, { force: true });
    throw new Error(`backup failed verification (integrity: ${check}, tables: ${tables}); the bad copy was removed`);
  }

  const all = readdirSync(outDir).filter((f) => f.startsWith(PREFIX) && f.endsWith(".db")).sort();
  const removed = all.slice(0, Math.max(0, all.length - keep));
  for (const f of removed) rmSync(path.join(outDir, f), { force: true });

  return { target, bytes: statSync(target).size, tables, kept: all.length - removed.length, removed };
}

/** Turns command-line words into { outDir, keep }. Exported so it can be tested. */
export function parseArgs(args) {
  let keep = 14;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep") {
      keep = Number(args[++i]);
    } else if (args[i].startsWith("--")) {
      throw new Error(`unknown option ${args[i]}`);
    } else {
      rest.push(args[i]);
    }
  }
  if (rest.length > 1) throw new Error("expected at most one output folder");
  return { outDir: rest[0] ?? "backups", keep };
}

// Command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`backup FAILED: ${e.message}
usage: node scripts/backup.mjs [outDir] [--keep N]`);
    process.exit(2);
  }
  const file = process.env.DATABASE_FILE ?? path.join("data", "aurum.db");
  runBackup({ file, ...opts })
    .then((r) => console.log(`backup ok: ${r.target} (${r.bytes} bytes, ${r.tables} tables); kept ${r.kept}, removed ${r.removed.length} old`))
    .catch((e) => { console.error(`backup FAILED: ${e.message}`); process.exit(1); });
}
