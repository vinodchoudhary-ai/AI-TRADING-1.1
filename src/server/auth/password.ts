import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// scrypt parameters (OWASP-recommended equivalent: N=2^15, r=8, p=3). Stored in the hash,
// so they can be raised later without breaking existing passwords.
const N = 32768;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: scrypt$N$r$p$salt(base64)$hash(base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const params = [Number(n), Number(r), Number(p)];
  // Refuse absurd parameters from a damaged row instead of exhausting memory.
  if (params.some((x) => !Number.isInteger(x) || x < 1) || params[0] > 1 << 17 || params[1] > 16 || params[2] > 16) {
    return false;
  }
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), params[0], params[1], params[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | undefined;
/** Burn the same time as a real check, so unknown emails can't be told apart by speed. */
export async function fakeVerify(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  await verifyPassword(await dummy, password);
}
