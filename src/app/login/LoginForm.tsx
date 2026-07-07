"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent";

export default function LoginForm({ linkFailed }: { linkFailed: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(
    linkFailed ? "That link didn't work. Send a fresh one below." : null,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (sendError) {
      setError(sendError.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <section
        aria-live="polite"
        className="flex w-full flex-col items-center gap-4 rounded-[1.75rem] border-4 border-paper-deep bg-white px-6 py-8 text-center"
      >
        <span aria-hidden="true" className="text-6xl">
          📬
        </span>
        <h2 className="text-2xl font-black">Check your email!</h2>
        <p className="font-semibold text-ink-soft">
          We sent a sign-in link to <span className="text-ink">{email}</span>.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-lg font-bold text-sky underline"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <label htmlFor="email" className="text-lg font-bold">
        Grown-ups sign in here
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-2xl border-4 border-paper-deep bg-white px-5 py-4 text-lg font-semibold outline-none focus:border-sky"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="chunk [--chunk-edge:var(--color-coral-deep)] bg-coral px-6 py-4 text-2xl font-black text-white disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Send me a magic link"}
      </button>
      <p aria-live="polite" className="min-h-6 text-center font-bold text-coral">
        {error}
      </p>
      <p className="text-center text-sm font-semibold text-ink-soft">
        No password. We email you a link, you tap it, you&apos;re in.
      </p>
    </form>
  );
}
