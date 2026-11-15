import { describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, maskSecret, signPayload, verifyPayload } from "../src/lib/crypto.js";

describe("crypto", () => {
  it("encrypts provider keys with authenticated encryption", () => {
    const secret = "xk-live-1234567890abcdef";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("masks secrets", () => {
    expect(maskSecret("xk-live-1234567890abcdef")).toBe("xk-l••••••••cdef");
    expect(maskSecret("short")).toBe("••••");
  });

  it("signs expiring payloads bound to a label", () => {
    const t = signPayload({ v: "1" }, 60, "artifact");
    expect(verifyPayload(t, "artifact")?.v).toBe("1");
    expect(verifyPayload(t, "preview")).toBeNull();
    expect(verifyPayload(t.replace(/.$/, "x"), "artifact")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(verifyPayload(t, "artifact")).toBeNull();
    vi.useRealTimers();
  });
});
