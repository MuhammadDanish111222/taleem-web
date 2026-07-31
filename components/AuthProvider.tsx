"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    loading,
    signInAnonymous,
    signInGoogle,
  } = useAuth();
  const [choiceLoading, setChoiceLoading] = useState<"anonymous" | "google" | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "syncing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [choiceResolved, setChoiceResolved] = useState(false);
  const [hasChosenAuth, setHasChosenAuth] = useState(false);
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/forbidden");

  useEffect(() => {
    if (isAdminPath) {
      setChoiceResolved(true);
      return;
    }
    const stored = localStorage.getItem("taleem-auth-choice");
    if (stored === "anonymous" || stored === "google") {
      setHasChosenAuth(true);
    } else if (user && !user.isAnonymous) {
      localStorage.setItem("taleem-auth-choice", "google");
      setHasChosenAuth(true);
    }
    setChoiceResolved(true);
  }, [isAdminPath, user]);

  useEffect(() => {
    if (isAdminPath || !choiceResolved || !hasChosenAuth || !user) {
      setProfileState("idle");
      return;
    }

    const syncKey = `taleem-user-profile-synced:${user.uid}`;
    if (sessionStorage.getItem(syncKey) === "1") {
      setProfileState("ready");
      return;
    }

    let active = true;
    setProfileState("syncing");
    setError(null);
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/users/me", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Unable to initialize your account");
        }
        if (active) {
          sessionStorage.setItem(syncKey, "1");
          setProfileState("ready");
        }
      })
      .catch((syncError) => {
        if (active) {
          setError(syncError instanceof Error ? syncError.message : "Unable to initialize your account");
          setProfileState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [choiceResolved, hasChosenAuth, isAdminPath, retryNonce, user]);

  if (isAdminPath) {
    return <>{children}</>;
  }

  if (
    loading ||
    !choiceResolved ||
    (user && hasChosenAuth && profileState !== "ready" && profileState !== "error")
  ) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <p className="text-slate-300">
            {user ? "Setting up your account…" : "Checking your session…"}
          </p>
        </div>
      </main>
    );
  }

  if (!user || !hasChosenAuth) {
    const choose = async (choice: "anonymous" | "google") => {
      setChoiceLoading(choice);
      setError(null);
      try {
        if (choice === "anonymous") {
          await signInAnonymous();
        } else {
          await signInGoogle();
        }
        localStorage.setItem("taleem-auth-choice", choice);
        setHasChosenAuth(true);
        setChoiceLoading(null);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : "Sign-in failed");
        setChoiceLoading(null);
      }
    };

    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
          <h1 className="text-3xl font-bold">Welcome to Taleem AI</h1>
          <p className="mt-3 text-slate-300">
            Choose how you want to continue. You can use the platform without sharing your email.
          </p>
          {error && (
            <p className="mt-4 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="mt-7 space-y-3">
            <button
              type="button"
              disabled={choiceLoading !== null}
              onClick={() => choose("google")}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {choiceLoading === "google" ? "Signing in…" : "Continue with Google"}
            </button>
            <button
              type="button"
              disabled={choiceLoading !== null}
              onClick={() => choose("anonymous")}
              className="w-full rounded-lg border border-slate-600 px-4 py-3 font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {choiceLoading === "anonymous" ? "Starting…" : "Continue anonymously"}
            </button>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Anonymous accounts have no email attached. A private user record is created only to store account identity and subscription status.
          </p>
        </section>
      </main>
    );
  }

  if (profileState === "error") {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="max-w-md rounded-xl border border-red-800 bg-red-950/40 p-6 text-center">
          <h1 className="text-xl font-semibold">Account setup could not finish</h1>
          <p className="mt-2 text-red-100">{error}</p>
          <button
            type="button"
            onClick={() => {
              setProfileState("idle");
              setRetryNonce((value) => value + 1);
            }}
            className="mt-5 rounded-lg bg-white px-4 py-2 font-medium text-slate-900"
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
