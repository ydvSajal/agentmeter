/** Password hashing with node:crypto scrypt. Format: scrypt$N$r$p$saltB64$hashB64 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCb(pw, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))),
  );

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Verified against when the email is unknown, so login timing does not reveal which emails exist. */
export const DUMMY_HASH = await hashPassword("not-a-real-password");
