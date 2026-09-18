import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  clearPreviouslyAuthorized,
  clearSession,
  readPreviouslyAuthorized,
  readStoredSession,
  storeSession,
  useGoogleAuth,
} from "./auth";

describe("stored Google session", () => {
  beforeEach(() => {
    clearSession();
    clearPreviouslyAuthorized();
  });

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
    expect(readPreviouslyAuthorized()).toBe(true);
  });
});

describe("focus-driven reconnect", () => {
  let requestAccessToken: Mock<GoogleTokenClient["requestAccessToken"]>;
  let tokenCallback: (response: GoogleTokenResponse) => void;

  beforeEach(() => {
    requestAccessToken = vi.fn<GoogleTokenClient["requestAccessToken"]>();
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (options) => {
            tokenCallback = options.callback;
            return { requestAccessToken };
          },
          revoke: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete window.google;
  });

  it("never opens Google on its own when a stored session has expired", async () => {
    storeSession({ accessToken: "old", expiresAt: Date.now() - 1_000 });
    const { result } = renderHook(() => useGoogleAuth("client-id"));

    await waitFor(() => expect(result.current.isGoogleReady).toBe(true));
    expect(result.current.status).toBe("expired");
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  it("reconnects once per lapse, and not while a request is already open", async () => {
    storeSession({ accessToken: "old", expiresAt: Date.now() - 1_000 });
    const { result } = renderHook(() => useGoogleAuth("client-id"));
    await waitFor(() => expect(result.current.isGoogleReady).toBe(true));

    act(() => result.current.reconnectIfExpired());
    act(() => result.current.reconnectIfExpired());
    expect(requestAccessToken).toHaveBeenCalledTimes(1);

    act(() => tokenCallback({ access_token: "fresh", expires_in: 3600 }));
    expect(result.current.status).toBe("authenticated");
    act(() => result.current.reconnectIfExpired());
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it("treats a token past its expiry as lapsed even if the timer has not fired", async () => {
    const issuedAt = Date.now();
    storeSession({ accessToken: "token", expiresAt: issuedAt + 3_600_000 });
    const { result } = renderHook(() => useGoogleAuth("client-id"));
    await waitFor(() => expect(result.current.isGoogleReady).toBe(true));
    expect(result.current.status).toBe("authenticated");

    act(() => result.current.reconnectIfExpired());
    expect(requestAccessToken).not.toHaveBeenCalled();

    // A laptop that slept through the expiry: the clock has moved, the timer has not.
    vi.spyOn(Date, "now").mockReturnValue(issuedAt + 4_000_000);
    act(() => result.current.reconnectIfExpired());
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("expired");
  });
});
