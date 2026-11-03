/**
 * Browser port of qrw_core: decode and verify credentials, revocation lists and
 * challenge responses entirely offline. Mirrors core/qrw_core and is checked
 * against vectors produced by the Python implementation (tests/qrw.test.ts).
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { deflate, inflate } from "pako";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const STRICT = { zip215: false } as const; // strict RFC 8032 checks, same as OpenSSL on the server

export const PREFIX = "QRW1:";
const SIG_LEN = 64;
const MAX_DECOMPRESSED = 8192;
const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export class InvalidQRError extends Error {}

export function b45decode(text: string): Uint8Array {
  const vals = [...text].map((c) => {
    const i = B45.indexOf(c);
    if (i < 0) throw new Error("invalid base45 character");
    return i;
  });
  if (vals.length % 3 === 1) throw new Error("invalid base45 length");
  const out: number[] = [];
  for (let i = 0; i + 2 < vals.length; i += 3) {
    const n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025;
    if (n > 0xffff) throw new Error("base45 triplet out of range");
    out.push(n >> 8, n & 0xff);
  }
  if (vals.length % 3 === 2) {
    const n = vals[vals.length - 2] + vals[vals.length - 1] * 45;
    if (n > 0xff) throw new Error("base45 pair out of range");
    out.push(n);
  }
  return Uint8Array.from(out);
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("invalid base64url");
  const pad = text + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export interface Signed { payloadBytes: Uint8Array; signature: Uint8Array }

export function decodeQr(text: string): Signed {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) throw new InvalidQRError("not a QRW1 code");
  let data: Uint8Array;
  try {
    const raw = b45decode(text.slice(PREFIX.length));
    data = inflate(raw);
  } catch {
    throw new InvalidQRError("corrupt QR payload");
  }
  if (!data || data.length > MAX_DECOMPRESSED) throw new InvalidQRError("QR payload too large");
  if (data.length <= SIG_LEN) throw new InvalidQRError("QR payload too short");
  return { signature: data.slice(0, SIG_LEN), payloadBytes: data.slice(SIG_LEN) };
}

export type Reason = "MALFORMED" | "UNKNOWN_ISSUER" | "BAD_SIGNATURE" | "NOT_YET_VALID" | "EXPIRED" | "REVOKED";

export interface Payload {
  credentialId: string; issuerKeyId: string; level: "L1" | "L2"; ninMasked: string; name: string;
  ward: string; lga: string; state: string; issuedOn: string; expiresOn: string;
  holderPublicKey?: string; photo?: string;
}

export interface Result { accepted: boolean; reasons: Reason[]; payload: Payload | null }
export type KeySet = Record<string, Uint8Array>;

const FIELDS: Record<string, keyof Payload> = {
  id: "credentialId", kid: "issuerKeyId", lvl: "level", nin: "ninMasked", nm: "name", wd: "ward",
  lga: "lga", st: "state", iat: "issuedOn", exp: "expiresOn", hpk: "holderPublicKey", ph: "photo",
};
const OPTIONAL = new Set(["hpk", "ph"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parsePayload(body: Record<string, unknown>): Payload {
  if (body.typ !== "QRW1-CRED") throw new Error("wrong type");
  for (const k of Object.keys(body)) if (k !== "typ" && !(k in FIELDS)) throw new Error("unexpected field");
  const p: Record<string, unknown> = {};
  for (const [short, long] of Object.entries(FIELDS)) {
    if (!(short in body)) {
      if (OPTIONAL.has(short)) continue;
      throw new Error(`missing ${short}`);
    }
    if (typeof body[short] !== "string" || body[short] === "") throw new Error(`bad ${short}`);
    p[long] = body[short];
  }
  const out = p as unknown as Payload;
  if (out.level !== "L1" && out.level !== "L2") throw new Error("bad level");
  if (out.level === "L2" && !out.holderPublicKey) throw new Error("L2 needs holder key");
  if (out.level === "L1" && out.holderPublicKey) throw new Error("L1 has holder key");
  if (!/^\d{3}\*{5}\d{3}$/.test(out.ninMasked)) throw new Error("NIN not masked");
  if (!DATE.test(out.issuedOn) || !DATE.test(out.expiresOn) || out.expiresOn <= out.issuedOn) throw new Error("bad dates");
  return out;
}

/** Fail securely: any doubt is a rejection, never an exception. */
export function verifyCredential(signed: Signed, keys: KeySet, revoked: Set<string>, today: string): Result {
  const reject = (r: Reason): Result => ({ accepted: false, reasons: [r], payload: null });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(dec.decode(signed.payloadBytes));
    if (typeof body !== "object" || body === null || Array.isArray(body)) return reject("MALFORMED");
  } catch {
    return reject("MALFORMED");
  }
  const key = typeof body.kid === "string" ? keys[body.kid] : undefined;
  if (!key) return reject("UNKNOWN_ISSUER");
  let ok = false;
  try {
    ok = ed.verify(signed.signature, signed.payloadBytes, key, STRICT);
  } catch {
    ok = false;
  }
  if (!ok) return reject("BAD_SIGNATURE");
  let payload: Payload;
  try {
    payload = parsePayload(body);
  } catch {
    return reject("MALFORMED");
  }
  const reasons: Reason[] = [];
  if (today < payload.issuedOn) reasons.push("NOT_YET_VALID");
  if (today > payload.expiresOn) reasons.push("EXPIRED");
  if (revoked.has(payload.credentialId)) reasons.push("REVOKED");
  return reasons.length ? { accepted: false, reasons, payload: null } : { accepted: true, reasons: [], payload };
}

