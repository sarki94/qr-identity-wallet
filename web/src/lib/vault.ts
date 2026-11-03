/** Wallet key vault: the device private key is sealed with a key derived from the profile PIN (NFR-S2). */
import { b64urlDecode, b64urlEncode } from "./qrw";

const ITERATIONS = 210_000;
const enc = new TextEncoder();

export interface Sealed { salt: string; iv: string; ct: string }

async function derive(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(seed: Uint8Array, pin: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await derive(pin, salt), seed));
  return { salt: b64urlEncode(salt), iv: b64urlEncode(iv), ct: b64urlEncode(ct) };
}

/** Throws if the PIN is wrong (AES-GCM authentication fails). */
export async function unseal(s: Sealed, pin: string): Promise<Uint8Array> {
  const key = await derive(pin, b64urlDecode(s.salt));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(s.iv) }, key, b64urlDecode(s.ct)));
}
