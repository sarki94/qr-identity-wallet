/** Cross-language tests: credentials issued by the Python core must verify identically in the browser. */
import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import {
  b45decode, b64urlDecode, decodeQr, InvalidQRError, signChallenge, verifyChallengeResponse,
  verifyCredential, verifyRevocationList, newHolderKey, challengeQr, parseTagged,
} from "../src/lib/qrw";

const keys = { [vectors.issuer.kid]: b64urlDecode(vectors.issuer.public_key) };
const today = vectors.today;

describe("TC-WEB: browser verifier agrees with the Python issuer", () => {
  it("TC-WEB-001 [NFR-C1] base45 RFC 9285 vector", () => {
    expect(new TextDecoder().decode(b45decode("QED8WEX0"))).toBe("ietf!");
  });

  it("TC-WEB-002 [FR-16] accepts a Python-issued L2 credential offline", () => {
    const r = verifyCredential(decodeQr(vectors.l2_qr), keys, new Set(), today);
    expect(r.accepted).toBe(true);
    expect(r.payload?.name).toBe("Musa Ibrahim");
    expect(r.payload?.level).toBe("L2");
  });

  it("TC-WEB-003 [FR-16, NFR-S5] rejects a tampered credential", () => {
    const r = verifyCredential(decodeQr(vectors.tampered_qr), keys, new Set(), today);
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain("BAD_SIGNATURE");
  });

  it("TC-WEB-004 [FR-18] rejects revoked and expired credentials", () => {
    expect(verifyCredential(decodeQr(vectors.l1_qr), keys, new Set(["cred-vector-l1"]), today).reasons).toContain("REVOKED");
    expect(verifyCredential(decodeQr(vectors.l2_qr), keys, new Set(), "2028-01-01").reasons).toContain("EXPIRED");
  });

  it("TC-WEB-005 [NFR-S5] unknown issuer and garbage QR fail securely", () => {
    expect(verifyCredential(decodeQr(vectors.l2_qr), {}, new Set(), today).reasons).toContain("UNKNOWN_ISSUER");
    for (const bad of ["", "hello", "QRW1:", "QRW1:!!!", "QRW1:AAAA"]) {
      expect(() => decodeQr(bad)).toThrow(InvalidQRError);
    }
  });

  it("TC-WEB-006 [FR-12, FR-17] browser signs the same challenge response as Python (deterministic Ed25519)", () => {
    const seed = b64urlDecode(vectors.holder_seed_b64);
    expect(signChallenge(seed, vectors.nonce, "cred-vector-l2")).toBe(vectors.response);
    const hpk = verifyCredential(decodeQr(vectors.l2_qr), keys, new Set(), today).payload!.holderPublicKey!;
    expect(verifyChallengeResponse(hpk, vectors.nonce, "cred-vector-l2", vectors.response)).toBe(true);
    expect(verifyChallengeResponse(hpk, "DIFFERENTnonce000000AA", "cred-vector-l2", vectors.response)).toBe(false);
  });

  it("TC-WEB-007 [FR-23] a different device key cannot answer the challenge", () => {
    const hpk = verifyCredential(decodeQr(vectors.l2_qr), keys, new Set(), today).payload!.holderPublicKey!;
    const impostor = newHolderKey();
    expect(verifyChallengeResponse(hpk, vectors.nonce, "cred-vector-l2", signChallenge(impostor.seed, vectors.nonce, "cred-vector-l2"))).toBe(false);
  });

  it("TC-WEB-008 [FR-09, FR-15] verifies the Python-signed revocation list and rejects a forged one", () => {
    const list = verifyRevocationList(vectors.revocation.payload_b64, vectors.revocation.signature_b64, keys);
    expect(list.version).toBe(4);
    expect(list.revokedIds).toEqual(["cred-vector-l1"]);
    const forgedPayload = vectors.revocation.payload_b64.slice(0, -4) + "AAAA";
    expect(() => verifyRevocationList(forgedPayload, vectors.revocation.signature_b64, keys)).toThrow();
  });

  it("TC-WEB-009 [FR-17] device-to-device QR formats round-trip", () => {
    expect(parseTagged(challengeQr("abc", "cred-1"), "QRW1C")).toEqual(["cred-1", "abc"]);
    expect(() => parseTagged("QRW1R:x:y", "QRW1C")).toThrow(InvalidQRError);
  });
});
