import { useCallback, useEffect, useRef, useState } from "react";

const ACCESS_TOKEN_KEY = "life_metrics_google_access_token";
const TOKEN_EXPIRY_KEY = "life_metrics_google_token_expiry";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const EXPIRY_BUFFER_MS = 30_000;

type StoredSession = {
  accessToken: string;
  expiresAt: number;
};

export type AuthStatus =
  | "initializing"
  | "signedOut"
  | "authenticated"
  | "expired"
  | "error";

export type GoogleAuthState = {
  status: AuthStatus;
  accessToken: string | null;
  error: string | null;
  isGoogleReady: boolean;
  connect: () => void;
  signOut: () => void;
  markExpired: () => void;
};

export const readStoredSession = (now = Date.now()): StoredSession | null => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRY_KEY));
  if (!accessToken || !Number.isFinite(expiresAt) || expiresAt <= now + EXPIRY_BUFFER_MS) {
    return null;
  }
  return { accessToken, expiresAt };
};

export const storeSession = (session: StoredSession): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(session.expiresAt));
};

export const clearSession = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};

const waitForGoogleIdentity = async (timeoutMs = 10_000): Promise<void> => {
  const startedAt = Date.now();
  while (!window.google?.accounts?.oauth2) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Google sign-in could not be loaded. Check your connection and refresh.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
};

export const useGoogleAuth = (clientId: string): GoogleAuthState => {
  const initialSessionRef = useRef<StoredSession | null>(readStoredSession());
  const [status, setStatus] = useState<AuthStatus>(
    initialSessionRef.current ? "authenticated" : "initializing",
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    initialSessionRef.current?.accessToken ?? null,
  );
  const [expiresAt, setExpiresAt] = useState<number | null>(
    initialSessionRef.current?.expiresAt ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

  const markExpired = useCallback(() => {
    clearSession();
    setAccessToken(null);
    setExpiresAt(null);
    setError(null);
    setStatus("expired");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setStatus("error");
      setError("Google authentication is not configured.");
      return;
    }

    waitForGoogleIdentity()
      .then(() => {
        if (cancelled || !window.google) return;
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SHEETS_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              setError(response.error_description || response.error || "Google authorization failed.");
              setStatus("error");
              return;
            }

            const nextExpiry = Date.now() + (response.expires_in ?? 3600) * 1000;
            storeSession({ accessToken: response.access_token, expiresAt: nextExpiry });
            setAccessToken(response.access_token);
            setExpiresAt(nextExpiry);
            setError(null);
            setStatus("authenticated");
          },
          error_callback: () => {
            setError("The Google authorization window was closed or blocked.");
            setStatus((current) => (current === "authenticated" ? current : "error"));
          },
        });
        setIsGoogleReady(true);
        setStatus((current) => (current === "initializing" ? "signedOut" : current));
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Google sign-in could not be loaded.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (status !== "authenticated" || !expiresAt) return;
    const remaining = expiresAt - Date.now() - EXPIRY_BUFFER_MS;
    if (remaining <= 0) {
      markExpired();
      return;
    }
    const timer = window.setTimeout(markExpired, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt, markExpired, status]);

  const connect = useCallback(() => {
    if (!tokenClientRef.current) {
      setError("Google sign-in is still loading. Try again in a moment.");
      return;
    }
    setError(null);
    tokenClientRef.current.requestAccessToken({ prompt: "" });
  }, []);

  const signOut = useCallback(() => {
    const tokenToRevoke = accessToken;
    clearSession();
    setAccessToken(null);
    setExpiresAt(null);
    setError(null);
    setStatus("signedOut");
    if (tokenToRevoke && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(tokenToRevoke);
    }
  }, [accessToken]);

  return {
    status,
    accessToken,
    error,
    isGoogleReady,
    connect,
    signOut,
    markExpired,
  };
};
