"use client";

import {
  FormEvent,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        setErrorMessage(
          "Sign-in failed. Check your email and password.",
        );

        setLoading(false);
        return;
      }

      const params =
        new URLSearchParams(
          window.location.search,
        );

      const requestedPath =
        params.get("next");

      const nextPath =
        requestedPath &&
        requestedPath.startsWith("/") &&
        !requestedPath.startsWith("//")
          ? requestedPath
          : "/";

      window.location.assign(nextPath);
    } catch {
      setErrorMessage(
        "Could not connect. Check your connection and try again.",
      );

      setLoading(false);
    }
  }

  return (
    <main className="login-page mx-auto w-full max-w-md px-4 py-6 sm:py-10">
      <section className="rounded-3xl border border-[var(--p6-border-decorative)] bg-[var(--p6-surface)] p-6 shadow-[var(--p6-elevation-card)] sm:p-8">
        <div className="mb-6">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-[var(--primary)] font-[var(--font-heading)] text-xl font-bold text-[var(--p6-on-primary)]">
            PA
          </div>

          <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--muted)]">
            Welcome back
          </p>

          <h1 className="mt-2 text-3xl">
            Personal Assistant
          </h1>

          <p className="mt-3 text-[var(--ink-soft)]">
            Sign in to access your assistant.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-extrabold text-[var(--ink)]"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              className="mt-2 w-full rounded-xl border border-[var(--p6-border-control)] bg-[var(--p6-surface)] px-4 py-3 text-[var(--p6-text)] outline-none focus:border-[var(--p6-focus)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-extrabold text-[var(--ink)]"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              className="mt-2 w-full rounded-xl border border-[var(--p6-border-control)] bg-[var(--p6-surface)] px-4 py-3 text-[var(--p6-text)] outline-none focus:border-[var(--p6-focus)]"
              placeholder="Your password"
            />
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--p6-error-bg)] p-3 text-sm font-bold text-[var(--p6-error-text)]"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-xl border border-[var(--p6-primary)] bg-[var(--p6-primary)] px-4 py-3 font-extrabold text-[var(--p6-on-primary)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Signing in..."
              : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}