export function challengeMessage(nonce: string, credentialId: string): Uint8Array {
  return enc.encode(JSON.stringify(["QRW1-CHALLENGE", nonce, credentialId]));
}

export function newChallenge(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export function signChallenge(holderSeed: Uint8Array, nonce: string, credentialId: string): string {
  return b64urlEncode(ed.sign(challengeMessage(nonce, credentialId), holderSeed));
}

export function verifyChallengeResponse(holderPublicKey: string, nonce: string, credentialId: string, response: string): boolean {
  try {
    return ed.verify(b64urlDecode(response), challengeMessage(nonce, credentialId), b64urlDecode(holderPublicKey), STRICT);
  } catch {
    return false;
  }
}

export function newHolderKey(): { seed: Uint8Array; publicKey: string } {
  const seed = ed.utils.randomPrivateKey();
  return { seed, publicKey: b64urlEncode(ed.getPublicKey(seed)) };
}

export interface RevocationList { version: number; revokedIds: string[]; issuerKeyId: string; publishedAt: string }

export function verifyRevocationList(payloadB64: string, signatureB64: string, keys: KeySet): RevocationList {
  const payload = b64urlDecode(payloadB64);
  const body = JSON.parse(dec.decode(payload));
  const key = keys[body.kid];
  if (!key) throw new Error("unknown issuer");
  if (!ed.verify(b64urlDecode(signatureB64), payload, key, STRICT)) throw new Error("bad signature");
  if (body.typ !== "QRW1-REVOCATIONS" || !Number.isInteger(body.ver) || !Array.isArray(body.ids)) {
    throw new Error("not a revocation list");
  }
  return { version: body.ver, revokedIds: body.ids, issuerKeyId: body.kid, publishedAt: body.at };
}

/* Small QR formats used between devices (all offline). */
export const challengeQr = (nonce: string, credentialId: string) => `QRW1C:${credentialId}:${nonce}`;
export const responseQr = (credentialId: string, sig: string) => `QRW1R:${credentialId}:${sig}`;
export const bindingQr = (publicKey: string) => `QRW1B:${publicKey}`;

export function parseTagged(text: string, tag: "QRW1C" | "QRW1R" | "QRW1B"): string[] {
  const parts = text.trim().split(":");
  if (parts[0] !== tag) throw new InvalidQRError(`expected a ${tag} code`);
  return parts.slice(1);
}

export function todayIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Clean text from a scanner or paste box. Base45 uses the space character, so a
 * credential may legitimately end with a space: strip only line breaks and tabs.
 */
export function cleanScanned(text: string): string {
  return text.replace(/^[\r\n\t]+|[\r\n\t]+$/g, "");
}

export type CodeKind = "credential" | "binding" | "challenge" | "response" | "unknown";

/** Name the kind of QRW code, so a wrong paste gets a helpful message. */
export function codeKind(text: string): CodeKind {
  if (text.startsWith(PREFIX)) return "credential";
  if (text.startsWith("QRW1B:")) return "binding";
  if (text.startsWith("QRW1C:")) return "challenge";
  if (text.startsWith("QRW1R:")) return "response";
  return "unknown";
}

/** Compact form of the revocation ID list for the phone's storage (NFR-C3): deflate + base64url. */
export function packIds(ids: string[]): string {
  return b64urlEncode(deflate(new TextEncoder().encode(JSON.stringify(ids))));
}

export function unpackIds(packed: string): string[] {
  const ids = JSON.parse(new TextDecoder().decode(inflate(b64urlDecode(packed))));
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string")) throw new Error("bad packed list");
  return ids;
}
