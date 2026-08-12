import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, readStoredSession, storeSession } from "./auth";

describe("stored Google session", () => {
  beforeEach(() => clearSession());

  it("reuses a token that has enough time remaining", () => {
    storeSession({ accessToken: "token", expiresAt: 200_000 });
    expect(readStoredSession(100_000)).toEqual({ accessToken: "token", expiresAt: 200_000 });
  });

  it("rejects a token inside the expiry buffer", () => {
    storeSession({ accessToken: "token", expiresAt: 120_000 });
    expect(readStoredSession(100_000)).toBeNull();
  });

  it("clears both persisted values", () => {
    storeSession({ accessToken: "token", expiresAt: Date.now() + 100_000 });
    clearSession();
    expect(readStoredSession()).toBeNull();
  });
});
