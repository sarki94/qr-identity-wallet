/** Browser-side performance and wallet vault tests (NFR-P1, NFR-C2, NFR-S2, FR-11). */
import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { b64urlDecode, decodeQr, newHolderKey, signChallenge, verifyChallengeResponse, verifyCredential } from "../src/lib/qrw";
import { seal, unseal } from "../src/lib/vault";

const keys = { [vectors.issuer.kid]: b64urlDecode(vectors.issuer.public_key) };

describe("TC-WEB: performance and vault", () => {
  it("TC-WEB-013 [NFR-P1] 100 full offline checks run far inside the 3 s budget", () => {
    const seed = b64urlDecode(vectors.holder_seed_b64);
    const revoked = new Set(Array.from({ length: 10000 }, (_, i) => `cred-${i}`));
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      const r = verifyCredential(decodeQr(vectors.l2_qr), keys, revoked, vectors.today);
      const nonce = `nonce${i}`;
      expect(r.accepted && verifyChallengeResponse(r.payload!.holderPublicKey!, nonce, r.payload!.credentialId, signChallenge(seed, nonce, r.payload!.credentialId))).toBe(true);
    }
    const perCheck = (performance.now() - t0) / 100;
    console.log(`NFR-P1 (browser library): ${perCheck.toFixed(1)} ms per check`);
    expect(perCheck).toBeLessThan(300);
  });

  it("TC-WEB-014 [NFR-S2, FR-11] device key is sealed by the PIN; a wrong PIN cannot open it", async () => {
    const k = newHolderKey();
    const sealed = await seal(k.seed, "123456");
    expect(sealed.ct).not.toContain(Buffer.from(k.seed).toString("base64").slice(0, 10));
    expect(await unseal(sealed, "123456")).toEqual(k.seed);
    await expect(unseal(sealed, "654321")).rejects.toThrow();
  });

  it("TC-WEB-015 [NFR-C2, FR-10] five wallet profiles with credentials fit easily in 5 MB", async () => {
    const profiles = [];
    for (let i = 0; i < 5; i++) {
      const k = newHolderKey();
      profiles.push({ id: k.publicKey.slice(0, 10), label: `Profile ${i}`, publicKey: k.publicKey, sealed: await seal(k.seed, "123456"), credentialQr: vectors.l2_qr, failed: 0, lockedUntil: 0 });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(profiles)).length;
    console.log(`NFR-C2: 5 profiles = ${(bytes / 1024).toFixed(1)} KB`);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });
});

import { packIds, unpackIds } from "../src/lib/qrw";

describe("TC-WEB: compact revocation cache", () => {
  it("TC-WEB-016 [NFR-C3] 100,000 revoked IDs are stored in well under 2 MB and round-trip exactly", () => {
    const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    const ids = Array.from({ length: 100_000 }, () => `cred-${hex()}`);
    const packed = packIds(ids);
    console.log(`NFR-C3 (phone cache): ${(packed.length / 1e6).toFixed(2)} MB`);
    expect(packed.length).toBeLessThan(2_000_000);
    expect(unpackIds(packed)).toEqual(ids);
  });
});
